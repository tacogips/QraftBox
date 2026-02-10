/**
 * Pull Request API Routes
 *
 * REST endpoints for AI-powered pull request operations.
 * Provides PR creation, updates, status checking, and GitHub metadata management.
 */

import { Hono } from "hono";
import type {
  PRRequest,
  BranchPRStatus,
  PRPromptContext,
} from "../../types/pr.js";
import type { PRExecutor } from "../pr/executor.js";
import type { PRService } from "../github/pr-service.js";
import type { ContextManager } from "../workspace/context-manager.js";
import type { ContextId } from "../../types/workspace.js";
import {
  withTimeout,
  isTimeoutError,
  ROUTE_TIMEOUTS,
} from "../../utils/timeout.js";

/**
 * Validate PR request body
 */
export function validatePRRequest(
  request: unknown,
): { valid: true } | { valid: false; error: string } {
  if (typeof request !== "object" || request === null) {
    return { valid: false, error: "Request must be an object" };
  }

  const req = request as Record<string, unknown>;

  const promptTemplateId = req["promptTemplateId"];
  if (typeof promptTemplateId !== "string" || promptTemplateId.length === 0) {
    return {
      valid: false,
      error: "promptTemplateId must be a non-empty string",
    };
  }

  const baseBranch = req["baseBranch"];
  if (typeof baseBranch !== "string" || baseBranch.length === 0) {
    return { valid: false, error: "baseBranch must be a non-empty string" };
  }

  const title = req["title"];
  if (title !== undefined && typeof title !== "string") {
    return { valid: false, error: "title must be a string if provided" };
  }

  const body = req["body"];
  if (body !== undefined && typeof body !== "string") {
    return { valid: false, error: "body must be a string if provided" };
  }

  const draft = req["draft"];
  if (draft !== undefined && typeof draft !== "boolean") {
    return { valid: false, error: "draft must be a boolean if provided" };
  }

  const labels = req["labels"];
  if (labels !== undefined) {
    if (!Array.isArray(labels) || !labels.every((l) => typeof l === "string")) {
      return {
        valid: false,
        error: "labels must be an array of strings if provided",
      };
    }
  }

  const reviewers = req["reviewers"];
  if (reviewers !== undefined) {
    if (
      !Array.isArray(reviewers) ||
      !reviewers.every((r) => typeof r === "string")
    ) {
      return {
        valid: false,
        error: "reviewers must be an array of strings if provided",
      };
    }
  }

  const assignees = req["assignees"];
  if (assignees !== undefined) {
    if (
      !Array.isArray(assignees) ||
      !assignees.every((a) => typeof a === "string")
    ) {
      return {
        valid: false,
        error: "assignees must be an array of strings if provided",
      };
    }
  }

  const customVariables = req["customVariables"];
  if (customVariables !== undefined) {
    if (typeof customVariables !== "object" || customVariables === null) {
      return {
        valid: false,
        error: "customVariables must be an object if provided",
      };
    }
  }

  return { valid: true };
}

/**
 * Validate labels request body
 */
export function validateLabelsRequest(
  request: unknown,
): { valid: true } | { valid: false; error: string } {
  if (typeof request !== "object" || request === null) {
    return { valid: false, error: "Request must be an object" };
  }

  const req = request as Record<string, unknown>;

  const labels = req["labels"];
  if (!Array.isArray(labels) || labels.length === 0) {
    return { valid: false, error: "labels must be a non-empty array" };
  }

  if (!labels.every((l) => typeof l === "string")) {
    return { valid: false, error: "labels must be an array of strings" };
  }

  return { valid: true };
}

/**
 * Validate reviewers request body
 */
export function validateReviewersRequest(
  request: unknown,
): { valid: true } | { valid: false; error: string } {
  if (typeof request !== "object" || request === null) {
    return { valid: false, error: "Request must be an object" };
  }

  const req = request as Record<string, unknown>;

  const reviewers = req["reviewers"];
  if (!Array.isArray(reviewers) || reviewers.length === 0) {
    return { valid: false, error: "reviewers must be a non-empty array" };
  }

  if (!reviewers.every((r) => typeof r === "string")) {
    return { valid: false, error: "reviewers must be an array of strings" };
  }

  return { valid: true };
}

