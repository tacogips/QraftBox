/**
 * AI Agent Integration Types
 *
 * Types for integrating with claude-code-agent library for executing
 * AI prompts from the diff viewer.
 */

/**
 * File reference for context in AI prompts
 */
export interface FileReference {
  readonly path: string;
  readonly startLine?: number | undefined;
  readonly endLine?: number | undefined;
  readonly content?: string | undefined;
  readonly fileName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly encoding?: "utf8" | "base64" | undefined;
  readonly attachmentKind?: "text" | "image" | "binary" | undefined;
}

/**
 * Attachment payload passed to Claude session runner.
 */
export interface AIAttachment {
  readonly path?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly encoding?: "utf8" | "base64";
  readonly content?: string;
}

/**
 * Primary file context (selected lines)
 */
export interface PrimaryFileContext {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly content: string;
}

/**
 * Diff summary context
 */
export interface DiffSummaryContext {
  readonly baseBranch: string;
  readonly targetBranch: string;
  readonly changedFiles: readonly string[];
}

/**
 * Context provided with an AI prompt
 */
export interface AIPromptContext {
  /**
   * Primary file and line selection (if prompt initiated from line selection)
   */
  readonly primaryFile?: PrimaryFileContext | undefined;

  /**
   * Additional file references mentioned via @ syntax
   */
  readonly references: readonly FileReference[];

  /**
   * Diff summary when prompting in context of a diff
   */
  readonly diffSummary?: DiffSummaryContext | undefined;
}

/**
 * Session execution mode
 */
export type SessionMode = "continue" | "new";

/**
 * Options for AI prompt execution
 */
export interface AIPromptOptions {
  /**
   * Project path for the claude-code-agent
   */
  readonly projectPath: string;

  /**
   * Whether to continue existing session or create new
   */
  readonly sessionMode: SessionMode;

  /**
   * Execute immediately or queue for later
   */
  readonly immediate: boolean;

  /**
   * CLI session ID to resume (when sessionMode is "continue")
   */
  readonly resumeSessionId?: ClaudeSessionId | undefined;
}

/**
 * AI prompt request payload
 */
export interface AIPromptRequest {
  /**
   * The user's prompt text
   */
  readonly prompt: string;

  /**
   * Context for the prompt (files, lines, diff info)
   */
  readonly context: AIPromptContext;

  /**
   * Execution options
   */
  readonly options: AIPromptOptions;
}

/**
 * Result of submitting an AI prompt
 */
export interface AISessionSubmitResult {
  /**
   * Unique session identifier
   */
  readonly sessionId: QraftAiSessionId;

  /**
   * Position in queue if not immediate (1-based, undefined if running)
   */
  readonly queuePosition?: number | undefined;

  /**
   * Whether the session started immediately
   */
  readonly immediate: boolean;
  /**
   * Claude CLI session ID if already known at submit time
   */
  readonly claudeSessionId?: ClaudeSessionId | undefined;
}

/**
 * Queue status for UI display
 */
export interface QueueStatus {
  /**
   * Number of sessions currently running
   */
  readonly runningCount: number;

  /**
   * Number of sessions in queue
   */
  readonly queuedCount: number;

  /**
   * IDs of currently running sessions
   */
  readonly runningSessionIds: readonly QraftAiSessionId[];

  /**
   * Total sessions (running + queued)
   */
  readonly totalCount: number;
}

/**
 * Session state
 */
export type SessionState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * AI progress event types
 */
export type AIProgressEventType =
  | "session_started"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "message"
  | "error"
  | "completed"
  | "cancelled";

/**
 * Tool use event data
 */
export interface ToolUseData {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
}

/**
 * Tool result event data
 */
export interface ToolResultData {
  readonly toolName: string;
  readonly output: unknown;
  readonly isError: boolean;
}

/**
 * Message event data
 */
export interface MessageData {
  readonly role: "assistant" | "user";
  readonly content: string;
}

/**
 * Error event data
 */
export interface ErrorData {
  readonly message: string;
  readonly code?: string | undefined;
}

/**
 * AI progress event for SSE streaming
 */
export interface AIProgressEvent {
  readonly type: AIProgressEventType;
  readonly sessionId: QraftAiSessionId;
  readonly timestamp: string;
  readonly data:
    | ToolUseData
    | ToolResultData
    | MessageData
    | ErrorData
    | Record<string, never>;
}

/**
 * Session info for display
 */
