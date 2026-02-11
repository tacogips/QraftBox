import type { AISession, QueueStatus } from "../../../src/types/ai";
import type { PromptQueueItem } from "./app-api";

type SessionProgressEvent = {
  type?: string;
  sessionId?: string;
  data?: { content?: unknown; toolName?: unknown };
};

function parseProgressEvent(raw: string): SessionProgressEvent | null {
  try {
    return JSON.parse(raw) as SessionProgressEvent;
  } catch {
    return null;
  }
}

function updateRunningSessions(
  runningSessions: AISession[],
  event: SessionProgressEvent,
): AISession[] {
  if (typeof event.sessionId !== "string") {
    return runningSessions;
  }

  if (event.type === "message") {
    const content = event.data?.content;
    if (typeof content !== "string") return runningSessions;
    return runningSessions.map((session) =>
      session.id === event.sessionId
        ? {
            ...session,
            lastAssistantMessage: content,
            currentActivity: undefined,
          }
        : session,
    );
  }

  if (event.type === "thinking" || event.type === "session_started") {
    return runningSessions.map((session) =>
      session.id === event.sessionId
        ? { ...session, currentActivity: "Thinking..." }
        : session,
    );
  }

  if (event.type === "tool_use") {
    const toolName = event.data?.toolName;
    return runningSessions.map((session) =>
      session.id === event.sessionId
        ? {
            ...session,
            currentActivity:
              typeof toolName === "string" && toolName.length > 0
                ? `Using ${toolName}...`
                : "Using tool...",
          }
        : session,
    );
  }

  if (event.type === "tool_result") {
    return runningSessions.map((session) =>
      session.id === event.sessionId
        ? { ...session, currentActivity: "Processing tool result..." }
        : session,
    );
  }

  return runningSessions;
}

export function buildQueueStatus(prompts: PromptQueueItem[]): QueueStatus {
  const runningPrompts = prompts.filter((p) => p.status === "running");
  const queuedPrompts = prompts.filter((p) => p.status === "queued");
  return {
    runningCount: runningPrompts.length,
    queuedCount: queuedPrompts.length,
    runningSessionIds: [],
    totalCount: runningPrompts.length + queuedPrompts.length,
  };
}

export function createSessionStreamController(deps: {
  getRunningSessions: () => AISession[];
  setRunningSessions: (sessions: AISession[]) => void;
  fetchActiveSessions: () => Promise<void>;
  fetchPromptQueue: () => Promise<void>;
}): {
  sync: () => void;
  close: (sessionId: string) => void;
  closeAll: () => void;
} {
  const sessionStreams = new Map<string, EventSource>();

  async function reconcileSessionState(sessionId: string): Promise<void> {
    await deps.fetchActiveSessions();
    await deps.fetchPromptQueue();
    const stillRunning = deps
      .getRunningSessions()
      .some((session) => session.id === sessionId);
    if (!stillRunning) {
      closeSessionStream(sessionId);
    }
  }

  function applyProgressEvent(event: SessionProgressEvent): void {
    deps.setRunningSessions(updateRunningSessions(deps.getRunningSessions(), event));
  }

  function closeSessionStream(sessionId: string): void {
    const stream = sessionStreams.get(sessionId);
    if (stream === undefined) return;
    stream.close();
    sessionStreams.delete(sessionId);
  }

  function ensureSessionStream(sessionId: string): void {
    if (sessionStreams.has(sessionId)) return;

    const stream = new EventSource(`/api/ai/sessions/${sessionId}/stream`);
    stream.onmessage = (message) => {
      const event = parseProgressEvent(message.data);
      if (event !== null) {
        applyProgressEvent(event);
      }
    };

    const onTerminalEvent = (): void => {
      closeSessionStream(sessionId);
      void reconcileSessionState(sessionId);
    };

    stream.addEventListener("completed", onTerminalEvent);
    stream.addEventListener("failed", onTerminalEvent);
    stream.addEventListener("cancelled", onTerminalEvent);

    stream.addEventListener("error", (message) => {
      if (!(message instanceof MessageEvent)) {
        return;
      }
      const parsed = parseProgressEvent(message.data);
      if (parsed === null) {
        onTerminalEvent();
        return;
      }
      if (parsed.type === "error") {
        onTerminalEvent();
        return;
      }
      applyProgressEvent(parsed);
    });

    const progressEvents = [
      "session_started",
      "thinking",
      "tool_use",
      "tool_result",
      "message",
    ] as const;

    for (const eventType of progressEvents) {
      stream.addEventListener(eventType, (message) => {
        if (!(message instanceof MessageEvent)) return;
        const parsed = parseProgressEvent(message.data);
        if (parsed !== null) {
          applyProgressEvent(parsed);
        }
      });
    }

    stream.onerror = () => {
      void reconcileSessionState(sessionId);
    };

    sessionStreams.set(sessionId, stream);
  }

  function syncSessionStreams(): void {
    const runningIds = new Set(deps.getRunningSessions().map((s) => s.id));
    for (const [sessionId] of sessionStreams) {
      if (!runningIds.has(sessionId)) {
        closeSessionStream(sessionId);
      }
    }
    for (const sessionId of runningIds) {
      ensureSessionStream(sessionId);
    }
  }

  function closeAllSessionStreams(): void {
    for (const [, stream] of sessionStreams) {
      stream.close();
    }
    sessionStreams.clear();
  }

  return {
    sync: syncSessionStreams,
    close: closeSessionStream,
    closeAll: closeAllSessionStreams,
  };
}
