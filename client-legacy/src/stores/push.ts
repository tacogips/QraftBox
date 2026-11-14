/**
 * Push Store
 *
 * Client-side state management for git push operations with AI assistance.
 * Manages push status, remote selection, prompt selection, and push execution.
 */

import type {
  PushStatus,
  PushResult,
  RemoteTracking,
  UnpushedCommit,
  PushRequest,
} from "../../../src/types/push-context";
import {
  createDefaultPushRequest,
  canPushRepository,
} from "../../../src/types/push-context";

/**
 * Push store state
 */
export interface PushStoreState {
  /**
   * Current push status from server
   */
  readonly pushStatus: PushStatus | null;

  /**
   * List of unpushed commits
   */
  readonly unpushedCommits: readonly UnpushedCommit[];

  /**
   * Available remotes
   */
  readonly remotes: readonly RemoteTracking[];

  /**
   * Selected remote name (null for default)
   */
  readonly selectedRemote: string | null;

  /**
   * Selected prompt template ID
   */
  readonly selectedPromptId: string | null;

  /**
   * Whether a push operation is in progress
   */
  readonly isPushing: boolean;

  /**
   * Result of the last push operation
   */
  readonly pushResult: PushResult | null;

  /**
   * Error message if operation failed
   */
  readonly error: string | null;

  /**
   * Whether the push panel is open
   */
  readonly isPanelOpen: boolean;

  /**
   * Whether force push is enabled
   */
  readonly forcePush: boolean;

  /**
   * Whether to set upstream on push
   */
  readonly setUpstream: boolean;

  /**
   * Whether to push tags
   */
  readonly pushTags: boolean;

  /**
   * Custom variables for prompt template
   */
  readonly customVariables: Record<string, string>;

  /**
   * Whether status is being loaded
   */
  readonly loading: boolean;
}

/**
 * Push store actions
 */
export interface PushStoreActions {
  /**
   * Load push status from server
   */
  loadPushStatus(contextId: string): Promise<void>;

  /**
   * Load available remotes from server
   */
  loadRemotes(contextId: string): Promise<void>;

  /**
   * Select a remote for push
   */
  selectRemote(name: string): void;

  /**
   * Select a prompt template
   */
  selectPrompt(id: string): void;

  /**
   * Set custom variable value
   */
  setCustomVariable(key: string, value: string): void;

  /**
   * Clear custom variable
   */
  clearCustomVariable(key: string): void;

  /**
   * Toggle force push option
   */
  toggleForcePush(): void;

  /**
   * Toggle set upstream option
   */
  toggleSetUpstream(): void;

  /**
   * Toggle push tags option
   */
  togglePushTags(): void;

  /**
   * Preview push (dry run)
   */
  previewPush(contextId: string): Promise<void>;

  /**
   * Execute push operation
   */
  executePush(contextId: string): Promise<void>;

  /**
   * Open the push panel
   */
  openPanel(): void;

  /**
   * Close the push panel
   */
  closePanel(): void;

  /**
   * Toggle the push panel
   */
  togglePanel(): void;

  /**
   * Reset store to initial state
   */
  reset(): void;
}

/**
 * Combined push store type
 */
export type PushStore = PushStoreState & PushStoreActions;

/**
 * Create initial state
 */
function createInitialState(): PushStoreState {
  return {
    pushStatus: null,
    unpushedCommits: [],
    remotes: [],
    selectedRemote: null,
    selectedPromptId: null,
    isPushing: false,
    pushResult: null,
    error: null,
    isPanelOpen: false,
    forcePush: false,
    setUpstream: false,
    pushTags: false,
    customVariables: {},
    loading: false,
  };
}

/**
 * Initial push store state
 */
export const initialPushState: PushStoreState = createInitialState();

/**
 * Create a push store instance
 */
