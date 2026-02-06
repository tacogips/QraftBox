/**
 * GitHub API Routes
 *
 * REST endpoints for GitHub integration including authentication status,
 * user information, and repository data.
 */

import { Hono } from "hono";
import type { GitHubAuth } from "../github/auth.js";
import type { GitHubService } from "../github/service.js";
import type { ContextManager } from "../workspace/context-manager.js";
import type { ContextId } from "../../types/workspace.js";
import type { GitHubUser, RepoInfo } from "../../types/github.js";
import { getRepoFromRemote, type RepoIdentifier } from "../github/url-parser.js";

/**
 * Dependencies for GitHub routes (for dependency injection in tests)
 */
export interface GitHubRoutesDependencies {
  readonly getRepoFromRemote: (
    cwd: string,
    remote?: string,
  ) => Promise<RepoIdentifier | null>;
}

/**
 * Default dependencies using real implementations
 */
const defaultDependencies: GitHubRoutesDependencies = {
  getRepoFromRemote,
};

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Response for GitHub authentication status endpoint
 */
interface AuthStatusResponse {
  readonly authenticated: boolean;
  readonly method: "env" | "gh-cli" | "none";
  readonly user: GitHubUser | null;
  readonly ghCliAvailable: boolean;
}

/**
 * Response for GitHub user endpoint
 */
interface UserResponse {
  readonly user: GitHubUser;
}

/**
 * Response for repository info endpoint
 */
interface RepoInfoResponse {
  readonly repo: RepoInfo;
}

/**
 * Create GitHub routes
 *
 * Routes:
 * - GET /api/github/auth - Get GitHub authentication status
 * - GET /api/github/user - Get authenticated user info
 * - GET /api/ctx/:id/github/repo - Get repository info for context
 *
 * @param contextManager - Context manager instance
 * @param auth - GitHub authentication instance
 * @param service - GitHub service instance
 * @param deps - Optional dependencies for testing (defaults to real implementations)
 * @returns Hono app with GitHub routes mounted
 */
export function createGitHubRoutes(
  contextManager: ContextManager,
  auth: GitHubAuth,
  service: GitHubService,
  deps: GitHubRoutesDependencies = defaultDependencies,
): Hono {
  const app = new Hono();
  const { getRepoFromRemote: getRepo } = deps;

  /**
   * GET /api/github/auth
   *
   * Get GitHub authentication status.
   *
   * Returns:
   * - authenticated: true if a valid token is available
   * - method: 'env' | 'gh-cli' | 'none' - authentication source
   * - user: GitHubUser object or null if not authenticated
   * - ghCliAvailable: true if gh CLI token method was attempted
   *
   * Error cases:
   * - 500: Failed to check authentication status
   */
  app.get("/auth", async (c) => {
    try {
      const authenticated = await auth.isAuthenticated();
      const method = await auth.getAuthMethod();
      const user = await auth.getUser();

      // ghCliAvailable is true if method is 'gh-cli' or if gh CLI was available
      // but GITHUB_TOKEN/GH_TOKEN took precedence
      const ghCliAvailable = method === "gh-cli";

      const response: AuthStatusResponse = {
        authenticated,
        method,
        user,
        ghCliAvailable,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to check authentication status";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/github/user
   *
   * Get authenticated user information.
   *
   * Returns:
   * - user: GitHubUser object with login, name, email, avatarUrl
   *
   * Error cases:
   * - 401: Not authenticated (no valid token available)
   * - 500: Failed to fetch user information
   */
  app.get("/user", async (c) => {
    try {
      const user = await auth.getUser();

      if (!user) {
        const errorResponse: ErrorResponse = {
          error: "Not authenticated. Please provide a GitHub token via GITHUB_TOKEN environment variable or gh auth login.",
          code: 401,
        };
        return c.json(errorResponse, 401);
      }

      const response: UserResponse = {
        user,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to fetch user information";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/ctx/:id/github/repo
   *
   * Get GitHub repository information for a context.
   *
   * Path parameters:
   * - id: Context ID for the repository
   *
   * Returns:
   * - repo: RepoInfo object with owner, name, defaultBranch, etc.
   *
   * Error cases:
   * - 404: Context not found or git remote not configured
   * - 500: Failed to fetch repository information
   */
  app.get("/ctx/:id/repo", async (c) => {
    const contextId = c.req.param("id") as ContextId;

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
      // Extract owner/repo from git remote
      const repoIdentifier = await getRepo(context.repositoryRoot);

      if (!repoIdentifier) {
        const errorResponse: ErrorResponse = {
          error: "Git remote not configured or not a GitHub repository",
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      // Fetch repository info from GitHub
      const repoInfo = await service.getRepo(
        repoIdentifier.owner,
        repoIdentifier.repo,
      );

      if (!repoInfo) {
        const errorResponse: ErrorResponse = {
          error: `Repository not found: ${repoIdentifier.owner}/${repoIdentifier.repo}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      const response: RepoInfoResponse = {
        repo: repoInfo,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error
          ? e.message
          : "Failed to fetch repository information";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
