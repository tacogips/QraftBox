/**
 * Commit API Routes
 *
 * REST endpoints for AI-powered git commit operations.
 * Provides commit execution, preview, and staged files information.
 */

import { Hono } from "hono";
import type {
  CommitPromptContext,
  CommitRequest,
  CommitResult,
  StagedFile,
} from "../../types/commit-context";
import { validateCommitRequest } from "../../types/commit-context";
import {
  buildContext as defaultBuildContext,
  executeCommit as defaultExecuteCommit,
  previewCommit as defaultPreviewCommit,
} from "../commit/executor";
import {
  getStagedFiles as defaultGetStagedFiles,
  hasStagedChanges as defaultHasStagedChanges,
} from "../git/staged";
import type { StagedFile as GitStagedFile } from "../git/staged";
import type { ContextManager } from "../workspace/context-manager";
import type { ContextId } from "../../types/workspace";
import {
  withTimeout,
  isTimeoutError,
  ROUTE_TIMEOUTS,
} from "../../utils/timeout";

/**
 * Dependencies for commit routes (for dependency injection in tests)
 */
export interface CommitRoutesDependencies {
  readonly buildContext: (cwd: string) => Promise<CommitPromptContext>;
  readonly executeCommit: (
    cwd: string,
    message: string,
  ) => Promise<CommitResult>;
  readonly previewCommit: (
    context: CommitPromptContext,
    promptId: string,
  ) => Promise<string>;
  readonly getStagedFiles: (cwd: string) => Promise<readonly GitStagedFile[]>;
  readonly hasStagedChanges: (cwd: string) => Promise<boolean>;
}

/**
 * Default dependencies using real implementations
 */
const defaultDependencies: CommitRoutesDependencies = {
  buildContext: defaultBuildContext,
  executeCommit: defaultExecuteCommit,
  previewCommit: defaultPreviewCommit,
  getStagedFiles: defaultGetStagedFiles,
  hasStagedChanges: defaultHasStagedChanges,
};

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Response for commit execution
 */
interface CommitResponse {
  readonly result: CommitResult;
}

/**
 * Response for commit preview
 */
interface CommitPreviewResponse {
  readonly preview: string;
  readonly context: CommitPromptContext;
}

/**
 * Response for staged files
 */
interface StagedFilesResponse {
  readonly files: readonly StagedFile[];
  readonly hasStagedChanges: boolean;
}

/**
 * Create commit routes
 *
 * Routes:
 * - POST /api/ctx/:contextId/commit - Execute commit with AI
 * - POST /api/ctx/:contextId/commit/preview - Preview commit (dry run)
 * - GET /api/ctx/:contextId/staged - Get staged files info
 *
 * @param contextManager - Context manager instance
 * @param deps - Optional dependencies for testing (defaults to real implementations)
 * @returns Hono app with commit routes mounted
 */
