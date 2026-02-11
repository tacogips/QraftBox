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
import { createLocalPromptRoutes } from "./local-prompts.js";
import type { QraftBoxToolRegistry } from "../tools/registry.js";
import type { PromptStore } from "../../types/local-prompt.js";
import { createGitActionsRoutes } from "./git-actions.js";
import { createBranchRoutes } from "./branches.js";
import { createSystemInfoRoutes } from "./system-info.js";
import type { ModelConfig } from "../../types/system-info.js";
import type { RecentDirectoryStore } from "../workspace/recent-store.js";

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
  readonly recentStore: RecentDirectoryStore;
  readonly sessionManager: SessionManager;
  readonly promptStore?: PromptStore | undefined;
  readonly toolRegistry?: QraftBoxToolRegistry | undefined;
  readonly configDir?: string | undefined;
  readonly modelConfig?: ModelConfig | undefined;
  readonly initialTabs?:
    | readonly import("../../types/workspace").WorkspaceTab[]
    | undefined;
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
      routes: createClaudeSessionsRoutes(
        config.sessionManager.getMappingStore(),
      ),
    },
    // Prompt routes - GET /api/ctx/:contextId/prompts
    // These routes don't need context
    {
      prefix: "/prompts",
      routes: createPromptsRoutes(),
    },
    // Branch routes - GET /api/ctx/:contextId/branches
    // Wrapped to extract context from middleware
    {
      prefix: "/branches",
      routes: createBranchRoutesWithMiddleware(),
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
      routes: createWorkspaceRoutes(
        config.contextManager,
        config.recentStore,
        config.initialTabs,
      ),
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
        promptStore: config.promptStore,
      }),
    },
    // Local prompt management routes - /api/prompts
    ...(config.promptStore !== undefined
      ? [
          {
            prefix: "/prompts",
            routes: createLocalPromptRoutes({
              promptStore: config.promptStore,
              sessionManager: config.sessionManager,
            }),
          },
        ]
      : []),
    // Tool management routes - GET /api/tools
    ...(config.toolRegistry !== undefined
      ? [
          {
            prefix: "/tools",
            routes: createToolRoutes(config.toolRegistry),
          },
        ]
      : []),
    // Git actions routes - POST /api/git-actions
    {
      prefix: "/git-actions",
      routes: createGitActionsRoutes(),
    },
    // System info routes - GET /api/system-info
    {
      prefix: "/system-info",
      routes: createSystemInfoRoutes(
        config.modelConfig ?? {
          promptModel: "claude-opus-4-6",
          assistantModel: "claude-opus-4-6",
        },
      ),
    },
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
 * - /api/ctx/:contextId/branches - Branch listing, search, checkout
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

  // Routes that require a git repository.
  // Non-git routes (claude-sessions, prompts) are excluded so they work for any directory.
  const GIT_REQUIRED_PREFIXES: ReadonlySet<string> = new Set([
    "/diff",
    "/files",
    "/status",
    "/commits",
    "/search",
    "/commit",
    "/push",
    "/worktree",
    "/github",
    "/pr",
    "/branches",
  ]);

  // Mount context-scoped routes under /:contextId/
  // Git-requiring routes get a guard middleware that returns 400 for non-git directories.
  const contextGroups = getContextScopedRouteGroups(config);
  for (const group of contextGroups) {
    if (GIT_REQUIRED_PREFIXES.has(group.prefix)) {
      const guarded = new Hono<{ Variables: ContextVariables }>();
      guarded.use("*", async (c, next): Promise<Response | void> => {
        const serverContext = c.get("serverContext");
        if (serverContext !== undefined && !serverContext.isGitRepo) {
          return c.json(NOT_GIT_REPO_RESPONSE, 400);
        }
        await next();
      });
      guarded.route("/", group.routes);
      contextApp.route(`/:contextId${group.prefix}`, guarded);
    } else {
      contextApp.route(`/:contextId${group.prefix}`, group.routes);
    }
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
 * Standard error response for non-git-repo requests to git-only routes.
 *
 * Returns 400 with a clear message, preventing 500 errors from failed git commands.
 */
const NOT_GIT_REPO_RESPONSE = {
  error:
    "Not a git repository. Git operations are not available for this directory.",
  code: 400,
} as const;

/**
 * Create a new Request with the URL path rewritten to be relative to the route mount point.
 *
 * Context-scoped routes are mounted at /api/ctx/<contextId>/<prefix>/...
 * The sub-app's route handlers expect paths relative to the mount point (e.g., "/" or "/autocomplete").
 * However, c.req.raw retains the full original URL, so we must strip the prefix.
 *
 * Path structure: ['', 'api', 'ctx', '<contextId>', ...prefixParts, ...remaining]
 * We strip the first 4 segments + prefix parts and keep only the remaining path.
 *
 * @param originalReq - Original Request with full URL
 * @param prefix - Route group prefix (e.g., "/files", "/status", "/commits")
 * @returns New Request with relative path
 */
function createRelativeRequest(originalReq: Request, prefix: string): Request {
  const url = new URL(originalReq.url);
  const prefixParts = prefix.split("/").filter(Boolean);
  const segments = url.pathname.split("/");
  // segments[0] = '', [1] = 'api', [2] = 'ctx', [3] = contextId, [4..] = prefix + remaining
  const sliceAt = 4 + prefixParts.length;
  const remaining = segments.slice(sliceAt);
  url.pathname = "/" + remaining.join("/");
  return new Request(url.toString(), {
    method: originalReq.method,
    headers: originalReq.headers,
    body: originalReq.body,
  });
}

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

    // Forward the request with URL rewritten to be relative to mount point
    return commitRoutes.fetch(
      createRelativeRequest(c.req.raw, "/commits"),
      c.env,
    );
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
    return searchRoutes.fetch(
      createRelativeRequest(c.req.raw, "/search"),
      c.env,
    );
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
    return statusRoutes.fetch(
      createRelativeRequest(c.req.raw, "/status"),
      c.env,
    );
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
    return fileRoutes.fetch(createRelativeRequest(c.req.raw, "/files"), c.env);
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

/**
 * Create branch routes that get ServerContext from middleware
 *
 * Creates a middleware-wrapped version of branch routes that extracts
 * ServerContext from c.get("serverContext") for each request.
 */
function createBranchRoutesWithMiddleware(): Hono<{
  Variables: ContextVariables;
}> {
  const app = new Hono<{ Variables: ContextVariables }>();

  app.use("*", async (c) => {
    const serverContext = c.get("serverContext");
    if (serverContext === undefined) {
      return c.json({ error: "Server context not available", code: 500 }, 500);
    }

    const branchRoutes = createBranchRoutes(serverContext);
    return branchRoutes.fetch(
      createRelativeRequest(c.req.raw, "/branches"),
      c.env,
    );
  });

  return app;
}
