/**
 * Claude Sessions Store
 *
 * Client-side state management for browsing, filtering, and resuming Claude Code sessions.
 * Manages session lists, filters, pagination, and project information.
 */

import type {
  ExtendedSessionEntry,
  SessionFilters,
  SessionListResponse,
  ProjectInfo,
} from "../../../src/types/claude-session";

/**
 * Claude sessions store state
 */
export interface ClaudeSessionsState {
  /**
   * Currently loaded sessions
   */
  readonly sessions: readonly ExtendedSessionEntry[];

  /**
   * Total matching sessions (before pagination)
   */
  readonly total: number;

  /**
   * Available projects list
   */
  readonly projects: readonly ProjectInfo[];

  /**
   * Currently selected session ID
   */
  readonly selectedSessionId: string | null;

  /**
   * Current filter criteria
   */
  readonly filters: SessionFilters;

  /**
   * Pagination state
   */
  readonly pagination: {
    readonly offset: number;
    readonly limit: number;
  };

  /**
   * Whether data is loading
   */
  readonly isLoading: boolean;

  /**
   * Error message if last operation failed
   */
  readonly error: string | null;
}

/**
 * Claude sessions store actions
 */
export interface ClaudeSessionsActions {
  /**
   * Load list of available projects
   */
  fetchProjects(): Promise<void>;

  /**
   * Load sessions with current filters
   */
  fetchSessions(filters?: SessionFilters): Promise<void>;

  /**
   * Select a session for detail view
   */
  selectSession(id: string | null): void;

  /**
   * Update filter criteria
   */
  setFilters(filters: Partial<SessionFilters>): void;

  /**
   * Set initial filters without triggering a fetch
   */
  setInitialFilters(filters: Partial<SessionFilters>): void;

  /**
   * Clear all filters
   */
  clearFilters(): void;

  /**
   * Clear error state
   */
  clearError(): void;

  /**
   * Load more sessions (pagination)
   */
  loadMore(): Promise<void>;

  /**
   * Resume a session with optional follow-up prompt
   */
  resumeSession(
    sessionId: string,
    prompt?: string,
  ): Promise<{ sessionId: string; status: string }>;

  /**
   * Set context ID for API routing
   */
  setContextId(contextId: string): void;

  /**
   * Reset store to initial state
   */
  reset(): void;
}

/**
 * Combined claude sessions store type
 */
export type ClaudeSessionsStore = ClaudeSessionsState & ClaudeSessionsActions;

/**
 * Create initial state
 */
function createInitialState(): ClaudeSessionsState {
  return {
    sessions: [],
    total: 0,
    projects: [],
    selectedSessionId: null,
    filters: {},
    pagination: {
      offset: 0,
      limit: 50,
    },
    isLoading: false,
    error: null,
  };
}

/**
 * Context ID for routing claude-sessions API calls through context-scoped endpoints
 */
let storeContextId: string | null = null;

/**
 * Initial claude sessions store state
 */
export const initialClaudeSessionsState: ClaudeSessionsState =
  createInitialState();

/**
 * Create a claude sessions store instance
 */
