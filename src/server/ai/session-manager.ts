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
  createAgentRunner,
  type AgentRunner,
  type AgentExecution,
  type AgentEvent,
} from "./agent-runner.js";

/**
 * Runtime session handle - only stores non-serializable runtime state
 */
interface RuntimeSessionHandle {
  listeners: Set<(event: AIProgressEvent) => void>;
  execution?: AgentExecution | undefined;
  registeredClaudeSessionIds: Set<ClaudeSessionId>;
  /** Runtime-only content fields (not persisted to SQLite) */
  prompt: string;
  fullPrompt: string;
  context: AIPromptContext;
  lastAssistantMessage?: string | undefined;
  modelOverride?:
    | {
        vendor: "anthropics" | "openai";
        model: string;
        arguments: readonly string[];
      }
    | undefined;
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

  /**
   * List completed/failed/cancelled sessions as raw rows (includes projectPath)
   */
  listCompletedRows(): readonly AiSessionRow[];
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
 * @param agentRunner - Agent runner for executing prompts (created from config+toolRegistry if not provided)
 * @returns Session manager instance
 */
export function createSessionManager(
  config: AIConfig = DEFAULT_AI_CONFIG,
  toolRegistry?: QraftBoxToolRegistry | undefined,
  broadcast?: BroadcastFn | undefined,
  mappingStore?: SessionMappingStore | undefined,
  sessionStore?: AiSessionStore | undefined,
  agentRunner?: AgentRunner | undefined,
): SessionManager {
  const logger = createLogger("SessionManager");
  const store = sessionStore ?? createInMemoryAiSessionStore();
  const runtimeHandles = new Map<QraftAiSessionId, RuntimeSessionHandle>();
  const pendingClientSessions = new Set<QraftAiSessionId>();
  const runner = agentRunner ?? createAgentRunner(config, toolRegistry);

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
   * 2. If clientSessionId was present but not found in steps 0-1, return undefined (start new session)
   * 3. AiSessionStore lookup by worktreeId (fallback - ONLY when no clientSessionId)
   * 4. If none found, start a new session (undefined)
   *
   * Rationale for step 2:
   * When a user clicks "New Session" in the UI, a fresh clientSessionId is generated on the client.
   * If this clientSessionId has no mapping in SQLite (step 0) or in-memory store (step 1),
   * it means the user explicitly requested a NEW session. We must NOT fall back to the worktreeId
   * lookup, which would incorrectly resume a previous session for that worktree.
   *
   * The worktreeId fallback (step 3) is ONLY for the case when clientSessionId is absent/empty,
   * typically when the user sends a prompt without explicitly selecting a session context.
   */
  function resolveResumeSessionId(
    session: AiSessionRow,
  ): ClaudeSessionId | undefined {
    const hasClientSessionId =
      session.clientSessionId !== undefined &&
      session.clientSessionId.length > 0;

    // 0. Persistent SQLite mapping store lookup
    if (hasClientSessionId && mappingStore !== undefined) {
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
    if (hasClientSessionId) {
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

      // 2. clientSessionId was present but not found - user requested NEW session
      logger.info(
        "clientSessionId present but not found in SQLite or store - starting new session",
        {
          sessionId: session.id,
          clientSessionId: session.clientSessionId,
        },
      );
      return undefined;
    }

    // 3. AiSessionStore lookup by worktreeId (fallback - ONLY when no clientSessionId)
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

    // 4. No match found - start new session
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
   * Register a mapping in the mapping store (best-effort)
   */
  function registerMapping(
    claudeSessionId: ClaudeSessionId,
    session: AiSessionRow,
  ): void {
    if (mappingStore === undefined) return;
    try {
      const explicitQraftAiSessionId =
        session.clientSessionId !== undefined &&
        session.clientSessionId.length > 0
          ? session.clientSessionId
          : undefined;
      mappingStore.upsert(
        claudeSessionId,
        session.projectPath,
        session.worktreeId ?? generateWorktreeId(session.projectPath),
        "qraftbox",
        explicitQraftAiSessionId,
      );
      if (explicitQraftAiSessionId !== undefined) {
        logger.info("Registered session mapping from clientSessionId", {
          sessionId: session.id,
          clientSessionId: session.clientSessionId,
          claudeSessionId,
        });
      }
    } catch {
      // Best-effort registration for source detection
    }
  }

  /**
   * Process a single agent event and update state accordingly.
   * Explicit switch/case - no hidden side effects.
   */
  function processAgentEvent(
    sessionId: QraftAiSessionId,
    handle: RuntimeSessionHandle,
    event: AgentEvent,
  ): void {
    switch (event.type) {
      case "claude_session_detected": {
        store.updateClaudeSessionId(sessionId, event.claudeSessionId);
        handle.registeredClaudeSessionIds.add(event.claudeSessionId);
        // Register in mapping store for cross-restart continuity
        const session = store.get(sessionId);
        if (session !== undefined) {
          registerMapping(event.claudeSessionId, session);
        }
        break;
      }

      case "message": {
        handle.lastAssistantMessage = event.content;
        store.updateLastAssistantMessage(sessionId, event.content);
        store.updateActivity(sessionId, undefined);
        emitEvent(
          sessionId,
          createProgressEvent("message", sessionId, {
            role: event.role,
            content: event.content,
          }),
        );
        break;
      }

      case "tool_call": {
        store.updateActivity(sessionId, `Using ${event.toolName}...`);
        emitEvent(
          sessionId,
          createProgressEvent("tool_use", sessionId, {
            toolName: event.toolName,
            input: event.input,
          }),
        );
        break;
      }

      case "tool_result": {
        store.updateActivity(
          sessionId,
          `Processing ${event.toolName} result...`,
        );
        emitEvent(
          sessionId,
          createProgressEvent("tool_result", sessionId, {
            toolName: event.toolName,
            output: event.output,
            isError: event.isError,
          }),
        );
        break;
      }

      case "error": {
        emitEvent(
          sessionId,
          createProgressEvent("error", sessionId, {
            message: event.message,
          }),
        );
        break;
      }

      case "activity": {
        store.updateActivity(sessionId, event.activity);
        break;
      }

      case "completed": {
        const completedAt = new Date().toISOString();
        if (event.success) {
          store.updateState(sessionId, "completed", { completedAt });
        } else {
          store.updateState(sessionId, "failed", { completedAt });
          if (event.error !== undefined) {
            store.updateError(sessionId, event.error);
          }
        }
        store.updateActivity(sessionId, undefined);
        if (event.lastAssistantMessage !== undefined) {
          handle.lastAssistantMessage = event.lastAssistantMessage;
          store.updateLastAssistantMessage(
            sessionId,
            event.lastAssistantMessage,
          );
        }

        // Persist final mapping
        const completedSession = store.get(sessionId);
        if (
          completedSession?.currentClaudeSessionId !== undefined &&
          completedSession.worktreeId !== undefined
        ) {
          registerMapping(
            completedSession.currentClaudeSessionId,
            completedSession,
          );
        }

        // Emit terminal event
        emitEvent(
          sessionId,
          createProgressEvent(
            event.success ? "completed" : "error",
            sessionId,
            event.error !== undefined ? { message: event.error } : {},
          ),
        );
        break;
      }
    }
  }

  /**
   * Finalize session state after execution completes
   */
  function finalizeSession(sessionId: QraftAiSessionId): void {
    const session = store.get(sessionId);
    if (session === undefined) return;

    // If still running (no completed event received), check if cancelled
    if (session.state === "running") {
      const completedAt = new Date().toISOString();
      store.updateState(sessionId, "cancelled", { completedAt });
      store.updateActivity(sessionId, undefined);
    }
  }

  /**
   * Handle execution error
   */
  function handleExecutionError(
    sessionId: QraftAiSessionId,
    error: unknown,
  ): void {
    const currentSession = store.get(sessionId);
    if (currentSession?.state === "cancelled") {
      return; // Already cancelled, don't overwrite
    }

    const completedAt = new Date().toISOString();
    store.updateState(sessionId, "failed", { completedAt });
    store.updateActivity(sessionId, undefined);

    const errorMessage =
      error instanceof Error ? error.message : "Session failed";
    store.updateError(sessionId, errorMessage);
    emitEvent(
      sessionId,
      createProgressEvent("error", sessionId, { message: errorMessage }),
    );
  }

  /**
   * Run a prompt execution via AgentRunner and process the event stream.
   *
   * Flow:
   * 1. Transition session to "running"
   * 2. Start execution via runner.execute()
   * 3. Consume event stream, mapping each event to state updates + broadcasts
   * 4. Finalize state on completion
   */
  async function runExecution(sessionId: QraftAiSessionId): Promise<void> {
    const session = store.get(sessionId);
    if (session === undefined) return;
    const pendingClientSessionId = session.clientSessionId;

    try {
      const handle = runtimeHandles.get(sessionId);
      if (handle === undefined) return;

      // 1. Transition to running
      const startedAt = new Date().toISOString();
      store.updateState(sessionId, "running", { startedAt });
      store.updateActivity(sessionId, "Starting session...");
      emitEvent(sessionId, createProgressEvent("session_started", sessionId));

      // 2. Start execution
      const execution = runner.execute({
        prompt: handle.fullPrompt,
        projectPath: session.projectPath,
        resumeSessionId: session.currentClaudeSessionId,
        vendor: handle.modelOverride?.vendor,
        model: handle.modelOverride?.model,
        additionalArgs:
          handle.modelOverride !== undefined
            ? [...handle.modelOverride.arguments]
            : undefined,
      });
      handle.execution = execution;

      // If resuming, register known Claude session ID
      if (session.currentClaudeSessionId !== undefined) {
        handle.registeredClaudeSessionIds.add(session.currentClaudeSessionId);
        registerMapping(session.currentClaudeSessionId, session);
      }

      // 3. Consume event stream
      for await (const event of execution.events()) {
        // Check for external cancellation
        const currentSession = store.get(sessionId);
        if (
          currentSession === undefined ||
          currentSession.state === "cancelled"
        ) {
          break;
        }

        processAgentEvent(sessionId, handle, event);

        // If completed event, break out
        if (event.type === "completed") {
          break;
        }
      }

      // 4. Finalize state
      finalizeSession(sessionId);
    } catch (error) {
      handleExecutionError(sessionId, error);
    } finally {
      if (pendingClientSessionId !== undefined) {
        pendingClientSessions.delete(pendingClientSessionId);
      }
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
      const queuedSessions = [...store.listByState("queued")].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      const nextSession = queuedSessions.find((candidate) => {
        if (
          candidate.clientSessionId !== undefined &&
          pendingClientSessions.has(candidate.clientSessionId)
        ) {
          return false;
        }
        return true;
      });
      if (nextSession === undefined) break;

      const nextSessionId = nextSession.id;
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
      if (session.clientSessionId !== undefined) {
        pendingClientSessions.add(session.clientSessionId);
      }

      // Don't await - run in background
      runExecution(nextSessionId).catch(() => {
        // Errors handled in runExecution
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
        runExecution(sessionId).catch(() => {
          // Errors handled in runExecution
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

      // Cancel AgentExecution if available
      const handle = runtimeHandles.get(sessionId);
      if (handle?.execution !== undefined) {
        let cancelTimedOut = false;
        try {
          await Promise.race([
            handle.execution.cancel(),
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
            await handle.execution.abort();
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
        modelOverride:
          msg.model_vendor !== undefined && msg.model_name !== undefined
            ? {
                vendor: msg.model_vendor,
                model: msg.model_name,
                arguments: msg.model_arguments ?? [],
              }
            : undefined,
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

    listCompletedRows(): readonly AiSessionRow[] {
      const completed = store.listByState("completed");
      const failed = store.listByState("failed");
      const cancelled = store.listByState("cancelled");
      return [...completed, ...failed, ...cancelled];
    },
  };

  return manager;
}
