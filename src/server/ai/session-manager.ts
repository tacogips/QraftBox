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
  AIConfig,
  AIPromptMessage,
  QueuedPromptInfo,
  AIQueueUpdate,
  AIPromptContext,
  QraftAiSessionId,
  ClaudeSessionId,
  PromptId,
  WorktreeId,
} from "../../types/ai";
import { DEFAULT_AI_CONFIG } from "../../types/ai";
import { buildPromptWithContext } from "./prompt-builder";
import type { QraftBoxToolRegistry } from "../tools/registry.js";
import type { SessionMappingStore } from "./session-mapping-store.js";
import type { AiSessionStore, AiSessionRow } from "./ai-session-store.js";
import {
  createInMemoryAiSessionStore,
  toSessionInfo,
} from "./ai-session-store.js";
import { createLogger } from "../logger.js";
import { basename } from "node:path";
import {
  ClaudeCodeToolAgent,
  type ToolAgentSession,
} from "claude-code-agent/src/sdk/index.js";

/**
 * Runtime session handle - only stores non-serializable runtime state
 */
interface RuntimeSessionHandle {
  listeners: Set<(event: AIProgressEvent) => void>;
  toolAgentSession?: ToolAgentSession | undefined;
  registeredClaudeSessionIds: Set<ClaudeSessionId>;
  /** Runtime-only content fields (not persisted to SQLite) */
  prompt: string;
  fullPrompt: string;
  context: AIPromptContext;
  lastAssistantMessage?: string | undefined;
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
export function generateWorktreeId(projectPath: string): WorktreeId {
  const base = basename(projectPath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const hash = Bun.hash(projectPath).toString(16).slice(0, 6);
  return `${base}_${hash}` as WorktreeId;
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
  cancel(sessionId: QraftAiSessionId): Promise<void>;

  /**
   * Get queue status for UI
   */
  getQueueStatus(): QueueStatus;

  /**
   * Get session info
   */
  getSession(sessionId: QraftAiSessionId): AISessionInfo | null;

  /**
   * List all sessions
   */
  listSessions(): readonly AISessionInfo[];

  /**
   * Subscribe to session progress events
   */
  subscribe(
    sessionId: QraftAiSessionId,
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
  submitPrompt(msg: AIPromptMessage): {
    promptId: PromptId;
    worktreeId: WorktreeId;
  };

  /**
   * Get the current prompt queue state for display.
   * @param worktreeId - Optional filter to return only prompts for a specific worktree
   */
  getPromptQueue(worktreeId?: WorktreeId): readonly QueuedPromptInfo[];

  /**
   * Cancel a queued prompt by its ID.
   */
  cancelPrompt(promptId: PromptId): void;

  /**
   * Get the session mapping store for batch lookups (undefined if not configured).
   */
  getMappingStore(): SessionMappingStore | undefined;
}

/**
 * Generate a unique session ID using FNV-1a hash.
 * Same format as QraftAiSessionId: "qs_{base36_hash}"
 */
function generateSessionId(): QraftAiSessionId {
  const seed =
    String(Date.now()) + Math.random().toString(36).slice(2, 6) + "qraft";
  let hash = 0x811c9dc5; // FNV-1a offset basis (32-bit)
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV-1a prime
  }
  return `qs_${(hash >>> 0).toString(36)}` as QraftAiSessionId;
}

/**
 * Create a progress event
 */
function createProgressEvent(
  type: AIProgressEvent["type"],
  sessionId: QraftAiSessionId,
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
 * Create a session manager
 *
 * @param config - AI configuration
 * @param toolRegistry - Tool registry for MCP tools
 * @param broadcast - Broadcast function for WebSocket events
 * @param mappingStore - Session mapping store for persisting qraft_ai_session_id <-> claude_session_id mappings
 * @param sessionStore - AI session store for persisting session metadata
 * @returns Session manager instance
 */
export function createSessionManager(
  config: AIConfig = DEFAULT_AI_CONFIG,
  toolRegistry?: QraftBoxToolRegistry | undefined,
  broadcast?: BroadcastFn | undefined,
  mappingStore?: SessionMappingStore | undefined,
  sessionStore?: AiSessionStore | undefined,
): SessionManager {
  const logger = createLogger("SessionManager");
  const store = sessionStore ?? createInMemoryAiSessionStore();
  const runtimeHandles = new Map<QraftAiSessionId, RuntimeSessionHandle>();

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Convert AiSessionRow to QueuedPromptInfo for broadcast
   */
  function toPromptInfoFromRow(row: AiSessionRow): QueuedPromptInfo {
    return {
      id: row.promptId ?? ("" as PromptId),
      message: row.message ?? "",
      status: row.state,
      claude_session_id: row.currentClaudeSessionId,
      current_activity: row.currentActivity,
      error: row.error,
      created_at: row.createdAt,
      worktree_id: row.worktreeId ?? ("" as WorktreeId),
      qraft_ai_session_id: row.clientSessionId,
    };
  }

  /**
   * Resolve the resumeSessionId for a session about to be executed.
   *
   * Priority:
   * 0. Persistent SQLite lookup by clientSessionId via mappingStore
   * 1. AiSessionStore lookup by clientSessionId (most recent session with claude ID)
   * 2. AiSessionStore lookup by worktreeId (fallback)
   * 3. If none found, start a new session (undefined)
   */
  function resolveResumeSessionId(
    session: AiSessionRow,
  ): ClaudeSessionId | undefined {
    // 0. Persistent SQLite mapping store lookup
    if (
      mappingStore !== undefined &&
      session.clientSessionId !== undefined &&
      session.clientSessionId.length > 0
    ) {
      const stored = mappingStore.findClaudeSessionId(session.clientSessionId);
      if (stored !== undefined) {
        logger.info("Resolved resume session via SQLite mapping", {
          sessionId: session.id,
          clientSessionId: session.clientSessionId,
          resumeSessionId: stored,
        });
        return stored;
      }
    }

    // 1. AiSessionStore lookup by clientSessionId
    if (
      session.clientSessionId !== undefined &&
      session.clientSessionId.length > 0
    ) {
      const resumeId = store.findResumeByClientSessionId(
        session.clientSessionId,
      );
      if (resumeId !== undefined) {
        logger.info("Resolved resume session via clientSessionId in store", {
          sessionId: session.id,
          clientSessionId: session.clientSessionId,
          resumeSessionId: resumeId,
        });
        return resumeId;
      }
    }

    // 2. AiSessionStore lookup by worktreeId
    if (session.worktreeId !== undefined && session.worktreeId.length > 0) {
      const resumeId = store.findResumeByWorktreeId(session.worktreeId);
      if (resumeId !== undefined) {
        logger.info("Resolved resume session via worktreeId fallback", {
          sessionId: session.id,
          worktreeId: session.worktreeId,
          resumeSessionId: resumeId,
        });
        return resumeId;
      }
    }

    return undefined;
  }

  /**
   * Broadcast current prompt queue state via WebSocket
   */
  function broadcastQueueUpdate(): void {
    if (broadcast === undefined) return;
    const rows = store.listPromptQueue();
    const update: AIQueueUpdate = {
      prompts: rows.map(toPromptInfoFromRow),
    };
    broadcast("ai:queue_update", update);
  }

  /**
   * Emit event to session listeners
   */
  function emitEvent(
    sessionId: QraftAiSessionId,
    event: AIProgressEvent,
  ): void {
    const handle = runtimeHandles.get(sessionId);
    if (handle !== undefined) {
      for (const listener of handle.listeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }

    // Broadcast queue update for prompt queue entries
    const session = store.get(sessionId);
    if (session?.promptId !== undefined) {
      broadcastQueueUpdate();
    }
  }

  /**
   * Execute a session with real claude-code-agent integration
   */
  async function executeSession(sessionId: QraftAiSessionId): Promise<void> {
    const session = store.get(sessionId);
    if (session === undefined) return;

    const handle = runtimeHandles.get(sessionId);
    if (handle === undefined) return;

    // Update state to running
    const startedAt = new Date().toISOString();
    store.updateState(sessionId, "running", { startedAt });
    store.updateActivity(sessionId, "Starting session...");

    // Emit session started event
    emitEvent(sessionId, createProgressEvent("session_started", sessionId));

    try {
      // If toolRegistry is available, use real ClaudeCodeToolAgent
      if (toolRegistry !== undefined) {
        // Create ClaudeCodeToolAgent with tool registry
        const allowedToolNames = [...toolRegistry.getAllowedToolNames()];
        const mcpServerConfig = toolRegistry.toMcpServerConfig();

        const agent = new ClaudeCodeToolAgent({
          cwd: session.projectPath,
          mcpServers: {
            "qraftbox-tools": mcpServerConfig as any,
          },
          allowedTools: allowedToolNames,
          model: config.assistantModel,
          additionalArgs: [...config.assistantAdditionalArgs],
        });

        // Start or resume session using cached Claude session ID
        const resumeClaudeId = session.currentClaudeSessionId;
        const toolAgentSession =
          resumeClaudeId !== undefined
            ? await agent.startSession({
                prompt: handle.fullPrompt,
                resumeSessionId: resumeClaudeId,
              })
            : await agent.startSession({
                prompt: handle.fullPrompt,
              });

        handle.toolAgentSession = toolAgentSession;
        if (resumeClaudeId !== undefined) {
          logger.info("Resuming Claude session", {
            qraftAiSessionId: sessionId,
            claudeSessionId: resumeClaudeId,
          });
          handle.registeredClaudeSessionIds.add(resumeClaudeId);
          try {
            mappingStore?.upsert(
              resumeClaudeId,
              session.projectPath,
              session.worktreeId ?? generateWorktreeId(session.projectPath),
              "qraftbox",
            );
          } catch {
            // Best-effort registration for source detection.
          }
        }

        // Session started

        // Listen for events
        let streamedAssistantContent = "";
        toolAgentSession.on("message", (msg: unknown) => {
          // Detect Claude session ID once from stream (only for new sessions)
          const currentSession = store.get(sessionId);
          if (
            currentSession !== undefined &&
            currentSession.currentClaudeSessionId === undefined &&
            typeof msg === "object" &&
            msg !== null
          ) {
            const obj = msg as Record<string, unknown>;
            if (
              typeof obj["sessionId"] === "string" &&
              obj["sessionId"].length > 0
            ) {
              const claudeSessionId = obj["sessionId"] as ClaudeSessionId;
              store.updateClaudeSessionId(sessionId, claudeSessionId);
              handle.registeredClaudeSessionIds.add(claudeSessionId);
              logger.info("Detected Claude session ID from stream", {
                qraftAiSessionId: sessionId,
                claudeSessionId,
              });
              try {
                mappingStore?.upsert(
                  claudeSessionId,
                  currentSession.projectPath,
                  currentSession.worktreeId ??
                    generateWorktreeId(currentSession.projectPath),
                  "qraftbox",
                );
              } catch {
                // Best-effort registration for source detection.
              }
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

            if (
              msgType === "stream_event" &&
              rawMsg.event?.type === "content_block_delta" &&
              rawMsg.event.delta?.type === "text_delta" &&
              typeof rawMsg.event.delta.text === "string"
            ) {
              streamedAssistantContent += rawMsg.event.delta.text;
              if (streamedAssistantContent.length > 0) {
                handle.lastAssistantMessage = streamedAssistantContent;
                store.updateActivity(sessionId, undefined);
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
              handle.lastAssistantMessage = content;
              store.updateActivity(sessionId, undefined);
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
            store.updateActivity(sessionId, `Using ${toolName}...`);
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
            store.updateActivity(sessionId, `Processing ${toolName} result...`);
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
        for await (const _msg of toolAgentSession.messages()) {
          // Check if cancelled
          const currentSession = store.get(sessionId);
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

        // Keep explicit cancellation as cancelled (don't downgrade to failed)
        const latestSession = store.get(sessionId);
        if (
          latestSession?.state === "cancelled" ||
          finalAgentState === "cancelled"
        ) {
          const completedAt = new Date().toISOString();
          store.updateState(sessionId, "cancelled", { completedAt });
          store.updateActivity(sessionId, undefined);
          return;
        }

        // Mark as completed or failed
        const completedAt = new Date().toISOString();
        if (sessionResult.success) {
          store.updateState(sessionId, "completed", { completedAt });
          store.updateActivity(sessionId, undefined);
        } else {
          store.updateState(sessionId, "failed", { completedAt });
          store.updateActivity(sessionId, undefined);
          // Store error message in session
          if (sessionResult.error !== undefined) {
            store.updateError(sessionId, sessionResult.error.message);
            emitEvent(
              sessionId,
              createProgressEvent("error", sessionId, {
                message: sessionResult.error.message,
              }),
            );
          }
        }

        // Persist final mapping to SQLite for cross-restart continuity
        const completedSession = store.get(sessionId);
        if (
          mappingStore !== undefined &&
          completedSession?.currentClaudeSessionId !== undefined &&
          completedSession.worktreeId !== undefined
        ) {
          try {
            mappingStore.upsert(
              completedSession.currentClaudeSessionId,
              completedSession.projectPath,
              completedSession.worktreeId,
              "qraftbox",
            );
          } catch {
            // Non-critical
          }
        }

        // Clean up agent
        await agent.close();

        const finalSession = store.get(sessionId);
        emitEvent(
          sessionId,
          createProgressEvent(
            finalSession?.state === "completed" ? "completed" : "error",
            sessionId,
          ),
        );
      } else {
        // Fallback to stubbed behavior if toolRegistry is undefined
        emitEvent(sessionId, createProgressEvent("thinking", sessionId));
        store.updateActivity(sessionId, "Thinking...");

        await new Promise((resolve) => setTimeout(resolve, 100));

        const currentSession = store.get(sessionId);
        if (
          currentSession === undefined ||
          currentSession.state === "cancelled"
        ) {
          return;
        }

        const stubbedContent =
          "[AI Integration Stubbed] Tool registry not provided. The full prompt was:\n\n" +
          handle.fullPrompt.slice(0, 500) +
          (handle.fullPrompt.length > 500 ? "..." : "");
        handle.lastAssistantMessage = stubbedContent;
        store.updateActivity(sessionId, undefined);

        emitEvent(
          sessionId,
          createProgressEvent("message", sessionId, {
            role: "assistant",
            content: stubbedContent,
          }),
        );

        const completedAt = new Date().toISOString();
        store.updateState(sessionId, "completed", { completedAt });

        emitEvent(sessionId, createProgressEvent("completed", sessionId));
      }
    } catch (e) {
      const currentSession = store.get(sessionId);
      if (currentSession?.state === "cancelled") {
        const completedAt =
          currentSession.completedAt ?? new Date().toISOString();
        store.updateState(sessionId, "cancelled", { completedAt });
        return;
      }

      const completedAt = new Date().toISOString();
      store.updateState(sessionId, "failed", { completedAt });
      store.updateActivity(sessionId, undefined);

      const errorMessage = e instanceof Error ? e.message : "Session failed";
      store.updateError(sessionId, errorMessage);
      emitEvent(
        sessionId,
        createProgressEvent("error", sessionId, {
          message: errorMessage,
        }),
      );
    } finally {
      // Clean up runtime handle for terminal states
      const finalSession = store.get(sessionId);
      if (
        finalSession !== undefined &&
        (finalSession.state === "completed" ||
          finalSession.state === "failed" ||
          finalSession.state === "cancelled")
      ) {
        runtimeHandles.delete(sessionId);
      }
      broadcastQueueUpdate();
      processQueue();
    }
  }

  /**
   * Process the queue - start next session if capacity available
   */
  function processQueue(): void {
    while (store.countByState("running") < config.maxConcurrent) {
      const nextSessionId = store.nextQueued();
      if (nextSessionId === undefined) break;

      const session = store.get(nextSessionId);
      if (session === undefined || session.state !== "queued") continue;

      // For prompt queue sessions, resolve resume session ID
      if (
        session.promptId !== undefined &&
        session.currentClaudeSessionId === undefined
      ) {
        const resumeId = resolveResumeSessionId(session);
        if (resumeId !== undefined) {
          store.updateClaudeSessionId(nextSessionId, resumeId);
        }
      }

      broadcastQueueUpdate();

      // Don't await - run in background
      executeSession(nextSessionId).catch(() => {
        // Errors handled in executeSession
      });
    }
  }

  /**
   * Generate a unique prompt ID
   */
  function generatePromptId(): PromptId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    return `prompt_${timestamp}_${random}` as PromptId;
  }

  const manager: SessionManager = {
    async submit(request: AIPromptRequest): Promise<AISessionSubmitResult> {
      if (!config.enabled) {
        throw new Error("AI features are disabled");
      }

      const sessionId = generateSessionId();
      const fullPrompt = buildPromptWithContext(request);

      // Immediate execution or queue
      if (
        request.options.immediate &&
        store.countByState("running") < config.maxConcurrent
      ) {
        // Create session in store
        const sessionRow: AiSessionRow = {
          id: sessionId,
          state: "queued" as const,
          projectPath: request.options.projectPath,
          createdAt: new Date().toISOString(),
          currentActivity: undefined,
          currentClaudeSessionId: request.options.resumeSessionId,
        };

        store.insert(sessionRow);

        // Create runtime handle
        const handle: RuntimeSessionHandle = {
          listeners: new Set(),
          registeredClaudeSessionIds: new Set(),
          prompt: request.prompt,
          fullPrompt,
          context: request.context,
        };
        runtimeHandles.set(sessionId, handle);

        // Start immediately
        executeSession(sessionId).catch(() => {
          // Errors handled in executeSession
        });

        return {
          sessionId,
          immediate: true,
          claudeSessionId: sessionRow.currentClaudeSessionId,
        };
      } else {
        // Check queue size BEFORE inserting
        if (store.countByState("queued") >= config.maxQueueSize) {
          throw new Error(
            `Queue is full (max ${config.maxQueueSize} sessions)`,
          );
        }

        // Create session in store
        const sessionRow: AiSessionRow = {
          id: sessionId,
          state: "queued" as const,
          projectPath: request.options.projectPath,
          createdAt: new Date().toISOString(),
          currentActivity: undefined,
          currentClaudeSessionId: request.options.resumeSessionId,
        };

        store.insert(sessionRow);

        // Create runtime handle
        const handle: RuntimeSessionHandle = {
          listeners: new Set(),
          registeredClaudeSessionIds: new Set(),
          prompt: request.prompt,
          fullPrompt,
          context: request.context,
        };
        runtimeHandles.set(sessionId, handle);

        // Calculate queue position (1-based)
        const queuedSessions = store.listByState("queued");
        const queuePosition =
          queuedSessions.findIndex((s) => s.id === sessionId) + 1;

        // Try to process queue in case there's capacity
        processQueue();

        return {
          sessionId,
          queuePosition: queuePosition > 0 ? queuePosition : undefined,
          immediate: false,
          claudeSessionId: sessionRow.currentClaudeSessionId,
        };
      }
    },

    async cancel(sessionId: QraftAiSessionId): Promise<void> {
      const session = store.get(sessionId);
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

      // Mark cancelled first so UI and executor loop observe terminal state quickly.
      const completedAt = new Date().toISOString();
      store.updateState(sessionId, "cancelled", { completedAt });
      store.updateActivity(sessionId, undefined);
      emitEvent(sessionId, createProgressEvent("cancelled", sessionId));

      // Cancel ToolAgentSession if available
      const handle = runtimeHandles.get(sessionId);
      if (handle?.toolAgentSession !== undefined) {
        let cancelTimedOut = false;
        try {
          await Promise.race([
            handle.toolAgentSession.cancel(),
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
            await handle.toolAgentSession.abort();
          } catch {
            // Keep cancellation idempotent and continue local cleanup
          }
        }
      }

      // Clean up runtime handle
      runtimeHandles.delete(sessionId);
    },

    getQueueStatus(): QueueStatus {
      const running = store.listByState("running");
      const queuedCount = store.countByState("queued");

      return {
        runningCount: running.length,
        queuedCount,
        runningSessionIds: running.map((s) => s.id),
        totalCount: running.length + queuedCount,
      };
    },

    getSession(sessionId: QraftAiSessionId): AISessionInfo | null {
      const session = store.get(sessionId);
      if (session === undefined) {
        return null;
      }
      const handle = runtimeHandles.get(sessionId);
      const info = toSessionInfo(session);
      // Merge runtime content if handle exists
      if (handle !== undefined) {
        return {
          ...info,
          prompt: handle.prompt,
          context: handle.context,
          lastAssistantMessage: handle.lastAssistantMessage,
        };
      }
      return info;
    },

    listSessions(): readonly AISessionInfo[] {
      return store.list().map((row) => {
        const info = toSessionInfo(row);
        const handle = runtimeHandles.get(row.id);
        if (handle !== undefined) {
          return {
            ...info,
            prompt: handle.prompt,
            context: handle.context,
            lastAssistantMessage: handle.lastAssistantMessage,
          };
        }
        return info;
      });
    },

    subscribe(
      sessionId: QraftAiSessionId,
      listener: (event: AIProgressEvent) => void,
    ): () => void {
      // Get runtime handle for this session
      const handle = runtimeHandles.get(sessionId);
      if (handle !== undefined) {
        handle.listeners.add(listener);
      }

      // Return unsubscribe function
      return () => {
        const h = runtimeHandles.get(sessionId);
        if (h !== undefined) {
          h.listeners.delete(listener);
        }
      };
    },

    cleanup(): void {
      const deletedCount = store.cleanup(config.sessionTimeoutMs);

      // Also clean up any stale runtime handles
      for (const [id, _handle] of runtimeHandles.entries()) {
        const session = store.get(id);
        if (session === undefined) {
          runtimeHandles.delete(id);
        }
      }

      if (deletedCount > 0) {
        logger.info("Cleanup completed", { deletedCount });
      }
    },

    submitPrompt(msg: AIPromptMessage): {
      promptId: PromptId;
      worktreeId: WorktreeId;
    } {
      if (!config.enabled) {
        throw new Error("AI features are disabled");
      }

      const promptId = generatePromptId();
      const sessionId = generateSessionId();
      const projectPath = msg.project_path ?? "";
      const worktreeId =
        typeof msg.worktree_id === "string" && msg.worktree_id.length > 0
          ? (msg.worktree_id as WorktreeId)
          : generateWorktreeId(projectPath);

      const clientSessionId: QraftAiSessionId | undefined =
        typeof msg.qraft_ai_session_id === "string" &&
        msg.qraft_ai_session_id.length > 0
          ? (msg.qraft_ai_session_id as QraftAiSessionId)
          : undefined;

      const messageForDisplay =
        msg.message.length > 200
          ? msg.message.slice(0, 200) + "..."
          : msg.message;

      const promptContext: AIPromptContext = msg.context ?? { references: [] };

      // Create session row in store with prompt queue fields
      const sessionRow: AiSessionRow = {
        id: sessionId,
        state: "queued" as const,
        projectPath,
        createdAt: new Date().toISOString(),
        promptId,
        worktreeId,
        message: messageForDisplay,
        clientSessionId,
      };

      store.insert(sessionRow);

      // Create runtime handle for content that stays in memory
      const handle: RuntimeSessionHandle = {
        listeners: new Set(),
        registeredClaudeSessionIds: new Set(),
        prompt: msg.message,
        fullPrompt: buildPromptWithContext({
          prompt: msg.message,
          context: promptContext,
          options: {
            projectPath,
            sessionMode: "new",
            immediate: true,
          },
        }),
        context: promptContext,
      };
      runtimeHandles.set(sessionId, handle);

      logger.info("Prompt queued", {
        promptId,
        sessionId,
        clientSessionId,
        worktreeId,
      });

      broadcastQueueUpdate();

      // Try to dispatch immediately if capacity available
      processQueue();

      return { promptId, worktreeId };
    },

    getPromptQueue(worktreeId?: WorktreeId): readonly QueuedPromptInfo[] {
      const rows = store.listPromptQueue(worktreeId);
      return rows.map(toPromptInfoFromRow);
    },

    cancelPrompt(promptId: PromptId): void {
      const session = store.findByPromptId(promptId);
      if (session === undefined) {
        throw new Error(`Prompt not found: ${promptId}`);
      }

      if (session.state === "queued") {
        const completedAt = new Date().toISOString();
        store.updateState(session.id, "cancelled", { completedAt });
        runtimeHandles.delete(session.id);
        broadcastQueueUpdate();
      } else if (session.state === "running") {
        // Cancel the running session
        void manager.cancel(session.id).catch(() => {
          // Best effort
        });
        broadcastQueueUpdate();
      }
    },

    getMappingStore(): SessionMappingStore | undefined {
      return mappingStore;
    },
  };

  return manager;
}
