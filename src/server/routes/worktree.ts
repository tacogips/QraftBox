/**
 * Worktree API Routes
 *
 * Provides REST API endpoints for git worktree operations including
 * creating, listing, and removing worktrees, as well as detecting repository
 * types and navigating between worktrees and main repositories.
 */

import { Hono } from "hono";
import { basename } from "node:path";
import { stat } from "node:fs/promises";
import type { ContextManager } from "../workspace/context-manager";
import type {
  WorktreeInfo,
  RepositoryDetectionResult,
  CreateWorktreeRequest,
} from "../../types/worktree";
import { generateDefaultWorktreePath } from "../../types/worktree";
import {
  detectRepositoryType,
  listWorktrees,
  createWorktree,
  removeWorktree,
  getMainRepositoryPath,
  WorktreeError,
} from "../git/worktree";
import { validateContextId } from "../../types/workspace";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Response for listing worktrees
 */
interface WorktreeListResponse {
  readonly worktrees: readonly WorktreeInfo[];
  readonly mainRepository: string;
}

/**
 * Response for detecting repository type
 */
interface DetectResponse {
  readonly detection: RepositoryDetectionResult;
}

/**
 * Response for getting main repository path
 */
interface MainRepositoryResponse {
  readonly isWorktree: boolean;
  readonly mainRepositoryPath: string | null;
  readonly mainRepositoryName: string | null;
}

/**
 * Response for getting default worktree path
 */
interface DefaultPathResponse {
  readonly path: string;
  readonly exists: boolean;
}

/**
 * Dependencies for worktree routes (for testing)
 */
export interface WorktreeRoutesDependencies {
  readonly detectRepositoryType: typeof detectRepositoryType;
  readonly listWorktrees: typeof listWorktrees;
  readonly createWorktree: typeof createWorktree;
  readonly removeWorktree: typeof removeWorktree;
  readonly getMainRepositoryPath: typeof getMainRepositoryPath;
  readonly generateDefaultWorktreePath: typeof generateDefaultWorktreePath;
}

/**
 * Create worktree routes
 *
 * Routes:
 * - GET /:id/worktree - List all worktrees for context
 * - GET /:id/worktree/detect - Detect repository type
 * - GET /:id/worktree/main - Get main repository path (for navigation)
 * - GET /default-path - Get default worktree path
 * - POST /:id/worktree - Create new worktree
 * - DELETE /:id/worktree - Remove worktree
 *
 * @param contextManager - Context manager instance
 * @param deps - Optional dependencies for testing
 * @returns Hono app with worktree routes mounted
 */
