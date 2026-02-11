/**
 * AgentRunner Module
 *
 * Encapsulates Claude agent execution logic. Provides an explicit event stream
 * with no hidden side effects - the caller decides what to do with each event.
 *
 * This module separates agent execution from queue/session management concerns.
 */

import type { ClaudeSessionId, AIConfig } from "../../types/ai.js";
import type { QraftBoxToolRegistry } from "../tools/registry.js";
import { createLogger } from "../logger.js";
import {
  ClaudeCodeToolAgent,
  type ToolAgentSession,
} from "claude-code-agent/src/sdk/index.js";

const logger = createLogger("AgentRunner");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isLikelyClaudeSessionId(value: string): boolean {
  return UUID_PATTERN.test(value);
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
 * ClaudeAgentRunner - Real implementation using ClaudeCodeToolAgent
 */
class ClaudeAgentRunner implements AgentRunner {
  constructor(
    private readonly config: AIConfig,
    private readonly toolRegistry: QraftBoxToolRegistry,
  ) {}

  execute(params: AgentRunParams): AgentExecution {
    const channel = new EventChannel<AgentEvent>();
    let toolAgentSession: ToolAgentSession | undefined;
    let agent: ClaudeCodeToolAgent | undefined;
    let cancelled = false;

    /**
     * Start the agent execution in the background
     */
    const startExecution = async (): Promise<void> => {
      try {
        // Create ClaudeCodeToolAgent with MCP config
        const allowedToolNames = [...this.toolRegistry.getAllowedToolNames()];
        const mcpServerConfig = this.toolRegistry.toMcpServerConfig();

        agent = new ClaudeCodeToolAgent({
          cwd: params.projectPath,
          mcpServers: {
            "qraftbox-tools": mcpServerConfig as any,
          },
          allowedTools: allowedToolNames,
          model: this.config.assistantModel,
          additionalArgs: [...this.config.assistantAdditionalArgs],
        });

        // Start or resume session
        console.log(`!!!! resume session ${params.resumeSessionId}`);
        toolAgentSession =
          params.resumeSessionId !== undefined
            ? await agent.startSession({
                prompt: params.prompt,
                resumeSessionId: params.resumeSessionId,
              })
            : await agent.startSession({
                prompt: params.prompt,
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
        toolAgentSession.on("message", (msg: unknown) => {
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

        toolAgentSession.on("toolCall", (call: unknown) => {
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

        toolAgentSession.on("toolResult", (result: unknown) => {
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

        toolAgentSession.on("error", (err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          channel.push({ type: "error", message: errorMessage });
        });

        // Iterate messages until completion or cancellation
        for await (const _msg of toolAgentSession.messages()) {
          // Check cancellation flag
          if (cancelled) {
            break;
          }
        }

        // Wait for completion
        const sessionResult = await toolAgentSession.waitForCompletion();
        const finalAgentState = toolAgentSession.getState().state;

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
        if (toolAgentSession !== undefined) {
          await toolAgentSession.cancel();
        }
      },

      async abort(): Promise<void> {
        cancelled = true;
        if (toolAgentSession !== undefined) {
          await toolAgentSession.abort();
        }
      },
    };
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
    return new ClaudeAgentRunner(config, toolRegistry);
  }
  return new StubbedAgentRunner();
}
