/**
 * Git Branch Operations Module
 *
 * Provides git branch operations including listing, searching, and checkout
 * with uncommitted changes handling (stash/force).
 */

import type {
  BranchInfo,
  BranchCheckoutRequest,
  BranchCheckoutResponse,
} from "../../types/branch.js";
import {
  createCheckoutSuccess,
  createCheckoutFailure,
} from "../../types/branch.js";
import { execGit } from "./executor.js";

/**
 * List all git branches with metadata
 *
 * Uses `git for-each-ref` to get branch information including last commit details.
 * Supports both local and remote branches.
 *
 * @param projectPath - Path to git repository
 * @param includeRemote - Whether to include remote branches (default: false)
 * @returns Promise resolving to array of BranchInfo objects
 *
 * @example
 * ```typescript
 * // List local branches only
 * const branches = await listBranches('/path/to/repo');
 *
 * // List both local and remote branches
 * const allBranches = await listBranches('/path/to/repo', true);
 * ```
 */
/**
 * Options for listing branches
 */
export interface ListBranchesOptions {
  readonly includeRemote?: boolean | undefined;
  readonly offset?: number | undefined;
  readonly limit?: number | undefined;
}

/**
 * Result of listing branches with pagination metadata
 */
export interface ListBranchesResult {
  readonly branches: readonly BranchInfo[];
  readonly total: number;
  readonly currentBranch: string;
  readonly defaultBranch: string;
}

export async function listBranches(
  projectPath: string,
  includeRemote?: boolean | undefined,
  options?: { offset?: number; limit?: number } | undefined,
): Promise<ListBranchesResult> {
  // Get current branch
  const currentBranch = await getCurrentBranch(projectPath);

  // Get default branch
  const defaultBranch = await getDefaultBranch(projectPath);

  // Format: refname, objectname (short), committerdate (unix), subject, authorname
  // Sort by committerdate descending (most recent first)
  const format =
    "%(refname:short)%09%(objectname:short)%09%(committerdate:iso8601)%09%(subject)%09%(authorname)";

  // Build refs pattern
  const refs = includeRemote ? ["refs/heads", "refs/remotes"] : ["refs/heads"];

  const result = await execGit(
    ["for-each-ref", "--sort=-committerdate", `--format=${format}`, ...refs],
    { cwd: projectPath },
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to list branches: ${result.stderr}`);
  }

  const allBranches: BranchInfo[] = [];
  let defaultBranchInfo: BranchInfo | undefined = undefined;
  const lines = result.stdout.split("\n");

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    const parts = line.split("\t");
    if (parts.length < 5) {
      continue;
    }

    const name = parts[0];
    const hash = parts[1];
    const dateStr = parts[2];
    const message = parts[3];
    const author = parts[4];

    if (
      name === undefined ||
      hash === undefined ||
      dateStr === undefined ||
      message === undefined ||
      author === undefined
    ) {
      continue;
    }

    const isCurrent = name === currentBranch;
    const isDefault = name === defaultBranch;
    const isRemote = name.startsWith("origin/") || name.includes("/");

    // Parse date
    const date = new Date(dateStr).getTime();

    // Get ahead/behind for current branch
    let aheadBehind:
      | { readonly ahead: number; readonly behind: number }
      | undefined = undefined;

    if (isCurrent && !isRemote) {
      try {
        aheadBehind = await getAheadBehind(projectPath, name);
      } catch {
        // Ignore errors (e.g., no upstream)
        aheadBehind = undefined;
      }
    }

    const branchInfo: BranchInfo = {
      name,
      isCurrent,
      isDefault,
      isRemote,
      lastCommit: {
        hash,
        message,
        author,
        date,
      },
      aheadBehind,
    };

    // Separate default branch from the rest
    if (isDefault) {
      defaultBranchInfo = branchInfo;
    } else {
      allBranches.push(branchInfo);
    }
  }

  // Total = non-default branches (default is always pinned separately)
  const total = allBranches.length;

  // Apply pagination to non-default branches
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 30;
  const paged = allBranches.slice(offset, offset + limit);

  // Default branch is always first (pinned), then paginated rest
  const branches: BranchInfo[] = [];
  if (defaultBranchInfo !== undefined && offset === 0) {
    branches.push(defaultBranchInfo);
  }
  branches.push(...paged);

  return {
    branches,
    total: defaultBranchInfo !== undefined ? total + 1 : total,
    currentBranch,
    defaultBranch,
  };
}

/**
 * Get the name of the current branch
 *
 * Uses `git rev-parse --abbrev-ref HEAD` to get the current branch name.
 *
 * @param projectPath - Path to git repository
 * @returns Promise resolving to current branch name
 * @throws Error if not on a branch (detached HEAD)
 *
 * @example
 * ```typescript
 * const current = await getCurrentBranch('/path/to/repo');
 * console.log(`Current branch: ${current}`);
 * ```
 */
export async function getCurrentBranch(projectPath: string): Promise<string> {
  const result = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: projectPath,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to get current branch: ${result.stderr}`);
  }

  const branch = result.stdout.trim();

  if (branch === "HEAD") {
    throw new Error("Detached HEAD state - not on any branch");
  }

  return branch;
}

