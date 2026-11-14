/**
 * GitHub Service Module
 *
 * This module provides a high-level service for interacting with the GitHub API
 * using Octokit. It wraps common operations like fetching repository information,
 * branches, labels, collaborators, and branch comparisons.
 */

import type { Octokit } from "@octokit/rest";
import { createOctokitClient, type OctokitClientOptions } from "./client.js";
import type { GitHubAuth } from "./auth.js";
import type {
  RepoInfo,
  Label,
  Collaborator,
  CollaboratorPermissions,
  BranchComparison,
} from "../../types/github.js";
import type { CommitInfo } from "../../types/commit.js";

/**
 * GitHub Service interface for API operations
 */
export interface GitHubService {
  /**
   * Get authenticated Octokit client instance
   * @returns Octokit instance if authenticated, null otherwise
   */
  getClient(): Promise<Octokit | null>;

  /**
   * Get repository information
   * @param owner Repository owner (user or organization)
   * @param repo Repository name
   * @returns Repository info if successful, null on error
   */
  getRepo(owner: string, repo: string): Promise<RepoInfo | null>;

  /**
   * Get default branch name for a repository
   * @param owner Repository owner
   * @param repo Repository name
   * @returns Default branch name if successful, null on error
   */
  getDefaultBranch(owner: string, repo: string): Promise<string | null>;

  /**
   * List all branch names in a repository
   * @param owner Repository owner
   * @param repo Repository name
   * @returns Array of branch names (empty array on error)
   */
  getBranches(owner: string, repo: string): Promise<string[]>;

  /**
   * List all labels in a repository
   * @param owner Repository owner
   * @param repo Repository name
   * @returns Array of labels (empty array on error)
   */
  getLabels(owner: string, repo: string): Promise<Label[]>;

  /**
   * List all collaborators in a repository
   * @param owner Repository owner
   * @param repo Repository name
   * @returns Array of collaborators (empty array on error)
   */
  getCollaborators(owner: string, repo: string): Promise<Collaborator[]>;

  /**
   * Compare two branches
   * @param owner Repository owner
   * @param repo Repository name
   * @param base Base branch name
   * @param head Head branch name
   * @returns Comparison result if successful, null on error
   */
  compareBranches(
    owner: string,
    repo: string,
    base: string,
    head: string,
  ): Promise<BranchComparison | null>;
}

/**
 * Options for creating GitHub service
 */
export interface GitHubServiceOptions {
  /**
   * Custom GitHub auth instance for testing
   */
  auth?: GitHubAuth;
}

/**
 * Create GitHub service instance
 *
 * This factory function creates a GitHub service that uses the provided
 * authentication to interact with the GitHub API via Octokit.
 *
 * @param options Service configuration options
 * @returns GitHubService instance
 *
 * @example
 * ```typescript
 * const service = createGitHubService();
 * const repo = await service.getRepo('owner', 'repo');
 * if (repo) {
 *   console.log(`Default branch: ${repo.defaultBranch}`);
 * }
 * ```
 */
