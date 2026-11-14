/**
 * System Info API Routes
 *
 * Provides REST API endpoints for retrieving system information including
 * installed tool versions (git, Claude Code).
 */

import { Hono } from "hono";
import { $ } from "bun";
import type {
  SystemInfo,
  VersionInfo,
  ModelConfig,
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
   */
  app.get("/", async (c) => {
    try {
      // Fetch versions in parallel
      const [git, claudeCode] = await Promise.all([
        getGitVersion(),
        getClaudeCodeVersion(),
      ]);

      const response: SystemInfo = {
        git,
        claudeCode,
        models: modelConfig,
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