/**
 * Get the default branch name (main or master)
 *
 * Attempts to detect the default branch by:
 * 1. Checking `git symbolic-ref refs/remotes/origin/HEAD`
 * 2. Falling back to checking if 'main' exists
 * 3. Falling back to checking if 'master' exists
 * 4. Falling back to the current branch
 *
 * @param projectPath - Path to git repository
 * @returns Promise resolving to default branch name
 *
 * @example
 * ```typescript
 * const defaultBranch = await getDefaultBranch('/path/to/repo');
 * console.log(`Default branch: ${defaultBranch}`);
 * ```
 */
export async function getDefaultBranch(projectPath: string): Promise<string> {
  // Try to get remote HEAD
  const remoteHeadResult = await execGit(
    ["symbolic-ref", "refs/remotes/origin/HEAD"],
    { cwd: projectPath },
  );

  if (remoteHeadResult.exitCode === 0) {
    const ref = remoteHeadResult.stdout.trim();
    // Extract branch name from refs/remotes/origin/main
    const match = ref.match(/refs\/remotes\/origin\/(.+)$/);
    if (match !== null && match[1] !== undefined) {
      return match[1];
    }
  }

  // Check if 'main' branch exists
  const mainResult = await execGit(["rev-parse", "--verify", "main"], {
    cwd: projectPath,
  });
  if (mainResult.exitCode === 0) {
    return "main";
  }

  // Check if 'master' branch exists
  const masterResult = await execGit(["rev-parse", "--verify", "master"], {
    cwd: projectPath,
  });
  if (masterResult.exitCode === 0) {
    return "master";
  }

  // Fallback to current branch
  try {
    return await getCurrentBranch(projectPath);
  } catch {
    return "main"; // Ultimate fallback
  }
}

/**
 * Search branches by partial name match
 *
 * Filters branches by partial name matching (case-insensitive).
 *
 * @param projectPath - Path to git repository
 * @param query - Search query (partial branch name)
 * @param limit - Maximum number of results to return (default: 20)
 * @returns Promise resolving to array of matching BranchInfo objects
 *
 * @example
 * ```typescript
 * // Find all branches containing 'feature'
 * const results = await searchBranches('/path/to/repo', 'feature');
 *
 * // Limit results to 10
 * const results = await searchBranches('/path/to/repo', 'fix', 10);
 * ```
 */
export async function searchBranches(
  projectPath: string,
  query: string,
  limit?: number | undefined,
): Promise<readonly BranchInfo[]> {
  // List all branches (including remote if query might match remote branches)
  const includeRemote = query.includes("/");
  const result = await listBranches(projectPath, includeRemote);

  // Filter by partial name match (case-insensitive)
  const lowerQuery = query.toLowerCase();
  const filtered = result.branches.filter((branch) =>
    branch.name.toLowerCase().includes(lowerQuery),
  );

  // Apply limit
  const maxResults = limit ?? 20;
  return filtered.slice(0, maxResults);
}

/**
 * Checkout a git branch with uncommitted changes handling
 *
 * Supports:
 * - Automatic stashing of uncommitted changes (if request.stash is true)
 * - Force checkout (if request.force is true)
 *
 * @param projectPath - Path to git repository
 * @param request - Checkout request with branch name and options
 * @returns Promise resolving to BranchCheckoutResponse
 *
 * @example
 * ```typescript
 * // Simple checkout
 * const response = await checkoutBranch('/path/to/repo', {
 *   branch: 'feature-branch'
 * });
 *
 * // Checkout with automatic stash
 * const response = await checkoutBranch('/path/to/repo', {
 *   branch: 'main',
 *   stash: true
 * });
 *
 * // Force checkout (discard uncommitted changes)
 * const response = await checkoutBranch('/path/to/repo', {
 *   branch: 'main',
 *   force: true
 * });
 * ```
 */
