import { buildQueueStatus } from "./ai-runtime";
import type { PromptQueueItem } from "./app-api";
import {
  createFileChangeHandler,
  type FileChangeMessage,
} from "../../../client-shared/src/realtime/file-change-handler";

interface AppRealtimeDeps {
  getContextId: () => string | null;
  getProjectPath: () => string;
  getSelectedPath: () => string | null;
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
  let reconnectDelay = 1000;
  const fileChangeHandler = createFileChangeHandler({
    getContextId: deps.getContextId,
    getProjectPath: deps.getProjectPath,
    getSelectedPath: deps.getSelectedPath,
    markStale: deps.markAllFilesTreeStale,
    refreshContext: async (contextId: string): Promise<void> => {
      await Promise.all([
        deps.fetchDiff(contextId),
        deps.refreshAllFiles(contextId),
      ]);
    },
    refreshSelectedPath: deps.fetchFileContent,
  });

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
          fileChangeHandler.handleFileChange(message.data as FileChangeMessage);
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
    fileChangeHandler.dispose();
    if (ws !== null) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  }

  return { connect, disconnect };
}
