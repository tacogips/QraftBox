import {
  createFileChangeHandler,
  type FileChangeMessage,
} from "../../../../client-shared/src/realtime/file-change-handler";

interface RealtimeMessage {
  readonly event: string;
  readonly data: unknown;
}

export interface DiffRealtimeController {
  connect(): void;
  disconnect(): void;
}

export interface CreateDiffRealtimeControllerOptions {
  readonly debounceMs?: number | undefined;
  readonly webSocketFactory?: ((url: string) => WebSocket) | undefined;
  readonly locationSource?: Pick<Location, "protocol" | "host"> | undefined;
  getContextId(): string | null;
  getProjectPath(): string;
  getSelectedPath(): string | null;
  markAllFilesTreeStale?(): void;
  refreshDiff(contextId: string): Promise<void> | void;
  refreshSelectedPath?(
    contextId: string,
    selectedPath: string,
  ): Promise<void> | void;
}

export function createDiffRealtimeController(
  options: CreateDiffRealtimeControllerOptions,
): DiffRealtimeController {
  const webSocketFactory =
    options.webSocketFactory ?? ((url) => new WebSocket(url));
  const locationSource = options.locationSource ?? window.location;
  const fileChangeHandler = createFileChangeHandler({
    debounceMs: options.debounceMs,
    getContextId: options.getContextId,
    getProjectPath: options.getProjectPath,
    getSelectedPath: options.getSelectedPath,
    markStale: options.markAllFilesTreeStale ?? (() => {}),
    refreshContext: options.refreshDiff,
    refreshSelectedPath: options.refreshSelectedPath,
  });
  let webSocket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;

  function connect(): void {
    if (webSocket !== null && webSocket.readyState <= WebSocket.OPEN) {
      return;
    }

    const protocol = locationSource.protocol === "https:" ? "wss:" : "ws:";
    webSocket = webSocketFactory(`${protocol}//${locationSource.host}/ws`);

    webSocket.onopen = () => {
      reconnectDelay = 1000;
    };

    webSocket.onmessage = (event) => {
      try {
        const realtimeMessage = JSON.parse(event.data) as RealtimeMessage;
        if (realtimeMessage.event === "file-change") {
          fileChangeHandler.handleFileChange(
            realtimeMessage.data as FileChangeMessage,
          );
        }
      } catch {
        // Ignore malformed realtime payloads.
      }
    };

    webSocket.onclose = () => {
      webSocket = null;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
        connect();
      }, reconnectDelay);
    };

    webSocket.onerror = () => {
      // Reconnect is handled by onclose.
    };
  }

  function disconnect(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    fileChangeHandler.dispose();
    if (webSocket !== null) {
      webSocket.onclose = null;
      webSocket.close();
      webSocket = null;
    }
  }

  return {
    connect,
    disconnect,
  };
}