/**
 * Dependencies for PR routes (for dependency injection in tests)
 */
export interface PRRoutesDependencies {
  readonly executor: PRExecutor;
  readonly prService: PRService;
}

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Response for PR status endpoint
 */
interface PRStatusResponse {
  readonly status: BranchPRStatus;
}

/**
 * Response for branches list endpoint
 */
interface BranchesResponse {
  readonly branches: readonly string[];
}

/**
 * Response for PR creation/update
 */
interface PRActionResponse {
  readonly sessionId: string;
  readonly context: PRPromptContext;
}

/**
 * Response for label/reviewer operations
 */
interface SuccessResponse {
  readonly success: boolean;
}

/**
 * Create PR routes
 *
 * Routes:
 * - GET /api/ctx/:contextId/pr/status - Get PR status for current branch
 * - GET /api/ctx/:contextId/pr/branches - Get available base branches
 * - POST /api/ctx/:contextId/pr - Create PR via AI
 * - PUT /api/ctx/:contextId/pr/:prNumber - Update existing PR
 * - POST /api/ctx/:contextId/pr/:prNumber/labels - Add labels to PR
 * - POST /api/ctx/:contextId/pr/:prNumber/reviewers - Request reviewers
 *
 * @param contextManager - Context manager instance
 * @param deps - Dependencies (executor and prService)
 * @returns Hono app with PR routes mounted
 */
