/**
 * Commit Store
 *
 * Client-side state management for AI-powered commit functionality.
 * Manages staged files, prompt selection, commit execution, and result tracking.
 */

import type {
  StagedFile,
  CommitRequest,
  CommitResult,
} from "../../../src/types/commit-context";

/**
 * Prompt template definition
 */
export interface PromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly variables: readonly string[];
}

/**
 * Commit execution status
 */
export type CommitStatus =
  | "idle"
  | "loading"
  | "committing"
  | "success"
  | "error";

/**
 * Commit store state
 */
export interface CommitStoreState {
  /**
   * Currently staged files
   */
  readonly stagedFiles: readonly StagedFile[];

  /**
   * Full staged diff text
   */
  readonly stagedDiff: string;

  /**
   * Selected prompt template ID
   */
  readonly selectedPromptId: string | null;

  /**
   * Commit message preview or result
   */
  readonly commitMessage: string;

  /**
   * Whether a commit operation is in progress
   */
  readonly isCommitting: boolean;

  /**
   * Result of last commit operation
   */
  readonly commitResult: CommitResult | null;

  /**
   * Current operation status
   */
  readonly status: CommitStatus;

  /**
   * Error message if operation failed
   */
  readonly error: string | null;

  /**
   * Session ID for commit operation
   */
  readonly sessionId: string | null;
}

/**
 * Commit store actions
 */
export interface CommitStoreActions {
  /**
   * Load staged files from server
   */
  loadStagedFiles(): Promise<void>;

  /**
   * Select a prompt template
   */
  selectPrompt(id: string): void;

  /**
   * Preview commit (dry run)
   */
  previewCommit(): Promise<void>;

  /**
   * Execute actual commit
   */
  executeCommit(): Promise<void>;

  /**
   * Cancel ongoing commit operation
   */
  cancel(): void;

  /**
   * Reset store to initial state
   */
  reset(): void;

  /**
   * Set staged files manually (for testing)
   * @internal
   */
  _setStagedFiles?(files: readonly StagedFile[], diff: string): void;
}

/**
 * Combined commit store type
 */
export type CommitStore = CommitStoreState & CommitStoreActions;

/**
 * Create initial state
 */
function createInitialState(): CommitStoreState {
  return {
    stagedFiles: [],
    stagedDiff: "",
    selectedPromptId: null,
    commitMessage: "",
    isCommitting: false,
    commitResult: null,
    status: "idle",
    error: null,
    sessionId: null,
  };
}

/**
 * Initial commit store state
 */
export const initialCommitState: CommitStoreState = createInitialState();

/**
 * Create a commit store instance
 *
 * @param contextId - Context ID for API calls (will be injected when connecting to API)
 */
