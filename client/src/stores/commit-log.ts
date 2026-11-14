/**
 * Commit log store types and functions
 *
 * Manages the commit log state for the diff viewer, including:
 * - Loading commit history with pagination
 * - Selecting commits to view diffs
 * - Search filtering by message/author
 * - Mode switching (branch-diff vs commit mode)
 */

import type {
  CommitInfo,
  CommitLogQuery,
  CommitLogResponse,
  CommitPagination,
} from "../../../src/types/commit";

/**
 * Display mode for the diff viewer
 * - 'branch-diff': Show diff between branches
 * - 'commit': Show diff for a specific commit
 */
export type CommitViewMode = "branch-diff" | "commit";

/**
 * Commit log store state
 */
export interface CommitLogStoreState {
  /**
   * List of loaded commits
   */
  readonly commits: readonly CommitInfo[];

  /**
   * Currently selected commit (null if no commit selected)
   */
  readonly selectedCommit: CommitInfo | null;

  /**
   * Whether initial commit list is loading
   */
  readonly loading: boolean;

  /**
   * Whether loading more commits (pagination)
   */
  readonly loadingMore: boolean;

  /**
   * Error message if loading failed
   */
  readonly error: string | null;

  /**
   * Pagination state
   */
  readonly pagination: CommitPagination;

  /**
   * Search query (filters commits by message/author)
   */
  readonly search: string;

  /**
   * Current branch name
   */
  readonly branch: string;

  /**
   * Current display mode
   */
  readonly mode: CommitViewMode;
}

/**
 * Commit log store actions
 */
export interface CommitLogStoreActions {
  /**
   * Load commits with optional query parameters
   */
  loadCommits(options?: CommitLogQuery): Promise<void>;

  /**
   * Load more commits (pagination)
   */
  loadMore(): Promise<void>;

  /**
   * Select a commit by hash and switch to commit mode
   */
  selectCommit(hash: string): Promise<void>;

  /**
   * Clear commit selection and return to branch-diff mode
   */
  clearSelection(): void;

  /**
   * Set search query
   */
  setSearch(query: string): void;

  /**
   * Set branch name
   */
  setBranch(branch: string): void;

  /**
   * Refresh current commits (reload with same parameters)
   */
  refresh(): Promise<void>;

  /**
   * Reset the store to initial state
   */
  reset(): void;
}

/**
 * Combined commit log store type
 */
export type CommitLogStore = CommitLogStoreState & CommitLogStoreActions;

/**
 * Create initial state for the commit log store
 */
function createInitialState(): CommitLogStoreState {
  return {
    commits: [],
    selectedCommit: null,
    loading: false,
    loadingMore: false,
    error: null,
    pagination: {
      offset: 0,
      limit: 50,
      total: 0,
      hasMore: false,
    },
    search: "",
    branch: "main",
    mode: "branch-diff",
  };
}

/**
 * Initial state for the commit log store
 */
export const initialCommitLogState: CommitLogStoreState = createInitialState();

/**
 * Create a commit log store
 *
 * This store manages the commit log functionality including:
 * - Loading commit history with pagination
 * - Commit selection and mode switching
 * - Search filtering by message/author
 * - API integration (currently stubbed)
 */
