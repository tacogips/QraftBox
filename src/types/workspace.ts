/**
 * Workspace Types for the qraftbox multi-directory workspace feature
 *
 * This module defines types for managing multiple git repositories
 * simultaneously using a tab-based interface with directory browsing.
 */

/**
 * Context identifier for workspace tabs
 *
 * Each workspace tab has a unique context ID that identifies its
 * directory context and associated state.
 */
export type ContextId = string;

/**
 * Information about a single workspace tab
 *
 * Each tab represents an open directory (potentially a git repository)
 * with its own context and state.
 */
export interface WorkspaceTab {
  readonly id: ContextId;
  readonly path: string;
  readonly name: string;
  readonly repositoryRoot: string;
  readonly isGitRepo: boolean;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
  // Git worktree support
  readonly isWorktree: boolean;
  readonly mainRepositoryPath: string | null;
  readonly worktreeName: string | null;
}

/**
 * Workspace state containing all open tabs
 *
 * Manages multiple directory contexts with a single active tab.
 * Enforces a maximum number of tabs to prevent resource exhaustion.
 */
export interface Workspace {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: ContextId | null;
  readonly maxTabs: number;
}

/**
 * A single entry in a directory listing (file or directory)
 */
export interface DirectoryEntry {
  readonly name: string;
  readonly path: string;
  readonly isDirectory: boolean;
  readonly isGitRepo: boolean;
  readonly isSymlink: boolean;
  readonly isHidden: boolean;
  readonly modifiedAt: number;
}

/**
 * Response containing directory listing results
 *
 * Includes the current path, parent path for navigation,
 * and all entries in the directory.
 */
export interface DirectoryListingResponse {
  readonly path: string;
  readonly parentPath: string | null;
  readonly entries: readonly DirectoryEntry[];
  readonly canGoUp: boolean;
}

/**
 * Recently opened directory for quick access
 */
export interface RecentDirectory {
  readonly path: string;
  readonly name: string;
  readonly lastOpened: number;
  readonly isGitRepo: boolean;
}

/**
 * Validation result type
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string | undefined;
}

/**
 * Create an empty workspace with no tabs
 *
 * @param maxTabs - Maximum number of tabs allowed (default: 10)
 * @returns Empty workspace state
 */
export function createEmptyWorkspace(maxTabs = 10): Workspace {
  if (maxTabs < 1) {
    throw new Error("maxTabs must be at least 1");
  }
  if (maxTabs > 50) {
    throw new Error("maxTabs must not exceed 50");
  }

  return {
    tabs: [],
    activeTabId: null,
    maxTabs,
  };
}

/**
 * Create a workspace tab
 *
 * @param path - Absolute path to the directory
 * @param name - Display name for the tab
 * @param repositoryRoot - Root of the git repository (or same as path if not a git repo)
 * @param isGitRepo - Whether this is a git repository
 * @param isWorktree - Whether this is a git worktree (default: false)
 * @param mainRepositoryPath - Path to main repository if this is a worktree (default: null)
 * @param worktreeName - Name of the worktree if this is a worktree (default: null)
 * @returns A new workspace tab
 */
export function createWorkspaceTab(
  path: string,
  name: string,
  repositoryRoot: string,
  isGitRepo: boolean,
  isWorktree = false,
  mainRepositoryPath: string | null = null,
  worktreeName: string | null = null,
): WorkspaceTab {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    path,
    name,
    repositoryRoot,
    isGitRepo,
    createdAt: now,
    lastAccessedAt: now,
    isWorktree,
    mainRepositoryPath,
    worktreeName,
  };
}

/**
 * Update the last accessed time for a tab
 *
 * @param tab - The tab to update
 * @returns Updated tab with new lastAccessedAt timestamp
 */
export function updateTabAccessTime(tab: WorkspaceTab): WorkspaceTab {
  return {
    ...tab,
    lastAccessedAt: Date.now(),
  };
}

/**
 * Validate workspace tab parameters
 *
 * @param path - Directory path
 * @param name - Tab name
 * @param repositoryRoot - Repository root path
 * @returns Validation result
 */
