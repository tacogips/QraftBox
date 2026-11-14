import {
  generateQraftAiSessionId,
  type AISession,
  type FileReference,
  type QraftAiSessionId,
  type QueueStatus,
} from "../../../src/types/ai";
import {
  cancelAISessionApi,
  cancelQueuedPromptApi,
  fetchAISessionsApi,
  fetchPromptQueueApi,
  submitAIPrompt,
  type PromptQueueItem,
} from "./app-api";
import { buildQueueStatus } from "./ai-runtime";
import type { ScreenType } from "./app-routing";

type SetState<T> = (value: T) => void;
type GetState<T> = () => T;

interface AIFeatureDeps {
  getContextId: GetState<string | null>;
  getProjectPath: GetState<string>;
  /**
   * The app-wide "current" QraftAiSessionId.
   *
   * This is NOT the same as `AIPromptContext.resumeSessionId`.
   * - `qraftAiSessionId` is the app-level active session. It is set both
   *   when resuming an existing session (handleResumeCliSession) AND when
   *   starting a brand-new session (handleNewSession generates a fresh ID).
   *   It is also used for toolbar display, session data fetching, and
   *   screen navigation -- purposes unrelated to "resuming".
   * - `AIPromptContext.resumeSessionId` is a per-prompt override that
   *   tells submitPrompt which session to continue (or undefined to
   *   create a new one).
   *
   * Renaming this to `resumeSessionId` would be misleading because the
   * field covers broader app state, not just the resume-a-conversation
   * use case.
   */
  getQraftAiSessionId: GetState<QraftAiSessionId>;
  setQraftAiSessionId: SetState<QraftAiSessionId>;
  getRunningSessions: GetState<AISession[]>;
  setRunningSessions: SetState<AISession[]>;
  getQueuedSessions: GetState<AISession[]>;
  setQueuedSessions: SetState<AISession[]>;
  getRecentlyCompletedSessions: GetState<AISession[]>;
  setRecentlyCompletedSessions: SetState<AISession[]>;
  getServerPromptQueue: GetState<PromptQueueItem[]>;
  setServerPromptQueue: SetState<PromptQueueItem[]>;
  setQueueStatus: SetState<QueueStatus>;
  getAIPanelCollapsed: GetState<boolean>;
  setAIPanelCollapsed: SetState<boolean>;
  setResumeDisplaySessionId: SetState<string | null>;
  navigateToScreen: (screen: ScreenType) => void;
}

/**
 * Context for AI prompt submission.
 *
 * Session behavior:
 * - Bottom AI panel (AIPromptPanel): passes `resumeSessionId` with the
 *   current session ID to continue an existing conversation.
 * - Inline comment prompt: passes `resumeSessionId: undefined` to start
 *   a new independent session (does not affect the current panel session).
 *
 * TODO: `submitPrompt` does not yet branch on `resumeSessionId`.
 *       Currently all submits use `deps.getQraftAiSessionId()`.
 */
export interface AIPromptContext {
  primaryFile:
    | {
        path: string;
        startLine: number;
        endLine: number;
        content: string;
      }
    | undefined;
  references: readonly FileReference[];
  diffSummary: string | undefined;
  /**
   * Session ID to resume. When set, the prompt continues an existing
   * session's conversation. When undefined, a new session is created.
   */
  resumeSessionId?: QraftAiSessionId;
  modelProfileId?: string | undefined;
}

