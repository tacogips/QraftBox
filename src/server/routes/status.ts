/**
 * Status API Routes
 *
 * Provides REST API endpoints for working tree status, including staged,
 * modified, untracked, and conflict files, along with current branch information.
 */

import { Hono } from "hono";
import { execGit } from "../git/executor.js";

/**
 * Server context provided to routes
 */
export interface ServerContext {
  readonly projectPath: string;
}

/**
 * Working tree status response
 */
export interface StatusResponse {
  readonly clean: boolean;
  readonly staged: readonly string[];
  readonly modified: readonly string[];
  readonly untracked: readonly string[];
  readonly conflicts: readonly string[];
  readonly branch: string;
}

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Create status routes
 *
 * Routes:
 * - GET /api/status - Get working tree status
 *
 * @param context - Server context with project path
 * @returns Hono app with status routes mounted
 */
export function createStatusRoutes(context: ServerContext): Hono {
  const app = new Hono();

  /**
   * GET /api/status
   *
   * Get working tree status including staged, modified, untracked files,
   * conflicts, and current branch name.
   *
   * Returns:
   * - clean: true if working tree is clean (no changes)
   * - staged: files staged for commit (first char is A/M/D/R/C, not space or ?)
   * - modified: files modified but not staged (second char is M/D, not space)
   * - untracked: untracked files ("??" prefix)
   * - conflicts: files with merge conflicts (UU, AA, DD, etc.)
   * - branch: current branch name
   */
  app.get("/", async (c) => {
    try {
      // Get current branch name
      const branchResult = await execGit(
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: context.projectPath },
      );

      if (branchResult.exitCode !== 0) {
        const errorResponse: ErrorResponse = {
          error: `Failed to get current branch: ${branchResult.stderr}`,
          code: 500,
        };
        return c.json(errorResponse, 500);
      }

      const branch = branchResult.stdout.trim();

      // Get working tree status using porcelain format
      const statusResult = await execGit(["status", "--porcelain=v1"], {
        cwd: context.projectPath,
      });

      if (statusResult.exitCode !== 0) {
        const errorResponse: ErrorResponse = {
          error: `Failed to get status: ${statusResult.stderr}`,
          code: 500,
        };
        return c.json(errorResponse, 500);
      }

      // Parse porcelain output
      const parsed = parsePorcelainStatus(statusResult.stdout);

      const response: StatusResponse = {
        clean: parsed.clean,
        staged: parsed.staged,
        modified: parsed.modified,
        untracked: parsed.untracked,
        conflicts: parsed.conflicts,
        branch,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve status";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}

/**
 * Parsed status result
 */
interface ParsedStatus {
  readonly clean: boolean;
  readonly staged: readonly string[];
  readonly modified: readonly string[];
  readonly untracked: readonly string[];
  readonly conflicts: readonly string[];
}

/**
 * Parse git status --porcelain=v1 output
 *
 * Porcelain v1 format: "XY path"
 * - X = staged status (first char)
 * - Y = unstaged status (second char)
 *
 * Staged (X not space or ?): A/M/D/R/C
 * Modified (Y is M/D): M/D
 * Untracked: "??"
 * Conflicts: UU, AA, DD, AU, UA, DU, UD, etc.
 *
 * @param rawStatus - Raw git status --porcelain=v1 output
 * @returns Parsed status with categorized files
 */
function parsePorcelainStatus(rawStatus: string): ParsedStatus {
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];
  const conflicts: string[] = [];

  const lines = rawStatus.split("\n");

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    // Porcelain v1 format: "XY path"
    const statusPart = line.substring(0, 2);
    const path = line.substring(3);

    const stagedCode = statusPart[0] ?? " ";
    const unstagedCode = statusPart[1] ?? " ";

    // Check for conflicts first (both X and Y are non-space conflict markers)
    if (isConflictStatus(stagedCode, unstagedCode)) {
      conflicts.push(path);
      continue;
    }

    // Check for untracked files ("??")
    if (stagedCode === "?" && unstagedCode === "?") {
      untracked.push(path);
      continue;
    }

    // Check for staged files (X is not space or ?)
    if (stagedCode !== " " && stagedCode !== "?") {
      staged.push(path);
    }

    // Check for modified files (Y is M or D, not space)
    if (unstagedCode === "M" || unstagedCode === "D") {
      modified.push(path);
    }
  }

  const clean =
    staged.length === 0 &&
    modified.length === 0 &&
    untracked.length === 0 &&
    conflicts.length === 0;

  return {
    clean,
    staged,
    modified,
    untracked,
    conflicts,
  };
}

/**
 * Check if status codes indicate a conflict
 *
 * Conflict patterns:
 * - DD: both deleted
 * - AU: added by us
 * - UD: deleted by them
 * - UA: added by them
 * - DU: deleted by us
 * - AA: both added
 * - UU: both modified
 *
 * @param stagedCode - First character (X)
 * @param unstagedCode - Second character (Y)
 * @returns true if this is a conflict status
 */
function isConflictStatus(stagedCode: string, unstagedCode: string): boolean {
  const conflictPatterns = ["DD", "AU", "UD", "UA", "DU", "AA", "UU"];
  const statusPair = stagedCode + unstagedCode;
  return conflictPatterns.includes(statusPair);
}