export function createPushStore(): PushStore {
  let state: PushStoreState = createInitialState();

  /**
   * Update state immutably
   */
  function updateState(updates: Partial<PushStoreState>): void {
    state = { ...state, ...updates };
  }

  /**
   * Build push request from current state
   */
  function buildPushRequest(): PushRequest {
    if (state.selectedPromptId === null) {
      throw new Error("No prompt template selected");
    }

    const request = createDefaultPushRequest(state.selectedPromptId);
    return {
      ...request,
      remote: state.selectedRemote ?? undefined,
      force: state.forcePush,
      setUpstream: state.setUpstream,
      pushTags: state.pushTags,
      customVariables:
        Object.keys(state.customVariables).length > 0
          ? state.customVariables
          : undefined,
      dryRun: false,
    };
  }

  return {
    // State getters
    get pushStatus(): PushStatus | null {
      return state.pushStatus;
    },
    get unpushedCommits(): readonly UnpushedCommit[] {
      return state.unpushedCommits;
    },
    get remotes(): readonly RemoteTracking[] {
      return state.remotes;
    },
    get selectedRemote(): string | null {
      return state.selectedRemote;
    },
    get selectedPromptId(): string | null {
      return state.selectedPromptId;
    },
    get isPushing(): boolean {
      return state.isPushing;
    },
    get pushResult(): PushResult | null {
      return state.pushResult;
    },
    get error(): string | null {
      return state.error;
    },
    get isPanelOpen(): boolean {
      return state.isPanelOpen;
    },
    get forcePush(): boolean {
      return state.forcePush;
    },
    get setUpstream(): boolean {
      return state.setUpstream;
    },
    get pushTags(): boolean {
      return state.pushTags;
    },
    get customVariables(): Record<string, string> {
      return state.customVariables;
    },
    get loading(): boolean {
      return state.loading;
    },

    // Actions
    async loadPushStatus(contextId: string): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        const response = await fetch(`/api/ctx/${contextId}/push/status`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: response.statusText,
          }));
          const errorMessage =
            typeof errorData === "object" &&
            errorData !== null &&
            "error" in errorData &&
            typeof errorData.error === "string"
              ? errorData.error
              : "Failed to load push status";
          throw new Error(errorMessage);
        }

        const status = (await response.json()) as PushStatus;

        updateState({
          pushStatus: status,
          unpushedCommits: status.unpushedCommits,
          loading: false,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to load push status";
        updateState({
          error: errorMessage,
          loading: false,
        });
      }
    },

    async loadRemotes(contextId: string): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        const response = await fetch(`/api/ctx/${contextId}/remotes`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: response.statusText,
          }));
          const errorMessage =
            typeof errorData === "object" &&
            errorData !== null &&
            "error" in errorData &&
            typeof errorData.error === "string"
              ? errorData.error
              : "Failed to load remotes";
          throw new Error(errorMessage);
        }

        const remotesData = (await response.json()) as {
          remotes: RemoteTracking[];
        };

        updateState({
          remotes: remotesData.remotes,
          loading: false,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to load remotes";
        updateState({
          error: errorMessage,
          loading: false,
        });
      }
    },

    selectRemote(name: string): void {
      updateState({ selectedRemote: name, error: null });
    },

    selectPrompt(id: string): void {
      updateState({ selectedPromptId: id, error: null });
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

    toggleForcePush(): void {
      updateState({ forcePush: !state.forcePush });
    },

    toggleSetUpstream(): void {
      updateState({ setUpstream: !state.setUpstream });
    },

    togglePushTags(): void {
      updateState({ pushTags: !state.pushTags });
    },

    async previewPush(contextId: string): Promise<void> {
      if (state.selectedPromptId === null) {
        updateState({ error: "No prompt template selected" });
        return;
      }

      if (state.pushStatus === null || !canPushRepository(state.pushStatus)) {
        updateState({ error: "Cannot push: no unpushed commits" });
        return;
      }

      updateState({ isPushing: true, error: null, pushResult: null });

      try {
        const request = buildPushRequest();
        const dryRunRequest: PushRequest = { ...request, dryRun: true };

        const response = await fetch(`/api/ctx/${contextId}/push/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dryRunRequest),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: response.statusText,
          }));
          const errorMessage =
            typeof errorData === "object" &&
            errorData !== null &&
            "error" in errorData &&
            typeof errorData.error === "string"
              ? errorData.error
              : "Preview failed";
          throw new Error(errorMessage);
        }

        const result = (await response.json()) as { sessionId: string };

        updateState({
          isPushing: false,
          pushResult: {
            success: true,
            remote: state.selectedRemote ?? "origin",
            branch: state.pushStatus?.branchName ?? "main",
            pushedCommits: state.unpushedCommits.length,
            sessionId: result.sessionId,
          },
        });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Preview failed";
        updateState({
          error: errorMessage,
          isPushing: false,
        });
      }
    },

    async executePush(contextId: string): Promise<void> {
      if (state.selectedPromptId === null) {
        updateState({ error: "No prompt template selected" });
        return;
      }

      if (state.pushStatus === null || !canPushRepository(state.pushStatus)) {
        updateState({ error: "Cannot push: no unpushed commits" });
        return;
      }

      updateState({ isPushing: true, error: null, pushResult: null });

      try {
        const request = buildPushRequest();

        const response = await fetch(`/api/ctx/${contextId}/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: response.statusText,
          }));
          const errorMessage =
            typeof errorData === "object" &&
            errorData !== null &&
            "error" in errorData &&
            typeof errorData.error === "string"
              ? errorData.error
              : "Push failed";
          throw new Error(errorMessage);
        }

        const result = (await response.json()) as PushResult;

        updateState({
          isPushing: false,
          pushResult: result,
        });

        // Refresh push status after successful push
        if (result.success) {
          await this.loadPushStatus(contextId);
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Push failed";
        updateState({
          error: errorMessage,
          isPushing: false,
        });
      }
    },

    openPanel(): void {
      updateState({ isPanelOpen: true });
    },

    closePanel(): void {
      updateState({ isPanelOpen: false });
    },

    togglePanel(): void {
      updateState({ isPanelOpen: !state.isPanelOpen });
    },

    reset(): void {
      state = createInitialState();
    },
  };
}
