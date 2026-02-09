/**
 * Branch Types for git branch operations
 *
 * This module defines types for branch listing, searching, and checkout
 * operations with uncommitted changes handling.
 */

/**
 * Information about a single git branch
 *
 * Contains metadata including current status, default branch status,
 * remote tracking, and last commit information.
 */
export interface BranchInfo {
  readonly name: string;
  readonly isCurrent: boolean;
  readonly isDefault: boolean;
  readonly isRemote: boolean;
  readonly lastCommit: {
    readonly hash: string;
    readonly message: string;
    readonly author: string;
    readonly date: number;
  };
  readonly aheadBehind?:
    | {
        readonly ahead: number;
        readonly behind: number;
      }
    | undefined;
}

/**
 * Response for listing all branches
 *
 * Contains all branches with current and default branch information.
 */
export interface BranchListResponse {
  readonly branches: readonly BranchInfo[];
  readonly current: string;
  readonly defaultBranch: string;
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}

/**
 * Request for searching branches by name
 *
 * Supports limiting results and including/excluding remote branches.
 */
export interface BranchSearchRequest {
  readonly query: string;
  readonly limit?: number | undefined;
  readonly includeRemote?: boolean | undefined;
}

/**
 * Request for checking out a branch
 *
 * Supports force checkout and automatic stashing of uncommitted changes.
 */
export interface BranchCheckoutRequest {
  readonly branch: string;
  readonly force?: boolean | undefined;
  readonly stash?: boolean | undefined;
}

/**
 * Response from branch checkout operation
 *
 * Contains success status, branch information, and optional error details.
 */
export interface BranchCheckoutResponse {
  readonly success: boolean;
  readonly previousBranch: string;
  readonly currentBranch: string;
  readonly stashCreated?: string | undefined;
  readonly error?: string | undefined;
}

/**
 * Create a BranchInfo with minimal required fields and optional overrides
 *
 * @param name - Branch name
 * @param overrides - Optional partial BranchInfo to override defaults
 * @returns BranchInfo with defaults applied
 */
export function createBranchInfo(
  name: string,
  overrides?: Partial<BranchInfo>,
): BranchInfo {
  return {
    name,
    isCurrent: false,
    isDefault: false,
    isRemote: false,
    lastCommit: {
      hash: "",
      message: "",
      author: "",
      date: 0,
    },
    aheadBehind: undefined,
    ...overrides,
  };
}

/**
 * Create a successful checkout response
 *
 * @param previousBranch - Branch before checkout
 * @param currentBranch - Branch after checkout
 * @param stashCreated - Optional stash reference if changes were stashed
 * @returns Successful BranchCheckoutResponse
 */
export function createCheckoutSuccess(
  previousBranch: string,
  currentBranch: string,
  stashCreated?: string | undefined,
): BranchCheckoutResponse {
  return {
    success: true,
    previousBranch,
    currentBranch,
    stashCreated,
    error: undefined,
  };
}

/**
 * Create a failed checkout response
 *
 * @param previousBranch - Branch before failed checkout attempt
 * @param error - Error message describing the failure
 * @returns Failed BranchCheckoutResponse
 */
export function createCheckoutFailure(
  previousBranch: string,
  error: string,
): BranchCheckoutResponse {
  return {
    success: false,
    previousBranch,
    currentBranch: previousBranch,
    stashCreated: undefined,
    error,
  };
}

/**
 * Check if a branch name is valid according to git naming rules
 *
 * Invalid characters include: space, .., ~, ^, :, ?, *, [, \, @{
 * Branch names cannot start or end with a slash, or contain consecutive slashes.
 *
 * @param name - Branch name to validate
 * @returns True if name is valid, false otherwise
 */
export function isValidBranchName(name: string): boolean {
  if (!name || name.trim().length === 0) {
    return false;
  }

  // Check for invalid characters
  const invalidChars = /[ ~^:?*[\]\\@{]/;
  if (invalidChars.test(name)) {
    return false;
  }

  // Check for double dots
  if (name.includes("..")) {
    return false;
  }

  // Cannot start or end with slash
  if (name.startsWith("/") || name.endsWith("/")) {
    return false;
  }

  // Cannot contain consecutive slashes
  if (name.includes("//")) {
    return false;
  }

  // Cannot end with .lock
  if (name.endsWith(".lock")) {
    return false;
  }

  return true;
}