export function createWorktreeRoutes(
  contextManager: ContextManager,
  deps?: WorktreeRoutesDependencies,
): Hono {
  const app = new Hono();

  // Use injected dependencies or defaults
  const {
    detectRepositoryType: detectRepo = detectRepositoryType,
    listWorktrees: listWT = listWorktrees,
    createWorktree: createWT = createWorktree,
    removeWorktree: removeWT = removeWorktree,
    getMainRepositoryPath: getMainRepo = getMainRepositoryPath,
    generateDefaultWorktreePath: genDefaultPath = generateDefaultWorktreePath,
  } = deps ?? {};

  /**
   * GET /:id/worktree
   *
   * List all worktrees for a given context.
   *
   * Path parameters:
   * - id: Context ID
   *
   * Response:
   * - 200: WorktreeListResponse with worktrees array and main repository path
   * - 400: Invalid context ID
   * - 404: Context not found
   * - 500: Git operation failed
   */
  app.get("/:id/worktree", async (c) => {
    const id = c.req.param("id");

    // Validate context ID
    const validation = validateContextId(id);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid context ID",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Get context
    const context = contextManager.getContext(id);
    if (context === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${id}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    try {
      // List worktrees
      const worktrees = await listWT(context.repositoryRoot);

      // Find main repository
      const mainWorktree = worktrees.find((wt) => wt.isMain);
      const mainRepository = mainWorktree?.path ?? context.repositoryRoot;

      const response: WorktreeListResponse = {
        worktrees,
        mainRepository,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof WorktreeError
          ? `Git error: ${e.message}`
          : e instanceof Error
            ? e.message
            : "Failed to list worktrees";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /:id/worktree/detect
   *
   * Detect repository type (main/worktree/bare/not-git) for the given context.
   *
   * Path parameters:
   * - id: Context ID
   *
   * Response:
   * - 200: DetectResponse with repository detection result
   * - 400: Invalid context ID
   * - 404: Context not found
   * - 500: Detection failed
   */
  app.get("/:id/worktree/detect", async (c) => {
    const id = c.req.param("id");

    // Validate context ID
    const validation = validateContextId(id);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid context ID",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Get context
    const context = contextManager.getContext(id);
    if (context === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${id}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    try {
      // Detect repository type
      const detection = await detectRepo(context.repositoryRoot);

      const response: DetectResponse = {
        detection,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to detect repository type";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /:id/worktree/main
   *
   * Get main repository path if the context is a worktree.
   * This endpoint enables navigation from a worktree back to the main repository.
   *
   * Path parameters:
   * - id: Context ID
   *
   * Response:
   * - 200: MainRepositoryResponse with isWorktree, mainRepositoryPath, mainRepositoryName
   * - 400: Invalid context ID
   * - 404: Context not found
   * - 500: Operation failed
   */
  app.get("/:id/worktree/main", async (c) => {
    const id = c.req.param("id");

    // Validate context ID
    const validation = validateContextId(id);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid context ID",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Get context
    const context = contextManager.getContext(id);
    if (context === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${id}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    try {
      // Get main repository path
      const mainRepositoryPath = await getMainRepo(context.repositoryRoot);
      const isWorktree = mainRepositoryPath !== null;

      // Extract repository name from path
      let mainRepositoryName: string | null = null;
      if (mainRepositoryPath !== null) {
        mainRepositoryName = basename(mainRepositoryPath);
      }

      const response: MainRepositoryResponse = {
        isWorktree,
        mainRepositoryPath,
        mainRepositoryName,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get main repository path";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /default-path
   *
   * Get default worktree path for a project and worktree name.
   *
   * Query parameters:
   * - projectPath (required): Absolute path to project
   * - name (required): Worktree name
   *
   * Response:
   * - 200: DefaultPathResponse with path and exists flag
   * - 400: Missing or invalid query parameters
   * - 500: Operation failed
   */
  app.get("/default-path", async (c) => {
    const projectPath = c.req.query("projectPath");
    const name = c.req.query("name");

    // Validate query parameters
    if (!projectPath || projectPath.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Missing required query parameter: projectPath",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (!name || name.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Missing required query parameter: name",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Generate default path
      const path = genDefaultPath(projectPath, name);

      // Check if path exists
      let exists = false;
      try {
        await stat(path);
        exists = true;
      } catch {
        // Path doesn't exist
        exists = false;
      }

      const response: DefaultPathResponse = {
        path,
        exists,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to generate default path";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /:id/worktree
   *
   * Create a new worktree for the given context.
   *
   * Path parameters:
   * - id: Context ID
   *
   * Request body: CreateWorktreeRequest
   * - branch (required): Branch name
   * - worktreeName (optional): Custom worktree name (defaults to branch name)
   * - createBranch (optional): Create new branch
   * - baseBranch (optional): Base branch for new branch
   * - customPath (optional): Override default path
   *
   * Response:
   * - 200: CreateWorktreeResult
   * - 400: Invalid context ID or request body
   * - 404: Context not found
   * - 500: Creation failed
   */
  app.post("/:id/worktree", async (c) => {
    const id = c.req.param("id");

    // Validate context ID
    const validation = validateContextId(id);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid context ID",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Get context
    const context = contextManager.getContext(id);
    if (context === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${id}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Parse request body
    let requestBody: unknown;
    try {
      requestBody = await c.req.json();
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Validate request body structure
    if (
      typeof requestBody !== "object" ||
      requestBody === null ||
      !("branch" in requestBody)
    ) {
      const errorResponse: ErrorResponse = {
        error: "Missing required field: branch",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const body = requestBody as Record<string, unknown>;

    if (typeof body["branch"] !== "string" || body["branch"].length === 0) {
      const errorResponse: ErrorResponse = {
        error: "branch must be a non-empty string",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Build CreateWorktreeRequest with proper optional property handling
    const request: CreateWorktreeRequest = {
      branch: body["branch"],
    };

    // Add optional properties only if they are valid strings
    const worktreeNameValue = body["worktreeName"];
    if (typeof worktreeNameValue === "string" && worktreeNameValue.length > 0) {
      (request as { worktreeName?: string }).worktreeName = worktreeNameValue;
    }

    const createBranchValue = body["createBranch"];
    if (typeof createBranchValue === "boolean") {
      (request as { createBranch?: boolean }).createBranch = createBranchValue;
    }

    const baseBranchValue = body["baseBranch"];
    if (typeof baseBranchValue === "string" && baseBranchValue.length > 0) {
      (request as { baseBranch?: string }).baseBranch = baseBranchValue;
    }

    const customPathValue = body["customPath"];
    if (typeof customPathValue === "string" && customPathValue.length > 0) {
      (request as { customPath?: string }).customPath = customPathValue;
    }

    try {
      // Create worktree
      const result = await createWT(context.repositoryRoot, request);
      return c.json(result);
    } catch (e) {
      const errorMessage =
        e instanceof WorktreeError
          ? `Git error: ${e.message}`
          : e instanceof Error
            ? e.message
            : "Failed to create worktree";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * DELETE /:id/worktree
   *
   * Remove a worktree.
   *
   * Path parameters:
   * - id: Context ID
   *
   * Query parameters:
   * - path (required): Worktree path to remove
   * - force (optional): Force removal (boolean)
   *
   * Response:
   * - 200: RemoveWorktreeResult
   * - 400: Invalid context ID or query parameters
   * - 404: Context not found
   * - 500: Removal failed
   */
  app.delete("/:id/worktree", async (c) => {
    const id = c.req.param("id");

    // Validate context ID
    const validation = validateContextId(id);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid context ID",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Get context
    const context = contextManager.getContext(id);
    if (context === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${id}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Get query parameters
    const path = c.req.query("path");
    const forceParam = c.req.query("force");

    // Validate path parameter
    if (!path || path.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Missing required query parameter: path",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Parse force parameter
    const force = forceParam === "true";

    try {
      // Remove worktree
      const result = await removeWT(context.repositoryRoot, path, force);
      return c.json(result);
    } catch (e) {
      const errorMessage =
        e instanceof WorktreeError
          ? `Git error: ${e.message}`
          : e instanceof Error
            ? e.message
            : "Failed to remove worktree";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
