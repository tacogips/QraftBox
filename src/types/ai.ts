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
  readonly sessionId: string;

  /**
   * Position in queue if not immediate (1-based, undefined if running)
   */
  readonly queuePosition?: number | undefined;

  /**
   * Whether the session started immediately
   */
  readonly immediate: boolean;
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
  readonly runningSessionIds: readonly string[];

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
  readonly sessionId: string;
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
  readonly id: string;
  readonly state: SessionState;
  readonly prompt: string;
  readonly createdAt: string;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly context: AIPromptContext;
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
}

/**
 * Default AI configuration
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  maxConcurrent: 1,
  maxQueueSize: 10,
  sessionTimeoutMs: 5 * 60 * 1000, // 5 minutes
  enabled: true,
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

/**
 * Validate AI prompt request
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string | undefined;
}

/**
 * Validate an AI prompt request
 */
export function validateAIPromptRequest(
  request: AIPromptRequest,
): ValidationResult {
  // Validate prompt
  if (!request.prompt || request.prompt.trim().length === 0) {
    return {
      valid: false,
      error: "Prompt cannot be empty",
    };
  }

  // Validate prompt length (reasonable limit)
  if (request.prompt.length > 100000) {
    return {
      valid: false,
      error: "Prompt exceeds maximum length of 100000 characters",
    };
  }

  // Validate project path
  if (
    !request.options.projectPath ||
    request.options.projectPath.trim().length === 0
  ) {
    return {
      valid: false,
      error: "Project path is required",
    };
  }

  // Validate session mode
  const validModes: readonly SessionMode[] = ["continue", "new"];
  if (!validModes.includes(request.options.sessionMode)) {
    return {
      valid: false,
      error: `Invalid session mode: ${request.options.sessionMode}`,
    };
  }

  // Validate file references
  for (const ref of request.context.references) {
    if (!ref.path || ref.path.trim().length === 0) {
      return {
        valid: false,
        error: "File reference path cannot be empty",
      };
    }

    // Validate line range if provided
    if (ref.startLine !== undefined && ref.endLine !== undefined) {
      if (ref.startLine < 1) {
        return {
          valid: false,
          error: `Invalid start line for ${ref.path}: must be >= 1`,
        };
      }
      if (ref.endLine < ref.startLine) {
        return {
          valid: false,
          error: `Invalid line range for ${ref.path}: end must be >= start`,
        };
      }
    }
  }

  // Validate primary file if provided
  if (request.context.primaryFile !== undefined) {
    const pf = request.context.primaryFile;
    if (!pf.path || pf.path.trim().length === 0) {
      return {
        valid: false,
        error: "Primary file path cannot be empty",
      };
    }
    if (pf.startLine < 1) {
      return {
        valid: false,
        error: "Primary file start line must be >= 1",
      };
    }
    if (pf.endLine < pf.startLine) {
      return {
        valid: false,
        error: "Primary file end line must be >= start line",
      };
    }
  }

  return { valid: true };
}