export function createCommitStore(contextId?: string): CommitStore {
  let state: CommitStoreState = createInitialState();
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
  function updateState(updates: Partial<CommitStoreState>): void {
    state = { ...state, ...updates };
    notifyListeners();
  }

  /**
   * Get the API base URL for context
   */
  function getApiBase(): string {
    if (contextId === undefined) {
      // Fallback to default context for testing
      return "/api/ctx/default";
    }
    return `/api/ctx/${contextId}`;
  }

  return {
    // State getters
    get stagedFiles(): readonly StagedFile[] {
      return state.stagedFiles;
    },
    get stagedDiff(): string {
      return state.stagedDiff;
    },
    get selectedPromptId(): string | null {
      return state.selectedPromptId;
    },
    get commitMessage(): string {
      return state.commitMessage;
    },
    get isCommitting(): boolean {
      return state.isCommitting;
    },
    get commitResult(): CommitResult | null {
      return state.commitResult;
    },
    get status(): CommitStatus {
      return state.status;
    },
    get error(): string | null {
      return state.error;
    },
    get sessionId(): string | null {
      return state.sessionId;
    },

    // Actions
    async loadStagedFiles(): Promise<void> {
      updateState({ status: "loading", error: null });

      try {
        // TODO: Replace with actual API call when commit routes are implemented
        // const response = await fetch(`${getApiBase()}/staged`);
        // if (!response.ok) {
        //   throw new Error(`Failed to load staged files: ${response.statusText}`);
        // }
        // const data = await response.json() as {
        //   stagedFiles: StagedFile[];
        //   stagedDiff: string;
        // };

        // Stubbed for now - return empty state
        const data = {
          stagedFiles: [] as StagedFile[],
          stagedDiff: "",
        };

        updateState({
          stagedFiles: data.stagedFiles,
          stagedDiff: data.stagedDiff,
          status: "idle",
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to load staged files";
        updateState({
          error: errorMessage,
          status: "error",
        });
        throw e;
      }
    },

    selectPrompt(id: string): void {
      updateState({
        selectedPromptId: id,
        error: null,
      });
    },

    async previewCommit(): Promise<void> {
      if (state.selectedPromptId === null) {
        updateState({
          error: "No prompt template selected",
          status: "error",
        });
        return;
      }

      if (state.stagedFiles.length === 0) {
        updateState({
          error: "No staged files to commit",
          status: "error",
        });
        return;
      }

      updateState({ status: "committing", error: null });

      try {
        const request: CommitRequest = {
          promptId: state.selectedPromptId,
          variables: {},
          dryRun: true,
        };

        // TODO: Replace with actual API call when commit routes are implemented
        // const response = await fetch(`${getApiBase()}/commit/preview`, {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify(request),
        // });
        // if (!response.ok) {
        //   throw new Error(`Failed to preview commit: ${response.statusText}`);
        // }
        // const data = await response.json() as { sessionId: string };

        // Suppress unused variable warning - will be used when API is connected
        void request;

        // Stubbed response
        const data = {
          sessionId: `session_${Date.now()}`,
        };

        updateState({
          sessionId: data.sessionId,
          status: "idle",
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to preview commit";
        updateState({
          error: errorMessage,
          status: "error",
        });
        throw e;
      }
    },

    async executeCommit(): Promise<void> {
      if (state.selectedPromptId === null) {
        updateState({
          error: "No prompt template selected",
          status: "error",
        });
        return;
      }

      if (state.stagedFiles.length === 0) {
        updateState({
          error: "No staged files to commit",
          status: "error",
        });
        return;
      }

      if (state.isCommitting) {
        throw new Error("Commit already in progress");
      }

      updateState({
        status: "committing",
        isCommitting: true,
        error: null,
        commitResult: null,
      });

      try {
        const request: CommitRequest = {
          promptId: state.selectedPromptId,
          variables: {},
          dryRun: false,
        };

        // TODO: Replace with actual API call when commit routes are implemented
        // const response = await fetch(`${getApiBase()}/commit`, {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify(request),
        // });
        // if (!response.ok) {
        //   throw new Error(`Failed to execute commit: ${response.statusText}`);
        // }
        // const data = await response.json() as { sessionId: string };

        // Suppress unused variable warning - will be used when API is connected
        void request;

        // Stubbed response
        const data = {
          sessionId: `session_${Date.now()}`,
        };

        updateState({
          sessionId: data.sessionId,
          status: "success",
          isCommitting: false,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to execute commit";
        updateState({
          error: errorMessage,
          status: "error",
          isCommitting: false,
        });
        throw e;
      }
    },

    cancel(): void {
      if (!state.isCommitting) {
        return;
      }

      // TODO: Implement actual cancellation via API
      // await fetch(`${getApiBase()}/commit/${state.sessionId}/cancel`, {
      //   method: "POST",
      // });

      updateState({
        isCommitting: false,
        status: "idle",
        sessionId: null,
      });
    },

    reset(): void {
      state = createInitialState();
      notifyListeners();
    },

    /**
     * Set staged files manually (for testing)
     * @internal
     */
    _setStagedFiles(files: readonly StagedFile[], diff: string): void {
      updateState({
        stagedFiles: files,
        stagedDiff: diff,
      });
    },
  };
}
