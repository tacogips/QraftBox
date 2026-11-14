/**
 * File tree store types and functions
 *
 * Provides the file tree data structures and store for managing
 * the file tree component's state.
 */

/**
 * Represents a node in the file tree (file or directory)
 */
export interface FileNode {
  /**
   * File or directory name (not full path)
   */
  readonly name: string;

  /**
   * Full path from repository root
   */
  readonly path: string;

  /**
   * Whether this is a directory (true) or file (false)
   */
  readonly isDirectory: boolean;

  /**
   * Child nodes (only for directories)
   */
  readonly children?: readonly FileNode[];

  /**
   * File status (only for files with changes or special states)
   * undefined for unchanged tracked files or directories
   */
  readonly status?: "added" | "modified" | "deleted" | "untracked" | "ignored";

  /**
   * Whether this file is binary (true if binary, undefined if text)
   */
  readonly isBinary?: boolean;
}

/**
 * File tree store state
 */
export interface FilesStoreState {
  /**
   * Root of the file tree (null if not loaded)
   */
  readonly tree: FileNode | null;

  /**
   * Display mode: 'diff' shows only changed files, 'all' shows all files
   */
  readonly mode: "diff" | "all";

  /**
   * Set of expanded directory paths
   */
  readonly expandedPaths: ReadonlySet<string>;

  /**
   * Whether the tree is currently loading
   */
  readonly loading: boolean;

  /**
   * Error message if loading failed
   */
  readonly error: string | null;
}

/**
 * File tree store actions
 */
export interface FilesStoreActions {
  /**
   * Load the file tree from the server
   */
  loadTree(): Promise<void>;

  /**
   * Toggle expansion state of a directory
   */
  toggleExpanded(path: string): void;

  /**
   * Set the display mode
   */
  setMode(mode: "diff" | "all"): void;

  /**
   * Expand all directories
   */
  expandAll(): void;

  /**
   * Collapse all directories
   */
  collapseAll(): void;

  /**
   * Reset the store to initial state
   */
  reset(): void;
}

/**
 * Combined files store type
 */
export type FilesStore = FilesStoreState & FilesStoreActions;

/**
 * Initial state for the files store
 */
export const initialFilesState: FilesStoreState = {
  tree: null,
  mode: "diff",
  expandedPaths: new Set(),
  loading: false,
  error: null,
};

/**
 * Create a files store (placeholder for actual implementation)
 *
 * The actual store implementation using Svelte stores will be added
 * when implementing the full client core.
 */
export function createFilesStore(): FilesStore {
  // Placeholder - will be implemented with actual Svelte store
  const state: FilesStoreState = { ...initialFilesState };

  return {
    ...state,
    loadTree: async () => {
      // TODO: Implement API call
    },
    toggleExpanded: (_path: string) => {
      // TODO: Implement toggle
    },
    setMode: (_mode: "diff" | "all") => {
      // TODO: Implement mode switch
    },
    expandAll: () => {
      // TODO: Implement expand all
    },
    collapseAll: () => {
      // TODO: Implement collapse all
    },
    reset: () => {
      // TODO: Implement reset
    },
  };
}
