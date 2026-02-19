import { buildQueueStatus } from "./ai-runtime";
import type { PromptQueueItem } from "./app-api";
import type { FileChangeEvent } from "../../../src/types/watcher";

interface FileChangeMessage {
  readonly changes: readonly FileChangeEvent[];
  readonly projectPath?: string;
}

interface AppRealtimeDeps {
  getContextId: () => string | null;
  getProjectPath: () => string;
  getSelectedPath: () => string | null;
  getFileTreeMode: () => "diff" | "all";
  markAllFilesTreeStale: () => void;
  fetchDiff: (ctxId: string) => Promise<void>;
  refreshAllFiles: (ctxId: string) => Promise<void>;
  fetchFileContent: (ctxId: string, filePath: string) => Promise<void>;
  setPromptQueue: (prompts: PromptQueueItem[]) => void;
  setQueueStatus: (status: ReturnType<typeof buildQueueStatus>) => void;
  fetchActiveSessions: () => Promise<void>;
}

export function createAppRealtimeController(deps: AppRealtimeDeps): {
  connect: () => void;
  disconnect: () => void;
} {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let refetchTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;

  function connect(): void {
    if (ws !== null && ws.readyState <= WebSocket.OPEN) {
      return;
    }

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onopen = () => {
      reconnectDelay = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          event: string;
          data: unknown;
        };

        if (message.event === "file-change") {
          const contextId = deps.getContextId();
          if (contextId === null) {
            return;
          }
          const fileChangeMessage = message.data as FileChangeMessage;
          const selectedPath = deps.getSelectedPath();
          const activeProjectPath = deps.getProjectPath();
          const isCurrentProjectEvent =
            fileChangeMessage.projectPath === undefined ||
            fileChangeMessage.projectPath === activeProjectPath;

          deps.markAllFilesTreeStale();
          if (refetchTimer !== null) {
            clearTimeout(refetchTimer);
          }

          refetchTimer = setTimeout(() => {
            const currentContextId = deps.getContextId();
            if (currentContextId !== null) {
              void deps.fetchDiff(currentContextId);
              void deps.refreshAllFiles(currentContextId);
            }
            refetchTimer = null;
          }, 500);

          if (
            isCurrentProjectEvent &&
            selectedPath !== null &&
            fileChangeMessage.changes.some((change) => change.path === selectedPath)
          ) {
            void deps.fetchFileContent(contextId, selectedPath);
          }
          return;
        }

        if (message.event === "ai:queue_update") {
          const update = message.data as { prompts: PromptQueueItem[] };
          deps.setPromptQueue(update.prompts);
          deps.setQueueStatus(buildQueueStatus(update.prompts));
          void deps.fetchActiveSessions();
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      ws = null;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
        connect();
      }, reconnectDelay);
    };

    ws.onerror = () => {
      // onclose handles reconnection
    };
  }

  function disconnect(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (refetchTimer !== null) {
      clearTimeout(refetchTimer);
      refetchTimer = null;
    }
    if (ws !== null) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  }

  return { connect, disconnect };
}