export function createPRRoutes(
  contextManager: ContextManager,
  deps: PRRoutesDependencies,
): Hono {
  const app = new Hono();
  const { executor, prService } = deps;

  /**
   * GET /api/ctx/:contextId/pr/status
   *
   * Get pull request status for the current branch.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Returns:
   * - status: BranchPRStatus with hasPR, existing PR info, canCreatePR, availableBaseBranches
   *
   * Error cases:
   * - 404: Context not found
   * - 500: Failed to get PR status
   */
  app.get("/:contextId/status", async (c) => {
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
      const status = await withTimeout(
        executor.getPRStatus(context.repositoryRoot),
        ROUTE_TIMEOUTS.PR_STATUS,
        "prStatus:getPRStatus",
      );

      const response: PRStatusResponse = {
        status,
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
        e instanceof Error ? e.message : "Failed to get PR status";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/ctx/:contextId/pr/branches
   *
   * Get available base branches for PR creation.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Returns:
   * - branches: Array of available base branch names
   *
   * Error cases:
   * - 404: Context not found
   * - 500: Failed to get branches
   */
  app.get("/:contextId/branches", async (c) => {
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
      const branches = await withTimeout(
        executor.getBaseBranches(context.repositoryRoot),
        ROUTE_TIMEOUTS.PR_BRANCHES,
        "prBranches:getBaseBranches",
      );

      const response: BranchesResponse = {
        branches,
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
        e instanceof Error ? e.message : "Failed to get branches";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /api/ctx/:contextId/pr
   *
   * Create a pull request via AI assistance.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Request body (PRRequest):
   * - promptTemplateId: Prompt template ID to use
   * - baseBranch: Base branch for the PR
   * - title: PR title (optional, AI will generate if not provided)
   * - body: PR body (optional, AI will generate if not provided)
   * - draft: Create as draft PR (optional, default false)
   * - labels: Labels to add (optional)
   * - reviewers: Reviewers to request (optional)
   * - assignees: Assignees to add (optional)
   * - customVariables: Template variable substitutions (optional)
   *
   * Returns:
   * - sessionId: AI session ID for tracking
   * - context: PR prompt context with commits and metadata
   *
   * Error cases:
   * - 400: Invalid request body, no repository info
   * - 404: Context not found
   * - 500: Failed to create PR
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

    // Validate request
    const validation = validatePRRequest(requestBody);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error,
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const request = requestBody as PRRequest;

    try {
      // Check if repository info is available
      const repoInfo = await withTimeout(
        executor.getRepoInfo(context.repositoryRoot),
        ROUTE_TIMEOUTS.PR_CREATE,
        "prCreate:getRepoInfo",
      );
      if (repoInfo === null) {
        const errorResponse: ErrorResponse = {
          error: "No GitHub repository information available",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Create PR via executor
      const result = await withTimeout(
        executor.createPR(context.repositoryRoot, request),
        ROUTE_TIMEOUTS.PR_CREATE,
        "prCreate:createPR",
      );

      const response: PRActionResponse = {
        sessionId: result.sessionId,
        context: result.context,
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
        e instanceof Error ? e.message : "Failed to create PR";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * PUT /api/ctx/:contextId/pr/:prNumber
   *
   * Update an existing pull request.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   * - prNumber: Pull request number
   *
   * Request body (PRRequest):
   * - promptTemplateId: Prompt template ID to use
   * - baseBranch: Base branch for the PR
   * - title: PR title (optional, AI will generate if not provided)
   * - body: PR body (optional, AI will generate if not provided)
   * - draft: Update draft status (optional)
   * - labels: Labels to add (optional)
   * - reviewers: Reviewers to request (optional)
   * - assignees: Assignees to add (optional)
   * - customVariables: Template variable substitutions (optional)
   *
   * Returns:
   * - sessionId: AI session ID for tracking
   * - context: PR prompt context with commits and metadata
   *
   * Error cases:
   * - 400: Invalid request body, invalid PR number, no repository info
   * - 404: Context not found, PR not found
   * - 500: Failed to update PR
   */
  app.put("/:contextId/:prNumber", async (c) => {
    const contextId = c.req.param("contextId") as ContextId;
    const prNumberStr = c.req.param("prNumber");

    // Parse PR number
    const prNumber = parseInt(prNumberStr ?? "", 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      const errorResponse: ErrorResponse = {
        error: "Invalid PR number",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

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

    // Validate request
    const validation = validatePRRequest(requestBody);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error,
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const request = requestBody as PRRequest;

    try {
      // Check if repository info is available
      const repoInfo = await withTimeout(
        executor.getRepoInfo(context.repositoryRoot),
        ROUTE_TIMEOUTS.PR_UPDATE,
        "prUpdate:getRepoInfo",
      );
      if (repoInfo === null) {
        const errorResponse: ErrorResponse = {
          error: "No GitHub repository information available",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Update PR via executor
      const result = await withTimeout(
        executor.updatePR(context.repositoryRoot, prNumber, request),
        ROUTE_TIMEOUTS.PR_UPDATE,
        "prUpdate:updatePR",
      );

      const response: PRActionResponse = {
        sessionId: result.sessionId,
        context: result.context,
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
        e instanceof Error ? e.message : "Failed to update PR";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /api/ctx/:contextId/pr/:prNumber/labels
   *
   * Add labels to a pull request.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   * - prNumber: Pull request number
   *
   * Request body:
   * - labels: Array of label names to add
   *
   * Returns:
   * - success: Boolean indicating operation success
   *
   * Error cases:
   * - 400: Invalid request body, invalid PR number, no repository info
   * - 404: Context not found
   * - 500: Failed to add labels
   */
  app.post("/:contextId/:prNumber/labels", async (c) => {
    const contextId = c.req.param("contextId") as ContextId;
    const prNumberStr = c.req.param("prNumber");

    // Parse PR number
    const prNumber = parseInt(prNumberStr ?? "", 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      const errorResponse: ErrorResponse = {
        error: "Invalid PR number",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

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

    // Validate request
    const validation = validateLabelsRequest(requestBody);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error,
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const request = requestBody as { labels: string[] };

    try {
      // Get repository info
      const repoInfo = await withTimeout(
        executor.getRepoInfo(context.repositoryRoot),
        ROUTE_TIMEOUTS.PR_METADATA,
        "prLabels:getRepoInfo",
      );
      if (repoInfo === null) {
        const errorResponse: ErrorResponse = {
          error: "No GitHub repository information available",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Add labels via PR service
      await withTimeout(
        prService.addLabels(
          repoInfo.owner,
          repoInfo.name,
          prNumber,
          request.labels,
        ),
        ROUTE_TIMEOUTS.PR_METADATA,
        "prLabels:addLabels",
      );

      const response: SuccessResponse = {
        success: true,
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
        e instanceof Error ? e.message : "Failed to add labels";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /api/ctx/:contextId/pr/:prNumber/merge
   *
   * Merge a pull request.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   * - prNumber: Pull request number
   *
   * Request body:
   * - mergeMethod: "merge" | "squash" | "rebase" (optional, defaults to "merge")
   *
   * Returns:
   * - merged: Boolean indicating if merge was successful
   * - message: Merge result message
   *
   * Error cases:
   * - 400: Invalid PR number, no repository info
   * - 404: Context not found
   * - 500: Failed to merge PR
   */
  app.post("/:contextId/:prNumber/merge", async (c) => {
    const contextId = c.req.param("contextId") as ContextId;
    const prNumberStr = c.req.param("prNumber");

    // Parse PR number
    const prNumber = parseInt(prNumberStr ?? "", 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      const errorResponse: ErrorResponse = {
        error: "Invalid PR number",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Get context from manager
    const context = contextManager.getContext(contextId);
    if (context === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${contextId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Parse request body
    let requestBody: { mergeMethod?: "merge" | "squash" | "rebase" } = {};
    try {
      requestBody = (await c.req.json()) as typeof requestBody;
    } catch {
      // Use defaults if no body provided
    }

    const mergeMethod = requestBody.mergeMethod ?? "merge";

    try {
      // Get repository info
      const repoInfo = await withTimeout(
        executor.getRepoInfo(context.repositoryRoot),
        ROUTE_TIMEOUTS.PR_MERGE,
        "prMerge:getRepoInfo",
      );
      if (repoInfo === null) {
        const errorResponse: ErrorResponse = {
          error: "No GitHub repository information available",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Merge PR via PR service
      const result = await withTimeout(
        prService.mergePR(repoInfo.owner, repoInfo.name, prNumber, mergeMethod),
        ROUTE_TIMEOUTS.PR_MERGE,
        "prMerge:mergePR",
      );

      return c.json(result);
    } catch (e) {
      if (isTimeoutError(e)) {
        const errorResponse: ErrorResponse = {
          error: `Operation timed out: ${e.operation}`,
          code: 504,
        };
        return c.json(errorResponse, 504);
      }
      const errorMessage =
        e instanceof Error ? e.message : "Failed to merge PR";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /api/ctx/:contextId/pr/:prNumber/reviewers
   *
   * Request reviewers for a pull request.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   * - prNumber: Pull request number
   *
   * Request body:
   * - reviewers: Array of GitHub usernames to request review from
   *
   * Returns:
   * - success: Boolean indicating operation success
   *
   * Error cases:
   * - 400: Invalid request body, invalid PR number, no repository info
   * - 404: Context not found
   * - 500: Failed to request reviewers
   */
  app.post("/:contextId/:prNumber/reviewers", async (c) => {
    const contextId = c.req.param("contextId") as ContextId;
    const prNumberStr = c.req.param("prNumber");

    // Parse PR number
    const prNumber = parseInt(prNumberStr ?? "", 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      const errorResponse: ErrorResponse = {
        error: "Invalid PR number",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

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

    // Validate request
    const validation = validateReviewersRequest(requestBody);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error,
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const request = requestBody as { reviewers: string[] };

    try {
      // Get repository info
      const repoInfo = await withTimeout(
        executor.getRepoInfo(context.repositoryRoot),
        ROUTE_TIMEOUTS.PR_METADATA,
        "prReviewers:getRepoInfo",
      );
      if (repoInfo === null) {
        const errorResponse: ErrorResponse = {
          error: "No GitHub repository information available",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Request reviewers via PR service
      await withTimeout(
        prService.requestReviewers(
          repoInfo.owner,
          repoInfo.name,
          prNumber,
          request.reviewers,
        ),
        ROUTE_TIMEOUTS.PR_METADATA,
        "prReviewers:requestReviewers",
      );

      const response: SuccessResponse = {
        success: true,
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
        e instanceof Error ? e.message : "Failed to request reviewers";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