export function validateTabParams(
  path: string,
  name: string,
  repositoryRoot: string,
): ValidationResult {
  // Validate path
  if (!path || path.trim().length === 0) {
    return {
      valid: false,
      error: "path cannot be empty",
    };
  }

  // Validate name
  if (!name || name.trim().length === 0) {
    return {
      valid: false,
      error: "name cannot be empty",
    };
  }

  if (name.length > 100) {
    return {
      valid: false,
      error: "name must not exceed 100 characters",
    };
  }

  // Validate repositoryRoot
  if (!repositoryRoot || repositoryRoot.trim().length === 0) {
    return {
      valid: false,
      error: "repositoryRoot cannot be empty",
    };
  }

  return { valid: true };
}

/**
 * Validate directory path format
 *
 * @param path - Path to validate
 * @returns Validation result
 */
export function validateDirectoryPath(path: string): ValidationResult {
  if (!path || path.trim().length === 0) {
    return {
      valid: false,
      error: "path cannot be empty",
    };
  }

  // Path length validation
  if (path.length > 4096) {
    return {
      valid: false,
      error: "path exceeds maximum length of 4096 characters",
    };
  }

  // Check for null bytes (security)
  if (path.includes("\0")) {
    return {
      valid: false,
      error: "path contains invalid null byte",
    };
  }

  return { valid: true };
}

/**
 * Validate context ID format
 *
 * @param id - Context ID to validate
 * @returns Validation result
 */
export function validateContextId(id: ContextId): ValidationResult {
  if (!id || id.trim().length === 0) {
    return {
      valid: false,
      error: "context ID cannot be empty",
    };
  }

  // UUID validation (standard format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(id)) {
    return {
      valid: false,
      error: "invalid context ID format (expected UUID)",
    };
  }

  return { valid: true };
}

/**
 * Check if workspace has reached maximum tabs
 *
 * @param workspace - Workspace to check
 * @returns True if at maximum capacity
 */
export function isWorkspaceFull(workspace: Workspace): boolean {
  return workspace.tabs.length >= workspace.maxTabs;
}

/**
 * Find a tab by context ID
 *
 * @param workspace - Workspace to search
 * @param id - Context ID to find
 * @returns Tab if found, undefined otherwise
 */
export function findTabById(
  workspace: Workspace,
  id: ContextId,
): WorkspaceTab | undefined {
  return workspace.tabs.find((tab) => tab.id === id);
}

/**
 * Check if a path is already open in the workspace
 *
 * @param workspace - Workspace to check
 * @param path - Path to look for
 * @returns Tab if path is already open, undefined otherwise
 */
export function findTabByPath(
  workspace: Workspace,
  path: string,
): WorkspaceTab | undefined {
  return workspace.tabs.find((tab) => tab.path === path);
}

/**
 * Get the active tab from workspace
 *
 * @param workspace - Workspace
 * @returns Active tab if one exists, undefined otherwise
 */
export function getActiveTab(workspace: Workspace): WorkspaceTab | undefined {
  if (workspace.activeTabId === null) {
    return undefined;
  }
  return findTabById(workspace, workspace.activeTabId);
}

/**
 * Sort directory entries by name, directories first
 *
 * @param entries - Entries to sort
 * @returns Sorted entries (directories first, then files, both alphabetically)
 */
export function sortDirectoryEntries(
  entries: readonly DirectoryEntry[],
): readonly DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    // Directories come first
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;

    // Then sort alphabetically by name (case-insensitive)
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/**
 * Filter out hidden entries from directory listing
 *
 * @param entries - Entries to filter
 * @returns Entries with hidden items removed
 */
export function filterHiddenEntries(
  entries: readonly DirectoryEntry[],
): readonly DirectoryEntry[] {
  return entries.filter((entry) => !entry.isHidden);
}

/**
 * Sort recent directories by last opened time (most recent first)
 *
 * @param recent - Recent directories to sort
 * @returns Sorted recent directories
 */
export function sortRecentDirectories(
  recent: readonly RecentDirectory[],
): readonly RecentDirectory[] {
  return [...recent].sort((a, b) => b.lastOpened - a.lastOpened);
}
