/**
 * Push API Routes
 *
 * REST endpoints for AI-powered git push operations.
 * Provides push execution, preview, status, and remote information.
 */

import { Hono } from "hono";
import type {
  PushPromptContext,
  PushResult,
  PushStatus,
} from "../../types/push-context";
import {
  buildContext as defaultBuildContext,
  executePush as defaultExecutePush,
  previewPush as defaultPreviewPush,
  getPushStatus as defaultGetPushStatus,
  getRemotes as defaultGetRemotes,
  type PushOptions,
  type Remote,
} from "../push/executor";
import type { ContextManager } from "../workspace/context-manager";
import type { ContextId } from "../../types/workspace";

/**
 * Push request body
 */
export interface PushRequest {
  readonly promptId: string;
  readonly variables?: Record<string, string>;
  readonly remote?: string;
  readonly branch?: string;
  readonly force?: boolean;
  readonly setUpstream?: boolean;
  readonly pushTags?: boolean;
}

/**
 * Validate push request
 */
export function validatePushRequest(
  request: unknown,
): { valid: true } | { valid: false; error: string } {
  if (typeof request !== "object" || request === null) {
    return { valid: false, error: "Request must be an object" };
  }

  const req = request as Record<string, unknown>;

  const promptId = req["promptId"];
  if (typeof promptId !== "string" || promptId.length === 0) {
    return { valid: false, error: "promptId must be a non-empty string" };
  }

  const variables = req["variables"];
  if (variables !== undefined) {
    if (typeof variables !== "object" || variables === null) {
      return { valid: false, error: "variables must be an object if provided" };
    }
  }

  const remote = req["remote"];
  if (remote !== undefined && typeof remote !== "string") {
    return { valid: false, error: "remote must be a string if provided" };
  }

  const branch = req["branch"];
  if (branch !== undefined && typeof branch !== "string") {
    return { valid: false, error: "branch must be a string if provided" };
  }

  const force = req["force"];
  if (force !== undefined && typeof force !== "boolean") {
    return { valid: false, error: "force must be a boolean if provided" };
  }

  const setUpstream = req["setUpstream"];
  if (setUpstream !== undefined && typeof setUpstream !== "boolean") {
    return { valid: false, error: "setUpstream must be a boolean if provided" };
  }

  const pushTags = req["pushTags"];
  if (pushTags !== undefined && typeof pushTags !== "boolean") {
    return { valid: false, error: "pushTags must be a boolean if provided" };
  }

  return { valid: true };
}

/**
 * Dependencies for push routes (for dependency injection in tests)
 */
export interface PushRoutesDependencies {
  readonly buildContext: (
    cwd: string,
    options?: PushOptions,
  ) => Promise<PushPromptContext>;
  readonly executePush: (cwd: string, options: PushOptions) => Promise<PushResult>;
  readonly previewPush: (
    context: PushPromptContext,
    promptId: string,
  ) => Promise<string>;
  readonly getPushStatus: (cwd: string) => Promise<PushStatus>;
  readonly getRemotes: (cwd: string) => Promise<Remote[]>;
}

/**
 * Default dependencies using real implementations
 */
const defaultDependencies: PushRoutesDependencies = {
  buildContext: defaultBuildContext,
  executePush: defaultExecutePush,
  previewPush: defaultPreviewPush,
  getPushStatus: defaultGetPushStatus,
  getRemotes: defaultGetRemotes,
};

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Response for push execution
 */
interface PushResponse {
  readonly result: PushResult;
}

/**
 * Response for push preview
 */
interface PushPreviewResponse {
  readonly preview: string;
  readonly context: PushPromptContext;
}

/**
 * Response for push status
 */
interface PushStatusResponse {
  readonly status: PushStatus;
}

/**
 * Response for remotes list
 */
interface RemotesResponse {
  readonly remotes: readonly Remote[];
}

