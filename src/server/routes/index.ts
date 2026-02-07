/**
 * Route Registry
 *
 * Central registry for all API routes, handling mounting of both context-scoped
 * and non-context routes onto the main Hono app.
 */

import { Hono } from "hono";
import type {
  ContextManager,
  ServerContext,
} from "../workspace/context-manager.js";
import type { SessionManager } from "../ai/session-manager.js";
import { contextMiddleware } from "../middleware/context.js";
import { createCommitRoutes as createCommitHistoryRoutes } from "./commits.js";
import { createSearchRoutes as createSearchRoutesImpl } from "./search.js";
import { createWorkspaceRoutes } from "./workspace.js";
import { createBrowseRoutes } from "./browse.js";
import { createAIRoutes } from "./ai.js";
import { createPushRoutes as createPushRoutesImpl } from "./push.js";
import { createCommitRoutes as createCommitOpRoutes } from "./commit.js";
import { createWorktreeRoutes as createWorktreeRoutesImpl } from "./worktree.js";
import { createClaudeSessionsRoutes } from "./claude-sessions.js";
import { createPromptRoutes } from "./prompts.js";
import { createDiffRoutes } from "./diff.js";
import { createFileRoutes as createFileRoutesImpl } from "./files.js";
import { createStatusRoutes as createStatusRoutesImpl } from "./status.js";
import { createToolRoutes } from "./tools.js";
import type { AyndToolRegistry } from "../tools/registry.js";

/**
 * Route group definition
 *
 * A route group consists of a URL prefix and a Hono app instance
 * containing the routes for that group.
 */
export interface RouteGroup {
  readonly prefix: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly routes: Hono<any>;
}

/**
 * Configuration for mounting all routes
 */
export interface MountRoutesConfig {
  readonly contextManager: ContextManager;
  readonly sessionManager: SessionManager;
  readonly toolRegistry?: AyndToolRegistry | undefined;
  readonly configDir?: string | undefined;
}

/**
 * Get all context-scoped route groups
 *
 * Context-scoped routes require a ServerContext from middleware and are
 * mounted under /api/ctx/:contextId/.
 *
 * These routes expect c.get("serverContext") to be available via the
 * contextMiddleware.
 *
 * @param config - Mount routes configuration
 * @returns Array of context-scoped route groups
 */
export function getContextScopedRouteGroups(
  config: MountRoutesConfig,
): readonly RouteGroup[] {
  return [
    // Diff routes - GET /api/ctx/:contextId/diff
    // These routes already support middleware context extraction
    {
      prefix: "/diff",
      routes: createDiffRoutes(),
    },
    // File routes - GET /api/ctx/:contextId/files
    // Wrapped to extract context from middleware
    {
      prefix: "/files",
      routes: createFileRoutesWithMiddleware(),
    },
    // Status routes - GET /api/ctx/:contextId/status
    // Wrapped to extract context from middleware
    {
      prefix: "/status",
      routes: createStatusRoutesWithMiddleware(),
    },
    // Commit history routes - GET /api/ctx/:contextId/commits
    // Note: This is the commit LOG/history routes, not commit operations
    // Wrapped to extract context from middleware
    {
      prefix: "/commits",
      routes: createCommitsRoutes(),
    },
    // Search routes - GET /api/ctx/:contextId/search
    // Wrapped to extract context from middleware
    {
      prefix: "/search",
      routes: createSearchRoutesWithMiddleware(),
    },
    // Commit operation routes - POST /api/ctx/:contextId/commit
    // Takes contextManager
    {
      prefix: "/commit",
      routes: createCommitOpRoutes(config.contextManager),
    },
    // Push operation routes - POST /api/ctx/:contextId/push
    // Takes contextManager
    {
      prefix: "/push",
      routes: createPushRoutesImpl(config.contextManager),
    },
    // Worktree routes - GET /api/ctx/:contextId/worktree
    // Takes contextManager
    {
      prefix: "/worktree",
      routes: createWorktreeRoutesImpl(config.contextManager),
    },
    // GitHub integration routes - GET /api/ctx/:contextId/github
    // TODO: Properly instantiate GitHubAuth and GitHubService
    // For now, create stub routes
    {
      prefix: "/github",
      routes: new Hono(), // Stub - needs proper GitHub auth setup
    },
    // Pull request routes - GET /api/ctx/:contextId/pr
    // TODO: Properly instantiate PRExecutor and PRService
    // For now, create stub routes
    {
      prefix: "/pr",
      routes: new Hono(), // Stub - needs proper PR service setup
    },
    // Claude session routes - GET /api/ctx/:contextId/claude-sessions
    // These routes don't need context
    {
      prefix: "/claude-sessions",
      routes: createClaudeSessionsRoutes(),
    },
    // Prompt routes - GET /api/ctx/:contextId/prompts
    // These routes don't need context
    {
      prefix: "/prompts",
      routes: createPromptsRoutes(),
    },
  ];
}

