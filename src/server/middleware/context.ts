/**
 * Context Middleware for Multi-Directory Workspace
 *
 * Extracts context ID from route parameters, validates it, looks up the context
 * from ContextManager, and attaches ServerContext to Hono context for downstream routes.
 */

import type { MiddlewareHandler } from "hono";
import type {
  ContextManager,
  ServerContext,
} from "../workspace/context-manager";
import type { ContextId } from "../../types/workspace";
import { validateContextId } from "../../types/workspace";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Context middleware configuration
 */
export interface ContextMiddlewareConfig {
  readonly contextManager: ContextManager;
}

/**
 * Hono context variables type extension
 */
type ContextVariables = {
  serverContext: ServerContext;
};

/**
 * Create context middleware
 *
 * This middleware extracts the context ID from the route parameter `:contextId`,
 * validates it, looks up the corresponding workspace context, and attaches the
 * ServerContext to the Hono context for use by downstream route handlers.
 *
 * Usage:
 * ```typescript
 * const contextApp = new Hono();
 * contextApp.use("/:contextId/*", contextMiddleware(contextManager));
 * contextApp.route("/:contextId/commits", commitRoutes);
 * contextApp.route("/:contextId/search", searchRoutes);
 * ```
 *
 * Downstream routes can access the context:
 * ```typescript
 * const serverContext = c.get("serverContext") as ServerContext;
 * ```
 *
 * @param contextManager - Context manager instance
 * @returns Hono middleware handler
 */
export function contextMiddleware(
  contextManager: ContextManager,
): MiddlewareHandler<{ Variables: ContextVariables }> {
  return async (c, next): Promise<Response | void> => {
    // Extract context ID from route parameter
    const contextId = c.req.param("contextId");

    // Validate context ID exists
    if (contextId === undefined || contextId.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Missing context ID in route",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Validate context ID format
    const validation = validateContextId(contextId);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid context ID format",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Look up context from context manager
    const workspaceTab = contextManager.getContext(contextId as ContextId);
    if (workspaceTab === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Context not found: ${contextId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Get server context for this workspace tab
    let serverContext: ServerContext;
    try {
      serverContext = contextManager.getServerContext(contextId as ContextId);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get server context";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Attach server context to Hono context for downstream routes
    c.set("serverContext", serverContext);

    // Continue to next handler
    await next();
  };
}
