/**
 * Branch API Routes
 *
 * Provides REST API endpoints for git branch operations including
 * listing branches, searching, and checkout with uncommitted changes handling.
 */

import { Hono } from "hono";
import type { ServerContext } from "../../types/index.js";
import type {
  BranchInfo,
  BranchListResponse,
  BranchCheckoutRequest,
  BranchCheckoutResponse,
  BranchMergeRequest,
  BranchMergeResponse,
  BranchCreateRequest,
  BranchCreateResponse,
} from "../../types/branch.js";
import {
  listBranches,
  searchBranches,
  checkoutBranch,
  mergeBranch,
  createBranch,
} from "../git/branch.js";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Search results response format
 */
interface SearchResponse {
  readonly results: readonly BranchInfo[];
}

/**
 * Hono context variables type extension for middleware
 */
type ContextVariables = {
  serverContext: ServerContext;
};

/**
 * Create branch routes
 *
 * Routes:
 * - GET / - List all branches with metadata
 * - GET /search - Search branches by name
 * - POST /checkout - Checkout a branch with uncommitted changes handling
 *
 * @param context - Optional server context with project path (for standalone use)
 * @returns Hono app with branch routes mounted
 *
 * @example
 * ```typescript
 * // Standalone usage with explicit context
 * const app = createBranchRoutes({ projectPath: '/path/to/repo' });
 *
 * // Middleware usage (context from Hono variables)
 * const app = new Hono();
 * app.use('*', async (c, next) => {
 *   c.set('serverContext', { projectPath: '/path/to/repo' });
 *   await next();
 * });
 * app.route('/branches', createBranchRoutes());
 * ```
 */
export function createBranchRoutes(
  context?: ServerContext | undefined,
): Hono<{ Variables: ContextVariables }> {
  const app = new Hono<{ Variables: ContextVariables }>();

  /**
   * GET /
   *
   * List all branches with metadata.
   *
   * Query parameters:
   * - includeRemote (optional): Include remote branches (default: false)
   *
   * Returns:
   * - branches: Array of BranchInfo objects
   * - current: Name of current branch
   * - defaultBranch: Name of default branch (main/master)
   */
  app.get("/", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = context ?? c.get("serverContext");

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract query parameters
    const includeRemoteParam = c.req.query("includeRemote");
    const includeRemote =
      includeRemoteParam === "true" || includeRemoteParam === "1";

    // Pagination parameters
    const offsetParam = c.req.query("offset");
    const limitParam = c.req.query("limit");
    const offset = offsetParam !== undefined ? parseInt(offsetParam, 10) : 0;
    const limit = limitParam !== undefined ? parseInt(limitParam, 10) : 30;

    try {
      const result = await listBranches(
        serverContext.projectPath,
        includeRemote,
        { offset, limit },
      );

      const response: BranchListResponse = {
        branches: result.branches,
        current: result.currentBranch,
        defaultBranch: result.defaultBranch,
        total: result.total,
        offset,
        limit,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to list branches";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /search
   *
   * Search branches by partial name match.
   *
   * Query parameters:
   * - q (required): Search query (partial branch name)
   * - limit (optional): Maximum number of results (default: 20)
   * - includeRemote (optional): Include remote branches (default: false)
   *
   * Returns:
   * - results: Array of matching BranchInfo objects
   */
  app.get("/search", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = context ?? c.get("serverContext");

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract query parameters
    const query = c.req.query("q");
    const limitParam = c.req.query("limit");

    // Validate required parameters
    if (query === undefined || query.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Query parameter 'q' is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Parse limit
    const limit = limitParam !== undefined ? parseInt(limitParam, 10) : 20;

    // Validate limit
    if (isNaN(limit) || limit < 1) {
      const errorResponse: ErrorResponse = {
        error: "Limit must be a positive number",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Execute search
      const results = await searchBranches(
        serverContext.projectPath,
        query,
        limit,
      );

      const response: SearchResponse = {
        results,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to search branches";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /checkout
   *
   * Checkout a git branch with uncommitted changes handling.
   *
   * Request body (BranchCheckoutRequest):
   * - branch (required): Branch name to checkout
   * - force (optional): Force checkout, discarding uncommitted changes
   * - stash (optional): Stash uncommitted changes before checkout
   *
   * Returns:
   * - success: Boolean indicating success or failure
   * - previousBranch: Branch name before checkout
   * - currentBranch: Branch name after checkout
   * - stashCreated (optional): Stash reference if changes were stashed
   * - error (optional): Error message if checkout failed
   */
  app.post("/checkout", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = context ?? c.get("serverContext");

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Parse request body
    let checkoutRequest: BranchCheckoutRequest;
    try {
      const body = await c.req.json();
      checkoutRequest = body as BranchCheckoutRequest;
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Validate required fields
    if (
      checkoutRequest.branch === undefined ||
      checkoutRequest.branch.trim().length === 0
    ) {
      const errorResponse: ErrorResponse = {
        error: "Branch name is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Execute checkout
      const response: BranchCheckoutResponse = await checkoutBranch(
        serverContext.projectPath,
        checkoutRequest,
      );

      // Return appropriate status code based on success
      const statusCode = response.success ? 200 : 400;
      return c.json(response, statusCode);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to checkout branch";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /merge
   *
   * Merge a branch into the current branch.
   * Requires clean working tree (no uncommitted changes).
   *
   * Request body (BranchMergeRequest):
   * - branch (required): Branch name to merge
   * - noFf (optional): Force merge commit even for fast-forward (default: false)
   *
   * Returns:
   * - success: Boolean indicating success
   * - mergedBranch: Branch that was merged
   * - currentBranch: Current branch name
   * - error (optional): Error message if merge failed
   */
  app.post("/merge", async (c) => {
    const serverContext = context ?? c.get("serverContext");

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    let mergeRequest: BranchMergeRequest;
    try {
      const body = await c.req.json();
      mergeRequest = body as BranchMergeRequest;
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (
      mergeRequest.branch === undefined ||
      mergeRequest.branch.trim().length === 0
    ) {
      const errorResponse: ErrorResponse = {
        error: "Branch name is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      const result = await mergeBranch(
        serverContext.projectPath,
        mergeRequest.branch,
        mergeRequest.noFf,
      );

      const response: BranchMergeResponse = {
        success: result.success,
        mergedBranch: mergeRequest.branch,
        currentBranch: result.currentBranch,
        error: result.error,
      };

      const statusCode = result.success ? 200 : 400;
      return c.json(response, statusCode);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to merge branch";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /create
   *
   * Create a new branch and switch to it.
   *
   * Request body (BranchCreateRequest):
   * - branch (required): New branch name
   * - startPoint (optional): Commit/ref to create from (default: current HEAD)
   *
   * Returns:
   * - success: Boolean indicating success
   * - branch: Created branch name
   * - error (optional): Error message if creation failed
   */
  app.post("/create", async (c) => {
    const serverContext = context ?? c.get("serverContext");

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    let createRequest: BranchCreateRequest;
    try {
      const body = await c.req.json();
      createRequest = body as BranchCreateRequest;
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (
      createRequest.branch === undefined ||
      createRequest.branch.trim().length === 0
    ) {
      const errorResponse: ErrorResponse = {
        error: "Branch name is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      const response: BranchCreateResponse = await createBranch(
        serverContext.projectPath,
        createRequest,
      );

      const statusCode = response.success ? 201 : 400;
      return c.json(response, statusCode);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to create branch";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
