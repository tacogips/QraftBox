/**
 * Diff API Routes
 *
 * Provides REST API endpoints for fetching git diffs and file diffs.
 * Supports filtering by base/target refs, file paths, and context lines.
 */

import { Hono } from "hono";
import type { DiffFile } from "../../types/git.js";
import type { ServerContext } from "../../types/index.js";
import { getDiff, getFileDiff, type DiffOptions } from "../git/diff.js";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Diff response with statistics
 */
interface DiffResponse {
  readonly files: readonly DiffFile[];
  readonly stats: {
    readonly totalFiles: number;
    readonly additions: number;
    readonly deletions: number;
  };
}

/**
 * Single file diff response
 */
interface FileDiffResponse {
  readonly file: DiffFile;
}

/**
 * Hono context variables type extension for middleware
 */
type ContextVariables = {
  serverContext: ServerContext;
};

/**
 * Create diff routes
 *
 * Routes:
 * - GET /diff - Get full diff with optional filters
 * - GET /diff/file/:path{.+} - Get single file diff
 *
 * @param context - Optional server context with project path (for standalone use)
 * @returns Hono app with diff routes mounted
 */
export function createDiffRoutes(
  context?: ServerContext | undefined,
): Hono<{ Variables: ContextVariables }> {
  const app = new Hono<{ Variables: ContextVariables }>();

  /**
   * GET /diff
   *
   * Get full diff between base and target refs.
   *
   * Query parameters:
   * - base (optional): Base ref (commit/branch/tag)
   * - target (optional): Target ref (commit/branch/tag)
   * - path (optional): Path filter to limit diff to specific file
   * - contextLines (optional): Number of context lines (default: 3)
   *
   * Returns:
   * - files: Array of DiffFile objects
   * - stats: Overall statistics (totalFiles, additions, deletions)
   */
  app.get("/", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract query parameters
    const base = c.req.query("base");
    const target = c.req.query("target");
    const path = c.req.query("path");
    const contextLinesParam = c.req.query("contextLines");

    // Parse contextLines
    const contextLines =
      contextLinesParam !== undefined
        ? parseInt(contextLinesParam, 10)
        : undefined;

    // Validate contextLines
    if (
      contextLines !== undefined &&
      (isNaN(contextLines) || contextLines < 0)
    ) {
      const errorResponse: ErrorResponse = {
        error: "contextLines must be a non-negative number",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Build diff options
    const diffOptions: DiffOptions = {
      base: base ?? undefined,
      target: target ?? undefined,
      paths: path !== undefined ? [path] : undefined,
      contextLines,
    };

    try {
      // Execute git diff operation
      const files = await getDiff(serverContext.projectPath, diffOptions);

      // Calculate statistics
      const stats = {
        totalFiles: files.length,
        additions: files.reduce((sum, file) => sum + file.additions, 0),
        deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      };

      const response: DiffResponse = {
        files,
        stats,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve diff";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /diff/file/:path{.+}
   *
   * Get diff for a single file.
   *
   * Path parameters:
   * - path: File path (relative to repo root)
   *
   * Query parameters:
   * - base (optional): Base ref (commit/branch/tag)
   * - target (optional): Target ref (commit/branch/tag)
   * - contextLines (optional): Number of context lines (default: 3)
   *
   * Returns:
   * - file: DiffFile object
   *
   * Returns 404 if file has no changes.
   */
  app.get("/file/*", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract file path from wildcard parameter
    // Hono's wildcard captures everything after the base path
    const filePath = c.req.path.replace("/file/", "");

    if (filePath.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "File path is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Extract query parameters
    const base = c.req.query("base");
    const target = c.req.query("target");
    const contextLinesParam = c.req.query("contextLines");

    // Parse contextLines
    const contextLines =
      contextLinesParam !== undefined
        ? parseInt(contextLinesParam, 10)
        : undefined;

    // Validate contextLines
    if (
      contextLines !== undefined &&
      (isNaN(contextLines) || contextLines < 0)
    ) {
      const errorResponse: ErrorResponse = {
        error: "contextLines must be a non-negative number",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Build diff options
    const diffOptions: DiffOptions = {
      base: base ?? undefined,
      target: target ?? undefined,
      contextLines,
    };

    try {
      // Execute git diff operation for single file
      const file = await getFileDiff(
        serverContext.projectPath,
        filePath,
        diffOptions,
      );

      if (file === undefined) {
        const errorResponse: ErrorResponse = {
          error: `No diff found for file: ${filePath}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      const response: FileDiffResponse = {
        file,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve file diff";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
