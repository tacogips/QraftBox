/**
 * Local Prompt Management Types
 *
 * Types for managing prompts locally at ~/.local/QraftBox/prompts/
 * before dispatching to Claude Code agent.
 */

import type {
  AIPromptContext,
  ClaudeSessionId,
  PromptId,
  QraftAiSessionId,
} from "./ai";

/**
 * Status of a locally stored prompt
 */
export type LocalPromptStatus =
  | "pending" // Saved locally, not dispatched
  | "dispatching" // Being sent to Claude Code agent
  | "dispatched" // Sent to agent, has dispatchSessionId
  | "completed" // Session completed
  | "failed" // Session failed or dispatch error
  | "cancelled"; // Cancelled by user

/**
 * A locally stored prompt
 */
export interface LocalPrompt {
  /** Unique prompt identifier */
  readonly id: PromptId;
  /** Raw prompt text from the user */
  readonly prompt: string;
  /** AI-generated summary for searchability */
  readonly description: string;
  /** File references and context */
  readonly context: AIPromptContext;
  /** Project path for claude-code-agent */
  readonly projectPath: string;
  /** Current status */
  readonly status: LocalPromptStatus;
  /** QraftBox internal session ID assigned when the prompt is dispatched */
  readonly dispatchSessionId: QraftAiSessionId | null;
  /** ISO timestamp of creation */
  readonly createdAt: string;
  /** ISO timestamp of last update */
  readonly updatedAt: string;
  /** Error message if failed */
  readonly error: string | null;
}

/**
 * Request to create a new local prompt
 */
export interface CreateLocalPromptRequest {
  readonly prompt: string;
  readonly context: AIPromptContext;
  readonly projectPath: string;
}

/**
 * Options for dispatching a prompt to Claude Code agent
 */
export interface DispatchPromptOptions {
  /** If true, attempt immediate execution (skip queue) */
  readonly immediate?: boolean;
  /** CLI session ID to resume instead of creating a new session */
  readonly resumeSessionId?: ClaudeSessionId | undefined;
}

/**
 * Response for listing prompts
 */
export interface LocalPromptListResponse {
  readonly prompts: readonly LocalPrompt[];
  readonly total: number;
}

/**
 * Filter options for listing prompts
 */
export interface LocalPromptListOptions {
  readonly status?: LocalPromptStatus;
  readonly limit?: number;
  readonly offset?: number;
  readonly search?: string;
}

/**
 * Updatable fields on a local prompt
 */
export interface LocalPromptUpdate {
  readonly description?: string;
  readonly status?: LocalPromptStatus;
  readonly dispatchSessionId?: QraftAiSessionId | null;
  readonly error?: string | null;
  readonly prompt?: string;
}

/**
 * Prompt store interface for file-based storage
 */
export interface PromptStore {
  /**
   * Create and store a new prompt locally
   */
  create(request: CreateLocalPromptRequest): Promise<LocalPrompt>;

  /**
   * Get a prompt by ID
   */
  get(id: PromptId): Promise<LocalPrompt | null>;

  /**
   * List prompts with optional filtering
   */
  list(options?: LocalPromptListOptions): Promise<LocalPromptListResponse>;

  /**
   * Update a prompt's mutable fields
   */
  update(id: PromptId, updates: LocalPromptUpdate): Promise<LocalPrompt>;

  /**
   * Delete a prompt
   */
  delete(id: PromptId): Promise<boolean>;

  /**
   * Recover prompts interrupted by server restart.
   * Resets prompts with status "dispatching" or "dispatched" back to "pending".
   * @returns Number of recovered prompts
   */
  recoverInterrupted(): Promise<number>;
}

/**
 * Generate a unique prompt ID
 */
export function generatePromptId(): PromptId {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `prompt_${timestamp}_${random}` as PromptId;
}

/**
 * Generate a basic description from prompt text (fallback before AI summary)
 */
export function generateBasicDescription(prompt: string): string {
  // Take first line or first 120 chars, whichever is shorter
  const firstLine = prompt.split("\n")[0] ?? prompt;
  const truncated =
    firstLine.length > 120 ? firstLine.slice(0, 117) + "..." : firstLine;
  return truncated.trim();
}

/**
 * Default storage directory for local prompts
 */
export const DEFAULT_PROMPTS_DIR = `${process.env["HOME"] ?? "~"}/.local/QraftBox/prompts`;
