/**
 * Session Queue Store
 *
 * Client-side state management for the AI session queue.
 * Manages running, queued, and completed sessions.
 */

import type {
  AISession,
  ConversationViewMode,
  SessionState,
} from "../../../src/types/ai";
import type { AIAgent } from "../../../src/types/ai-agent";

/**
 * Queue store state
 */
export interface QueueStoreState {
  /**
   * Currently running sessions
   */
  readonly running: readonly AISession[];

  /**
   * Sessions waiting in queue
   */
  readonly queued: readonly AISession[];

  /**
   * Completed/failed/cancelled sessions
   */
  readonly completed: readonly AISession[];

  /**
   * ID of currently selected session
   */
  readonly selectedSessionId: string | null;

  /**
   * Current conversation view mode
   */
  readonly viewMode: ConversationViewMode;

  /**
   * Whether queue is loading
   */
  readonly loading: boolean;

  /**
   * Error message if last operation failed
   */
  readonly error: string | null;
}

/**
 * Queue store actions
 */
export interface QueueStoreActions {
  /**
   * Load queue from server
   */
  loadQueue(): Promise<void>;

  /**
   * Select a session
   */
  selectSession(id: string | null): void;

  /**
   * Cancel a session
   */
  cancelSession(id: string): Promise<void>;

  /**
   * Run a queued session immediately
   */
  runNow(id: string): Promise<void>;

  /**
   * Remove a session from queue
   */
  removeFromQueue(id: string): Promise<void>;

  /**
   * Reorder a queued session
   */
  reorderQueue(id: string, newPosition: number): Promise<void>;

  /**
   * Clear all completed sessions
   */
  clearCompleted(): Promise<void>;

  /**
   * Set conversation view mode
   */
  setViewMode(mode: ConversationViewMode): void;

  /**
   * Get a session by ID
   */
  getSession(id: string): AISession | null;

  /**
   * Handle SSE event from server
   */
  handleEvent(event: { type: string; sessionId: string; data?: unknown }): void;

  /**
   * Reset store to initial state
   */
  reset(): void;
}

/**
 * Combined queue store type
 */
export type QueueStore = QueueStoreState & QueueStoreActions;

/**
 * Create initial state
 */
function createInitialState(): QueueStoreState {
  return {
    running: [],
    queued: [],
    completed: [],
    selectedSessionId: null,
    viewMode: "chat",
    loading: false,
    error: null,
  };
}

/**
 * Initial queue store state
 */
export const initialQueueState: QueueStoreState = createInitialState();

/**
 * Create a queue store instance
 */
