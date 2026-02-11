/**
 * Session Manager
 *
 * Manages AI sessions including queueing, execution, and streaming.
 * Integrates with claude-code-agent library (stubbed for now).
 */

import type {
  AIPromptRequest,
  AISessionSubmitResult,
  QueueStatus,
  AIProgressEvent,
  AISessionInfo,
  SessionState,
  AIConfig,
  AIPromptMessage,
  QueuedPromptInfo,
  AIQueueUpdate,
  AIPromptContext,
  QraftAiSessionId,
} from "../../types/ai";
import {
  DEFAULT_AI_CONFIG,
  deriveQraftAiSessionIdFromClaude,
} from "../../types/ai";
import { buildPromptWithContext } from "./prompt-builder";
import type { QraftBoxToolRegistry } from "../tools/registry.js";
import { SessionRegistry } from "../claude/session-registry.js";
import { createLogger } from "../logger.js";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { readdirSync, statSync } from "node:fs";
import {
  ClaudeCodeToolAgent,
  type ToolAgentSession,
} from "claude-code-agent/src/sdk/index.js";

/**
 * Internal session representation
 */
interface InternalSession {
  id: string;
  state: SessionState;
  prompt: string;
  fullPrompt: string;
  request: AIPromptRequest;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastAssistantMessage?: string;
  currentActivity: string | undefined;
  listeners: Set<(event: AIProgressEvent) => void>;
  abortController?: AbortController;
  toolAgentSession?: ToolAgentSession;
  claudeAgent?: ClaudeCodeToolAgent;
  registeredClaudeSessionIds: Set<string>;
  currentClaudeSessionId?: string;
}

/**
 * Internal queued prompt representation for server-side queue management
 */
interface QueuedPrompt {
  readonly id: string;
  /** Claude CLI session ID explicitly requested by the client (null = new session) */
  requestedClaudeSessionId: string | null;
  readonly message: string;
  readonly context: AIPromptContext;
  readonly projectPath: string;
  readonly runImmediately: boolean;
  readonly worktreeId: string;
  /** Client-generated group ID for session continuity across queued prompts */
  readonly qraftAiSessionId: QraftAiSessionId | undefined;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  resultClaudeSessionId: string | undefined;
  currentActivity: string | undefined;
  error: string | undefined;
  readonly createdAt: Date;
  /** QraftBox internal session ID (set when dispatched) */
  internalSessionId: string | undefined;
}

/**
 * Broadcast callback type for sending events to WebSocket clients
 */
export type BroadcastFn = (event: string, data: unknown) => void;

const SESSION_CANCEL_TIMEOUT_MS = 3000;

/**
 * Generate a deterministic, URL-safe worktree identifier from a project path.
 * Format: {basename_sanitized}_{6_char_hash}
 *
 * @param projectPath - Absolute filesystem path to the project/worktree directory
 * @returns URL-safe worktree identifier
 */
