/**
 * System Info API Routes
 *
 * Provides REST API endpoints for retrieving system information including
 * installed tool versions (git, Claude Code).
 */

import { Hono } from "hono";
import { $ } from "bun";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  SystemInfo,
  VersionInfo,
  ModelConfig,
  ClaudeCodeUsage,
  ModelUsageStats,
  DailyActivity,
} from "../../types/system-info.js";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Get git version from git --version command
 *
 * Parses output like "git version 2.43.0" to extract "2.43.0".
 *
 * @returns Version info with version string or error
 */
async function getGitVersion(): Promise<VersionInfo> {
  try {
    const result = await $`git --version`.quiet().nothrow();

    if (result.exitCode !== 0) {
      return {
        version: null,
        error: "git command failed",
      };
    }

    const output = result.stdout.toString().trim();

    // Parse version from "git version X.Y.Z" format
    const match = /git version (.+)/.exec(output);
    if (match !== null && match[1] !== undefined) {
      return {
        version: match[1],
        error: null,
      };
    }

    return {
      version: output,
      error: null,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return {
      version: null,
      error: errorMessage,
    };
  }
}

/**
 * Get Claude Code version from claude --version command
 *
 * Captures whatever version output the Claude CLI provides.
 *
 * @returns Version info with version string or error
 */
async function getClaudeCodeVersion(): Promise<VersionInfo> {
  try {
    const result = await $`claude --version`.quiet().nothrow();

    if (result.exitCode !== 0) {
      return {
        version: null,
        error: "claude command failed or not found",
      };
    }

    const output = result.stdout.toString().trim();

    // Return the full output as version string
    return {
      version: output,
      error: null,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return {
      version: null,
      error: errorMessage,
    };
  }
}

/**
 * Stats cache JSON structure from ~/.claude/stats-cache.json
 */
interface StatsCacheJson {
  version?: number;
  lastComputedDate?: string;
  dailyActivity?: Array<{
    date?: string;
    messageCount?: number;
    sessionCount?: number;
    toolCallCount?: number;
    tokensByModel?: Record<string, number>;
  }>;
  modelUsage?: Record<
    string,
    {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
    }
  >;
  totalSessions?: number;
  totalMessages?: number;
  firstSessionDate?: string;
}

/**
 * Get Claude Code usage statistics from ~/.claude/stats-cache.json
 *
 * Reads and parses the stats-cache.json file to extract usage data including:
 * - Total sessions and messages
 * - Per-model token usage statistics
 * - Recent daily activity (last 14 days)
 *
 * @returns Claude Code usage statistics or null if file doesn't exist or can't be parsed
 */
async function getClaudeCodeUsage(): Promise<ClaudeCodeUsage | null> {
  try {
    const statsPath = join(homedir(), ".claude", "stats-cache.json");
    const file = Bun.file(statsPath);

    // Check if file exists
    const exists = await file.exists();
    if (!exists) {
      return null;
    }

    // Parse JSON
    const data = (await file.json()) as unknown;

    // Type guard for stats cache structure
    if (typeof data !== "object" || data === null) {
      return null;
    }

    const stats = data as StatsCacheJson;

    // Extract model usage with defaults
    const modelUsage: Record<string, ModelUsageStats> = {};
    if (
      stats.modelUsage !== undefined &&
      typeof stats.modelUsage === "object"
    ) {
      for (const [modelName, usage] of Object.entries(stats.modelUsage)) {
        if (usage !== undefined) {
          modelUsage[modelName] = {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            cacheReadInputTokens: usage.cacheReadInputTokens ?? 0,
            cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
          };
        }
      }
    }

    // Extract daily activity (last 14 days)
    const allActivity: DailyActivity[] = [];
    if (Array.isArray(stats.dailyActivity)) {
      for (const entry of stats.dailyActivity) {
        if (entry.date !== undefined) {
          // Build activity object with spread to respect exactOptionalPropertyTypes
          const activity: DailyActivity = {
            date: entry.date,
            ...(entry.messageCount !== undefined && {
              messageCount: entry.messageCount,
            }),
            ...(entry.sessionCount !== undefined && {
              sessionCount: entry.sessionCount,
            }),
            ...(entry.toolCallCount !== undefined && {
              toolCallCount: entry.toolCallCount,
            }),
            ...(entry.tokensByModel !== undefined && {
              tokensByModel: entry.tokensByModel,
            }),
          };
          allActivity.push(activity);
        }
      }
    }

    // Take last 14 days
    const recentDailyActivity = allActivity.slice(-14);

    return {
      totalSessions: stats.totalSessions ?? 0,
      totalMessages: stats.totalMessages ?? 0,
      firstSessionDate: stats.firstSessionDate ?? null,
      lastComputedDate: stats.lastComputedDate ?? null,
      modelUsage,
      recentDailyActivity,
    };
  } catch (e) {
    // If file can't be read or parsed, return null
    return null;
  }
}

/**
 * Create system info routes
 *
 * Routes:
 * - GET /api/system-info - Get system information including tool versions
 *
 * @param modelConfig - Model configuration for AI operations
 * @returns Hono app with system info routes mounted
 */
export function createSystemInfoRoutes(modelConfig: ModelConfig): Hono {
  const app = new Hono();

  /**
   * GET /api/system-info
   *
   * Get system information including versions of installed tools and model configuration.
   *
   * Returns:
   * - git: Git version information (version string or error)
   * - claudeCode: Claude Code version information (version string or error)
   * - models: Model configuration (promptModel and assistantModel)
   * - claudeCodeUsage: Claude Code usage statistics (or null if unavailable)
   */
  app.get("/", async (c) => {
    try {
      // Fetch versions and usage data in parallel
      const [git, claudeCode, claudeCodeUsage] = await Promise.all([
        getGitVersion(),
        getClaudeCodeVersion(),
        getClaudeCodeUsage(),
      ]);

      const response: SystemInfo = {
        git,
        claudeCode,
        models: modelConfig,
        claudeCodeUsage,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve system info";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
