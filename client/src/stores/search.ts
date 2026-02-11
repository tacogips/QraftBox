/**
 * Search store types and functions
 *
 * Manages the search state for the diff viewer, including query,
 * scope selection, results, and navigation between matches.
 */

import type {
  SearchScope,
  SearchResult,
  SearchResponse,
} from "../../../src/types/search";

/**
 * Search store state
 */
export interface SearchStoreState {
  /**
   * Current search query/pattern
   */
  readonly query: string;

  /**
   * Search scope (file, changed, or all)
   */
  readonly scope: SearchScope;

  /**
   * Current file path for file-scoped search
   */
  readonly currentFilePath: string | null;

  /**
   * Search results
   */
  readonly results: readonly SearchResult[];

  /**
   * Currently selected result index
   */
  readonly currentIndex: number;

  /**
   * Whether a search is in progress
   */
  readonly loading: boolean;

  /**
   * Error message if search failed
   */
  readonly error: string | null;

  /**
   * Whether the search UI is open
   */
  readonly isOpen: boolean;

  /**
   * Total match count (may differ from results.length if truncated)
   */
  readonly totalMatches: number;

  /**
   * Whether results were truncated
   */
  readonly truncated: boolean;
}

/**
 * Search store actions
 */
export interface SearchStoreActions {
  /**
   * Set the search query
   */
  setQuery(query: string): void;

  /**
   * Set the search scope
   */
  setScope(scope: SearchScope): void;

  /**
   * Set the current file path (for file-scoped search)
   */
  setCurrentFilePath(filePath: string | null): void;

  /**
   * Execute the search with current query and scope
   */
  search(): Promise<void>;

  /**
   * Navigate to the next result
   */
  nextResult(): void;

  /**
   * Navigate to the previous result
   */
  prevResult(): void;

  /**
   * Jump to a specific result by index
   */
  jumpToResult(index: number): void;

  /**
   * Clear search query and results
   */
  clear(): void;

  /**
   * Open the search UI
   */
  open(): void;

  /**
   * Close the search UI
   */
  close(): void;

  /**
   * Reset the store to initial state
   */
  reset(): void;
}

/**
 * Combined search store type
 */
export type SearchStore = SearchStoreState & SearchStoreActions;

/**
 * Create initial state for the search store
 */
function createInitialState(): SearchStoreState {
  return {
    query: "",
    scope: "file",
    currentFilePath: null,
    results: [],
    currentIndex: -1,
    loading: false,
    error: null,
    isOpen: false,
    totalMatches: 0,
    truncated: false,
  };
}

/**
 * Initial state for the search store
 */
export const initialSearchState: SearchStoreState = createInitialState();

/**
 * Create a search store
 *
 * This store manages the search functionality including:
 * - Query and scope state
 * - Search execution with API integration
 * - Result navigation (next/prev/jump)
 * - UI open/close state
 */
export function createSearchStore(): SearchStore {
  let state: SearchStoreState = createInitialState();
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
  function updateState(updates: Partial<SearchStoreState>): void {
    state = { ...state, ...updates };
    notifyListeners();
  }

  /**
   * Debounce timer for search
   */
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    // State getters
    get query(): string {
      return state.query;
    },
    get scope(): SearchScope {
      return state.scope;
    },
    get currentFilePath(): string | null {
      return state.currentFilePath;
    },
    get results(): readonly SearchResult[] {
      return state.results;
    },
    get currentIndex(): number {
      return state.currentIndex;
    },
    get loading(): boolean {
      return state.loading;
    },
    get error(): string | null {
      return state.error;
    },
    get isOpen(): boolean {
      return state.isOpen;
    },
    get totalMatches(): number {
      return state.totalMatches;
    },
    get truncated(): boolean {
      return state.truncated;
    },

    // Actions
    setQuery(query: string): void {
      updateState({ query, error: null });

      // Clear debounce timer
      if (searchDebounceTimer !== undefined) {
        clearTimeout(searchDebounceTimer);
      }
    },

    setScope(scope: SearchScope): void {
      updateState({ scope, error: null });
    },

    setCurrentFilePath(filePath: string | null): void {
      updateState({ currentFilePath: filePath });
    },

    async search(): Promise<void> {
      const { query, scope, currentFilePath } = state;

      // Validate
      if (query.trim().length === 0) {
        updateState({
          results: [],
          currentIndex: -1,
          totalMatches: 0,
          truncated: false,
          error: null,
        });
        return;
      }

      // For file scope, need a file path
      if (scope === "file" && currentFilePath === null) {
        updateState({
          error: "No file selected for search",
          results: [],
          currentIndex: -1,
        });
        return;
      }

      updateState({ loading: true, error: null });

      try {
        // Build search URL
        const params = new URLSearchParams();
        params.set("pattern", query);
        params.set("scope", scope);
        if (scope === "file" && currentFilePath !== null) {
          params.set("file", currentFilePath);
        }

        // TODO: Replace with actual API call when search route is implemented
        // const response = await fetch(`/api/search?${params.toString()}`);
        // if (!response.ok) {
        //   throw new Error(`Search failed: ${response.statusText}`);
        // }
        // const data = await response.json() as SearchResponse;

        // Stubbed: return empty results for now
        const data: SearchResponse = {
          results: [],
          totalMatches: 0,
          filesSearched: 0,
          pattern: query,
          scope,
          truncated: false,
        };

        updateState({
          results: data.results,
          currentIndex: data.results.length > 0 ? 0 : -1,
          totalMatches: data.totalMatches,
          truncated: data.truncated,
          loading: false,
        });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Search failed";
        updateState({
          error: errorMessage,
          results: [],
          currentIndex: -1,
          loading: false,
        });
      }
    },

    nextResult(): void {
      if (state.results.length === 0) {
        return;
      }

      const nextIndex = (state.currentIndex + 1) % state.results.length;
      updateState({ currentIndex: nextIndex });
    },

    prevResult(): void {
      if (state.results.length === 0) {
        return;
      }

      const prevIndex =
        state.currentIndex <= 0
          ? state.results.length - 1
          : state.currentIndex - 1;
      updateState({ currentIndex: prevIndex });
    },

    jumpToResult(index: number): void {
      if (index >= 0 && index < state.results.length) {
        updateState({ currentIndex: index });
      }
    },

    clear(): void {
      if (searchDebounceTimer !== undefined) {
        clearTimeout(searchDebounceTimer);
      }
      updateState({
        query: "",
        results: [],
        currentIndex: -1,
        totalMatches: 0,
        truncated: false,
        error: null,
      });
    },

    open(): void {
      updateState({ isOpen: true });
    },

    close(): void {
      updateState({ isOpen: false });
    },

    reset(): void {
      if (searchDebounceTimer !== undefined) {
        clearTimeout(searchDebounceTimer);
      }
      state = createInitialState();
      notifyListeners();
    },
  };
}
