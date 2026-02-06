/**
 * HTTP Server
 *
 * Provides Hono HTTP server creation with route mounting, middleware,
 * and lifecycle management (start/stop).
 */

import { Hono } from "hono";
import type { CLIConfig } from "../types/index";
import type { ContextManager } from "./workspace/context-manager";
import { createErrorHandler } from "./errors";
import { createStaticMiddleware, createSPAFallback } from "./static";
import { join } from "path";

/**
 * Server options for creating the Hono instance
 */
export interface ServerOptions {
  readonly config: CLIConfig;
  readonly contextManager: ContextManager;
}

/**
 * Server instance returned by startServer
 */
export interface Server {
  readonly port: number;
  readonly hostname: string;
  stop(): void;
}

/**
 * Health check response
 */
interface HealthCheckResponse {
  readonly status: "ok";
  readonly timestamp: number;
}

/**
 * Create Hono HTTP server
 *
 * Creates a new Hono instance with error handling, static file serving,
 * and route mounting. Routes are organized under context-scoped paths
 * for multi-workspace support.
 *
 * Route structure:
 * - /api/health - Health check endpoint
 * - /api/workspace - Workspace management (non-context routes)
 * - /api/browse - Directory browsing (non-context routes)
 * - /api/ctx/:contextId/commits - Commit history (context-scoped)
 * - /api/ctx/:contextId/search - Search (context-scoped)
 * - /api/ctx/:contextId/commit - Commit operations (context-scoped)
 * - /api/ctx/:contextId/push - Push operations (context-scoped)
 * - /api/ctx/:contextId/prompts - Prompt management (context-scoped)
 * - /api/ctx/:contextId/worktree - Worktree management (context-scoped)
 * - /api/ctx/:contextId/github - GitHub integration (context-scoped)
 * - /api/ctx/:contextId/pr - Pull request management (context-scoped)
 * - /api/ctx/:contextId/claude-sessions - Claude session management (context-scoped)
 * - /* - Static files and SPA fallback
 *
 * @param options - Server options with config and context manager
 * @returns Hono app instance
 */
export function createServer(options: ServerOptions): Hono {
  const app = new Hono();

  // Mount error handler
  app.onError(createErrorHandler());

  // Health check endpoint
  app.get("/api/health", (c) => {
    const response: HealthCheckResponse = {
      status: "ok",
      timestamp: Date.now(),
    };
    return c.json(response);
  });

  // TODO: Mount workspace routes at /api/workspace
  // import { createWorkspaceRoutes } from "./routes/workspace";
  // app.route("/api/workspace", createWorkspaceRoutes(options.contextManager));

  // TODO: Mount browse routes at /api/browse
  // import { createBrowseRoutes } from "./routes/browse";
  // app.route("/api/browse", createBrowseRoutes());

  // TODO: Mount context-scoped routes under /api/ctx/:contextId
  // Context-scoped routes pattern:
  // const contextApp = new Hono();
  // contextApp.use("/:contextId/*", contextMiddleware(options.contextManager));
  // contextApp.route("/:contextId/commits", commitRoutes);
  // contextApp.route("/:contextId/search", searchRoutes);
  // ... other context-scoped routes
  // app.route("/api/ctx", contextApp);

  // Static file serving and SPA fallback
  // Assumes client build is at ./dist/client relative to project root
  const clientDir = join(options.config.projectPath, "dist", "client");
  const indexPath = join(clientDir, "index.html");

  app.use("*", createStaticMiddleware(clientDir));
  app.use("*", createSPAFallback(indexPath));

  return app;
}

/**
 * Start HTTP server
 *
 * Starts the Bun HTTP server with the provided Hono app, binding to the
 * host and port specified in config.
 *
 * @param app - Hono app instance
 * @param config - CLI configuration
 * @returns Server instance with port, hostname, and stop function
 */
export function startServer(app: Hono, config: CLIConfig): Server {
  const server = Bun.serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  });

  return {
    port: server.port,
    hostname: server.hostname,
    stop(): void {
      server.stop();
    },
  };
}

/**
 * Stop HTTP server
 *
 * Gracefully stops the HTTP server.
 *
 * @param server - Server instance returned by startServer
 */
export function stopServer(server: Server): void {
  server.stop();
}