export function createCommitLogStore(): CommitLogStore {
  let state: CommitLogStoreState = createInitialState();
  const listeners: Set<() => void> = new Set();

  /**
   * Notify all listeners of state change
   */
  function notifyListeners(): void {
    listeners.forEach((listener) => listener());
  }

  /**
   * Update state immutably
   */
  function updateState(updates: Partial<CommitLogStoreState>): void {
    state = { ...state, ...updates };
    notifyListeners();
  }

  /**
   * Build query from current state
   */
  function buildQuery(overrides?: Partial<CommitLogQuery>): CommitLogQuery {
    return {
      branch: state.branch,
      limit: state.pagination.limit,
      offset: state.pagination.offset,
      search: state.search.trim().length > 0 ? state.search : undefined,
      ...overrides,
    };
  }

  return {
    // State getters
    get commits(): readonly CommitInfo[] {
      return state.commits;
    },
    get selectedCommit(): CommitInfo | null {
      return state.selectedCommit;
    },
    get loading(): boolean {
      return state.loading;
    },
    get loadingMore(): boolean {
      return state.loadingMore;
    },
    get error(): string | null {
      return state.error;
    },
    get pagination(): CommitPagination {
      return state.pagination;
    },
    get search(): string {
      return state.search;
    },
    get branch(): string {
      return state.branch;
    },
    get mode(): CommitViewMode {
      return state.mode;
    },

    // Actions
    async loadCommits(options?: CommitLogQuery): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        // Build query parameters
        const query = buildQuery(options);
        const params = new URLSearchParams();
        if (query.branch !== undefined) {
          params.set("branch", query.branch);
        }
        if (query.limit !== undefined) {
          params.set("limit", query.limit.toString());
        }
        if (query.offset !== undefined) {
          params.set("offset", query.offset.toString());
        }
        if (query.search !== undefined && query.search.length > 0) {
          params.set("search", query.search);
        }

        // TODO: Replace with actual API call when commit route is implemented
        // const response = await fetch(`/api/commits?${params.toString()}`);
        // if (!response.ok) {
        //   throw new Error(`Failed to load commits: ${response.statusText}`);
        // }
        // const data = await response.json() as CommitLogResponse;

        // Stubbed: return empty response for now
        const data: CommitLogResponse = {
          commits: [],
          pagination: {
            offset: query.offset ?? 0,
            limit: query.limit ?? 50,
            total: 0,
            hasMore: false,
          },
          branch: query.branch ?? "main",
        };

        updateState({
          commits: data.commits,
          pagination: data.pagination,
          branch: data.branch,
          loading: false,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to load commits";
        updateState({
          error: errorMessage,
          commits: [],
          loading: false,
        });
      }
    },

    async loadMore(): Promise<void> {
      if (!state.pagination.hasMore || state.loadingMore) {
        return;
      }

      updateState({ loadingMore: true, error: null });

      try {
        const nextOffset = state.pagination.offset + state.pagination.limit;
        const query = buildQuery({ offset: nextOffset });

        const params = new URLSearchParams();
        if (query.branch !== undefined) {
          params.set("branch", query.branch);
        }
        if (query.limit !== undefined) {
          params.set("limit", query.limit.toString());
        }
        if (query.offset !== undefined) {
          params.set("offset", query.offset.toString());
        }
        if (query.search !== undefined && query.search.length > 0) {
          params.set("search", query.search);
        }

        // TODO: Replace with actual API call when commit route is implemented
        // const response = await fetch(`/api/commits?${params.toString()}`);
        // if (!response.ok) {
        //   throw new Error(`Failed to load more commits: ${response.statusText}`);
        // }
        // const data = await response.json() as CommitLogResponse;

        // Stubbed: return empty response for now
        const data: CommitLogResponse = {
          commits: [],
          pagination: {
            offset: nextOffset,
            limit: query.limit ?? 50,
            total: state.pagination.total,
            hasMore: false,
          },
          branch: query.branch ?? "main",
        };

        // Append new commits to existing list
        updateState({
          commits: [...state.commits, ...data.commits],
          pagination: data.pagination,
          loadingMore: false,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to load more commits";
        updateState({
          error: errorMessage,
          loadingMore: false,
        });
      }
    },

    async selectCommit(hash: string): Promise<void> {
      // Find commit in loaded commits
      const commit = state.commits.find(
        (c) => c.hash === hash || c.shortHash === hash,
      );

      if (commit === undefined) {
        updateState({
          error: `Commit ${hash} not found in loaded commits`,
        });
        return;
      }

      // Switch to commit mode and set selected commit
      updateState({
        selectedCommit: commit,
        mode: "commit",
        error: null,
      });

      // TODO: Optionally load commit details from API
      // This could fetch additional information like file changes
      // const response = await fetch(`/api/commits/${hash}`);
      // const detail = await response.json() as CommitDetail;
    },

    clearSelection(): void {
      updateState({
        selectedCommit: null,
        mode: "branch-diff",
      });
    },

    setSearch(query: string): void {
      updateState({
        search: query,
        error: null,
      });
    },

    setBranch(branch: string): void {
      updateState({
        branch,
        error: null,
      });
    },

    async refresh(): Promise<void> {
      // Reload with current parameters (offset 0)
      await this.loadCommits({ offset: 0 });
    },

    reset(): void {
      state = createInitialState();
      notifyListeners();
    },
  };
}
