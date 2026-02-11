/**
 * AI Prompt Store
 *
 * Client-side state management for AI prompt functionality.
 * Manages prompt text, file references, execution mode, and queue status.
 */

import type {
  AIPromptRequest,
  AIPromptContext,
  FileReference,
  QueueStatus,
  AISessionSubmitResult,
  SessionMode,
} from "../../../src/types/ai";
import { createEmptyQueueStatus } from "../../../src/types/ai";

/**
 * Selected line range for prompt context
 */
export interface SelectedLines {
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly content?: string | undefined;
}

/**
 * Execution mode for prompts
 */
export type ExecutionMode = "immediate" | "queue";

/**
 * AI store state
 */
export interface AIStoreState {
  /**
   * Queue status from server
   */
  readonly queueStatus: QueueStatus;

  /**
   * Current prompt text
   */
  readonly currentPrompt: string;

  /**
   * Currently selected lines (for inline prompt)
   */
  readonly selectedLines: SelectedLines | null;

  /**
   * File references for context
   */
  readonly fileReferences: readonly FileReference[];

  /**
   * Execution mode (immediate or queue)
   */
  readonly executionMode: ExecutionMode;

  /**
   * Whether prompt submission is in progress
   */
  readonly submitting: boolean;

  /**
   * Error message if last operation failed
   */
  readonly error: string | null;

  /**
   * Whether the prompt panel is open
   */
  readonly isPanelOpen: boolean;

  /**
   * Whether inline prompt is active
   */
  readonly isInlinePromptActive: boolean;
}

/**
 * AI store actions
 */
export interface AIStoreActions {
  /**
   * Set the prompt text
   */
  setPrompt(prompt: string): void;

  /**
   * Select lines for context
   */
  selectLines(path: string, start: number, end: number, content?: string): void;

  /**
   * Clear line selection
   */
  clearLineSelection(): void;

  /**
   * Add a file reference
   */
  addFileReference(ref: FileReference): void;

  /**
   * Remove a file reference by path
   */
  removeFileReference(path: string): void;

  /**
   * Clear all file references
   */
  clearFileReferences(): void;

  /**
   * Set execution mode
   */
  setExecutionMode(mode: ExecutionMode): void;

  /**
   * Submit prompt to server
   */
  submit(): Promise<AISessionSubmitResult>;

  /**
   * Refresh queue status from server
   */
  refreshQueueStatus(): Promise<void>;

  /**
   * Open the prompt panel
   */
  openPanel(): void;

  /**
   * Close the prompt panel
   */
  closePanel(): void;

  /**
   * Toggle the prompt panel
   */
  togglePanel(): void;

  /**
   * Activate inline prompt for selected lines
   */
  activateInlinePrompt(
    path: string,
    start: number,
    end: number,
    content?: string,
  ): void;

  /**
   * Deactivate inline prompt
   */
  deactivateInlinePrompt(): void;

  /**
   * Reset store to initial state
   */
  reset(): void;
}

/**
 * Combined AI store type
 */
export type AIStore = AIStoreState & AIStoreActions;

/**
 * Create initial state
 */
function createInitialState(): AIStoreState {
  return {
    queueStatus: createEmptyQueueStatus(),
    currentPrompt: "",
    selectedLines: null,
    fileReferences: [],
    executionMode: "immediate",
    submitting: false,
    error: null,
    isPanelOpen: false,
    isInlinePromptActive: false,
  };
}

/**
 * Initial AI store state
 */
export const initialAIState: AIStoreState = createInitialState();

/**
 * Create an AI store instance
 */
