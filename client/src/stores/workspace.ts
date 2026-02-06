/**
 * Workspace store types and functions
 *
 * Manages the workspace state for multi-directory support, including:
 * - Tab management (open, close, switch, reorder)
 * - Directory switching and validation
 * - Recent directories tracking
 * - Workspace persistence (save/restore)
 */

// TODO: Replace with actual imports when workspace types are implemented
// import type {
//   ContextId,
//   WorkspaceTab,
//   RecentDirectory,
// } from "../../../src/types/workspace";

/**
 * Temporary type definitions until workspace types module is implemented
 * These should be replaced with imports from src/types/workspace.ts
 */
export type ContextId = string;

export interface WorkspaceTab {
  readonly id: ContextId;
  readonly path: string;
  readonly name: string;
  readonly repositoryRoot: string;
  readonly isGitRepo: boolean;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
}

export interface RecentDirectory {
  readonly path: string;
  readonly name: string;
  readonly lastOpened: number;
  readonly isGitRepo: boolean;
}

/**
 * Workspace store state
 */
export interface WorkspaceStoreState {
  /**
   * List of open directory tabs
   */
  readonly tabs: readonly WorkspaceTab[];

  /**
   * Currently active tab ID (null if no tabs open)
   */
  readonly activeTabId: ContextId | null;

  /**
   * Whether the directory picker modal is open
   */
  readonly isPickerOpen: boolean;

  /**
   * Recently opened directories
   */
  readonly recentDirectories: readonly RecentDirectory[];

  /**
   * Whether a directory operation is in progress
   */
  readonly loading: boolean;

  /**
   * Error message if operation failed
   */
  readonly error: string | null;
}

/**
 * Workspace store actions
 */
export interface WorkspaceStoreActions {
  /**
   * Open a directory in a new tab
   */
  openDirectory(path: string): Promise<void>;

  /**
   * Close a tab by ID
   */
  closeTab(id: ContextId): void;

  /**
   * Activate (switch to) a tab by ID
   */
  activateTab(id: ContextId): void;

  /**
   * Reorder tabs (drag and drop)
   */
  reorderTabs(fromIndex: number, toIndex: number): void;

  /**
   * Open the directory picker modal
   */
  openPicker(): void;

  /**
   * Close the directory picker modal
   */
  closePicker(): void;

  /**
   * Save current workspace state to storage
   */
  saveWorkspace(): Promise<void>;

  /**
   * Restore workspace state from storage
   */
  restoreWorkspace(): Promise<void>;

  /**
   * Reset the store to initial state
   */
  reset(): void;
}

/**
 * Combined workspace store type
 */
export type WorkspaceStore = WorkspaceStoreState & WorkspaceStoreActions;

/**
 * Maximum number of tabs allowed
 */
const MAX_TABS = 10;

/**
 * Maximum number of recent directories to track
 */
const MAX_RECENT = 20;

/**
 * Local storage key for workspace persistence
 */
const WORKSPACE_STORAGE_KEY = "aynd:workspace";

/**
 * Create initial state for the workspace store
 */
function createInitialState(): WorkspaceStoreState {
  return {
    tabs: [],
    activeTabId: null,
    isPickerOpen: false,
    recentDirectories: [],
    loading: false,
    error: null,
  };
}

/**
 * Initial state for the workspace store
 */
export const initialWorkspaceState: WorkspaceStoreState = createInitialState();

/**
 * Generate a unique context ID
 */
