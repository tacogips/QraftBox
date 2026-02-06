/**
 * Octokit Client Factory
 *
 * This module provides factory functions for creating Octokit client instances
 * with authentication from the GitHub auth system.
 */

import { Octokit } from "@octokit/rest";
import { createGitHubAuth, type GitHubAuth } from "./auth.js";

/**
 * Options for creating Octokit client
 */
export interface OctokitClientOptions {
  /**
   * Custom GitHub auth instance for testing
   */
  auth?: GitHubAuth;
}

/**
 * Create an authenticated Octokit client
 *
 * This function attempts to create an Octokit client with authentication.
 * It uses the GitHubAuth system to retrieve a token from available sources
 * (GITHUB_TOKEN, GH_TOKEN, or gh CLI).
 *
 * @param options Optional configuration for testing
 * @returns Octokit instance if token available, null if no authentication
 *
 * @example
 * ```typescript
 * const client = await createOctokitClient();
 * if (client) {
 *   const { data } = await client.rest.users.getAuthenticated();
 *   console.log(`Authenticated as ${data.login}`);
 * } else {
 *   console.log('Not authenticated');
 * }
 * ```
 */
export async function createOctokitClient(
  options: OctokitClientOptions = {},
): Promise<Octokit | null> {
  const auth = options.auth ?? createGitHubAuth();
  const token = await auth.getToken();

  if (!token) {
    return null;
  }

  return new Octokit({
    auth: token,
  });
}

/**
 * Get an authenticated Octokit client or throw
 *
 * This is a convenience function that throws an error if authentication
 * is not available, making it easier to use in code paths that require
 * authentication.
 *
 * @param options Optional configuration for testing
 * @returns Octokit instance (never null)
 * @throws Error if no authentication available
 *
 * @example
 * ```typescript
 * try {
 *   const client = await getAuthenticatedClient();
 *   const { data } = await client.rest.users.getAuthenticated();
 * } catch (error) {
 *   console.error('GitHub authentication required');
 * }
 * ```
 */
export async function getAuthenticatedClient(
  options: OctokitClientOptions = {},
): Promise<Octokit> {
  const client = await createOctokitClient(options);

  if (!client) {
    throw new Error(
      "GitHub authentication required. Set GITHUB_TOKEN or authenticate with gh CLI.",
    );
  }

  return client;
}