export function createAIFeatureController(deps: AIFeatureDeps): {
  submitPrompt: (
    message: string,
    immediate: boolean,
    context: AIPromptContext,
  ) => Promise<void>;
  fetchPromptQueue: () => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
  handleCancelActiveSession: (sessionId: string) => Promise<void>;
  handleCancelQueuedPrompt: (promptId: string) => Promise<void>;
  handleResumeToChanges: (resumeQraftId: string) => void;
  handleResumeCliSession: (resumeQraftId: string) => void;
  handleNewSession: () => void;
  handleSearchSession: () => void;
  hasActiveSessionWork: () => boolean;
} {
  let stickyCompletedSession: { session: AISession; expiresAt: number } | null =
    null;

  async function fetchPromptQueue(): Promise<void> {
    try {
      const prompts = await fetchPromptQueueApi();
      deps.setServerPromptQueue(prompts);
      deps.setQueueStatus(buildQueueStatus(prompts));
    } catch {
      // Silently ignore
    }
  }

  async function fetchActiveSessions(): Promise<void> {
    try {
      const sessions = await fetchAISessionsApi();

      const running: AISession[] = [];
      const queued: AISession[] = [];
      const recentCompleted: AISession[] = [];
      const now = Date.now();
      const recentWindowMs = 60_000;

      for (const info of sessions) {
        const session: AISession = {
          ...info,
          id: info.id as QraftAiSessionId,
          state: info.state as AISession["state"],
          context: info.context as AISession["context"],
          turns: [],
          currentActivity: info.currentActivity,
        };

        if (session.state === "running") {
          running.push(session);
        } else if (session.state === "queued") {
          queued.push(session);
        } else if (
          session.state === "completed" ||
          session.state === "failed" ||
          session.state === "cancelled"
        ) {
          const terminalAt =
            session.completedAt ?? session.startedAt ?? session.createdAt;
          const terminalTime = new Date(terminalAt).getTime();
          // Keep terminal sessions visible briefly even when timestamps are missing
          // or malformed, to avoid a jarring panel disappear right after completion.
          if (
            Number.isNaN(terminalTime) ||
            now - terminalTime < recentWindowMs
          ) {
            recentCompleted.push(session);
          }
        }
      }

      if (recentCompleted.length > 0) {
        stickyCompletedSession = {
          session: recentCompleted[0],
          expiresAt: now + recentWindowMs,
        };
      } else if (
        stickyCompletedSession !== null &&
        stickyCompletedSession.expiresAt > now &&
        running.length === 0 &&
        queued.length === 0
      ) {
        recentCompleted.push(stickyCompletedSession.session);
      } else if (
        stickyCompletedSession !== null &&
        stickyCompletedSession.expiresAt <= now
      ) {
        stickyCompletedSession = null;
      }

      deps.setRunningSessions(running);
      deps.setQueuedSessions(queued);
      deps.setRecentlyCompletedSessions(recentCompleted);
      void fetchPromptQueue();
    } catch {
      // Silently ignore
    }
  }

  async function submitPrompt(
    message: string,
    immediate: boolean,
    context: AIPromptContext,
  ): Promise<void> {
    if (deps.getContextId() === null) return;

    try {
      const payload = {
        runImmediately: immediate,
        message,
        context,
        projectPath: deps.getProjectPath(),
        qraftAiSessionId: deps.getQraftAiSessionId(),
        modelProfileId: context.modelProfileId,
      };
      await submitAIPrompt(payload);

      void fetchPromptQueue();
      void fetchActiveSessions();
    } catch (error) {
      console.error("AI prompt submit error:", error);
    }
  }

  async function handleCancelActiveSession(sessionId: string): Promise<void> {
    try {
      await cancelAISessionApi(sessionId);
      deps.setRunningSessions(
        deps.getRunningSessions().filter((session) => session.id !== sessionId),
      );
      deps.setQueuedSessions(
        deps.getQueuedSessions().filter((session) => session.id !== sessionId),
      );
      void fetchPromptQueue();
    } catch (error) {
      console.error("Failed to cancel session:", error);
    }
  }

  async function handleCancelQueuedPrompt(promptId: string): Promise<void> {
    try {
      await cancelQueuedPromptApi(promptId);
      deps.setServerPromptQueue(
        deps.getServerPromptQueue().filter((prompt) => prompt.id !== promptId),
      );
      void fetchPromptQueue();
    } catch (error) {
      console.error("Failed to cancel queued prompt:", error);
    }
  }

  function handleResumeToChanges(resumeQraftId: string): void {
    deps.setQraftAiSessionId(resumeQraftId as QraftAiSessionId);
    deps.setResumeDisplaySessionId(resumeQraftId);
    deps.navigateToScreen("files");
    void fetchActiveSessions();
    void fetchPromptQueue();
  }

  function handleResumeCliSession(resumeQraftId: string): void {
    if (deps.getContextId() === null) return;
    deps.setQraftAiSessionId(resumeQraftId as QraftAiSessionId);
    deps.setResumeDisplaySessionId(resumeQraftId);
    void fetchActiveSessions();
    void fetchPromptQueue();
  }

  function handleNewSession(): void {
    deps.setResumeDisplaySessionId(null);
    deps.setQraftAiSessionId(generateQraftAiSessionId());
    if (deps.getAIPanelCollapsed()) {
      deps.setAIPanelCollapsed(false);
    }
  }

  function handleSearchSession(): void {
    deps.navigateToScreen("sessions");
    void fetchActiveSessions();
    void fetchPromptQueue();
  }

  function hasActiveSessionWork(): boolean {
    return (
      deps.getRunningSessions().length > 0 ||
      deps.getQueuedSessions().length > 0 ||
      deps
        .getServerPromptQueue()
        .some(
          (item) => item.status === "queued" || item.status === "running",
        ) ||
      deps.getRecentlyCompletedSessions().length > 0
    );
  }

  return {
    submitPrompt,
    fetchPromptQueue,
    fetchActiveSessions,
    handleCancelActiveSession,
    handleCancelQueuedPrompt,
    handleResumeToChanges,
    handleResumeCliSession,
    handleNewSession,
    handleSearchSession,
    hasActiveSessionWork,
  };
}
