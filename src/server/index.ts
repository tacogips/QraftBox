/**
 * HTTP Server
 *
 * Provides Hono HTTP server creation with route mounting, middleware,
 * and lifecycle management (start/stop).
 */

import { Hono } from "hono";
import type { CLIConfig } from "../types/index";
import type { ContextManager } from "./workspace/context-manager";
import type { ServerWebSocket } from "bun";
import type { WebSocketManager } from "./websocket/index";
import { createErrorHandler } from "./errors";
import { createStaticMiddleware, createSPAFallback } from "./static";
import { mountAllRoutes } from "./routes/index";
import { createSessionManager } from "./ai/session-manager";
import { createPromptStore } from "./prompts/prompt-store";
import { ensureSystemPromptFiles } from "./git-actions/system-prompt";
import { join } from "path";
import { createQraftBoxToolRegistry } from "./tools/registry";
import { DEFAULT_AI_CONFIG } from "../types/ai";
import { createLogger } from "./logger";
import type { RecentDirectoryStore } from "./workspace/recent-store";
import { createSessionMappingStore } from "./ai/session-mapping-store";

/**
 * Server options for creating the Hono instance
 */
export interface ServerOptions {
  readonly config: CLIConfig;
  readonly contextManager: ContextManager;
  readonly recentStore: RecentDirectoryStore;
  readonly initialTabs?:
    | readonly import("../types/workspace").WorkspaceTab[]
    | undefined;
  /** Optional broadcast callback for WebSocket-based AI queue updates */
  readonly broadcast?: ((event: string, data: unknown) => void) | undefined;
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
  const logger = createLogger("Server");
  const app = new Hono();

  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    try {
      await next();
      logger.debug("Request completed", {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      logger.error("Request failed", error, {
        method: c.req.method,
        path: c.req.path,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  });

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

  // Mount all API routes (workspace, browse, context-scoped routes)
  const toolRegistry = createQraftBoxToolRegistry({
    projectPath: options.config.projectPath,
  });

  // Initialize tool registry (fire and forget)
  void toolRegistry.initialize().catch((e) => {
    logger.error("Failed to initialize tool registry", e);
  });

  const mappingStore = createSessionMappingStore();

  const sessionManager = createSessionManager(
    {
      ...DEFAULT_AI_CONFIG,
      enabled: options.config.ai,
      assistantModel: options.config.assistantModel,
      assistantAdditionalArgs: [...options.config.assistantAdditionalArgs],
    },
    toolRegistry,
    options.broadcast,
    mappingStore,
  );
  const promptStore = createPromptStore();

  // Recover prompts interrupted by previous server shutdown
  void promptStore
    .recoverInterrupted()
    .then((count) => {
      if (count > 0) {
        logger.info(
          `Recovered ${count} interrupted prompt(s) to pending state`,
        );
      }
    })
    .catch((e: unknown) => {
      logger.error("Failed to recover interrupted prompts", e);
    });

  // Initialize system prompt files (fire and forget)
  void ensureSystemPromptFiles().catch((e) => {
    logger.error("Failed to initialize system prompt files", e);
  });

  mountAllRoutes(app, {
    contextManager: options.contextManager,
    recentStore: options.recentStore,
    sessionManager,
    promptStore,
    toolRegistry,
    modelConfig: {
      promptModel: options.config.promptModel,
      assistantModel: options.config.assistantModel,
    },
    initialTabs: options.initialTabs,
  });

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
 * host and port specified in config. Optionally configures WebSocket support
 * for real-time file change notifications.
 *
 * When wsManager is provided, the server handles WebSocket upgrade requests
 * at the `/ws` endpoint and routes WebSocket events to the manager.
 *
 * @param app - Hono app instance
 * @param config - CLI configuration
 * @param wsManager - Optional WebSocket manager for real-time updates
 * @returns Server instance with port, hostname, and stop function
 */
export function startServer(
  app: Hono,
  config: CLIConfig,
  wsManager?: WebSocketManager | undefined,
): Server {
  const logger = createLogger("Server");
  if (wsManager !== undefined) {
    // Capture wsManager in a const for use inside handlers
    const manager = wsManager;

    const server = Bun.serve({
      fetch(
        req: Request,
        server: import("bun").Server,
      ): Response | Promise<Response> | undefined {
        const url = new URL(req.url);
        if (url.pathname === "/ws") {
          if (server.upgrade(req)) {
            logger.debug("WebSocket upgrade accepted");
            return undefined;
          }
          logger.error("WebSocket upgrade failed");
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return app.fetch(req, server);
      },
      websocket: {
        open(ws: ServerWebSocket<unknown>): void {
          manager.handleOpen(ws);
        },
        close(ws: ServerWebSocket<unknown>): void {
          manager.handleClose(ws);
        },
        message(ws: ServerWebSocket<unknown>, message: string | Buffer): void {
          manager.handleMessage(ws, message);
        },
      },
      port: config.port,
      hostname: config.host,
      idleTimeout: 120,
    });

    return {
      port: server.port,
      hostname: server.hostname,
      stop(): void {
        logger.debug("Stopping server with WebSocket support");
        server.stop();
      },
    };
  }

  // HTTP-only server (no WebSocket)
  const server = Bun.serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
    idleTimeout: 120,
  });

  return {
    port: server.port,
    hostname: server.hostname,
    stop(): void {
      logger.debug("Stopping HTTP-only server");
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