/**
 * Get all non-context route groups
 *
 * Non-context routes do not require a workspace context and are mounted
 * directly under /api/.
 *
 * @param config - Mount routes configuration
 * @returns Array of non-context route groups
 */
export function getNonContextRouteGroups(
  config: MountRoutesConfig,
): readonly RouteGroup[] {
  return [
    // Workspace management routes - GET /api/workspace
    {
      prefix: "/workspace",
      routes: createWorkspaceRoutes(config.contextManager),
    },
    // Directory browsing routes - GET /api/browse
    {
      prefix: "/browse",
      routes: createBrowseRoutes(),
    },
    // AI routes - POST /api/ai/prompt
    {
      prefix: "/ai",
      routes: createAIRoutes({
        projectPath: "", // Will be set by request
        sessionManager: config.sessionManager,
      }),
    },
    // Tool management routes - GET /api/tools
    ...(config.toolRegistry !== undefined
      ? [
          {
            prefix: "/tools",
            routes: createToolRoutes(config.toolRegistry),
          },
        ]
      : []),
  ];
}

/**
 * Mount all routes onto the Hono app
 *
 * This function:
 * 1. Mounts non-context routes directly under /api/
 * 2. Creates a context-scoped sub-app under /api/ctx
 * 3. Applies context middleware to context-scoped routes
 * 4. Mounts all context-scoped routes under /api/ctx/:contextId/
 *
 * Route structure:
 * - /api/workspace - Workspace management
 * - /api/browse - Directory browsing
 * - /api/ai - AI operations
 * - /api/ctx/:contextId/diff - Diff viewing
 * - /api/ctx/:contextId/files - File tree and content
 * - /api/ctx/:contextId/status - Working tree status
 * - /api/ctx/:contextId/commits - Commit history
 * - /api/ctx/:contextId/search - Search
 * - /api/ctx/:contextId/commit - Commit operations
 * - /api/ctx/:contextId/push - Push operations
 * - /api/ctx/:contextId/worktree - Worktree management
 * - /api/ctx/:contextId/github - GitHub integration
 * - /api/ctx/:contextId/pr - Pull request management
 * - /api/ctx/:contextId/claude-sessions - Claude session management
 * - /api/ctx/:contextId/prompts - Prompt management
 *
 * @param app - Main Hono app instance
 * @param config - Mount routes configuration
 */
export function mountAllRoutes(app: Hono, config: MountRoutesConfig): void {
  // Mount non-context routes directly under /api
  const nonContextGroups = getNonContextRouteGroups(config);
  for (const group of nonContextGroups) {
    app.route(`/api${group.prefix}`, group.routes);
  }

  // Create context-scoped sub-app
  const contextApp = new Hono();

  // Apply context middleware to all context-scoped routes
  // This extracts contextId from the route and attaches ServerContext to c.set("serverContext")
  contextApp.use("/:contextId/*", contextMiddleware(config.contextManager));

  // Mount context-scoped routes under /:contextId/
  const contextGroups = getContextScopedRouteGroups(config);
  for (const group of contextGroups) {
    contextApp.route(`/:contextId${group.prefix}`, group.routes);
  }

  // Mount the entire context sub-app under /api/ctx
  app.route("/api/ctx", contextApp);
}