export function createQueueStore(): QueueStore {
  let state: QueueStoreState = createInitialState();

  /**
   * Update state immutably
   */
  function updateState(updates: Partial<QueueStoreState>): void {
    state = { ...state, ...updates };
  }

  /**
   * Find session by ID across all lists
   */
  function findSession(id: string): AISession | null {
    for (const session of state.running) {
      if (session.id === id) return session;
    }
    for (const session of state.queued) {
      if (session.id === id) return session;
    }
    for (const session of state.completed) {
      if (session.id === id) return session;
    }
    return null;
  }

  /**
   * Update a session in place
   */
  function updateSession(id: string, updates: Partial<AISession>): void {
    // Check running
    const runningIndex = state.running.findIndex((s) => s.id === id);
    if (runningIndex !== -1) {
      const updated = { ...state.running[runningIndex]!, ...updates };
      const newRunning = [...state.running];
      newRunning[runningIndex] = updated as AISession;
      updateState({ running: newRunning });
      return;
    }

    // Check queued
    const queuedIndex = state.queued.findIndex((s) => s.id === id);
    if (queuedIndex !== -1) {
      const updated = { ...state.queued[queuedIndex]!, ...updates };
      const newQueued = [...state.queued];
      newQueued[queuedIndex] = updated as AISession;
      updateState({ queued: newQueued });
      return;
    }

    // Check completed
    const completedIndex = state.completed.findIndex((s) => s.id === id);
    if (completedIndex !== -1) {
      const updated = { ...state.completed[completedIndex]!, ...updates };
      const newCompleted = [...state.completed];
      newCompleted[completedIndex] = updated as AISession;
      updateState({ completed: newCompleted });
    }
  }

  /**
   * Move session between lists based on state
   */
  function moveSession(id: string, newState: SessionState): void {
    const session = findSession(id);
    if (session === null) return;

    // Remove from current list
    const newRunning = state.running.filter((s) => s.id !== id);
    const newQueued = state.queued.filter((s) => s.id !== id);
    const newCompleted = state.completed.filter((s) => s.id !== id);

    const updatedSession = { ...session, state: newState };

    // Add to appropriate list
    switch (newState) {
      case "running":
        updateState({
          running: [...newRunning, updatedSession],
          queued: newQueued,
          completed: newCompleted,
        });
        break;
      case "queued":
        updateState({
          running: newRunning,
          queued: [...newQueued, updatedSession],
          completed: newCompleted,
        });
        break;
      case "completed":
      case "failed":
      case "cancelled":
        updateState({
          running: newRunning,
          queued: newQueued,
          completed: [updatedSession, ...newCompleted],
        });
        break;
    }
  }

  return {
    // State getters
    get running(): readonly AISession[] {
      return state.running;
    },
    get queued(): readonly AISession[] {
      return state.queued;
    },
    get completed(): readonly AISession[] {
      return state.completed;
    },
    get selectedSessionId(): string | null {
      return state.selectedSessionId;
    },
    get viewMode(): ConversationViewMode {
      return state.viewMode;
    },
    get loading(): boolean {
      return state.loading;
    },
    get error(): string | null {
      return state.error;
    },

    // Actions
    async loadQueue(): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        const response = await fetch("/api/ai/sessions");
        if (!response.ok) {
          throw new Error(`Failed to load sessions: ${response.statusText}`);
        }

        const data = (await response.json()) as {
          sessions: {
            id: string;
            state: string;
            prompt: string;
            createdAt: string;
            startedAt?: string | undefined;
            completedAt?: string | undefined;
            context: unknown;
            aiAgent?: AIAgent | undefined;
          }[];
        };

        // Convert AISessionInfo to AISession by adding empty turns
        const sessions: AISession[] = data.sessions.map((info) => ({
          ...info,
          state: info.state as AISession["state"],
          context: info.context as AISession["context"],
          turns: [],
        }));

        // Categorize by state
        const running: AISession[] = [];
        const queued: AISession[] = [];
        const completed: AISession[] = [];

        for (const session of sessions) {
          switch (session.state) {
            case "running":
              running.push(session);
              break;
            case "queued":
              queued.push(session);
              break;
            case "completed":
            case "failed":
            case "cancelled":
              completed.push(session);
              break;
          }
        }

        updateState({
          running,
          queued,
          completed,
          loading: false,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to load queue";
        updateState({ error: errorMessage, loading: false });
      }
    },

    selectSession(id: string | null): void {
      updateState({ selectedSessionId: id });
    },

    async cancelSession(id: string): Promise<void> {
      try {
        const response = await fetch(`/api/ai/sessions/${id}/cancel`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error(`Failed to cancel session: ${response.statusText}`);
        }

        moveSession(id, "cancelled");
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to cancel session";
        updateState({ error: errorMessage });
        throw e;
      }
    },

    async runNow(id: string): Promise<void> {
      try {
        // TODO: Replace with actual API call
        // const response = await fetch(`/api/ai/sessions/${id}/run-now`, {
        //   method: "POST",
        // });
        // if (!response.ok) throw new Error("Failed to run session");

        moveSession(id, "running");
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to run session";
        updateState({ error: errorMessage });
        throw e;
      }
    },

    async removeFromQueue(id: string): Promise<void> {
      try {
        // TODO: Replace with actual API call
        // const response = await fetch(`/api/ai/sessions/${id}`, {
        //   method: "DELETE",
        // });
        // if (!response.ok) throw new Error("Failed to remove session");

        const newQueued = state.queued.filter((s) => s.id !== id);
        updateState({ queued: newQueued });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to remove session";
        updateState({ error: errorMessage });
        throw e;
      }
    },

    async reorderQueue(id: string, newPosition: number): Promise<void> {
      const session = state.queued.find((s) => s.id === id);
      if (session === undefined) return;

      const newQueued = state.queued.filter((s) => s.id !== id);
      const clampedPosition = Math.max(
        0,
        Math.min(newPosition, newQueued.length),
      );
      newQueued.splice(clampedPosition, 0, session);

      updateState({ queued: newQueued });

      // TODO: API call to persist order
      // await fetch(`/api/ai/sessions/${id}/reorder`, {
      //   method: "POST",
      //   body: JSON.stringify({ position: newPosition }),
      // });
    },

    async clearCompleted(): Promise<void> {
      try {
        // TODO: Replace with actual API call
        // const response = await fetch("/api/ai/sessions/completed", {
        //   method: "DELETE",
        // });
        // if (!response.ok) throw new Error("Failed to clear completed");

        updateState({ completed: [] });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to clear completed";
        updateState({ error: errorMessage });
        throw e;
      }
    },

    setViewMode(mode: ConversationViewMode): void {
      updateState({ viewMode: mode });
    },

    getSession(id: string): AISession | null {
      return findSession(id);
    },

    handleEvent(event: {
      type: string;
      sessionId: string;
      data?: unknown;
    }): void {
      const { type, sessionId, data } = event;

      switch (type) {
        case "session_started":
          moveSession(sessionId, "running");
          break;

        case "completed":
          moveSession(sessionId, "completed");
          break;

        case "error":
        case "failed":
          moveSession(sessionId, "failed");
          break;

        case "cancelled":
          moveSession(sessionId, "cancelled");
          break;

        case "thinking":
          updateSession(sessionId, { currentActivity: "Thinking..." });
          break;

        case "tool_use":
          if (data && typeof data === "object" && "toolName" in data) {
            updateSession(sessionId, {
              currentActivity: `Using ${(data as { toolName: string }).toolName}...`,
            });
          }
          break;

        case "message":
          updateSession(sessionId, { currentActivity: undefined });
          break;
      }
    },

    reset(): void {
      state = createInitialState();
    },
  };
}
