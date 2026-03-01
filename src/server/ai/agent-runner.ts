/**
 * AgentRunner Module
 *
 * Encapsulates Claude agent execution logic. Provides an explicit event stream
 * with no hidden side effects - the caller decides what to do with each event.
 *
 * This module separates agent execution from queue/session management concerns.
 */

import type { ClaudeSessionId, AIConfig } from "../../types/ai.js";
import { AIAgent } from "../../types/ai-agent.js";
import type { QraftBoxToolRegistry } from "../tools/registry.js";
import { createLogger } from "../logger.js";
import {
  SessionRunner,
  type RunningSession,
  type AgentSessionAttachment,
} from "claude-code-agent/src/sdk/index.js";
import {
  SessionRunner as CodexSessionRunner,
  toNormalizedEvents,
} from "codex-agent";
import type { ModelAuthMode } from "../../types/model-config.js";
import { buildAgentAuthEnv } from "./claude-env.js";

const logger = createLogger("AgentRunner");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AWAITING_INPUT_POLL_INTERVAL_MS = 100;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readStringField(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = obj[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRawStringField(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function isLikelyClaudeSessionId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

interface CodexMessageEvent {
  readonly type: "message";
  readonly content: string;
  readonly isDelta?: boolean;
}

interface CodexToolCallEvent {
  readonly type: "tool_call";
  readonly toolName: string;
}

interface CodexToolResultEvent {
  readonly type: "tool_result";
  readonly toolName: string;
  readonly isError: boolean;
}

interface CodexSessionDetectedEvent {
  readonly type: "session_detected";
  readonly sessionId: ClaudeSessionId;
}

type CodexParsedEvent =
  | CodexMessageEvent
  | CodexToolCallEvent
  | CodexToolResultEvent
  | CodexSessionDetectedEvent
  | null;

function readFirstStringField(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = readStringField(obj, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/**
 * Build a Codex CLI command for non-interactive JSONL execution.
 *
 * - New session: codex exec --json [opts...] <prompt>
 * - Resume session: codex exec resume --json [opts...] <sessionId> <prompt>
 */
export function buildCodexExecCommand(
  params: AgentRunParams,
  imagePaths?: readonly string[],
): string[] {
  const args: string[] = ["codex", "exec"];

  if (params.resumeSessionId !== undefined) {
    args.push("resume");
  }

  args.push("--json");

  if (params.model !== undefined && params.model.length > 0) {
    args.push("--model", params.model);
  }

  if (params.additionalArgs !== undefined && params.additionalArgs.length > 0) {
    args.push(...params.additionalArgs);
  }

  if (imagePaths !== undefined && imagePaths.length > 0) {
    for (const imagePath of imagePaths) {
      args.push("--image", imagePath);
    }
  }

  if (params.resumeSessionId !== undefined) {
    args.push(params.resumeSessionId);
  }

  args.push(params.prompt);
  return args;
}

export function parseCodexJsonLine(line: string): CodexParsedEvent {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const obj = asRecord(parsed);
  if (obj === undefined) {
    return null;
  }

  const lineType = readStringField(obj, "type");
  if (lineType === "thread.started") {
    const sessionId =
      readFirstStringField(obj, [
        "thread_id",
        "threadId",
        "session_id",
        "sessionId",
      ]) ??
      (() => {
        const thread = asRecord(obj["thread"]);
        if (thread === undefined) return undefined;
        return readFirstStringField(thread, ["id", "thread_id", "threadId"]);
      })();
    if (sessionId !== undefined) {
      return {
        type: "session_detected",
        sessionId: sessionId as ClaudeSessionId,
      };
    }
    return null;
  }

  if (lineType === "item.started") {
    const item = asRecord(obj["item"]);
    if (item === undefined) return null;
    const itemType = readStringField(item, "type");
    if (itemType === "command_execution") {
      const toolName = readFirstStringField(item, [
        "tool_name",
        "toolName",
        "name",
      ]);
      return {
        type: "tool_call",
        toolName: toolName ?? "local_shell_call",
      };
    }
    return null;
  }

  if (lineType === "item.completed") {
    const item = asRecord(obj["item"]);
    if (item === undefined) return null;
    const itemType = readStringField(item, "type");

    if (itemType === "agent_message") {
      const text = readFirstStringField(item, ["text", "content", "message"]);
      if (text !== undefined) {
        return { type: "message", content: text };
      }
      return null;
    }

    if (itemType === "command_execution") {
      const toolName = readFirstStringField(item, [
        "tool_name",
        "toolName",
        "name",
      ]);
      const exitCodeRaw = item["exit_code"];
      const isError =
        (typeof exitCodeRaw === "number" && exitCodeRaw !== 0) ||
        readStringField(item, "status") === "failed";
      return {
        type: "tool_result",
        toolName: toolName ?? "local_shell_call",
        isError,
      };
    }

    return null;
  }

  if (lineType === "item.delta") {
    const item = asRecord(obj["item"]);
    if (item === undefined) return null;
    if (readStringField(item, "type") !== "agent_message") {
      return null;
    }
    const delta = asRecord(obj["delta"]);
    const text =
      (delta !== undefined
        ? readFirstStringField(delta, ["text", "content"])
        : undefined) ?? readFirstStringField(item, ["text"]);
    if (text !== undefined) {
      return { type: "message", content: text, isDelta: true };
    }
    return null;
  }

  if (lineType === "session_meta") {
    const payload = asRecord(obj["payload"]);
    const meta = payload !== undefined ? asRecord(payload["meta"]) : undefined;
    const sessionId =
      meta !== undefined
        ? readStringField(meta, "id")
        : payload !== undefined
          ? readStringField(payload, "id")
          : undefined;
    if (sessionId !== undefined) {
      return {
        type: "session_detected",
        sessionId: sessionId as ClaudeSessionId,
      };
    }
    return null;
  }

  if (lineType === "event_msg") {
    const payload = asRecord(obj["payload"]);
    if (payload === undefined) return null;
    const eventType = readStringField(payload, "type");
    if (eventType === "AgentMessage") {
      const messageValue = payload["message"];
      if (typeof messageValue === "string" && messageValue.trim().length > 0) {
        return { type: "message", content: messageValue };
      }
      const messageObj = asRecord(messageValue);
      const nestedContent =
        messageObj !== undefined ? messageObj["content"] : undefined;
      if (
        typeof nestedContent === "string" &&
        nestedContent.trim().length > 0
      ) {
        return { type: "message", content: nestedContent };
      }
      if (Array.isArray(nestedContent)) {
        const parts: string[] = [];
        for (const item of nestedContent) {
          const block = asRecord(item);
          if (block === undefined) continue;
          const text = readStringField(block, "text");
          if (text !== undefined) {
            parts.push(text);
          }
        }
        const combined = parts.join("\n").trim();
        if (combined.length > 0) {
          return { type: "message", content: combined };
        }
      }
      return null;
    }
    if (eventType === "ExecCommandBegin") {
      return { type: "tool_call", toolName: "local_shell_call" };
    }
    if (eventType === "ExecCommandEnd") {
      const exitCodeRaw = payload["exit_code"];
      const isError =
        typeof exitCodeRaw === "number" ? exitCodeRaw !== 0 : false;
      return {
        type: "tool_result",
        toolName: "local_shell_call",
        isError,
      };
    }
    return null;
  }

  if (lineType === "response_item") {
    const payload = asRecord(obj["payload"]);
    if (payload === undefined) return null;
    const responseType = readStringField(payload, "type");
    if (
      responseType === "message" &&
      readStringField(payload, "role") === "assistant"
    ) {
      const content = payload["content"];
      if (!Array.isArray(content)) return null;
      const parts: string[] = [];
      for (const item of content) {
        const block = asRecord(item);
        if (block === undefined) continue;
        const blockType = readStringField(block, "type");
        if (blockType !== "output_text" && blockType !== "input_text") continue;
        const text = readStringField(block, "text");
        if (text !== undefined) parts.push(text);
      }
      const combined = parts.join("\n").trim();
      if (combined.length > 0) {
        return { type: "message", content: combined };
      }
    }
  }

  return null;
}

export function shouldEmitCodexSessionDetected(
  previouslyDetectedSessionId: ClaudeSessionId | undefined,
  nextSessionId: ClaudeSessionId,
): boolean {
  return (
    previouslyDetectedSessionId === undefined ||
    previouslyDetectedSessionId !== nextSessionId
  );
}

export function buildCodexMessageSnapshots(
  previousContent: string,
  incomingContent: string,
  isDelta: boolean | undefined,
): readonly string[] {
  if (incomingContent.length === 0) {
    return [];
  }

  if (isDelta === true) {
    const snapshots: string[] = [];
    let acc = previousContent;
    for (const char of Array.from(incomingContent)) {
      acc += char;
      snapshots.push(acc);
    }
    return snapshots;
  }

  if (previousContent.length === 0) {
    const snapshots: string[] = [];
    let acc = "";
    for (const char of Array.from(incomingContent)) {
      acc += char;
      snapshots.push(acc);
    }
    return snapshots;
  }

  if (
    previousContent.length > 0 &&
    incomingContent.startsWith(previousContent) &&
    incomingContent.length > previousContent.length
  ) {
    const snapshots: string[] = [];
    let acc = previousContent;
    for (const char of Array.from(
      incomingContent.slice(previousContent.length),
    )) {
      acc += char;
      snapshots.push(acc);
    }
    return snapshots;
  }

  return [incomingContent];
}

export function downsampleCodexMessageSnapshots(
  snapshots: readonly string[],
  maxUpdates: number,
): readonly string[] {
  if (snapshots.length <= 1 || maxUpdates <= 1) {
    return snapshots;
  }
  if (snapshots.length <= maxUpdates) {
    return snapshots;
  }

  const sampled: string[] = [];
  const lastIndex = snapshots.length - 1;
  const denominator = maxUpdates - 1;

  for (let i = 0; i < maxUpdates; i += 1) {
    const index = Math.round((i * lastIndex) / denominator);
    const snapshot = snapshots[index];
    if (snapshot !== undefined) {
      sampled.push(snapshot);
    }
  }

  const finalSnapshot = snapshots[lastIndex];
  if (
    finalSnapshot !== undefined &&
    sampled[sampled.length - 1] !== finalSnapshot
  ) {
    sampled.push(finalSnapshot);
  }
  return sampled;
}

interface CodexStreamingSession {
  readonly sessionId: string;
  messages(): AsyncGenerator<unknown, void, undefined>;
  waitForCompletion(): Promise<{
    readonly success: boolean;
    readonly exitCode: number;
  }>;
  cancel(): Promise<void>;
}

interface CodexAgentPathAttachment {
  readonly type: "path";
  readonly path: string;
}

interface CodexAgentBase64Attachment {
  readonly type: "base64";
  readonly data: string;
  readonly mediaType?: string | undefined;
}

type CodexAgentAttachment = CodexAgentPathAttachment | CodexAgentBase64Attachment;

function toCodexAgentAttachments(
  attachments: readonly AgentSessionAttachment[] | undefined,
): readonly CodexAgentAttachment[] {
  if (attachments === undefined || attachments.length === 0) {
    return [];
  }

  const mapped: CodexAgentAttachment[] = [];
  for (const attachment of attachments) {
    const mimeType =
      typeof attachment.mimeType === "string" ? attachment.mimeType : undefined;
    const isImageMime = mimeType?.startsWith("image/") ?? false;

    if (typeof attachment.path === "string" && attachment.path.length > 0) {
      // Codex accepts file path images; allow unknown mime for path-based inputs.
      mapped.push({ type: "path", path: attachment.path });
      continue;
    }

    if (
      attachment.encoding === "base64" &&
      typeof attachment.content === "string" &&
      attachment.content.length > 0 &&
      isImageMime
    ) {
      mapped.push({
        type: "base64",
        data: attachment.content,
        mediaType: mimeType,
      });
    }
  }
  return mapped;
}

/**
 * Extract Claude CLI session ID from various stream payload shapes.
 *
 * Claude stream/control payloads can expose session ID as:
 * - sessionId
 * - session_id
 * - message.sessionId / message.session_id
 * - result.sessionId / result.session_id
 */
export function extractClaudeSessionIdFromMessage(
  msg: unknown,
): ClaudeSessionId | undefined {
  const root = asRecord(msg);
  if (root === undefined) {
    return undefined;
  }

  const directCamel = readStringField(root, "sessionId");
  if (directCamel !== undefined && isLikelyClaudeSessionId(directCamel)) {
    return directCamel as ClaudeSessionId;
  }

  const directSnake = readStringField(root, "session_id");
  if (directSnake !== undefined && isLikelyClaudeSessionId(directSnake)) {
    return directSnake as ClaudeSessionId;
  }

  const nestedMessage = asRecord(root["message"]);
  if (nestedMessage !== undefined) {
    const messageCamel = readStringField(nestedMessage, "sessionId");
    if (messageCamel !== undefined && isLikelyClaudeSessionId(messageCamel)) {
      return messageCamel as ClaudeSessionId;
    }
    const messageSnake = readStringField(nestedMessage, "session_id");
    if (messageSnake !== undefined && isLikelyClaudeSessionId(messageSnake)) {
      return messageSnake as ClaudeSessionId;
    }
  }

  const nestedResult = asRecord(root["result"]);
  if (nestedResult !== undefined) {
    const resultCamel = readStringField(nestedResult, "sessionId");
    if (resultCamel !== undefined && isLikelyClaudeSessionId(resultCamel)) {
      return resultCamel as ClaudeSessionId;
    }
    const resultSnake = readStringField(nestedResult, "session_id");
    if (resultSnake !== undefined && isLikelyClaudeSessionId(resultSnake)) {
      return resultSnake as ClaudeSessionId;
    }
  }

  return undefined;
}

/**
 * Events yielded by an AgentRunner execution.
 * The consumer (session manager) maps these to state updates and broadcasts.
 */
export type AgentEvent =
  | {
      readonly type: "claude_session_detected";
      readonly claudeSessionId: ClaudeSessionId;
    }
  | {
      readonly type: "message";
      readonly role: "assistant" | "user";
      readonly content: string;
    }
  | {
      readonly type: "tool_call";
      readonly toolName: string;
      readonly input: Record<string, unknown>;
    }
  | {
      readonly type: "tool_result";
      readonly toolName: string;
      readonly output: unknown;
      readonly isError: boolean;
    }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "activity"; readonly activity: string | undefined }
  | {
      readonly type: "completed";
      readonly success: boolean;
      readonly error?: string | undefined;
      readonly lastAssistantMessage?: string | undefined;
    };

/**
 * Parameters for executing a prompt
 */
export interface AgentRunParams {
  readonly prompt: string;
  readonly projectPath: string;
  readonly resumeSessionId?: ClaudeSessionId | undefined;
  readonly attachments?: readonly AgentSessionAttachment[] | undefined;
  readonly aiAgent?: AIAgent | undefined;
  readonly vendor?: "anthropics" | "openai" | undefined;
  readonly authMode?: ModelAuthMode | undefined;
  readonly model?: string | undefined;
  readonly additionalArgs?: readonly string[] | undefined;
}

/**
 * Handle for a running agent execution.
 * Provides an event stream and cancellation.
 */
export interface AgentExecution {
  /** Async iterable of agent events. Completes when execution finishes. */
  events(): AsyncIterable<AgentEvent>;
  /** Graceful cancellation */
  cancel(): Promise<void>;
  /** Force abort */
  abort(): Promise<void>;
}

/**
 * AgentRunner - Executes prompts against the Claude agent.
 * Pure execution layer with no session/queue state management.
 */
export interface AgentRunner {
  execute(params: AgentRunParams): AgentExecution;
}

/**
 * EventChannel - Internal helper for bridging push-based events to pull-based AsyncIterable
 */
class EventChannel<T> {
  private queue: T[] = [];
  private resolve: ((value: IteratorResult<T>) => void) | undefined;
  private done = false;

  push(value: T): void {
    if (this.done) return;
    if (this.resolve !== undefined) {
      const resolveCallback = this.resolve;
      this.resolve = undefined;
      resolveCallback({ value, done: false });
    } else {
      this.queue.push(value);
    }
  }

  close(): void {
    this.done = true;
    if (this.resolve !== undefined) {
      const resolveCallback = this.resolve;
      this.resolve = undefined;
      resolveCallback({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.queue.length > 0) {
          const value = this.queue.shift();
          if (value === undefined) {
            return Promise.resolve({
              value: undefined as unknown as T,
              done: true,
            });
          }
          return Promise.resolve({ value, done: false });
        }
        if (this.done) {
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true,
          });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolve = resolve;
        });
      },
    };
  }
}

/**
 * ClaudeAgentRunner - Real implementation using SessionRunner
 */
class ClaudeAgentRunner implements AgentRunner {
  constructor(
    private readonly config: AIConfig,
    private readonly toolRegistry: QraftBoxToolRegistry,
  ) {}

  private resolveCliPath(params: AgentRunParams): string {
    if (params.aiAgent === AIAgent.CODEX) {
      return "codex";
    }
    if (params.aiAgent === AIAgent.GEMINI) {
      return "gemini";
    }
    if (params.aiAgent === AIAgent.CLAUDE) {
      return "claude";
    }
    return params.vendor === "openai" ? "codex" : "claude";
  }

  execute(params: AgentRunParams): AgentExecution {
    const channel = new EventChannel<AgentEvent>();
    let runningSession: RunningSession | undefined;
    let agent: SessionRunner | undefined;
    let cancelled = false;

    /**
     * Start the agent execution in the background
     */
    const startExecution = async (): Promise<void> => {
      try {
        // Create SessionRunner with MCP config
        const allowedToolNames = [...this.toolRegistry.getAllowedToolNames()];
        const mcpServerConfig = this.toolRegistry.toMcpServerConfig();

        const cliPath = this.resolveCliPath(params);
        const vendor =
          params.vendor ?? (cliPath === "codex" ? "openai" : "anthropics");
        agent = new SessionRunner({
          cwd: params.projectPath,
          mcpServers: {
            "qraftbox-tools": mcpServerConfig as any,
          },
          allowedTools: allowedToolNames,
          cliPath,
          model: params.model ?? this.config.assistantModel,
          additionalArgs:
            params.additionalArgs !== undefined
              ? [...params.additionalArgs]
              : [...this.config.assistantAdditionalArgs],
          env: buildAgentAuthEnv(vendor, params.authMode),
        });

        // Start or resume session
        const startConfig =
          params.resumeSessionId !== undefined
            ? {
                prompt: params.prompt,
                resumeSessionId: params.resumeSessionId,
              }
            : {
                prompt: params.prompt,
              };

        runningSession = await agent.startSession({
          ...startConfig,
          ...(params.attachments !== undefined && params.attachments.length > 0
            ? { attachments: [...params.attachments] }
            : {}),
        });

        if (params.resumeSessionId !== undefined) {
          logger.info("Resuming Claude session", {
            resumeSessionId: params.resumeSessionId,
          });
        }

        // Detect Claude session ID from stream (for new sessions)
        let claudeSessionDetected = params.resumeSessionId !== undefined;
        let streamedAssistantContent = "";

        // Set up event listeners
        runningSession.on("message", (msg: unknown) => {
          // Detect Claude session ID once from stream (only for new sessions)
          if (!claudeSessionDetected) {
            const detectedSessionId = extractClaudeSessionIdFromMessage(msg);
            if (detectedSessionId !== undefined) {
              channel.push({
                type: "claude_session_detected",
                claudeSessionId: detectedSessionId,
              });
              claudeSessionDetected = true;
              logger.info("Detected Claude session ID from stream", {
                claudeSessionId: detectedSessionId,
              });
            }
          }

          // Extract role and content from message
          // CLI stream-json format: { type: "assistant", message: { role: "assistant", content: [{type:"text",text:"..."}] } }
          if (typeof msg === "object" && msg !== null && "type" in msg) {
            const rawMsg = msg as {
              type?: string;
              event?: {
                type?: string;
                delta?: { type?: string; text?: string };
              };
              message?: { role?: string; content?: unknown };
              content?: unknown;
            };
            const msgType = rawMsg.type;

            // Handle stream_event for incremental content
            if (
              msgType === "stream_event" &&
              rawMsg.event?.type === "content_block_delta" &&
              rawMsg.event.delta?.type === "text_delta" &&
              typeof rawMsg.event.delta.text === "string"
            ) {
              streamedAssistantContent += rawMsg.event.delta.text;
              if (streamedAssistantContent.length > 0) {
                channel.push({
                  type: "message",
                  role: "assistant",
                  content: streamedAssistantContent,
                });
                channel.push({ type: "activity", activity: undefined });
              }
              return;
            }

            // Only capture assistant messages for lastAssistantMessage
            if (msgType !== "assistant") return;

            // Extract text content from CLI message format
            let content: string | undefined;
            const nestedContent = rawMsg.message?.content;
            if (typeof nestedContent === "string") {
              content = nestedContent;
            } else if (Array.isArray(nestedContent)) {
              // Content blocks: [{ type: "text", text: "..." }, ...]
              const textParts: string[] = [];
              for (const block of nestedContent) {
                if (
                  typeof block === "object" &&
                  block !== null &&
                  "text" in block &&
                  typeof (block as { text: unknown }).text === "string"
                ) {
                  textParts.push((block as { text: string }).text);
                }
              }
              content = textParts.join("\n");
            } else if (typeof rawMsg.content === "string") {
              content = rawMsg.content;
            }

            if (content !== undefined && content.length > 0) {
              streamedAssistantContent = content;
              channel.push({ type: "message", role: "assistant", content });
              channel.push({ type: "activity", activity: undefined });
            }
          }
        });

        runningSession.on("toolCall", (call: unknown) => {
          // Extract tool name and input
          if (typeof call === "object" && call !== null) {
            const toolCall = call as {
              name?: string;
              input?: Record<string, unknown>;
            };
            const toolName =
              typeof toolCall.name === "string" ? toolCall.name : "unknown";
            const input =
              typeof toolCall.input === "object" && toolCall.input !== null
                ? toolCall.input
                : {};
            channel.push({ type: "tool_call", toolName, input });
            channel.push({
              type: "activity",
              activity: `Using ${toolName}...`,
            });
          }
        });

        runningSession.on("toolResult", (result: unknown) => {
          // Extract tool result data
          if (typeof result === "object" && result !== null) {
            const toolResult = result as {
              name?: string;
              output?: unknown;
              isError?: boolean;
            };
            const toolName =
              typeof toolResult.name === "string" ? toolResult.name : "unknown";
            const isError =
              typeof toolResult.isError === "boolean"
                ? toolResult.isError
                : false;
            channel.push({
              type: "tool_result",
              toolName,
              output: toolResult.output,
              isError,
            });
            channel.push({
              type: "activity",
              activity: `Processing ${toolName} result...`,
            });
          }
        });

        runningSession.on("error", (err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          channel.push({ type: "error", message: errorMessage });
        });

        const waitForAwaitingInput = async (): Promise<boolean> => {
          const initialState = String(runningSession?.getState().state);
          let observedNonAwaitingState = initialState !== "awaiting_input";

          while (!cancelled) {
            const stateSnapshot = runningSession?.getState().state;
            const normalizedState = String(stateSnapshot);
            if (normalizedState !== "awaiting_input") {
              observedNonAwaitingState = true;
            }

            // Resumed sessions can start in awaiting_input from the previous turn.
            // Only treat awaiting_input as completion after this run has first
            // transitioned to a non-awaiting state.
            if (
              observedNonAwaitingState &&
              normalizedState === "awaiting_input"
            ) {
              return true;
            }
            await Bun.sleep(AWAITING_INPUT_POLL_INTERVAL_MS);
          }
          return false;
        };

        const consumeStreamMessages = async (): Promise<void> => {
          if (runningSession === undefined) {
            return;
          }
          for await (const _msg of runningSession.messages()) {
            if (cancelled) {
              break;
            }
          }
        };

        // Claude can remain in awaiting_input while keeping the stream open.
        // Treat that as a completed turn so queue locks are released and
        // follow-up prompts can execute.
        const reachedAwaitingInput = await Promise.race([
          consumeStreamMessages().then(() => false),
          waitForAwaitingInput(),
        ]);

        if (reachedAwaitingInput) {
          channel.push({ type: "activity", activity: undefined });
          channel.push({
            type: "completed",
            success: true,
            lastAssistantMessage: streamedAssistantContent,
          });
          return;
        }

        // Wait for completion
        const sessionResult = await runningSession.waitForCompletion();
        const finalAgentState = runningSession.getState().state;

        // Check if cancelled during completion wait
        if (cancelled || finalAgentState === "cancelled") {
          channel.push({
            type: "completed",
            success: false,
            lastAssistantMessage: streamedAssistantContent,
          });
          channel.close();
          return;
        }

        // Push completion event
        if (sessionResult.success) {
          channel.push({
            type: "completed",
            success: true,
            lastAssistantMessage: streamedAssistantContent,
          });
        } else {
          const errorMessage =
            sessionResult.error !== undefined
              ? sessionResult.error.message
              : "Unknown error";
          channel.push({
            type: "completed",
            success: false,
            error: errorMessage,
            lastAssistantMessage: streamedAssistantContent,
          });
        }
      } catch (error) {
        if (cancelled) {
          channel.push({
            type: "completed",
            success: false,
          });
        } else {
          const errorMessage =
            error instanceof Error ? error.message : "Session failed";
          channel.push({
            type: "error",
            message: errorMessage,
          });
          channel.push({
            type: "completed",
            success: false,
            error: errorMessage,
          });
        }
      } finally {
        // Clean up agent
        if (agent !== undefined) {
          await agent.close();
        }
        channel.close();
      }
    };

    // Return execution handle
    return {
      events(): AsyncIterable<AgentEvent> {
        // Start execution on first events() call (lazy)
        void startExecution();
        return channel;
      },

      async cancel(): Promise<void> {
        cancelled = true;
        if (runningSession !== undefined) {
          await runningSession.cancel();
        }
      },

      async abort(): Promise<void> {
        cancelled = true;
        if (runningSession !== undefined) {
          await runningSession.abort();
        }
      },
    };
  }
}

class CodexAgentRunner implements AgentRunner {
  execute(params: AgentRunParams): AgentExecution {
    const channel = new EventChannel<AgentEvent>();
    let started = false;
    let cancelled = false;
    let codexProcess:
      | {
          readonly stdout: ReadableStream<Uint8Array>;
          readonly stderr: ReadableStream<Uint8Array>;
          readonly exited: Promise<number>;
          kill(): void;
        }
      | undefined;
    let runningSession: CodexStreamingSession | undefined;

    const startExecution = async (): Promise<void> => {
      try {
        let streamedAssistantContent = "";
        let detectedSessionId: ClaudeSessionId | undefined =
          params.resumeSessionId;
        const emitParsedEvent = async (
          parsed: CodexParsedEvent,
        ): Promise<void> => {
          if (parsed === null) {
            return;
          }
          if (parsed.type === "session_detected") {
            if (
              shouldEmitCodexSessionDetected(
                detectedSessionId,
                parsed.sessionId,
              )
            ) {
              channel.push({
                type: "claude_session_detected",
                claudeSessionId: parsed.sessionId,
              });
            }
            detectedSessionId = parsed.sessionId;
            return;
          }
          if (parsed.type === "message") {
            const snapshots = downsampleCodexMessageSnapshots(
              buildCodexMessageSnapshots(
                streamedAssistantContent,
                parsed.content,
                parsed.isDelta,
              ),
              80,
            );
            const shouldPace = parsed.isDelta !== true && snapshots.length > 1;
            for (let index = 0; index < snapshots.length; index += 1) {
              const snapshot = snapshots[index];
              if (snapshot === undefined) {
                continue;
              }
              streamedAssistantContent = snapshot;
              channel.push({
                type: "message",
                role: "assistant",
                content: snapshot,
              });
              channel.push({ type: "activity", activity: undefined });
              if (shouldPace && index < snapshots.length - 1) {
                await Bun.sleep(16);
              }
            }
            return;
          }
          if (parsed.type === "tool_call") {
            channel.push({
              type: "tool_call",
              toolName: parsed.toolName,
              input: {},
            });
            channel.push({
              type: "activity",
              activity: `Using ${parsed.toolName}...`,
            });
            return;
          }
          if (parsed.type === "tool_result") {
            channel.push({
              type: "tool_result",
              toolName: parsed.toolName,
              output: undefined,
              isError: parsed.isError,
            });
            channel.push({
              type: "activity",
              activity: `Processing ${parsed.toolName} result...`,
            });
          }
        };

        const codexAttachments = toCodexAgentAttachments(params.attachments);
        const imagePaths = codexAttachments
          .filter((attachment): attachment is CodexAgentPathAttachment =>
            attachment.type === "path",
          )
          .map((attachment) => attachment.path);
        const streamToText = async (
          stream: ReadableStream<Uint8Array>,
        ): Promise<string> => {
          const decoder = new TextDecoder();
          let text = "";
          for await (const chunk of stream) {
            text += decoder.decode(chunk, { stream: true });
          }
          text += decoder.decode();
          return text;
        };

        const runViaCodexCliJson = async (): Promise<{
          readonly exitCode: number;
          readonly stderrText: string;
        }> => {
          const command = buildCodexExecCommand(params, imagePaths);
          const spawned = Bun.spawn({
            cmd: command,
            cwd: params.projectPath,
            env: {
              ...process.env,
              ...buildAgentAuthEnv("openai", params.authMode),
            },
            stdout: "pipe",
            stderr: "pipe",
          });
          codexProcess = spawned;
          const stderrPromise = streamToText(spawned.stderr);
          const decoder = new TextDecoder();
          let buffered = "";

          for await (const chunk of spawned.stdout) {
            if (cancelled) {
              break;
            }
            buffered += decoder.decode(chunk, { stream: true });
            let newlineIndex = buffered.indexOf("\n");
            while (newlineIndex >= 0) {
              const line = buffered.slice(0, newlineIndex);
              buffered = buffered.slice(newlineIndex + 1);
              await emitParsedEvent(parseCodexJsonLine(line));
              newlineIndex = buffered.indexOf("\n");
            }
          }

          buffered += decoder.decode();
          if (buffered.trim().length > 0) {
            await emitParsedEvent(parseCodexJsonLine(buffered));
          }

          const exitCode = await spawned.exited;
          const stderrText = (await stderrPromise).trim();
          codexProcess = undefined;
          return { exitCode, stderrText };
        };

        if (params.resumeSessionId !== undefined) {
          const directResult = await runViaCodexCliJson();

          if (cancelled) {
            channel.push({ type: "completed", success: false });
            return;
          }

          if (directResult.exitCode === 0) {
            channel.push({ type: "activity", activity: undefined });
            channel.push({
              type: "completed",
              success: true,
              lastAssistantMessage: streamedAssistantContent,
            });
            return;
          }

          const fallbackError = `Codex execution failed (exit ${directResult.exitCode})`;
          const errorMessage =
            directResult.stderrText.length > 0
              ? directResult.stderrText
              : fallbackError;
          channel.push({ type: "error", message: errorMessage });
          channel.push({ type: "activity", activity: undefined });
          channel.push({
            type: "completed",
            success: false,
            error: errorMessage,
            lastAssistantMessage: streamedAssistantContent,
          });
          return;
        }

        const codexRunner = new CodexSessionRunner();
        runningSession =
          await codexRunner.startSession({
            prompt: params.prompt,
            cwd: params.projectPath,
            model: params.model,
            additionalArgs:
              params.additionalArgs !== undefined
                ? [...params.additionalArgs]
                : undefined,
            streamGranularity: "char",
            images: imagePaths,
          });
        const activeSession = runningSession;
        if (activeSession === undefined) {
          throw new Error("Failed to start codex session");
        }
        let lastRenderedAssistantContent = "";
        let lastRenderAt = 0;
        const emitAssistantSnapshot = (): void => {
          if (streamedAssistantContent === lastRenderedAssistantContent) {
            return;
          }
          lastRenderedAssistantContent = streamedAssistantContent;
          channel.push({
            type: "message",
            role: "assistant",
            content: streamedAssistantContent,
          });
          channel.push({ type: "activity", activity: undefined });
        };

        for await (const normalizedEvent of toNormalizedEvents(
          activeSession.messages() as AsyncIterable<any>,
        )) {
          if (cancelled) {
            break;
          }

          const payload = asRecord(normalizedEvent);
          if (payload === undefined) {
            continue;
          }
          const eventType = readStringField(payload, "type");
          if (eventType === undefined) {
            continue;
          }

          if (eventType === "session.started") {
            const sessionId = readStringField(payload, "sessionId");
            if (sessionId !== undefined) {
              const castSessionId = sessionId as ClaudeSessionId;
              if (
                shouldEmitCodexSessionDetected(
                  detectedSessionId,
                  castSessionId,
                )
              ) {
                channel.push({
                  type: "claude_session_detected",
                  claudeSessionId: castSessionId,
                });
              }
              detectedSessionId = castSessionId;
            }
            continue;
          }

          if (eventType === "assistant.delta") {
            const text = readRawStringField(payload, "text");
            if (text === undefined) {
              continue;
            }
            streamedAssistantContent += text;
            const now = Date.now();
            if (now - lastRenderAt >= 16 || text.includes("\n")) {
              emitAssistantSnapshot();
              lastRenderAt = now;
            }
            continue;
          }

          if (eventType === "assistant.snapshot") {
            const content = readRawStringField(payload, "content");
            if (content !== undefined) {
              streamedAssistantContent = content;
            }
            continue;
          }

          if (eventType === "tool.call") {
            const toolName = readStringField(payload, "name") ?? "unknown-tool";
            const inputRaw = payload["input"];
            const input =
              typeof inputRaw === "object" && inputRaw !== null
                ? (inputRaw as Record<string, unknown>)
                : {};
            channel.push({ type: "tool_call", toolName, input });
            channel.push({
              type: "activity",
              activity: `Using ${toolName}...`,
            });
            continue;
          }

          if (eventType === "tool.result") {
            const toolName = readStringField(payload, "name") ?? "unknown-tool";
            const isError = payload["isError"] === true;
            channel.push({
              type: "tool_result",
              toolName,
              output: payload["output"],
              isError,
            });
            channel.push({
              type: "activity",
              activity: `Processing ${toolName} result...`,
            });
            continue;
          }

          if (eventType === "activity") {
            const message = readStringField(payload, "message");
            channel.push({ type: "activity", activity: message });
            continue;
          }

          if (eventType === "session.error") {
            const errorRaw = payload["error"];
            const nestedError = asRecord(errorRaw);
            const errorMessage =
              errorRaw instanceof Error
                ? errorRaw.message
                : typeof errorRaw === "string"
                  ? errorRaw
                  : nestedError !== undefined
                    ? readStringField(nestedError, "message")
                    : undefined;
            channel.push({
              type: "error",
              message: errorMessage ?? "Codex session error",
            });
            continue;
          }
        }
        emitAssistantSnapshot();

        if (cancelled) {
          channel.push({ type: "completed", success: false });
          return;
        }

        const result = await activeSession.waitForCompletion();
        runningSession = undefined;

        if (result.success) {
          channel.push({ type: "activity", activity: undefined });
          channel.push({
            type: "completed",
            success: true,
            lastAssistantMessage: streamedAssistantContent,
          });
          return;
        }

        const errorMessage = `Codex execution failed (exit ${result.exitCode})`;
        channel.push({ type: "error", message: errorMessage });
        channel.push({ type: "activity", activity: undefined });
        channel.push({
          type: "completed",
          success: false,
          error: errorMessage,
          lastAssistantMessage: streamedAssistantContent,
        });
        return;
      } catch (error) {
        if (cancelled) {
          channel.push({ type: "completed", success: false });
        } else {
          const errorMessage =
            error instanceof Error ? error.message : "Codex execution failed";
          channel.push({ type: "error", message: errorMessage });
          channel.push({
            type: "completed",
            success: false,
            error: errorMessage,
          });
        }
      } finally {
        channel.close();
      }
    };

    return {
      events(): AsyncIterable<AgentEvent> {
        if (!started) {
          started = true;
          void startExecution();
        }
        return channel;
      },

      async cancel(): Promise<void> {
        cancelled = true;
        if (codexProcess !== undefined) {
          codexProcess.kill();
          codexProcess = undefined;
        }
        if (runningSession !== undefined) {
          await runningSession.cancel();
          runningSession = undefined;
        }
      },

      async abort(): Promise<void> {
        cancelled = true;
        if (codexProcess !== undefined) {
          codexProcess.kill();
          codexProcess = undefined;
        }
        if (runningSession !== undefined) {
          await runningSession.cancel();
          runningSession = undefined;
        }
      },
    };
  }
}

class HybridAgentRunner implements AgentRunner {
  private readonly claudeRunner: ClaudeAgentRunner;
  private readonly codexRunner: CodexAgentRunner;

  constructor(config: AIConfig, toolRegistry: QraftBoxToolRegistry) {
    this.claudeRunner = new ClaudeAgentRunner(config, toolRegistry);
    this.codexRunner = new CodexAgentRunner();
  }

  execute(params: AgentRunParams): AgentExecution {
    const isCodex =
      params.aiAgent === AIAgent.CODEX ||
      (params.aiAgent === undefined && params.vendor === "openai");
    return isCodex
      ? this.codexRunner.execute(params)
      : this.claudeRunner.execute(params);
  }
}

/**
 * StubbedAgentRunner - Fallback implementation when no toolRegistry is available
 */
class StubbedAgentRunner implements AgentRunner {
  execute(params: AgentRunParams): AgentExecution {
    const channel = new EventChannel<AgentEvent>();

    const startExecution = async (): Promise<void> => {
      // Simulate thinking
      channel.push({ type: "activity", activity: "Thinking..." });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stubbedContent =
        "[AI Integration Stubbed] Tool registry not provided. The full prompt was:\n\n" +
        params.prompt.slice(0, 500) +
        (params.prompt.length > 500 ? "..." : "");

      channel.push({ type: "activity", activity: undefined });
      channel.push({
        type: "message",
        role: "assistant",
        content: stubbedContent,
      });
      channel.push({
        type: "completed",
        success: true,
        lastAssistantMessage: stubbedContent,
      });
      channel.close();
    };

    return {
      events(): AsyncIterable<AgentEvent> {
        void startExecution();
        return channel;
      },

      async cancel(): Promise<void> {
        // No-op for stubbed runner
      },

      async abort(): Promise<void> {
        // No-op for stubbed runner
      },
    };
  }
}

/**
 * Create an AgentRunner instance
 *
 * Factory function that returns either a real ClaudeAgentRunner (when toolRegistry
 * is provided) or a StubbedAgentRunner (for tests/fallback).
 *
 * @param config - AI configuration
 * @param toolRegistry - Optional tool registry for MCP tools
 * @returns AgentRunner instance
 */
export function createAgentRunner(
  config: AIConfig,
  toolRegistry?: QraftBoxToolRegistry | undefined,
): AgentRunner {
  if (toolRegistry !== undefined) {
    return new HybridAgentRunner(config, toolRegistry);
  }
  return new StubbedAgentRunner();
}
