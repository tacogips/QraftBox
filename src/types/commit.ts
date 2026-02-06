/**
 * Commit Types for the aynd commit log viewer
 *
 * This module defines types for browsing git commit history and viewing
 * commit diffs within the aynd application.
 */

/**
 * Author information for commits
 */
export interface CommitAuthor {
  readonly name: string;
  readonly email: string;
}

/**
 * Basic commit information
 */
export interface CommitInfo {
  readonly hash: string;
  readonly shortHash: string;
  readonly message: string;
  readonly body: string;
  readonly author: CommitAuthor;
  readonly committer: CommitAuthor;
  readonly date: number;
  readonly parentHashes: readonly string[];
}

/**
 * Commit change statistics
 */
export interface CommitStats {
  readonly filesChanged: number;
  readonly additions: number;
  readonly deletions: number;
}

/**
 * File change status codes
 * - 'A': Added
 * - 'M': Modified
 * - 'D': Deleted
 * - 'R': Renamed
 * - 'C': Copied
 */
export type FileChangeStatus = "A" | "M" | "D" | "R" | "C";

/**
 * File change information for a commit
 */
export interface CommitFileChange {
  readonly path: string;
  readonly status: FileChangeStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly oldPath?: string | undefined;
}

/**
 * Detailed commit information including stats and file changes
 */
export interface CommitDetail extends CommitInfo {
  readonly stats: CommitStats;
  readonly files: readonly CommitFileChange[];
}

/**
 * Pagination information for commit logs
 */
export interface CommitPagination {
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
  readonly hasMore: boolean;
}

/**
 * Query parameters for commit log requests
 */
export interface CommitLogQuery {
  readonly branch?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
  readonly search?: string | undefined;
}

/**
 * API response for commit log listing
 */
export interface CommitLogResponse {
  readonly commits: readonly CommitInfo[];
  readonly pagination: CommitPagination;
  readonly branch: string;
}

/**
 * Validation result type
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string | undefined;
}

/**
 * Validate commit log query parameters
 *
 * @param query - The commit log query to validate
 * @returns Validation result with error message if invalid
 */
export function validateCommitLogQuery(
  query: CommitLogQuery,
): ValidationResult {
  // Validate limit
  if (query.limit !== undefined) {
    if (query.limit < 1) {
      return {
        valid: false,
        error: "limit must be at least 1",
      };
    }
    if (query.limit > 1000) {
      return {
        valid: false,
        error: "limit must not exceed 1000",
      };
    }
  }

  // Validate offset
  if (query.offset !== undefined) {
    if (query.offset < 0) {
      return {
        valid: false,
        error: "offset must be non-negative",
      };
    }
  }

  // Validate search query
  if (query.search !== undefined) {
    if (query.search.length > 500) {
      return {
        valid: false,
        error: "search query exceeds maximum length of 500 characters",
      };
    }
  }

  // Validate branch
  if (query.branch !== undefined) {
    if (query.branch.trim().length === 0) {
      return {
        valid: false,
        error: "branch name cannot be empty",
      };
    }
  }

  return { valid: true };
}

/**
 * Validate commit hash format
 *
 * @param hash - The commit hash to validate
 * @returns Validation result with error message if invalid
 */
export function validateCommitHash(hash: string): ValidationResult {
  if (!hash || hash.trim().length === 0) {
    return {
      valid: false,
      error: "Commit hash cannot be empty",
    };
  }

  // Git commit hashes are 40 character hex strings (SHA-1)
  // or 7+ character short hashes
  const fullHashRegex = /^[0-9a-f]{40}$/i;
  const shortHashRegex = /^[0-9a-f]{7,40}$/i;

  if (!fullHashRegex.test(hash) && !shortHashRegex.test(hash)) {
    return {
      valid: false,
      error: "Invalid commit hash format",
    };
  }

  return { valid: true };
}

/**
 * Create an empty commit pagination object
 */
export function createEmptyPagination(): CommitPagination {
  return {
    offset: 0,
    limit: 50,
    total: 0,
    hasMore: false,
  };
}

/**
 * Create default commit log query
 */
export function createDefaultQuery(): CommitLogQuery {
  return {
    branch: undefined,
    limit: 50,
    offset: 0,
    search: undefined,
  };
}