export function createCommitRoutes(
  contextManager: ContextManager,
  deps: CommitRoutesDependencies = defaultDependencies,
): Hono {
  const app = new Hono();
  const {
    buildContext,
    executeCommit,
    previewCommit,
    getStagedFiles,
    hasStagedChanges,
  } = deps;

  /**
   * POST /api/ctx/:contextId/commit
   *
   * Execute commit with AI-generated message.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Request body (CommitRequest):
   * - promptId: Prompt template ID to use
   * - variables: Template variable substitutions
   * - dryRun: If true, only preview without committing
   *
   * Returns:
   * - result: CommitResult with success status and commit hash
   *
   * Error cases:
   * - 400: Invalid request body, invalid context ID
   * - 404: Context not found
   * - 500: Failed to build context or execute commit
   */
  app.post("/:contextId", async (c) => {
    const contextId = c.req.param("contextId") as ContextId;

    // Get context from manager
    const context = contextManager.getContext(contextId);
    if (context === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${contextId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Parse and validate request body
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

    // Type guard for CommitRequest
    if (
      typeof requestBody !== "object" ||
      requestBody === null ||
      !("promptId" in requestBody) ||
      !("variables" in requestBody) ||
      !("dryRun" in requestBody)
    ) {
      const errorResponse: ErrorResponse = {
        error:
          "Missing required fields: promptId, variables, dryRun are required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const request = requestBody as CommitRequest;

    // Validate commit request
    const validation = validateCommitRequest(request);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid commit request",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Build commit context with timeout protection
      const commitContext = await withTimeout(
        buildContext(context.repositoryRoot),
        ROUTE_TIMEOUTS.COMMIT,
        "commit:buildContext",
      );

      // Check if there are staged changes
      if (commitContext.stagedFiles.length === 0) {
        const errorResponse: ErrorResponse = {
          error: "No staged changes to commit",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // For now, we execute the commit directly without AI
      // TODO: Integrate with AI session manager to generate commit message
      // This is a placeholder implementation until TASK-003 AI integration

      // Use a simple commit message for now
      const message = `Auto-commit: ${commitContext.stagedFiles.length} files changed`;

      // Execute commit with timeout protection
      const result = await withTimeout(
        executeCommit(context.repositoryRoot, message),
        ROUTE_TIMEOUTS.COMMIT,
        "commit:executeCommit",
      );

      const response: CommitResponse = {
        result,
      };
      return c.json(response);
    } catch (e) {
      if (isTimeoutError(e)) {
        const errorResponse: ErrorResponse = {
          error: `Operation timed out: ${e.operation}`,
          code: 504,
        };
        return c.json(errorResponse, 504);
      }
      const errorMessage =
        e instanceof Error ? e.message : "Failed to execute commit";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /api/ctx/:contextId/commit/preview
   *
   * Preview commit without executing (dry run).
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Request body (CommitRequest):
   * - promptId: Prompt template ID to use
   * - variables: Template variable substitutions
   * - dryRun: Should be true for preview
   *
   * Returns:
   * - preview: Preview text of the commit prompt
   * - context: Commit prompt context with staged files and diff
   *
   * Error cases:
   * - 400: Invalid request body, invalid context ID
   * - 404: Context not found
   * - 500: Failed to build context or generate preview
   */
  app.post("/:contextId/preview", async (c) => {
    const contextId = c.req.param("contextId") as ContextId;

    // Get context from manager
    const context = contextManager.getContext(contextId);
    if (context === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${contextId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Parse and validate request body
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

    // Type guard for CommitRequest
    if (
      typeof requestBody !== "object" ||
      requestBody === null ||
      !("promptId" in requestBody)
    ) {
      const errorResponse: ErrorResponse = {
        error: "Missing required field: promptId",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const request = requestBody as CommitRequest;

    // Validate commit request
    const validation = validateCommitRequest(request);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid commit request",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Build commit context with timeout protection
      const commitContext = await withTimeout(
        buildContext(context.repositoryRoot),
        ROUTE_TIMEOUTS.COMMIT_PREVIEW,
        "commitPreview:buildContext",
      );

      // Check if there are staged changes
      if (commitContext.stagedFiles.length === 0) {
        const errorResponse: ErrorResponse = {
          error: "No staged changes to preview",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Generate preview with timeout protection
      const preview = await withTimeout(
        previewCommit(commitContext, request.promptId),
        ROUTE_TIMEOUTS.COMMIT_PREVIEW,
        "commitPreview:previewCommit",
      );

      const response: CommitPreviewResponse = {
        preview,
        context: commitContext,
      };
      return c.json(response);
    } catch (e) {
      if (isTimeoutError(e)) {
        const errorResponse: ErrorResponse = {
          error: `Operation timed out: ${e.operation}`,
          code: 504,
        };
        return c.json(errorResponse, 504);
      }
      const errorMessage =
        e instanceof Error ? e.message : "Failed to generate preview";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/ctx/:contextId/staged
   *
   * Get list of staged files with change information.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Returns:
   * - files: Array of staged files with status and change statistics
   * - hasStagedChanges: Boolean indicating if there are any staged changes
   *
   * Error cases:
   * - 404: Context not found
   * - 500: Failed to get staged files
   */
  app.get("/:contextId/staged", async (c) => {
    const contextId = c.req.param("contextId") as ContextId;

    // Get context from manager
    const context = contextManager.getContext(contextId);
    if (context === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${contextId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    try {
      // Get staged files from git with timeout protection
      const gitStagedFiles = await withTimeout(
        getStagedFiles(context.repositoryRoot),
        ROUTE_TIMEOUTS.STAGED_FILES,
        "stagedFiles:getStagedFiles",
      );

      // Check if there are staged changes
      const hasChanges = await withTimeout(
        hasStagedChanges(context.repositoryRoot),
        ROUTE_TIMEOUTS.STAGED_FILES,
        "stagedFiles:hasStagedChanges",
      );

      // Map git StagedFile to commit-context StagedFile
      // Map 'C' (Copied) to 'A' (Added) since StagedFileStatus doesn't include 'C'
      const files: readonly StagedFile[] = gitStagedFiles.map((file) => ({
        path: file.path,
        status: file.status === "C" ? "A" : file.status,
        additions: file.additions,
        deletions: file.deletions,
      }));

      const response: StagedFilesResponse = {
        files,
        hasStagedChanges: hasChanges,
      };
      return c.json(response);
    } catch (e) {
      if (isTimeoutError(e)) {
        const errorResponse: ErrorResponse = {
          error: `Operation timed out: ${e.operation}`,
          code: 504,
        };
        return c.json(errorResponse, 504);
      }
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get staged files";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