export interface AISessionInfo {
  readonly id: QraftAiSessionId;
  readonly state: SessionState;
  readonly prompt: string;
  readonly createdAt: string;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly context: AIPromptContext;
  readonly lastAssistantMessage?: string | undefined;
  readonly currentActivity?: string | undefined;
  /**
   * Claude CLI session ID currently bound to this execution
   */
  readonly claudeSessionId?: ClaudeSessionId | undefined;
  /**
   * Client-generated session group ID used to chain prompts.
   */
  readonly clientSessionId?: QraftAiSessionId | undefined;
  /**
   * Selected model profile ID resolved at submission time.
   */
  readonly modelProfileId?: string | undefined;
  /**
   * Resolved model vendor snapshot at submission time.
   */
  readonly modelVendor?: "anthropics" | "openai" | undefined;
  /**
   * Resolved model name snapshot at submission time.
   */
  readonly modelName?: string | undefined;
  /**
   * Resolved CLI arguments snapshot at submission time.
   */
  readonly modelArguments?: readonly string[] | undefined;
}

/**
 * Conversation view mode
 */
export type ConversationViewMode = "chat" | "carousel";

/**
 * Tool call information
 */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly output?: unknown;
  readonly status: "pending" | "running" | "completed" | "failed";
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly error?: string | undefined;
}

/**
 * Conversation turn (message exchange)
 */
export interface ConversationTurn {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[] | undefined;
  readonly timestamp: string;
}

/**
 * Full AI session with conversation history
 */
export interface AISession extends AISessionInfo {
  readonly turns: readonly ConversationTurn[];
  readonly currentActivity?: string | undefined;
  readonly stats?: SessionStats | undefined;
}

/**
 * Session statistics
 */
export interface SessionStats {
  readonly durationMs?: number | undefined;
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
  readonly costUsd?: number | undefined;
}

/**
 * AI configuration
 */
export interface AIConfig {
  /**
   * Maximum concurrent sessions
   */
  readonly maxConcurrent: number;

  /**
   * Maximum queue size
   */
  readonly maxQueueSize: number;

  /**
   * Session timeout in milliseconds
   */
  readonly sessionTimeoutMs: number;

  /**
   * Whether AI features are enabled
   */
  readonly enabled: boolean;

  /**
   * Model to use for the AI assistant
   */
  readonly assistantModel: string;

  /**
   * Additional CLI arguments for the AI assistant (e.g., ['--dangerously-skip-permissions'])
   */
  readonly assistantAdditionalArgs: readonly string[];
}

/**
 * AI prompt message format (simplified submission)
 *
 * This is the new unified format for submitting AI prompts.
 * The client only needs to pass the current session_id and the message.
 * The server manages the queue, session continuity, and execution.
 */
export interface AIPromptMessage {
  /** Whether to execute immediately (true) or queue (false) */
  readonly run_immediately: boolean;
  /** The prompt text */
  readonly message: string;
  /** Optional file context */
  readonly context?: AIPromptContext | undefined;
  /** Project path / working directory (defaults to server config) */
  readonly project_path?: string | undefined;
  /** Worktree identifier for queue partitioning (auto-generated from project_path if omitted) */
  readonly worktree_id?: string | undefined;
  /**
   * Client-generated session group ID.
   * Prompts sharing the same qraft_ai_session_id are treated as part of the same
   * conversation: the server inherits the resolved Claude session ID from the
   * most recently completed prompt in the same group.
   * Generate a new ID on the frontend when starting a "new session" flow,
   * and reuse it for subsequent prompts in that session.
   */
  readonly qraft_ai_session_id?: QraftAiSessionId | undefined;
  /** Optional model profile ID to override default AI Ask profile */
  readonly model_profile_id?: string | undefined;
  /** Resolved model vendor snapshot at submission time */
  readonly model_vendor?: "anthropics" | "openai" | undefined;
  /** Resolved model name snapshot at submission time */
  readonly model_name?: string | undefined;
  /** Resolved CLI arguments snapshot at submission time */
  readonly model_arguments?: readonly string[] | undefined;
}

/**
 * Queued prompt info for WebSocket broadcast
 */
export interface QueuedPromptInfo {
  readonly id: PromptId;
  /** Truncated message for display */
  readonly message: string;
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
  /** Claude CLI session ID (resolved after execution) */
  readonly claude_session_id?: ClaudeSessionId | undefined;
  /** Current activity description (e.g., "Using tool...") */
  readonly current_activity?: string | undefined;
  /** Error message if failed */
  readonly error?: string | undefined;
  readonly created_at: string;
  /** Worktree identifier for queue partitioning */
  readonly worktree_id: WorktreeId;
  /** Client-generated session group ID for prompt continuity */
  readonly qraft_ai_session_id?: QraftAiSessionId | undefined;
}