export async function checkoutBranch(
  projectPath: string,
  request: BranchCheckoutRequest,
): Promise<BranchCheckoutResponse> {
  // Get current branch
  let previousBranch: string;
  try {
    previousBranch = await getCurrentBranch(projectPath);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return createCheckoutFailure(
      "unknown",
      `Failed to get current branch: ${errorMessage}`,
    );
  }

  let stashCreated: string | undefined = undefined;

  // Stash uncommitted changes if requested
  if (request.stash === true) {
    const stashResult = await execGit(
      ["stash", "push", "-m", "auto-stash before checkout"],
      { cwd: projectPath },
    );

    if (stashResult.exitCode !== 0) {
      return createCheckoutFailure(
        previousBranch,
        `Failed to stash changes: ${stashResult.stderr}`,
      );
    }

    // Get stash reference
    const stashListResult = await execGit(["stash", "list"], {
      cwd: projectPath,
    });
    if (stashListResult.exitCode === 0) {
      const firstLine = stashListResult.stdout.split("\n")[0];
      if (firstLine !== undefined) {
        const match = firstLine.match(/^(stash@\{\d+\})/);
        if (match !== null && match[1] !== undefined) {
          stashCreated = match[1];
        }
      }
    }
  }

  // Build checkout command
  const checkoutArgs = ["checkout"];
  if (request.force === true) {
    checkoutArgs.push("--force");
  }
  checkoutArgs.push(request.branch);

  // Execute checkout
  const checkoutResult = await execGit(checkoutArgs, { cwd: projectPath });

  if (checkoutResult.exitCode !== 0) {
    return createCheckoutFailure(
      previousBranch,
      `Checkout failed: ${checkoutResult.stderr}`,
    );
  }

  // Verify current branch changed
  let currentBranch: string;
  try {
    currentBranch = await getCurrentBranch(projectPath);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return createCheckoutFailure(
      previousBranch,
      `Checkout succeeded but failed to verify: ${errorMessage}`,
    );
  }

  return createCheckoutSuccess(previousBranch, currentBranch, stashCreated);
}

/**
 * Merge a branch into the current branch
 *
 * Runs `git merge <branch>` in the specified project directory.
 * If merge conflicts occur, the merge is automatically aborted.
 *
 * @param projectPath - Path to git repository
 * @param branch - Branch name to merge
 * @param noFf - If true, always create a merge commit (--no-ff)
 * @returns Promise resolving to merge result
 */
export async function mergeBranch(
  projectPath: string,
  branch: string,
  noFf?: boolean | undefined,
): Promise<{ success: boolean; currentBranch: string; error?: string }> {
  let currentBranch: string;
  try {
    currentBranch = await getCurrentBranch(projectPath);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      currentBranch: "unknown",
      error: `Failed to get current branch: ${errorMessage}`,
    };
  }

  const mergeArgs = ["merge"];
  if (noFf === true) {
    mergeArgs.push("--no-ff");
  }
  mergeArgs.push(branch);

  const mergeResult = await execGit(mergeArgs, { cwd: projectPath });

  if (mergeResult.exitCode !== 0) {
    const isConflict =
      mergeResult.stderr.includes("CONFLICT") ||
      mergeResult.stdout.includes("CONFLICT") ||
      mergeResult.stderr.includes("Automatic merge failed");

    if (isConflict) {
      await execGit(["merge", "--abort"], { cwd: projectPath });
      return {
        success: false,
        currentBranch,
        error: "Merge conflicts detected. Merge was aborted.",
      };
    }

    return {
      success: false,
      currentBranch,
      error: `Merge failed: ${mergeResult.stderr}`,
    };
  }

  return {
    success: true,
    currentBranch,
  };
}

/**
 * Get ahead/behind counts for a branch relative to its upstream
 *
 * Uses `git rev-list --count --left-right` to count commits ahead and behind.
 *
 * @param projectPath - Path to git repository
 * @param branch - Branch name
 * @param upstream - Upstream branch name (optional, auto-detected if not provided)
 * @returns Promise resolving to { ahead, behind } counts
 * @throws Error if branch has no upstream or command fails
 *
 * @example
 * ```typescript
 * const { ahead, behind } = await getAheadBehind('/path/to/repo', 'main');
 * console.log(`${ahead} commits ahead, ${behind} commits behind`);
 * ```
 */
export async function getAheadBehind(
  projectPath: string,
  branch: string,
  upstream?: string | undefined,
): Promise<{ ahead: number; behind: number }> {
  // Auto-detect upstream if not provided
  let upstreamBranch = upstream;

  if (upstreamBranch === undefined) {
    const upstreamResult = await execGit(
      ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`],
      { cwd: projectPath },
    );

    if (upstreamResult.exitCode !== 0) {
      throw new Error(`Branch ${branch} has no upstream`);
    }

    upstreamBranch = upstreamResult.stdout.trim();
  }

  // Get ahead/behind counts
  const result = await execGit(
    ["rev-list", "--count", "--left-right", `${upstreamBranch}...${branch}`],
    { cwd: projectPath },
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to get ahead/behind for ${branch}: ${result.stderr}`,
    );
  }

  // Parse output: "behind\tahead"
  const parts = result.stdout.trim().split("\t");
  if (parts.length !== 2) {
    throw new Error(
      `Unexpected rev-list output format: ${result.stdout.trim()}`,
    );
  }

  const behind = parseInt(parts[0] ?? "0", 10);
  const ahead = parseInt(parts[1] ?? "0", 10);

  return { ahead, behind };
}