function generateContextId(): ContextId {
  return `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract directory name from path
 */
function extractDirectoryName(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/");
  const lastName = parts[parts.length - 1];
  return lastName !== undefined && lastName.length > 0 ? lastName : "/";
}

/**
 * Add or update recent directory
 */
function updateRecentDirectories(
  recent: readonly RecentDirectory[],
  directory: RecentDirectory,
): readonly RecentDirectory[] {
  // Remove existing entry with same path
  const filtered = recent.filter((r) => r.path !== directory.path);

  // Add new entry at the beginning
  const updated = [directory, ...filtered];

  // Limit to MAX_RECENT
  return updated.slice(0, MAX_RECENT);
}

/**
 * Create a workspace store
 *
 * This store manages the workspace functionality including:
 * - Multi-directory tab management
 * - Tab switching and reordering
 * - Directory picker state
 * - Recent directories tracking
 * - Workspace persistence to local storage
 */
export function createWorkspaceStore(): WorkspaceStore {
  let state: WorkspaceStoreState = createInitialState();
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
  function updateState(updates: Partial<WorkspaceStoreState>): void {
    state = { ...state, ...updates };
    notifyListeners();
  }

  /**
   * Find tab by ID
   */
  function findTab(id: ContextId): WorkspaceTab | undefined {
    return state.tabs.find((tab) => tab.id === id);
  }

  /**
   * Find tab index by ID
   */
  function findTabIndex(id: ContextId): number {
    return state.tabs.findIndex((tab) => tab.id === id);
  }

  /**
   * Check if path is already open
   */
  function isPathOpen(path: string): ContextId | null {
    const existing = state.tabs.find((tab) => tab.path === path);
    return existing !== undefined ? existing.id : null;
  }

  return {
    // State getters
    get tabs(): readonly WorkspaceTab[] {
      return state.tabs;
    },
    get activeTabId(): ContextId | null {
      return state.activeTabId;
    },
    get isPickerOpen(): boolean {
      return state.isPickerOpen;
    },
    get recentDirectories(): readonly RecentDirectory[] {
      return state.recentDirectories;
    },
    get loading(): boolean {
      return state.loading;
    },
    get error(): string | null {
      return state.error;
    },

    // Actions
    async openDirectory(path: string): Promise<void> {
      // Check if path is already open
      const existingId = isPathOpen(path);
      if (existingId !== null) {
        // Switch to existing tab and update recent directories
        this.activateTab(existingId);
        this.closePicker();

        // Update recent directories for reopened path
        const now = Date.now();
        const recentEntry: RecentDirectory = {
          path,
          name: extractDirectoryName(path),
          lastOpened: now,
          isGitRepo: false, // TODO: Get from existing tab
        };
        const updatedRecent = updateRecentDirectories(
          state.recentDirectories,
          recentEntry,
        );
        updateState({ recentDirectories: updatedRecent });

        await this.saveWorkspace();
        return;
      }

      // Check tab limit
      if (state.tabs.length >= MAX_TABS) {
        updateState({
          error: `Maximum ${MAX_TABS} tabs allowed. Close a tab to open a new directory.`,
        });
        return;
      }

      updateState({ loading: true, error: null });

      try {
        // TODO: Replace with actual API call when workspace routes are implemented
        // const response = await fetch('/api/workspace/tabs', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ path }),
        // });
        // if (!response.ok) {
        //   throw new Error(`Failed to open directory: ${response.statusText}`);
        // }
        // const data = await response.json() as { tab: WorkspaceTab };

        // Stubbed: Create tab locally for now
        const now = Date.now();
        const newTab: WorkspaceTab = {
          id: generateContextId(),
          path,
          name: extractDirectoryName(path),
          repositoryRoot: path, // TODO: Detect actual git root
          isGitRepo: false, // TODO: Detect if git repo
          createdAt: now,
          lastAccessedAt: now,
        };

        // Add tab and activate it
        const updatedTabs = [...state.tabs, newTab];

        // Update recent directories
        const recentEntry: RecentDirectory = {
          path,
          name: extractDirectoryName(path),
          lastOpened: now,
          isGitRepo: newTab.isGitRepo,
        };
        const updatedRecent = updateRecentDirectories(
          state.recentDirectories,
          recentEntry,
        );

        updateState({
          tabs: updatedTabs,
          activeTabId: newTab.id,
          recentDirectories: updatedRecent,
          loading: false,
          isPickerOpen: false,
        });

        // Save workspace state
        await this.saveWorkspace();
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to open directory";
        updateState({
          error: errorMessage,
          loading: false,
        });
      }
    },

    closeTab(id: ContextId): void {
      const tab = findTab(id);
      if (tab === undefined) {
        return;
      }

      // Remove tab
      const updatedTabs = state.tabs.filter((t) => t.id !== id);

      // Handle active tab change
      let newActiveId = state.activeTabId;
      if (state.activeTabId === id) {
        // If closing active tab, switch to adjacent tab
        const closedIndex = findTabIndex(id);
        if (updatedTabs.length > 0) {
          // Try next tab, or previous if at end
          const nextIndex = Math.min(closedIndex, updatedTabs.length - 1);
          const nextTab = updatedTabs[nextIndex];
          newActiveId = nextTab !== undefined ? nextTab.id : null;
        } else {
          newActiveId = null;
        }
      }

      updateState({
        tabs: updatedTabs,
        activeTabId: newActiveId,
        error: null,
      });

      // TODO: Notify server to clean up context
      // await fetch(`/api/workspace/tabs/${id}`, { method: 'DELETE' });

      // Save workspace state
      void this.saveWorkspace();
    },

    activateTab(id: ContextId): void {
      const tab = findTab(id);
      if (tab === undefined) {
        updateState({
          error: `Tab ${id} not found`,
        });
        return;
      }

      // Update lastAccessedAt
      const now = Date.now();
      const updatedTabs = state.tabs.map((t) =>
        t.id === id ? { ...t, lastAccessedAt: now } : t,
      );

      updateState({
        tabs: updatedTabs,
        activeTabId: id,
        error: null,
      });

      // TODO: Notify server to set active context
      // await fetch(`/api/workspace/tabs/${id}/activate`, { method: 'POST' });

      // Save workspace state
      void this.saveWorkspace();
    },

    reorderTabs(fromIndex: number, toIndex: number): void {
      // Validate indices
      if (
        fromIndex < 0 ||
        fromIndex >= state.tabs.length ||
        toIndex < 0 ||
        toIndex >= state.tabs.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      // Create new array with reordered tabs
      const newTabs = [...state.tabs];
      const movedTab = newTabs[fromIndex];
      if (movedTab === undefined) {
        return;
      }

      // Remove from old position
      newTabs.splice(fromIndex, 1);
      // Insert at new position
      newTabs.splice(toIndex, 0, movedTab);

      updateState({
        tabs: newTabs,
        error: null,
      });

      // Save workspace state
      void this.saveWorkspace();
    },

    openPicker(): void {
      updateState({ isPickerOpen: true });
    },

    closePicker(): void {
      updateState({ isPickerOpen: false });
    },

    async saveWorkspace(): Promise<void> {
      try {
        const workspaceData = {
          tabs: state.tabs,
          activeTabId: state.activeTabId,
          recentDirectories: state.recentDirectories,
        };

        // Save to localStorage
        localStorage.setItem(
          WORKSPACE_STORAGE_KEY,
          JSON.stringify(workspaceData),
        );
      } catch (e) {
        // Silent failure - workspace persistence is not critical
        console.error("Failed to save workspace:", e);
      }
    },

    async restoreWorkspace(): Promise<void> {
      try {
        const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
        if (stored === null) {
          return;
        }

        const workspaceData = JSON.parse(stored) as {
          tabs: WorkspaceTab[];
          activeTabId: ContextId | null;
          recentDirectories: RecentDirectory[];
        };

        // TODO: Validate restored tabs with server
        // Ensure all paths are still valid and contexts can be recreated

        updateState({
          tabs: workspaceData.tabs,
          activeTabId: workspaceData.activeTabId,
          recentDirectories: workspaceData.recentDirectories,
          error: null,
        });
      } catch (e) {
        // Silent failure - invalid stored data should not break the app
        console.error("Failed to restore workspace:", e);
      }
    },

    reset(): void {
      state = createInitialState();
      notifyListeners();

      // Clear localStorage
      try {
        localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      } catch (e) {
        console.error("Failed to clear workspace storage:", e);
      }
    },
  };
}
