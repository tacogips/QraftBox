/**
 * Shared base types for qraftbox server and CLI
 *
 * This module exports common types used across the server foundation,
 * including CLI configuration, view modes, and synchronization settings.
 */

// Re-export ServerContext from its canonical location
export type { ServerContext } from "../server/workspace/context-manager";

// Re-export ValidationResult from workspace types
export type { ValidationResult } from "./workspace";

/**
 * CLI configuration for server startup
 *
 * Contains all configuration parameters needed to start the qraftbox server,
 * including network settings, behavior flags, and project path.
 */
export interface CLIConfig {
  readonly port: number;
  readonly host: string;
  readonly open: boolean;
  readonly watch: boolean;
  readonly syncMode: SyncMode;
  readonly ai: boolean;
  readonly projectPath: string;
  /** Model used for internal prompts (commit messages, etc.) */
  readonly promptModel: string;
  /** Model used for AI assistant interactions */
  readonly assistantModel: string;
}

/**
 * View mode for diff display
 *
 * - "diff": Show side-by-side diff comparison
 * - "current-state": Show current file state only
 */
export type ViewMode = "diff" | "current-state";

/**
 * Synchronization mode for git operations
 *
 * - "manual": No automatic sync, user controls all git operations
 * - "auto-push": Automatically push commits to remote
 * - "auto-pull": Automatically pull changes from remote
 * - "auto": Both auto-push and auto-pull enabled
 */
export type SyncMode = "manual" | "auto-push" | "auto-pull" | "auto";