/**
 * AI queue update event payload for WebSocket broadcast
 */
export interface AIQueueUpdate {
  readonly prompts: readonly QueuedPromptInfo[];
}

/**
 * QraftAiSessionId - Branded type for session group identifiers.
 *
 * This is a one-way hash-based identifier used to group related prompts
 * into a single logical session. Two derivation paths exist:
 *
 * 1. **Claude-originated**: When a session is initiated via Claude CLI,
 *    the seed is `{claudeSessionId} + "claude"`. This allows grouping
 *    prompts that share the same underlying Claude CLI session.
 *
 * 2. **Qraft-originated**: When a session is initiated from QraftBox UI,
 *    the seed is `{datetime_microseconds} + "Qraft"`. This produces a
 *    unique ID for each new session started from the frontend.
 *
 * The hash is one-way (FNV-1a): you cannot recover the original seed.
 * To find the associated Claude session ID, look up stored prompt records.
 */
export type QraftAiSessionId = string & {
  readonly __brand: "QraftAiSessionId";
};

/**
 * ClaudeSessionId - Branded type for Claude CLI session identifiers (UUIDs).
 *
 * Represents the unique session ID assigned by Claude CLI/SDK.
 * Using a branded type prevents accidental confusion with other string IDs
 * (e.g., QraftBox internal session IDs, prompt IDs, worktree IDs).
 */
export type ClaudeSessionId = string & {
  readonly __brand: "ClaudeSessionId";
};

/**
 * PromptId - Branded type for prompt identifiers.
 *
 * Generated by the prompt queue (format: "prompt_{base36_timestamp}_{random}").
 * Used to track individual prompts through queueing, dispatch, and completion.
 */
export type PromptId = string & {
  readonly __brand: "PromptId";
};

/**
 * WorktreeId - Branded type for worktree identifiers.
 *
 * A deterministic, URL-safe identifier derived from a project path
 * (format: "{basename_sanitized}_{6_char_hash}").
 * Used for queue partitioning and session continuity scoping.
 */
export type WorktreeId = string & {
  readonly __brand: "WorktreeId";
};

/**
 * Derive a QraftAiSessionId from a Claude CLI session ID.
 *
 * Derivation path: Claude-originated.
 * Seed: {claudeSessionId} + "claude"
 * Hash: FNV-1a 32-bit, output as "qs_{base36}"
 *
 * @param claudeSessionId - Claude CLI session UUID
 * @returns Deterministic QraftAiSessionId
 */
export function deriveQraftAiSessionIdFromClaude(
  claudeSessionId: ClaudeSessionId,
): QraftAiSessionId {
  const seed = claudeSessionId + "claude";
  let hash = 0x811c9dc5; // FNV-1a offset basis (32-bit)
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV-1a prime
  }
  return `qs_${(hash >>> 0).toString(36)}` as QraftAiSessionId;
}

/**
 * Generate a QraftAiSessionId for a QraftBox-originated session.
 *
 * Derivation path: Qraft-originated.
 * Seed: {datetime_microseconds} + "Qraft"
 * Hash: FNV-1a 32-bit, output as "qs_{base36}"
 *
 * Uses performance.now() for microsecond precision when available,
 * falls back to Date.now() * 1000.
 *
 * @returns Unique QraftAiSessionId
 */
export function generateQraftAiSessionId(): QraftAiSessionId {
  const microSeconds =
    typeof performance !== "undefined"
      ? Math.floor(performance.now() * 1000 + performance.timeOrigin * 1000)
      : Date.now() * 1000;
  const seed = String(microSeconds) + "Qraft";
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `qs_${(hash >>> 0).toString(36)}` as QraftAiSessionId;
}

/**
 * Default AI configuration
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  maxConcurrent: 1,
  maxQueueSize: 10,
  sessionTimeoutMs: 5 * 60 * 1000, // 5 minutes
  enabled: true,
  assistantModel: "claude-opus-4-6",
  assistantAdditionalArgs: ["--dangerously-skip-permissions"],
};

/**
 * Create an empty AI prompt context
 */
export function createEmptyContext(): AIPromptContext {
  return {
    primaryFile: undefined,
    references: [],
    diffSummary: undefined,
  };
}

/**
 * Create an empty queue status
 */
export function createEmptyQueueStatus(): QueueStatus {
  return {
    runningCount: 0,
    queuedCount: 0,
    runningSessionIds: [],
    totalCount: 0,
  };
}