export function createClaudeSessionsStore(): ClaudeSessionsStore {
  let state: ClaudeSessionsState = createInitialState();
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
  function updateState(updates: Partial<ClaudeSessionsState>): void {
    state = { ...state, ...updates };
    notifyListeners();
  }

  /**
   * Build query parameters from filters and pagination
   */
  function buildQueryParams(): URLSearchParams {
    const params = new URLSearchParams();

    if (state.filters.workingDirectoryPrefix !== undefined) {
      params.set(
        "workingDirectoryPrefix",
        state.filters.workingDirectoryPrefix,
      );
    }
    if (state.filters.source !== undefined) {
      params.set("source", state.filters.source);
    }
    if (state.filters.branch !== undefined) {
      params.set("branch", state.filters.branch);
    }
    if (state.filters.searchQuery !== undefined) {
      params.set("search", state.filters.searchQuery);
    }
    if (state.filters.dateRange?.from !== undefined) {
      params.set("dateFrom", state.filters.dateRange.from);
    }
    if (state.filters.dateRange?.to !== undefined) {
      params.set("dateTo", state.filters.dateRange.to);
    }

    params.set("offset", String(state.pagination.offset));
    params.set("limit", String(state.pagination.limit));
    params.set("sortBy", "modified");
    params.set("sortOrder", "desc");

    return params;
  }

  return {
    // State getters
    get sessions(): readonly ExtendedSessionEntry[] {
      return state.sessions;
    },
    get total(): number {
      return state.total;
    },
    get projects(): readonly ProjectInfo[] {
      return state.projects;
    },
    get selectedSessionId(): string | null {
      return state.selectedSessionId;
    },
    get filters(): SessionFilters {
      return state.filters;
    },
    get pagination(): { readonly offset: number; readonly limit: number } {
      return state.pagination;
    },
    get isLoading(): boolean {
      return state.isLoading;
    },
    get error(): string | null {
      return state.error;
    },

    // Actions
    setContextId(contextId: string): void {
      storeContextId = contextId;
    },

    async fetchProjects(): Promise<void> {
      if (storeContextId === null) {
        updateState({ error: "Context ID not set", isLoading: false });
        return;
      }
      updateState({ isLoading: true, error: null });

      try {
        const response = await fetch(
          `/api/ctx/${storeContextId}/claude-sessions/projects`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load projects: ${response.statusText}`);
        }

        const data = (await response.json()) as ProjectInfo[];
        updateState({
          projects: data,
          isLoading: false,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to load projects";
        updateState({ error: errorMessage, isLoading: false });
      }
    },

    async fetchSessions(filters?: SessionFilters): Promise<void> {
      if (filters !== undefined) {
        updateState({
          filters: { ...state.filters, ...filters },
          pagination: { ...state.pagination, offset: 0 },
        });
      }

      updateState({ isLoading: true, error: null });

      try {
        if (storeContextId === null) {
          updateState({ error: "Context ID not set", isLoading: false });
          return;
        }
        const params = buildQueryParams();
        const response = await fetch(
          `/api/ctx/${storeContextId}/claude-sessions/sessions?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error(`Failed to load sessions: ${response.statusText}`);
        }

        const data = (await response.json()) as SessionListResponse;
        updateState({
          sessions: data.sessions,
          total: data.total,
          pagination: {
            offset: data.offset,
            limit: data.limit,
          },
          isLoading: false,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to load sessions";
        updateState({ error: errorMessage, isLoading: false });
      }
    },

    selectSession(id: string | null): void {
      updateState({ selectedSessionId: id });
    },

    setFilters(filters: Partial<SessionFilters>): void {
      const newFilters = { ...state.filters };

      if (filters.workingDirectoryPrefix !== undefined) {
        newFilters.workingDirectoryPrefix = filters.workingDirectoryPrefix;
      }
      if (filters.source !== undefined) {
        newFilters.source = filters.source;
      }
      if (filters.branch !== undefined) {
        newFilters.branch = filters.branch;
      }
      if (filters.searchQuery !== undefined) {
        newFilters.searchQuery = filters.searchQuery;
      }
      if (filters.dateRange !== undefined) {
        newFilters.dateRange = filters.dateRange;
      }

      updateState({
        filters: newFilters,
        pagination: { ...state.pagination, offset: 0 },
      });

      // Automatically fetch with new filters
      this.fetchSessions();
    },

    setInitialFilters(filters: Partial<SessionFilters>): void {
      const newFilters = { ...state.filters };

      if (filters.workingDirectoryPrefix !== undefined) {
        newFilters.workingDirectoryPrefix = filters.workingDirectoryPrefix;
      }
      if (filters.source !== undefined) {
        newFilters.source = filters.source;
      }
      if (filters.branch !== undefined) {
        newFilters.branch = filters.branch;
      }
      if (filters.searchQuery !== undefined) {
        newFilters.searchQuery = filters.searchQuery;
      }
      if (filters.dateRange !== undefined) {
        newFilters.dateRange = filters.dateRange;
      }

      updateState({
        filters: newFilters,
        pagination: { ...state.pagination, offset: 0 },
      });

      // Does NOT trigger fetchSessions - caller must explicitly fetch
    },

    clearFilters(): void {
      updateState({
        filters: {},
        pagination: { ...state.pagination, offset: 0 },
      });

      // Automatically fetch without filters
      this.fetchSessions();
    },

    clearError(): void {
      updateState({ error: null });
    },

    async loadMore(): Promise<void> {
      const newOffset = state.pagination.offset + state.pagination.limit;
      updateState({
        pagination: { ...state.pagination, offset: newOffset },
      });

      await this.fetchSessions();
    },

    async resumeSession(
      sessionId: string,
      prompt?: string,
    ): Promise<{ sessionId: string; status: string }> {
      updateState({ isLoading: true, error: null });

      try {
        if (storeContextId === null) {
          throw new Error("Context ID not set");
        }
        const response = await fetch(
          `/api/ctx/${storeContextId}/claude-sessions/sessions/${sessionId}/resume`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to resume session: ${response.statusText}`);
        }

        const data = (await response.json()) as {
          sessionId: string;
          status: string;
        };
        updateState({ isLoading: false });
        return data;
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to resume session";
        updateState({ error: errorMessage, isLoading: false });
        throw e;
      }
    },

    reset(): void {
      state = createInitialState();
      notifyListeners();
    },
  };
}

/**
 * Default store instance
 */
export const claudeSessionsStore = createClaudeSessionsStore();