export function generateWorktreeId(projectPath: string): string {
  const base = basename(projectPath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const hash = Bun.hash(projectPath).toString(16).slice(0, 6);
  return `${base}_${hash}`;
}

/**
 * Session manager interface
 */
export interface SessionManager {
  /**
   * Submit a prompt for execution (immediate or queued)
   */
  submit(request: AIPromptRequest): Promise<AISessionSubmitResult>;

  /**
   * Cancel a session
   */
  cancel(sessionId: string): Promise<void>;

  /**
   * Get queue status for UI
   */
  getQueueStatus(): QueueStatus;

  /**
   * Get session info
   */
  getSession(sessionId: string): AISessionInfo | null;

  /**
   * List all sessions
   */
  listSessions(): readonly AISessionInfo[];

  /**
   * Subscribe to session progress events
   */
  subscribe(
    sessionId: string,
    listener: (event: AIProgressEvent) => void,
  ): () => void;

  /**
   * Clean up completed/failed sessions
   */
  cleanup(): void;

  /**
   * Submit a prompt to the server-side queue.
   * The server manages session continuity and execution order.
   * Returns the prompt ID and the resolved worktree ID.
   */
  submitPrompt(msg: AIPromptMessage): { promptId: string; worktreeId: string };

  /**
   * Get the current prompt queue state for display.
   * @param worktreeId - Optional filter to return only prompts for a specific worktree
   */
  getPromptQueue(worktreeId?: string): readonly QueuedPromptInfo[];

  /**
   * Cancel a queued prompt by its ID.
   */
  cancelPrompt(promptId: string): void;
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `session_${timestamp}_${random}`;
}

/**
 * Create a progress event
 */
function createProgressEvent(
  type: AIProgressEvent["type"],
  sessionId: string,
  data: AIProgressEvent["data"] = {},
): AIProgressEvent {
  return {
    type,
    sessionId,
    timestamp: new Date().toISOString(),
    data,
  };
}

/**
 * Extract a Claude session ID (UUID) from SDK/CLI stream messages.
 */
function extractClaudeSessionId(msg: unknown): string | null {
  if (typeof msg !== "object" || msg === null) return null;
  const obj = msg as Record<string, unknown>;

  if (typeof obj["sessionId"] === "string" && obj["sessionId"].length > 0) {
    return obj["sessionId"];
  }

  if (typeof obj["session_id"] === "string" && obj["session_id"].length > 0) {
    return obj["session_id"];
  }

  if (typeof obj["session_id"] === "number") {
    return String(obj["session_id"]);
  }

  return null;
}

/** UUID v4 pattern (lowercase hex with dashes) */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Discover the Claude CLI session ID from the transcript directory.
 *
 * Claude CLI stores session transcripts at:
 *   ~/.claude/projects/{encoded-path}/{session-uuid}.jsonl
 *
 * where {encoded-path} is the absolute project path with '/' replaced by '-'.
 *
 * @param projectPath - Absolute path to the project directory
 * @param createdAfter - Only consider files modified after this timestamp (ms)
 * @returns Claude CLI session UUID, or null if not found
 */
function discoverClaudeSessionId(
  projectPath: string,
  createdAfter: number,
): string | null {
  try {
    const encoded = projectPath.replace(/\//g, "-");
    const transcriptDir = join(homedir(), ".claude", "projects", encoded);

    let entries: string[];
    try {
      entries = readdirSync(transcriptDir);
    } catch {
      return null; // Directory doesn't exist
    }

    // Find UUID-named .jsonl files modified after the session started
    let best: { name: string; mtime: number } | undefined;
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const name = entry.slice(0, -6); // strip .jsonl
      if (!UUID_RE.test(name)) continue;

      try {
        const st = statSync(join(transcriptDir, entry));
        const mtime = st.mtimeMs;
        if (mtime < createdAfter) continue;
        if (best === undefined || mtime > best.mtime) {
          best = { name, mtime };
        }
      } catch {
        continue;
      }
    }

    return best?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Convert internal session to public session info
 */
function toSessionInfo(session: InternalSession): AISessionInfo {
  return {
    id: session.id,
    state: session.state,
    prompt: session.prompt,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString(),
    completedAt: session.completedAt?.toISOString(),
    context: session.request.context,
    lastAssistantMessage: session.lastAssistantMessage,
    currentActivity: session.currentActivity,
    claudeSessionId: session.currentClaudeSessionId,
  };
}

/**
 * Create a session manager
 *
 * @param config - AI configuration
 * @returns Session manager instance
 */
export function createSessionManager(
  config: AIConfig = DEFAULT_AI_CONFIG,
  toolRegistry?: QraftBoxToolRegistry | undefined,
  broadcast?: BroadcastFn | undefined,
): SessionManager {
  const logger = createLogger("SessionManager");
  const sessions = new Map<string, InternalSession>();
  const sessionRegistry = new SessionRegistry();
  const queue: string[] = [];
  let runningCount = 0;

  /** Server-side prompt queue */
  const promptQueue: QueuedPrompt[] = [];
  /** Max prompts to keep in queue for display (including completed) */
  const MAX_PROMPT_HISTORY = 50;

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Emit event to session listeners
   */
  function emitEvent(sessionId: string, event: AIProgressEvent): void {
    const session = sessions.get(sessionId);
    if (session !== undefined) {
      for (const listener of session.listeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }

  /**
   * Execute a session with real claude-code-agent integration
   */
  async function executeSession(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (session === undefined) return;

    session.state = "running";
    session.currentActivity = "Starting session...";
    session.startedAt = new Date();
    runningCount++;

    // Emit session started event
    emitEvent(sessionId, createProgressEvent("session_started", sessionId));

    try {
      // If toolRegistry is available, use real ClaudeCodeToolAgent
      if (toolRegistry !== undefined) {
        // Create ClaudeCodeToolAgent with tool registry
        const allowedToolNames = [...toolRegistry.getAllowedToolNames()];
        const mcpServerConfig = toolRegistry.toMcpServerConfig();

        const agent = new ClaudeCodeToolAgent({
          cwd: session.request.options.projectPath,
          mcpServers: {
            "qraftbox-tools": mcpServerConfig as any,
          },
          allowedTools: allowedToolNames,
          model: config.assistantModel,
          additionalArgs: [...config.assistantAdditionalArgs],
        });

        session.claudeAgent = agent;

        // Start or resume session
        const resumeSessionId = session.request.options.resumeSessionId;
        const toolAgentSession =
          resumeSessionId !== undefined
            ? await agent.startSession({
                prompt: session.fullPrompt,
                resumeSessionId,
              })
            : await agent.startSession({
                prompt: session.fullPrompt,
              });

        session.toolAgentSession = toolAgentSession;
        if (resumeSessionId !== undefined && resumeSessionId.length > 0) {
          session.currentClaudeSessionId = resumeSessionId;
          logger.info("Resuming Claude session", {
            qraftAiSessionId: sessionId,
            claudeSessionId: resumeSessionId,
          });
          try {
            await sessionRegistry.register(
              resumeSessionId,
              session.request.options.projectPath,
            );
            session.registeredClaudeSessionIds.add(resumeSessionId);
          } catch {
            // Best-effort registration for source detection.
          }
        }

        // Session started

        // Listen for events
        let streamedAssistantContent = "";
        toolAgentSession.on("message", (msg: unknown) => {
          const claudeSessionId = extractClaudeSessionId(msg);
          if (
            claudeSessionId !== null &&
            !session.registeredClaudeSessionIds.has(claudeSessionId)
          ) {
            session.registeredClaudeSessionIds.add(claudeSessionId);
            session.currentClaudeSessionId = claudeSessionId;
            logger.info("Detected Claude session ID from stream", {
              qraftAiSessionId: sessionId,
              claudeSessionId,
            });
            void sessionRegistry
              .register(claudeSessionId, session.request.options.projectPath)
              .catch(() => {
                // Best-effort registration for source detection.
              });
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

            if (
              msgType === "stream_event" &&
              rawMsg.event?.type === "content_block_delta" &&
              rawMsg.event.delta?.type === "text_delta" &&
              typeof rawMsg.event.delta.text === "string"
            ) {
              streamedAssistantContent += rawMsg.event.delta.text;
              if (streamedAssistantContent.length > 0) {
                session.lastAssistantMessage = streamedAssistantContent;
                session.currentActivity = undefined;
                emitEvent(
                  sessionId,
                  createProgressEvent("message", sessionId, {
                    role: "assistant",
                    content: streamedAssistantContent,
                  }),
                );
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
              session.lastAssistantMessage = content;
              session.currentActivity = undefined;
              emitEvent(
                sessionId,
                createProgressEvent("message", sessionId, {
                  role: "assistant",
                  content,
                }),
              );
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
            emitEvent(
              sessionId,
              createProgressEvent("tool_use", sessionId, {
                toolName,
                input,
              }),
            );
            session.currentActivity = `Using ${toolName}...`;
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
            emitEvent(
              sessionId,
              createProgressEvent("tool_result", sessionId, {
                toolName,
                output: toolResult.output,
                isError,
              }),
            );
            session.currentActivity = `Processing ${toolName} result...`;
          }
        });

        toolAgentSession.on("error", (err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          emitEvent(
            sessionId,
            createProgressEvent("error", sessionId, {
              message: errorMessage,
            }),
          );
        });

        // Iterate messages until completion
        let msgCount = 0;
        for await (const _msg of toolAgentSession.messages()) {
          msgCount++;
          // Check if cancelled
          const currentSession = sessions.get(sessionId);
          if (
            currentSession === undefined ||
            currentSession.state === "cancelled"
          ) {
            break;
          }
        }

        // Wait for completion
        const sessionResult = await toolAgentSession.waitForCompletion();
        const finalAgentState = toolAgentSession.getState().state;

        // Fallback: if stream messages never contained a session ID,
        // discover it from the transcript file that the CLI created.
        if (session.currentClaudeSessionId === undefined) {
          const discovered = discoverClaudeSessionId(
            session.request.options.projectPath,
            session.startedAt?.getTime() ?? session.createdAt.getTime(),
          );
          if (discovered !== null) {
            session.currentClaudeSessionId = discovered;
            session.registeredClaudeSessionIds.add(discovered);
            logger.info("Discovered Claude session ID from transcript file", {
              qraftAiSessionId: sessionId,
              claudeSessionId: discovered,
            });
            void sessionRegistry
              .register(discovered, session.request.options.projectPath)
              .catch(() => {});
          }
        }

        // Keep explicit cancellation as cancelled (don't downgrade to failed)
        const latestSession = sessions.get(sessionId);
        if (
          latestSession?.state === "cancelled" ||
          finalAgentState === "cancelled"
        ) {
          session.state = "cancelled";
          session.completedAt = new Date();
          return;
        }

        // Mark as completed or failed
        if (sessionResult.success) {
          session.state = "completed";
          session.currentActivity = undefined;
        } else {
          session.state = "failed";
          session.currentActivity = undefined;
          if (sessionResult.error !== undefined) {
            emitEvent(
              sessionId,
              createProgressEvent("error", sessionId, {
                message: sessionResult.error.message,
              }),
            );
          }
        }
        session.completedAt = new Date();

        // Clean up agent
        await agent.close();

        emitEvent(
          sessionId,
          createProgressEvent(
            session.state === "completed" ? "completed" : "error",
            sessionId,
          ),
        );
      } else {
        // Fallback to stubbed behavior if toolRegistry is undefined
        emitEvent(sessionId, createProgressEvent("thinking", sessionId));
        session.currentActivity = "Thinking...";

        await new Promise((resolve) => setTimeout(resolve, 100));

        const currentSession = sessions.get(sessionId);
        if (
          currentSession === undefined ||
          currentSession.state === "cancelled"
        ) {
          return;
        }

        const stubbedContent =
          "[AI Integration Stubbed] Tool registry not provided. The full prompt was:\n\n" +
          session.fullPrompt.slice(0, 500) +
          (session.fullPrompt.length > 500 ? "..." : "");
        session.lastAssistantMessage = stubbedContent;
        session.currentActivity = undefined;

        emitEvent(
          sessionId,
          createProgressEvent("message", sessionId, {
            role: "assistant",
            content: stubbedContent,
          }),
        );

        session.state = "completed";
        session.completedAt = new Date();
        session.currentActivity = undefined;

        emitEvent(sessionId, createProgressEvent("completed", sessionId));
      }
    } catch (e) {
      if (session.state === "cancelled") {
        session.completedAt = session.completedAt ?? new Date();
        return;
      }

      session.state = "failed";
      session.completedAt = new Date();
      session.currentActivity = undefined;

      const errorMessage = e instanceof Error ? e.message : "Session failed";
      emitEvent(
        sessionId,
        createProgressEvent("error", sessionId, {
          message: errorMessage,
        }),
      );
    } finally {
      runningCount--;
      processQueue();
      // Also drain the prompt queue – the "completed" event listener in
      // dispatchNextPrompt's subscriber fires *before* runningCount is
      // decremented, so its re-entrance check (runningCount >= maxConcurrent)
      // returns early.  We must retry here, after the decrement.
      dispatchNextPrompt();
    }
  }

  /**
   * Process the queue - start next session if capacity available
   */
  function processQueue(): void {
    while (runningCount < config.maxConcurrent && queue.length > 0) {
      const nextSessionId = queue.shift();
      if (nextSessionId !== undefined) {
        const session = sessions.get(nextSessionId);
        if (session !== undefined && session.state === "queued") {
          // Don't await - run in background
          executeSession(nextSessionId).catch(() => {
            // Errors handled in executeSession
          });
        }
      }
    }
  }

  /**
   * Generate a unique prompt ID
   */
  function generatePromptId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    return `prompt_${timestamp}_${random}`;
  }

  /**
   * Convert internal QueuedPrompt to QueuedPromptInfo for broadcast
   */
  function toPromptInfo(p: QueuedPrompt): QueuedPromptInfo {
    return {
      id: p.id,
      message:
        p.message.length > 200 ? p.message.slice(0, 200) + "..." : p.message,
      status: p.status,
      requested_claude_session_id: p.requestedClaudeSessionId,
      claude_session_id: p.resultClaudeSessionId,
      current_activity: p.currentActivity,
      error: p.error,
      created_at: p.createdAt.toISOString(),
      worktree_id: p.worktreeId,
      qraft_ai_session_id: p.qraftAiSessionId,
    };
  }

  /**
   * Broadcast current prompt queue state via WebSocket
   */
  function broadcastQueueUpdate(): void {
    if (broadcast === undefined) return;
    const update: AIQueueUpdate = {
      prompts: promptQueue.map(toPromptInfo),
    };
    broadcast("ai:queue_update", update);
  }

  /**
   * Trim old completed/failed prompts from queue to prevent unbounded growth
   */
  function trimPromptHistory(): void {
    while (promptQueue.length > MAX_PROMPT_HISTORY) {
      const oldest = promptQueue[0];
      if (
        oldest !== undefined &&
        (oldest.status === "completed" ||
          oldest.status === "failed" ||
          oldest.status === "cancelled")
      ) {
        promptQueue.shift();
      } else {
        break;
      }
    }
  }

  /**
   * Resolve the resumeSessionId for the next prompt in queue.
   *
   * Priority:
   * 1. If prompt has an explicit session_id (Claude CLI session ID), use it
   * 2. If prompt has a qraft_ai_session_id, look for the most recently completed
   *    prompt in the same group to inherit its resultClaudeSessionId
   * 3. Otherwise, fall back to same-worktree lookup
   * 4. If none found, start a new session (undefined)
   */
  function resolveResumeSessionId(prompt: QueuedPrompt): string | undefined {
    // 1. Explicit Claude session ID takes priority
    if (
      prompt.requestedClaudeSessionId !== null &&
      prompt.requestedClaudeSessionId.length > 0
    ) {
      return prompt.requestedClaudeSessionId;
    }

    // 2. Match by qraft_ai_session_id first (client-generated group key)
    if (
      prompt.qraftAiSessionId !== undefined &&
      prompt.qraftAiSessionId.length > 0
    ) {
      for (let i = promptQueue.length - 1; i >= 0; i--) {
        const prev = promptQueue[i];
        if (prev === undefined) continue;
        if (prev.id === prompt.id) continue;
        if (prev.qraftAiSessionId !== prompt.qraftAiSessionId) continue;
        if (
          prev.resultClaudeSessionId !== undefined &&
          prev.resultClaudeSessionId.length > 0
        ) {
          return prev.resultClaudeSessionId;
        }
      }
    }

    // 3. Fall back to same-worktree lookup
    for (let i = promptQueue.length - 1; i >= 0; i--) {
      const prev = promptQueue[i];
      if (prev === undefined) continue;
      if (prev.id === prompt.id) continue;
      if (prev.worktreeId !== prompt.worktreeId) continue;
      if (
        prev.resultClaudeSessionId !== undefined &&
        prev.resultClaudeSessionId.length > 0
      ) {
        return prev.resultClaudeSessionId;
      }
    }

    return undefined;
  }

  /**
   * Dispatch the next queued prompt for execution.
   * Called when the prompt queue has items and capacity is available.
   */
  function dispatchNextPrompt(): void {
    const next = promptQueue.find((p) => p.status === "queued");
    if (next === undefined) return;
    if (runningCount >= config.maxConcurrent) return;

    next.status = "running";
    next.currentActivity = "Starting...";
    broadcastQueueUpdate();

    const resumeSessionId = resolveResumeSessionId(next);
    logger.info("Dispatching queued prompt", {
      promptId: next.id,
      resumeSessionId: resumeSessionId ?? null,
      message: next.message.slice(0, 80),
    });

    // Use the existing submit() mechanism internally
    const self = sessionManagerRef;
    if (self === undefined) return;

    void self
      .submit({
        prompt: next.message,
        context: next.context,
        options: {
          projectPath: next.projectPath,
          sessionMode: resumeSessionId !== undefined ? "continue" : "new",
          immediate: true,
          resumeSessionId,
        },
      })
      .then((result) => {
        next.internalSessionId = result.sessionId;
        if (result.claudeSessionId !== undefined) {
          next.resultClaudeSessionId = result.claudeSessionId;
        }
        broadcastQueueUpdate();

        // Subscribe to session events to track prompt lifecycle
        self.subscribe(result.sessionId, (event) => {
          if (event.type === "completed") {
            next.status = "completed";
            next.currentActivity = undefined;
            // Resolve claude session ID from the completed session
            const completedSession = self.getSession(result.sessionId);
            if (completedSession?.claudeSessionId !== undefined) {
              next.resultClaudeSessionId = completedSession.claudeSessionId;
            }
            trimPromptHistory();
            broadcastQueueUpdate();
            // Dispatch next prompt in queue
            dispatchNextPrompt();
          } else if (event.type === "error") {
            next.status = "failed";
            next.currentActivity = undefined;
            const errorData = event.data as { message?: string };
            next.error =
              typeof errorData.message === "string"
                ? errorData.message
                : "Session failed";
            broadcastQueueUpdate();
            // Still try to dispatch next
            dispatchNextPrompt();
          } else if (event.type === "cancelled") {
            next.status = "cancelled";
            next.currentActivity = undefined;
            broadcastQueueUpdate();
            dispatchNextPrompt();
          } else if (event.type === "tool_use") {
            const toolData = event.data as { toolName?: string };
            next.currentActivity =
              typeof toolData.toolName === "string"
                ? `Using ${toolData.toolName}...`
                : "Using tool...";
            broadcastQueueUpdate();
          } else if (event.type === "message") {
            next.currentActivity = undefined;
            // Also pick up claude session ID from message events
            const session = self.getSession(result.sessionId);
            if (session?.claudeSessionId !== undefined) {
              next.resultClaudeSessionId = session.claudeSessionId;
            }
            broadcastQueueUpdate();
          } else if (
            event.type === "thinking" ||
            event.type === "session_started"
          ) {
            next.currentActivity = "Thinking...";
            broadcastQueueUpdate();
          }
        });
      })
      .catch((err: unknown) => {
        next.status = "failed";
        next.currentActivity = undefined;
        next.error = err instanceof Error ? err.message : "Dispatch failed";
        broadcastQueueUpdate();
        dispatchNextPrompt();
      });
  }

  // Forward reference for self-calling submit from prompt queue
  let sessionManagerRef: SessionManager | undefined;

  const manager: SessionManager = {
    async submit(request: AIPromptRequest): Promise<AISessionSubmitResult> {
      if (!config.enabled) {
        throw new Error("AI features are disabled");
      }

      const sessionId = generateSessionId();
      const fullPrompt = buildPromptWithContext(request);

      const session: InternalSession = {
        id: sessionId,
        state: "queued",
        prompt: request.prompt,
        fullPrompt,
        request,
        createdAt: new Date(),
        currentActivity: undefined,
        listeners: new Set(),
        registeredClaudeSessionIds: new Set(),
        ...(request.options.resumeSessionId !== undefined
          ? { currentClaudeSessionId: request.options.resumeSessionId }
          : {}),
      };

      sessions.set(sessionId, session);

      // Immediate execution or queue
      if (request.options.immediate && runningCount < config.maxConcurrent) {
        // Start immediately
        executeSession(sessionId).catch(() => {
          // Errors handled in executeSession
        });

        return {
          sessionId,
          immediate: true,
          claudeSessionId: session.currentClaudeSessionId,
        };
      } else {
        // Add to queue
        if (queue.length >= config.maxQueueSize) {
          sessions.delete(sessionId);
          throw new Error(
            `Queue is full (max ${config.maxQueueSize} sessions)`,
          );
        }

        queue.push(sessionId);
        const queuePosition = queue.indexOf(sessionId) + 1;

        // Try to process queue in case there's capacity
        processQueue();

        return {
          sessionId,
          queuePosition,
          immediate: false,
          claudeSessionId: session.currentClaudeSessionId,
        };
      }
    },

    async cancel(sessionId: string): Promise<void> {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (
        session.state === "completed" ||
        session.state === "failed" ||
        session.state === "cancelled"
      ) {
        return; // Already done
      }

      // Remove from queue if queued
      const queueIndex = queue.indexOf(sessionId);
      if (queueIndex !== -1) {
        queue.splice(queueIndex, 1);
      }

      // Mark cancelled first so UI and executor loop observe terminal state quickly.
      session.state = "cancelled";
      session.completedAt = new Date();
      session.currentActivity = undefined;
      emitEvent(sessionId, createProgressEvent("cancelled", sessionId));

      // Cancel ToolAgentSession if available
      if (session.toolAgentSession !== undefined) {
        let cancelTimedOut = false;
        try {
          await Promise.race([
            session.toolAgentSession.cancel(),
            delay(SESSION_CANCEL_TIMEOUT_MS).then(() => {
              cancelTimedOut = true;
            }),
          ]);
        } catch {
          cancelTimedOut = true;
        }

        // Force-abort if graceful cancel did not complete in time
        if (cancelTimedOut) {
          try {
            await session.toolAgentSession.abort();
          } catch {
            // Keep cancellation idempotent and continue local cleanup
          }
        }
      }

      // Abort if running (fallback for old abort controller)
      if (session.abortController !== undefined) {
        session.abortController.abort();
      }
    },

    getQueueStatus(): QueueStatus {
      const runningSessionIds: string[] = [];
      for (const session of sessions.values()) {
        if (session.state === "running") {
          runningSessionIds.push(session.id);
        }
      }

      return {
        runningCount,
        queuedCount: queue.length,
        runningSessionIds,
        totalCount: runningCount + queue.length,
      };
    },

    getSession(sessionId: string): AISessionInfo | null {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return null;
      }
      return toSessionInfo(session);
    },

    listSessions(): readonly AISessionInfo[] {
      return Array.from(sessions.values()).map(toSessionInfo);
    },

    subscribe(
      sessionId: string,
      listener: (event: AIProgressEvent) => void,
    ): () => void {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        // Return no-op unsubscribe
        return () => {};
      }

      session.listeners.add(listener);

      // Return unsubscribe function
      return () => {
        session.listeners.delete(listener);
      };
    },

    cleanup(): void {
      const now = Date.now();
      const maxAge = config.sessionTimeoutMs;

      for (const [id, session] of sessions.entries()) {
        // Remove completed/failed/cancelled sessions older than maxAge
        if (
          session.state === "completed" ||
          session.state === "failed" ||
          session.state === "cancelled"
        ) {
          const age = now - session.createdAt.getTime();
          if (age > maxAge) {
            sessions.delete(id);
          }
        }
      }
    },

    submitPrompt(msg: AIPromptMessage): {
      promptId: string;
      worktreeId: string;
    } {
      if (!config.enabled) {
        throw new Error("AI features are disabled");
      }

      const promptId = generatePromptId();
      const projectPath = msg.project_path ?? "";
      const worktreeId =
        typeof msg.worktree_id === "string" && msg.worktree_id.length > 0
          ? msg.worktree_id
          : generateWorktreeId(projectPath);

      // Resolve qraft_ai_session_id:
      // 1. Use explicit value if provided
      // 2. Derive from session_id (Claude session ID) if available
      // 3. Otherwise undefined (new session group)
      let qraftAiSessionId: QraftAiSessionId | undefined;
      if (
        typeof msg.qraft_ai_session_id === "string" &&
        msg.qraft_ai_session_id.length > 0
      ) {
        qraftAiSessionId = msg.qraft_ai_session_id as QraftAiSessionId;
      } else if (msg.session_id !== null && msg.session_id.length > 0) {
        qraftAiSessionId = deriveQraftAiSessionIdFromClaude(msg.session_id);
      }

      const prompt: QueuedPrompt = {
        id: promptId,
        requestedClaudeSessionId: msg.session_id,
        message: msg.message,
        context: msg.context ?? { references: [] },
        projectPath,
        runImmediately: msg.run_immediately,
        worktreeId,
        qraftAiSessionId,
        status: "queued",
        resultClaudeSessionId: undefined,
        currentActivity: undefined,
        error: undefined,
        createdAt: new Date(),
        internalSessionId: undefined,
      };

      promptQueue.push(prompt);
      logger.info("Prompt queued", {
        promptId,
        requestedClaudeSessionId: msg.session_id,
        qraftAiSessionId,
        queueLength: promptQueue.filter((p) => p.status === "queued").length,
      });

      broadcastQueueUpdate();

      // Try to dispatch immediately if capacity available
      dispatchNextPrompt();

      return { promptId, worktreeId };
    },

    getPromptQueue(worktreeId?: string): readonly QueuedPromptInfo[] {
      const source =
        typeof worktreeId === "string" && worktreeId.length > 0
          ? promptQueue.filter((p) => p.worktreeId === worktreeId)
          : promptQueue;
      return source.map(toPromptInfo);
    },

    cancelPrompt(promptId: string): void {
      const prompt = promptQueue.find((p) => p.id === promptId);
      if (prompt === undefined) {
        throw new Error(`Prompt not found: ${promptId}`);
      }

      if (prompt.status === "queued") {
        prompt.status = "cancelled";
        prompt.currentActivity = undefined;
        broadcastQueueUpdate();
      } else if (
        prompt.status === "running" &&
        prompt.internalSessionId !== undefined
      ) {
        // Cancel the running session
        void manager.cancel(prompt.internalSessionId).catch(() => {
          // Best effort
        });
        prompt.status = "cancelled";
        prompt.currentActivity = undefined;
        broadcastQueueUpdate();
      }
    },
  };

  // Set forward reference so dispatchNextPrompt can call submit()
  sessionManagerRef = manager;

  return manager;
}
