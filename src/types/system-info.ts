/**
 * System Information Types
 *
 * Types for system information including git and Claude Code version information.
 */

/**
 * Version information for a system component
 *
 * Contains either a successfully retrieved version string or an error message.
 */
export interface VersionInfo {
  readonly version: string | null;
  readonly error: string | null;
}

/**
 * Model configuration for AI operations
 */
export interface ModelConfig {
  /** Model used for internal prompts (commit messages, etc.) */
  readonly promptModel: string;
  /** Model used for AI assistant interactions */
  readonly assistantModel: string;
}

/**
 * Per-model token usage statistics
 */
export interface ModelUsageStats {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
}

/**
 * Daily activity entry from Claude Code stats
 */
export interface DailyActivity {
  readonly date: string;
  readonly messageCount?: number;
  readonly sessionCount?: number;
  readonly toolCallCount?: number;
  readonly tokensByModel?: Record<string, number>;
}

/**
 * Claude Code usage statistics from stats-cache.json
 */
export interface ClaudeCodeUsage {
  readonly totalSessions: number;
  readonly totalMessages: number;
  readonly firstSessionDate: string | null;
  readonly lastComputedDate: string | null;
  readonly modelUsage: Record<string, ModelUsageStats>;
  readonly recentDailyActivity: DailyActivity[];
}

/**
 * System information including versions of installed tools
 */
export interface SystemInfo {
  readonly git: VersionInfo;
  readonly claudeCode: VersionInfo;
  readonly models: ModelConfig;
  readonly claudeCodeUsage: ClaudeCodeUsage | null;
}
