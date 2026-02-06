/**
 * PR Store
 *
 * Client-side state management for AI-powered pull request functionality.
 * Manages PR status, prompt selection, base branch selection, and PR execution.
 */

import type {
  PRRequest,
  PRResult,
  BranchPRStatus,
} from '../../../src/types/pr.js';

/**
 * PR store state
 */
export interface PRStoreState {
  /**
   * Current PR status for the branch
   */
  readonly currentPRStatus: BranchPRStatus | null;

  /**
   * Selected prompt template ID
   */
  readonly selectedPromptId: string | null;

  /**
   * Selected base branch for PR
   */
  readonly baseBranch: string;

  /**
   * Custom variables for prompt template
   */
  readonly customVariables: Record<string, string>;

  /**
   * Whether a fetch/create/update operation is in progress
   */
  readonly isLoading: boolean;

  /**
   * Error message if operation failed
   */
  readonly error: string | null;

  /**
   * Result of the last PR operation
   */
  readonly result: PRResult | null;
}

/**
 * PR store actions
 */
export interface PRStoreActions {
  /**
   * Fetch PR status for current branch
   */
  fetchBranchPRStatus(contextId: string): Promise<void>;

  /**
   * Create a new PR with AI
   */
  createPR(contextId: string, request: PRRequest): Promise<void>;

  /**
   * Update an existing PR
   */
  updatePR(
    contextId: string,
    prNumber: number,
    request: PRRequest,
  ): Promise<void>;

  /**
   * Select a prompt template
   */
  selectPrompt(id: string): void;

  /**
   * Select base branch for PR
   */
  selectBaseBranch(branch: string): void;

  /**
   * Set custom variable value
   */
  setCustomVariable(key: string, value: string): void;

  /**
   * Clear custom variable
   */
  clearCustomVariable(key: string): void;

  /**
   * Clear error state
   */
  clearError(): void;

  /**
   * Reset store to initial state
   */
  reset(): void;
}

/**
 * Combined PR store type
 */
export type PRStore = PRStoreState & PRStoreActions;

/**
 * Create initial state
 */
function createInitialState(): PRStoreState {
  return {
    currentPRStatus: null,
    selectedPromptId: null,
    baseBranch: 'main',
    customVariables: {},
    isLoading: false,
    error: null,
    result: null,
  };
}

/**
 * Initial PR store state
 */
export const initialPRState: PRStoreState = createInitialState();

/**
 * Create a PR store instance
 */
export function createPRStore(): PRStore {
  let state: PRStoreState = createInitialState();

  /**
   * Update state immutably
   */
  function updateState(updates: Partial<PRStoreState>): void {
    state = { ...state, ...updates };
  }

  return {
    // State getters
    get currentPRStatus(): BranchPRStatus | null {
      return state.currentPRStatus;
    },
    get selectedPromptId(): string | null {
      return state.selectedPromptId;
    },
    get baseBranch(): string {
      return state.baseBranch;
    },
    get customVariables(): Record<string, string> {
      return state.customVariables;
    },
    get isLoading(): boolean {
      return state.isLoading;
    },
    get error(): string | null {
      return state.error;
    },
    get result(): PRResult | null {
      return state.result;
    },

    // Actions
    async fetchBranchPRStatus(contextId: string): Promise<void> {
      updateState({ isLoading: true, error: null });

      try {
        const response = await fetch(`/api/ctx/${contextId}/pr/status`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: response.statusText,
          }));
          const errorMessage =
            typeof errorData === 'object' &&
            errorData !== null &&
            'error' in errorData &&
            typeof errorData.error === 'string'
              ? errorData.error
              : 'Failed to fetch PR status';
          throw new Error(errorMessage);
        }

        const status = (await response.json()) as BranchPRStatus;

        updateState({
          currentPRStatus: status,
          baseBranch: status.baseBranch,
          isLoading: false,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : 'Failed to fetch PR status';
        updateState({
          error: errorMessage,
          isLoading: false,
        });
      }
    },

    async createPR(contextId: string, request: PRRequest): Promise<void> {
      if (state.selectedPromptId === null) {
        updateState({ error: 'No prompt template selected' });
        return;
      }

      if (state.currentPRStatus === null) {
        updateState({ error: 'PR status not loaded' });
        return;
      }

      if (!state.currentPRStatus.canCreatePR) {
        updateState({
          error:
            state.currentPRStatus.reason ??
            'Cannot create PR for this branch',
        });
        return;
      }

      updateState({ isLoading: true, error: null, result: null });

      try {
        const response = await fetch(`/api/ctx/${contextId}/pr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: response.statusText,
          }));
          const errorMessage =
            typeof errorData === 'object' &&
            errorData !== null &&
            'error' in errorData &&
            typeof errorData.error === 'string'
              ? errorData.error
              : 'Failed to create PR';
          throw new Error(errorMessage);
        }

        const result = (await response.json()) as PRResult;

        updateState({
          isLoading: false,
          result,
        });

        // Refresh PR status after successful creation
        if (result.success) {
          await this.fetchBranchPRStatus(contextId);
        }
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : 'Failed to create PR';
        updateState({
          error: errorMessage,
          isLoading: false,
        });
      }
    },

    async updatePR(
      contextId: string,
      prNumber: number,
      request: PRRequest,
    ): Promise<void> {
      if (state.selectedPromptId === null) {
        updateState({ error: 'No prompt template selected' });
        return;
      }

      if (state.currentPRStatus === null || !state.currentPRStatus.hasPR) {
        updateState({ error: 'No existing PR to update' });
        return;
      }

      updateState({ isLoading: true, error: null, result: null });

      try {
        const response = await fetch(`/api/ctx/${contextId}/pr/${prNumber}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: response.statusText,
          }));
          const errorMessage =
            typeof errorData === 'object' &&
            errorData !== null &&
            'error' in errorData &&
            typeof errorData.error === 'string'
              ? errorData.error
              : 'Failed to update PR';
          throw new Error(errorMessage);
        }

        const result = (await response.json()) as PRResult;

        updateState({
          isLoading: false,
          result,
        });

        // Refresh PR status after successful update
        if (result.success) {
          await this.fetchBranchPRStatus(contextId);
        }
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : 'Failed to update PR';
        updateState({
          error: errorMessage,
          isLoading: false,
        });
      }
    },

    selectPrompt(id: string): void {
      updateState({ selectedPromptId: id, error: null });
    },

    selectBaseBranch(branch: string): void {
      updateState({ baseBranch: branch, error: null });
    },

    setCustomVariable(key: string, value: string): void {
      updateState({
        customVariables: { ...state.customVariables, [key]: value },
      });
    },

    clearCustomVariable(key: string): void {
      const newVars = { ...state.customVariables };
      delete newVars[key];
      updateState({ customVariables: newVars });
    },

    clearError(): void {
      updateState({ error: null });
    },

    reset(): void {
      state = createInitialState();
    },
  };
}