export function createGitHubService(
  options: GitHubServiceOptions = {},
): GitHubService {
  // Cached client to avoid recreating on every operation
  let cachedClient: Octokit | null | undefined = undefined;

  /**
   * Get or create Octokit client
   */
  async function getOrCreateClient(): Promise<Octokit | null> {
    if (cachedClient !== undefined) {
      return cachedClient;
    }

    const clientOptions: OctokitClientOptions = options.auth
      ? { auth: options.auth }
      : {};

    cachedClient = await createOctokitClient(clientOptions);
    return cachedClient;
  }

  return {
    async getClient(): Promise<Octokit | null> {
      return getOrCreateClient();
    },

    async getRepo(owner: string, repo: string): Promise<RepoInfo | null> {
      try {
        const client = await getOrCreateClient();
        if (!client) {
          return null;
        }

        const response = await client.rest.repos.get({
          owner,
          repo,
        });

        return {
          owner: response.data.owner.login,
          name: response.data.name,
          fullName: response.data.full_name,
          defaultBranch: response.data.default_branch,
          isPrivate: response.data.private,
          htmlUrl: response.data.html_url,
        };
      } catch (error) {
        // API error (404, 403, network error, etc.)
        return null;
      }
    },

    async getDefaultBranch(
      owner: string,
      repo: string,
    ): Promise<string | null> {
      try {
        const client = await getOrCreateClient();
        if (!client) {
          return null;
        }

        const response = await client.rest.repos.get({
          owner,
          repo,
        });

        return response.data.default_branch;
      } catch (error) {
        // API error
        return null;
      }
    },

    async getBranches(owner: string, repo: string): Promise<string[]> {
      try {
        const client = await getOrCreateClient();
        if (!client) {
          return [];
        }

        // GitHub API paginates branch lists, fetch all pages
        const branches: string[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await client.rest.repos.listBranches({
            owner,
            repo,
            per_page: 100,
            page,
          });

          branches.push(...response.data.map((branch) => branch.name));

          // Check if there are more pages
          hasMore = response.data.length === 100;
          page++;
        }

        return branches;
      } catch (error) {
        // API error
        return [];
      }
    },

    async getLabels(owner: string, repo: string): Promise<Label[]> {
      try {
        const client = await getOrCreateClient();
        if (!client) {
          return [];
        }

        // GitHub API paginates labels, fetch all pages
        const labels: Label[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await client.rest.issues.listLabelsForRepo({
            owner,
            repo,
            per_page: 100,
            page,
          });

          labels.push(
            ...response.data.map((label) => ({
              name: label.name,
              color: label.color,
              description: label.description ?? null,
            })),
          );

          // Check if there are more pages
          hasMore = response.data.length === 100;
          page++;
        }

        return labels;
      } catch (error) {
        // API error
        return [];
      }
    },

    async getCollaborators(
      owner: string,
      repo: string,
    ): Promise<Collaborator[]> {
      try {
        const client = await getOrCreateClient();
        if (!client) {
          return [];
        }

        // GitHub API paginates collaborators, fetch all pages
        const collaborators: Collaborator[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await client.rest.repos.listCollaborators({
            owner,
            repo,
            per_page: 100,
            page,
          });

          collaborators.push(
            ...response.data.map((collab) => {
              const permissions: CollaboratorPermissions = {
                admin: collab.permissions?.admin ?? false,
                push: collab.permissions?.push ?? false,
                pull: collab.permissions?.pull ?? false,
              };

              return {
                login: collab.login,
                avatarUrl: collab.avatar_url,
                permissions,
              };
            }),
          );

          // Check if there are more pages
          hasMore = response.data.length === 100;
          page++;
        }

        return collaborators;
      } catch (error) {
        // API error
        return [];
      }
    },

    async compareBranches(
      owner: string,
      repo: string,
      base: string,
      head: string,
    ): Promise<BranchComparison | null> {
      try {
        const client = await getOrCreateClient();
        if (!client) {
          return null;
        }

        const response = await client.rest.repos.compareCommits({
          owner,
          repo,
          base,
          head,
        });

        // Map GitHub comparison to our BranchComparison type
        const aheadBy = response.data.ahead_by;
        const behindBy = response.data.behind_by;

        let status: "ahead" | "behind" | "diverged" | "identical";
        if (response.data.status === "identical") {
          status = "identical";
        } else if (response.data.status === "ahead") {
          status = "ahead";
        } else if (response.data.status === "behind") {
          status = "behind";
        } else {
          status = "diverged";
        }

        // Map commits to CommitInfo format
        const commits: CommitInfo[] = response.data.commits.map((commit) => ({
          hash: commit.sha,
          shortHash: commit.sha.substring(0, 7),
          message: commit.commit.message.split("\n")[0] ?? "",
          body: commit.commit.message.split("\n").slice(1).join("\n").trim(),
          author: {
            name: commit.commit.author?.name ?? "Unknown",
            email: commit.commit.author?.email ?? "",
          },
          committer: {
            name: commit.commit.committer?.name ?? "Unknown",
            email: commit.commit.committer?.email ?? "",
          },
          date: commit.commit.author?.date
            ? new Date(commit.commit.author.date).getTime()
            : 0,
          parentHashes: commit.parents.map((parent) => parent.sha),
        }));

        return {
          aheadBy,
          behindBy,
          status,
          commits,
        };
      } catch (error) {
        // API error
        return null;
      }
    },
  };
}
