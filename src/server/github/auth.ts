/**
 * GitHub Authentication Module
 *
 * This module provides GitHub authentication detection and token resolution.
 * It checks multiple sources in priority order:
 * 1. GITHUB_TOKEN environment variable
 * 2. GH_TOKEN environment variable
 * 3. gh CLI (`gh auth token` command)
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { GitHubUser } from "../../types/github.js";

const execAsync = promisify(exec);

/**
 * GitHub authentication interface
 */
export interface GitHubAuth {
  /**
   * Get authentication token from available sources
   * @returns Token string if found, null otherwise
   */
  getToken(): Promise<string | null>;

  /**
   * Check if currently authenticated
   * @returns true if a valid token is available
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Get the authentication method being used
   * @returns 'env' for environment variables, 'gh-cli' for gh CLI, 'none' if not authenticated
   */
  getAuthMethod(): Promise<"env" | "gh-cli" | "none">;

  /**
   * Get authenticated user information from GitHub API
   * Requires a valid token to be available
   * @returns User info if authenticated, null otherwise
   */
  getUser(): Promise<GitHubUser | null>;
}

/**
 * Options for creating GitHub auth instance
 */
export interface GitHubAuthOptions {
  /**
   * Custom exec async function for testing
   */
  execAsync?: typeof execAsync;
  /**
   * Custom fetch function for testing
   */
  fetch?: typeof globalThis.fetch;
}

/**
 * Cached token to avoid repeated gh CLI invocations
 */
let cachedToken: string | null | undefined = undefined;
let cachedMethod: "env" | "gh-cli" | "none" | undefined = undefined;

/**
 * Clear cached authentication data (useful for testing)
 */
export function clearAuthCache(): void {
  cachedToken = undefined;
  cachedMethod = undefined;
}


/**
 * Create GitHub authentication instance
 */
export function createGitHubAuth(
  options: GitHubAuthOptions = {},
): GitHubAuth {
  const exec = options.execAsync ?? execAsync;
  const fetchFn = options.fetch ?? globalThis.fetch;

  /**
   * Get token from gh CLI
   */
  async function getGhCliTokenWithExec(): Promise<string | null> {
    try {
      const { stdout } = await exec("gh auth token", {
        timeout: 5000,
        encoding: "utf8",
      });
      const token = stdout.trim();
      return token.length > 0 ? token : null;
    } catch (error) {
      // gh CLI not installed or not authenticated
      return null;
    }
  }

  /**
   * Resolve token from available sources
   */
  async function resolveTokenWithExec(): Promise<{
    token: string | null;
    method: "env" | "gh-cli" | "none";
  }> {
    // Return cached result if available
    if (cachedToken !== undefined && cachedMethod !== undefined) {
      return { token: cachedToken, method: cachedMethod };
    }

    // Priority 1: GITHUB_TOKEN
    const githubToken = process.env["GITHUB_TOKEN"];
    if (githubToken && githubToken.trim().length > 0) {
      cachedToken = githubToken.trim();
      cachedMethod = "env";
      return { token: cachedToken, method: cachedMethod };
    }

    // Priority 2: GH_TOKEN
    const ghToken = process.env["GH_TOKEN"];
    if (ghToken && ghToken.trim().length > 0) {
      cachedToken = ghToken.trim();
      cachedMethod = "env";
      return { token: cachedToken, method: cachedMethod };
    }

    // Priority 3: gh CLI
    const ghCliToken = await getGhCliTokenWithExec();
    if (ghCliToken) {
      cachedToken = ghCliToken;
      cachedMethod = "gh-cli";
      return { token: cachedToken, method: cachedMethod };
    }

    // No authentication available
    cachedToken = null;
    cachedMethod = "none";
    return { token: null, method: "none" };
  }

  /**
   * Fetch user info from GitHub API
   */
  async function fetchUserInfoWithFetch(
    token: string,
  ): Promise<GitHubUser | null> {
    try {
      const response = await fetchFn("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        login: string;
        name: string | null;
        email: string | null;
        avatar_url: string;
      };

      return {
        login: data.login,
        name: data.name ?? data.login,
        email: data.email ?? "",
        avatarUrl: data.avatar_url,
      };
    } catch (error) {
      // Network error or invalid response
      return null;
    }
  }

  return {
    async getToken(): Promise<string | null> {
      const { token } = await resolveTokenWithExec();
      return token;
    },

    async isAuthenticated(): Promise<boolean> {
      const { token } = await resolveTokenWithExec();
      return token !== null;
    },

    async getAuthMethod(): Promise<"env" | "gh-cli" | "none"> {
      const { method } = await resolveTokenWithExec();
      return method;
    },

    async getUser(): Promise<GitHubUser | null> {
      const { token } = await resolveTokenWithExec();
      if (!token) {
        return null;
      }
      return fetchUserInfoWithFetch(token);
    },
  };
}
