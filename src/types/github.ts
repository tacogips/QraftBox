/**
 * GitHub API Types
 *
 * This module defines types for GitHub API integration, including authentication,
 * repository information, and pull request data.
 */

/**
 * GitHub user information
 */
export interface GitHubUser {
  readonly login: string;
  readonly name: string;
  readonly email: string;
  readonly avatarUrl: string;
}

/**
 * GitHub authentication status
 */
export interface GitHubAuthStatus {
  readonly authenticated: boolean;
  readonly method: "env" | "gh-cli" | "none";
  readonly user: GitHubUser | null;
  readonly ghCliAvailable: boolean;
}

/**
 * GitHub repository information
 */
export interface RepoInfo {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly isPrivate: boolean;
  readonly htmlUrl: string;
}

/**
 * GitHub issue/PR label
 */
export interface Label {
  readonly name: string;
  readonly color: string;
  readonly description: string | null;
}

/**
 * Collaborator permissions
 */
export interface CollaboratorPermissions {
  readonly admin: boolean;
  readonly push: boolean;
  readonly pull: boolean;
}

/**
 * Repository collaborator information
 */
export interface Collaborator {
  readonly login: string;
  readonly avatarUrl: string;
  readonly permissions: CollaboratorPermissions;
}

/**
 * Branch comparison result
 */
export interface BranchComparison {
  readonly aheadBy: number;
  readonly behindBy: number;
  readonly status: "ahead" | "behind" | "diverged" | "identical";
  readonly commits: readonly import("./commit.js").CommitInfo[];
}
