/**
 * Commit API Routes
 *
 * Provides REST API endpoints for browsing git commit history and viewing
 * commit details.
 */

import { Hono } from "hono";
import type {
  CommitLogQuery,
  CommitLogResponse,
  CommitDetail,
  CommitFileChange,
} from "../../types/commit";
import { validateCommitLogQuery, validateCommitHash } from "../../types/commit";
import {
  getCommitLog,
  getCommitDetail,
  getCommitFiles,
  GitError,
} from "../git/commit-log";

/**
 * Server context provided to routes
 */
export interface ServerContext {
  readonly projectPath: string;
}

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Create commit routes
 *
 * Routes:
 * - GET /api/commits - List commits with pagination
 * - GET /api/commits/:hash - Get commit detail
 * - GET /api/commits/:hash/diff - Get diff for commit
 * - GET /api/commits/:hash/files - Get files changed in commit
 *
 * @param context - Server context with project path
 * @returns Hono app with commit routes mounted
 */
export function createCommitRoutes(context: ServerContext): Hono {
  const app = new Hono();

  /**
   * GET /api/commits
   *
   * List commits with pagination and optional filtering.
   *
   * Query parameters:
   * - branch (optional): Branch name (default: HEAD)
   * - limit (optional): Number of commits to return (default: 50, max: 1000)
   * - offset (optional): Number of commits to skip (default: 0)
   * - search (optional): Search commits by message or author
   */
  app.get("/", async (c) => {
    // Extract query parameters
    const branch = c.req.query("branch");
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const search = c.req.query("search");

    // Parse optional parameters
    const limit =
      limitParam !== undefined ? parseInt(limitParam, 10) : undefined;
    const offset =
      offsetParam !== undefined ? parseInt(offsetParam, 10) : undefined;

    // Build query object
    const query: CommitLogQuery = {
      branch: branch ?? undefined,
      limit,
      offset,
      search: search ?? undefined,
    };

    // Validate query
    const validation = validateCommitLogQuery(query);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid query parameters",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Execute git operation
      const response: CommitLogResponse = await getCommitLog(
        context.projectPath,
        query,
      );
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof GitError
          ? `Git error: ${e.message}`
          : e instanceof Error
            ? e.message
            : "Failed to retrieve commits";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/commits/:hash
   *
   * Get detailed commit information including stats and file changes.
   *
   * Path parameters:
   * - hash: Commit hash (full or short)
   */
  app.get("/:hash", async (c) => {
    const hash = c.req.param("hash");

    // Validate hash format
    const validation = validateCommitHash(hash);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid commit hash",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Execute git operation
      const detail: CommitDetail = await getCommitDetail(
        context.projectPath,
        hash,
      );
      return c.json(detail);
    } catch (e) {
      if (e instanceof GitError) {
        // Check if commit not found
        const isNotFound = e.message.includes("not found");
        const errorResponse: ErrorResponse = {
          error: isNotFound ? `Commit not found: ${hash}` : e.message,
          code: isNotFound ? 404 : 500,
        };
        return c.json(errorResponse, isNotFound ? 404 : 500);
      }

      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve commit detail";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/commits/:hash/diff
   *
   * Get the unified diff for a commit.
   *
   * Path parameters:
   * - hash: Commit hash (full or short)
   *
   * Returns the raw unified diff output from git.
   */
  app.get("/:hash/diff", async (c) => {
    const hash = c.req.param("hash");

    // Validate hash format
    const validation = validateCommitHash(hash);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid commit hash",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Execute git show to get unified diff
      const proc = Bun.spawn(["git", "show", hash, "--format="], {
        cwd: context.projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      if (exitCode !== 0) {
        // Check if commit not found
        const isNotFound =
          stderr.includes("unknown revision") ||
          stderr.includes("bad revision");
        const errorResponse: ErrorResponse = {
          error: isNotFound ? `Commit not found: ${hash}` : stderr,
          code: isNotFound ? 404 : 500,
        };
        return c.json(errorResponse, isNotFound ? 404 : 500);
      }

      // Return diff as plain text
      return c.text(stdout);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve commit diff";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/commits/:hash/files
   *
   * Get the list of files changed in a commit with statistics.
   *
   * Path parameters:
   * - hash: Commit hash (full or short)
   */
  app.get("/:hash/files", async (c) => {
    const hash = c.req.param("hash");

    // Validate hash format
    const validation = validateCommitHash(hash);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid commit hash",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Execute git operation
      const files: readonly CommitFileChange[] = await getCommitFiles(
        context.projectPath,
        hash,
      );
      return c.json({ files });
    } catch (e) {
      if (e instanceof GitError) {
        // Check if commit not found
        const isNotFound = e.message.includes("not found");
        const errorResponse: ErrorResponse = {
          error: isNotFound ? `Commit not found: ${hash}` : e.message,
          code: isNotFound ? 404 : 500,
        };
        return c.json(errorResponse, isNotFound ? 404 : 500);
      }

      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve commit files";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
