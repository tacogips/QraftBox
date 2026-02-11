import {
  generateQraftAiSessionId,
  type AISession,
  type FileReference,
  type QraftAiSessionId,
  type QueueStatus,
} from "../../../src/types/ai";
import {
  cancelAISessionApi,
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

export function createAIFeatureController(deps: AIFeatureDeps): {
  handleAIPanelSubmit: (
    prompt: string,
    immediate: boolean,
    refs: readonly FileReference[],
  ) => Promise<void>;
  handleInlineCommentSubmit: (
    startLine: number,
    endLine: number,
    side: "old" | "new",
    filePath: string,
    prompt: string,
    immediate: boolean,
  ) => Promise<void>;
  fetchPromptQueue: () => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
  handleCancelActiveSession: (sessionId: string) => Promise<void>;
  handleResumeToChanges: (resumeQraftId: string) => void;
  handleResumeCliSession: (resumeQraftId: string) => void;
  handleNewSession: () => void;
  handleSearchSession: () => void;
  hasActiveSessionWork: () => boolean;
} {
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
          state: info.state as AISession["state"],
          context: info.context as AISession["context"],
          turns: [],
          currentActivity: info.currentActivity,
          claudeSessionId: info.claudeSessionId,
        };

        if (session.state === "running") {
          running.push(session);
        } else if (session.state === "queued") {
          queued.push(session);
        } else if (
          (session.state === "completed" || session.state === "failed") &&
          session.completedAt !== undefined
        ) {
          const completedTime = new Date(session.completedAt).getTime();
          if (now - completedTime < recentWindowMs) {
            recentCompleted.push(session);
          }
        }
      }

      deps.setRunningSessions(running);
      deps.setQueuedSessions(queued);
      deps.setRecentlyCompletedSessions(recentCompleted);
      void fetchPromptQueue();
    } catch {
      // Silently ignore
    }
  }

  async function handleAIPanelSubmit(
    prompt: string,
    immediate: boolean,
    refs: readonly FileReference[],
  ): Promise<void> {
    if (deps.getContextId() === null) return;

    try {
      await submitAIPrompt({
        runImmediately: immediate,
        message: prompt,
        context: {
          primaryFile: undefined,
          references: refs,
          diffSummary: undefined,
        },
        projectPath: deps.getProjectPath(),
        qraftAiSessionId: deps.getQraftAiSessionId(),
      });

      void fetchPromptQueue();
      void fetchActiveSessions();
    } catch (error) {
      console.error("AI prompt submit error:", error);
    }
  }

  async function handleInlineCommentSubmit(
    startLine: number,
    endLine: number,
    _side: "old" | "new",
    filePath: string,
    prompt: string,
    immediate: boolean,
  ): Promise<void> {
    if (deps.getContextId() === null) return;

    try {
      await submitAIPrompt({
        runImmediately: immediate,
        message: prompt,
        context: {
          primaryFile: {
            path: filePath,
            startLine,
            endLine,
            content: "",
          },
          references: [],
          diffSummary: undefined,
        },
        projectPath: deps.getProjectPath(),
        qraftAiSessionId: deps.getQraftAiSessionId(),
      });

      void fetchPromptQueue();
      void fetchActiveSessions();
    } catch (error) {
      console.error("AI inline prompt submit error:", error);
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

  function handleResumeToChanges(resumeQraftId: string): void {
    deps.setQraftAiSessionId(resumeQraftId as QraftAiSessionId);
    deps.setResumeDisplaySessionId(null);
    deps.navigateToScreen("diff");
    void fetchActiveSessions();
    void fetchPromptQueue();
  }

  function handleResumeCliSession(resumeQraftId: string): void {
    if (deps.getContextId() === null) return;
    deps.setQraftAiSessionId(resumeQraftId as QraftAiSessionId);
    deps.setResumeDisplaySessionId(null);
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
        .some((item) => item.status === "queued" || item.status === "running") ||
      deps.getRecentlyCompletedSessions().length > 0
    );
  }

  return {
    handleAIPanelSubmit,
    handleInlineCommentSubmit,
    fetchPromptQueue,
    fetchActiveSessions,
    handleCancelActiveSession,
    handleResumeToChanges,
    handleResumeCliSession,
    handleNewSession,
    handleSearchSession,
    hasActiveSessionWork,
  };
}