/**
 * Helper functions for route creation that need ServerContext from middleware
 *
 * These wrappers create route handlers that extract ServerContext from
 * Hono context variables set by the contextMiddleware. They use a middleware
 * pattern to inject ServerContext at request time rather than route creation time.
 */

/**
 * Hono context variables type for middleware
 */
type ContextVariables = {
  serverContext: ServerContext;
};

/**
 * Create commits routes that get ServerContext from middleware
 *
 * Creates a middleware-wrapped version of commit routes that extracts
 * ServerContext from c.get("serverContext") for each request.
 */
function createCommitsRoutes(): Hono<{ Variables: ContextVariables }> {
  const app = new Hono<{ Variables: ContextVariables }>();

  // Apply middleware that adds context-aware routing
  app.use("*", async (c) => {
    const serverContext = c.get("serverContext");
    if (serverContext === undefined) {
      return c.json({ error: "Server context not available", code: 500 }, 500);
    }

    // Create routes with the context for this specific request
    const commitRoutes = createCommitHistoryRoutes(serverContext);

    // Forward the request to the dynamically created routes
    return commitRoutes.fetch(c.req.raw, c.env);
  });

  return app;
}

/**
 * Create search routes that get ServerContext from middleware
 *
 * Creates a middleware-wrapped version of search routes that extracts
 * ServerContext from c.get("serverContext") for each request.
 */
function createSearchRoutesWithMiddleware(): Hono<{
  Variables: ContextVariables;
}> {
  const app = new Hono<{ Variables: ContextVariables }>();

  app.use("*", async (c) => {
    const serverContext = c.get("serverContext");
    if (serverContext === undefined) {
      return c.json({ error: "Server context not available", code: 500 }, 500);
    }

    // Search routes need diffTarget, which we'll default to working tree
    // SearchRoutes have a different ServerContext interface that includes diffTarget
    const searchContext = {
      projectPath: serverContext.projectPath,
      diffTarget: { type: "working-tree" as const },
    };

    const searchRoutes = createSearchRoutesImpl(searchContext as any);
    return searchRoutes.fetch(c.req.raw, c.env);
  });

  return app;
}

/**
 * Create status routes that get ServerContext from middleware
 *
 * Creates a middleware-wrapped version of status routes that extracts
 * ServerContext from c.get("serverContext") for each request.
 */
function createStatusRoutesWithMiddleware(): Hono<{
  Variables: ContextVariables;
}> {
  const app = new Hono<{ Variables: ContextVariables }>();

  app.use("*", async (c) => {
    const serverContext = c.get("serverContext");
    if (serverContext === undefined) {
      return c.json({ error: "Server context not available", code: 500 }, 500);
    }

    const statusRoutes = createStatusRoutesImpl(serverContext);
    return statusRoutes.fetch(c.req.raw, c.env);
  });

  return app;
}

/**
 * Create file routes that get ServerContext from middleware
 *
 * Creates a middleware-wrapped version of file routes that extracts
 * ServerContext from c.get("serverContext") for each request.
 */
function createFileRoutesWithMiddleware(): Hono<{
  Variables: ContextVariables;
}> {
  const app = new Hono<{ Variables: ContextVariables }>();

  app.use("*", async (c) => {
    const serverContext = c.get("serverContext");
    if (serverContext === undefined) {
      return c.json({ error: "Server context not available", code: 500 }, 500);
    }

    const fileRoutes = createFileRoutesImpl(serverContext);
    return fileRoutes.fetch(c.req.raw, c.env);
  });

  return app;
}

/**
 * Create prompts routes
 *
 * Prompts routes don't need ServerContext, so we just create them directly.
 */
function createPromptsRoutes(): Hono {
  // Prompts routes optionally take configDir
  return createPromptRoutes(undefined);
}