export function createAIStore(): AIStore {
  let state: AIStoreState = createInitialState();
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
  function updateState(updates: Partial<AIStoreState>): void {
    state = { ...state, ...updates };
    notifyListeners();
  }

  /**
   * Build prompt context from current state
   */
  function buildContext(): AIPromptContext {
    const context: AIPromptContext = {
      references: [...state.fileReferences],
    };

    // Add selected lines as primary file if present
    if (state.selectedLines !== null) {
      return {
        ...context,
        primaryFile: {
          path: state.selectedLines.path,
          startLine: state.selectedLines.start,
          endLine: state.selectedLines.end,
          content: state.selectedLines.content ?? "",
        },
      };
    }

    return context;
  }

  return {
    // State getters
    get queueStatus(): QueueStatus {
      return state.queueStatus;
    },
    get currentPrompt(): string {
      return state.currentPrompt;
    },
    get selectedLines(): SelectedLines | null {
      return state.selectedLines;
    },
    get fileReferences(): readonly FileReference[] {
      return state.fileReferences;
    },
    get executionMode(): ExecutionMode {
      return state.executionMode;
    },
    get submitting(): boolean {
      return state.submitting;
    },
    get error(): string | null {
      return state.error;
    },
    get isPanelOpen(): boolean {
      return state.isPanelOpen;
    },
    get isInlinePromptActive(): boolean {
      return state.isInlinePromptActive;
    },

    // Actions
    setPrompt(prompt: string): void {
      updateState({ currentPrompt: prompt, error: null });
    },

    selectLines(
      path: string,
      start: number,
      end: number,
      content?: string,
    ): void {
      const selectedLines: SelectedLines = { path, start, end };
      if (content !== undefined) {
        updateState({
          selectedLines: { ...selectedLines, content },
          error: null,
        });
      } else {
        updateState({ selectedLines, error: null });
      }
    },

    clearLineSelection(): void {
      updateState({ selectedLines: null });
    },

    addFileReference(ref: FileReference): void {
      // Check for duplicates
      const exists = state.fileReferences.some((r) => r.path === ref.path);
      if (!exists) {
        updateState({
          fileReferences: [...state.fileReferences, ref],
          error: null,
        });
      }
    },

    removeFileReference(path: string): void {
      updateState({
        fileReferences: state.fileReferences.filter((r) => r.path !== path),
      });
    },

    clearFileReferences(): void {
      updateState({ fileReferences: [] });
    },

    setExecutionMode(mode: ExecutionMode): void {
      updateState({ executionMode: mode });
    },

    async submit(): Promise<AISessionSubmitResult> {
      if (state.submitting) {
        throw new Error("Already submitting");
      }

      if (state.currentPrompt.trim().length === 0) {
        throw new Error("Prompt cannot be empty");
      }

      updateState({ submitting: true, error: null });

      try {
        // Build request for API call (stubbed for now)
        const apiRequest: AIPromptRequest = {
          prompt: state.currentPrompt,
          context: buildContext(),
          options: {
            projectPath: "", // Will be filled by server
            sessionMode: "new" as SessionMode,
            immediate: state.executionMode === "immediate",
          },
        };

        // TODO: Replace with actual API call
        // Suppress unused variable warning - will be used when API is connected
        void apiRequest;
        // const response = await fetch("/api/ai/prompt", {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify(request),
        // });
        // if (!response.ok) {
        //   const error = await response.json();
        //   throw new Error(error.error || "Failed to submit prompt");
        // }
        // const result = await response.json() as AISessionSubmitResult;

        // Stubbed response for now
        const result: AISessionSubmitResult = {
          sessionId: `session_${Date.now()}`,
          immediate: state.executionMode === "immediate",
          queuePosition:
            state.executionMode === "queue"
              ? state.queueStatus.queuedCount + 1
              : undefined,
        };

        // Clear prompt after successful submission
        updateState({
          currentPrompt: "",
          selectedLines: null,
          fileReferences: [],
          submitting: false,
          isInlinePromptActive: false,
        });

        return result;
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to submit prompt";
        updateState({ error: errorMessage, submitting: false });
        throw e;
      }
    },

    async refreshQueueStatus(): Promise<void> {
      try {
        // TODO: Replace with actual API call
        // const response = await fetch("/api/ai/queue/status");
        // if (!response.ok) {
        //   throw new Error("Failed to fetch queue status");
        // }
        // const status = await response.json() as QueueStatus;
        // Stubbed for now - keep current status
        // updateState({ queueStatus: status });
      } catch (e) {
        // Silently fail - don't update error state for background refresh
        console.error("Failed to refresh queue status:", e);
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

    activateInlinePrompt(
      path: string,
      start: number,
      end: number,
      content?: string,
    ): void {
      const selectedLines: SelectedLines = { path, start, end };
      if (content !== undefined) {
        updateState({
          selectedLines: { ...selectedLines, content },
          isInlinePromptActive: true,
          error: null,
        });
      } else {
        updateState({
          selectedLines,
          isInlinePromptActive: true,
          error: null,
        });
      }
    },

    deactivateInlinePrompt(): void {
      updateState({
        isInlinePromptActive: false,
        selectedLines: null,
        currentPrompt: "",
      });
    },

    reset(): void {
      state = createInitialState();
      notifyListeners();
    },
  };
}