/**
 * Create push routes
 *
 * Routes:
 * - POST /api/ctx/:contextId/push - Execute push with AI
 * - POST /api/ctx/:contextId/push/preview - Preview push (dry run)
 * - GET /api/ctx/:contextId/push/status - Get push status
 * - GET /api/ctx/:contextId/remotes - Get list of remotes
 *
 * @param contextManager - Context manager instance
 * @param deps - Optional dependencies for testing (defaults to real implementations)
 * @returns Hono app with push routes mounted
 */
export function createPushRoutes(
  contextManager: ContextManager,
  deps: PushRoutesDependencies = defaultDependencies,
): Hono {
  const app = new Hono();
  const { buildContext, executePush, previewPush, getPushStatus, getRemotes } =
    deps;

  /**
   * POST /api/ctx/:contextId/push
   *
   * Execute push with AI assistance.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Request body (PushRequest):
   * - promptId: Prompt template ID to use
   * - variables: Template variable substitutions (optional)
   * - remote: Remote name to push to (optional, defaults to origin)
   * - branch: Branch name to push (optional, defaults to current)
   * - force: Force push (optional, default false)
   * - setUpstream: Set upstream tracking (optional, default false)
   * - pushTags: Push tags (optional, default false)
   *
   * Returns:
   * - result: PushResult with success status and metadata
   *
   * Error cases:
   * - 400: Invalid request body, no commits to push
   * - 404: Context not found
   * - 500: Failed to execute push
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
    const validation = validatePushRequest(requestBody);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error,
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const request = requestBody as PushRequest;

    try {
      // Build push options from request
      const pushOptions: PushOptions = {
        remote: request.remote,
        branch: request.branch,
        force: request.force,
        setUpstream: request.setUpstream,
        pushTags: request.pushTags,
      };

      // Get push context to check if there are commits to push
      const pushContext = await buildContext(
        context.repositoryRoot,
        pushOptions,
      );

      if (pushContext.aheadCount === 0) {
        const errorResponse: ErrorResponse = {
          error: "No commits to push",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Execute push
      const result = await executePush(context.repositoryRoot, pushOptions);

      const response: PushResponse = {
        result,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to execute push";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /api/ctx/:contextId/push/preview
   *
   * Preview push without executing (dry run).
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Request body (PushRequest):
   * - promptId: Prompt template ID to use
   * - variables: Template variable substitutions (optional)
   * - remote: Remote name (optional)
   * - branch: Branch name (optional)
   *
   * Returns:
   * - preview: Preview text of the push prompt
   * - context: Push prompt context with commits and status
   *
   * Error cases:
   * - 400: Invalid request body
   * - 404: Context not found
   * - 500: Failed to generate preview
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

    // Validate request
    const validation = validatePushRequest(requestBody);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error,
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const request = requestBody as PushRequest;

    try {
      // Build push options from request
      const pushOptions: PushOptions = {
        remote: request.remote,
        branch: request.branch,
      };

      // Build push context
      const pushContext = await buildContext(
        context.repositoryRoot,
        pushOptions,
      );

      // Generate preview
      const preview = await previewPush(pushContext, request.promptId);

      const response: PushPreviewResponse = {
        preview,
        context: pushContext,
      };
      return c.json(response);
    } catch (e) {
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
   * GET /api/ctx/:contextId/push/status
   *
   * Get push status for the repository.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Returns:
   * - status: PushStatus with branch info, ahead/behind counts
   *
   * Error cases:
   * - 404: Context not found
   * - 500: Failed to get push status
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
      const status = await getPushStatus(context.repositoryRoot);

      const response: PushStatusResponse = {
        status,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get push status";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/ctx/:contextId/remotes
   *
   * Get list of remotes for the repository.
   *
   * Path parameters:
   * - contextId: Context ID for the repository
   *
   * Returns:
   * - remotes: Array of Remote with name, fetchUrl, pushUrl
   *
   * Error cases:
   * - 404: Context not found
   * - 500: Failed to get remotes
   */
  app.get("/:contextId/remotes", async (c) => {
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
      const remotes = await getRemotes(context.repositoryRoot);

      const response: RemotesResponse = {
        remotes,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get remotes";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
