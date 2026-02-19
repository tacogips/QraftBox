import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createAppRealtimeController } from "./app-realtime";

type MockSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close: () => void;
  send: (_data: string) => void;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createAppRealtimeController", () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalLocation = globalThis.location;
  const sockets: MockSocket[] = [];

  beforeEach(() => {
    sockets.length = 0;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { protocol: "http:", host: "localhost:7155" },
    });

    class TestWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      public onopen: (() => void) | null = null;
      public onmessage: ((event: { data: string }) => void) | null = null;
      public onclose: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      public readyState = TestWebSocket.CONNECTING;

      constructor(_url: string) {
        sockets.push(this);
      }

      close(): void {
        this.readyState = TestWebSocket.CLOSED;
      }

      send(_data: string): void {}
    }

    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: TestWebSocket,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: originalWebSocket,
    });
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  test("reloads selected file content when selected file changes in active project", async () => {
    const fetchDiff = mock(async () => {});
    const refreshAllFiles = mock(async () => {});
    const fetchFileContent = mock(async () => {});

    const controller = createAppRealtimeController({
      getContextId: () => "ctx-1",
      getProjectPath: () => "/repo/active",
      getSelectedPath: () => "src/main.ts",
      getFileTreeMode: () => "all",
      markAllFilesTreeStale: mock(() => {}),
      fetchDiff,
      refreshAllFiles,
      fetchFileContent,
      setPromptQueue: mock(() => {}),
      setQueueStatus: mock(() => {}),
      fetchActiveSessions: mock(async () => {}),
    });

    controller.connect();
    const socket = sockets[0];
    expect(socket).toBeDefined();

    socket?.onmessage?.({
      data: JSON.stringify({
        event: "file-change",
        data: {
          projectPath: "/repo/active",
          changes: [{ type: "modify", path: "src/main.ts", timestamp: 1 }],
        },
      }),
    });

    await wait(550);

    expect(fetchFileContent).toHaveBeenCalledWith("ctx-1", "src/main.ts");
    expect(fetchDiff).toHaveBeenCalledWith("ctx-1");
    expect(refreshAllFiles).toHaveBeenCalledWith("ctx-1");

    controller.disconnect();
  });

  test("does not reload selected file when change belongs to another project", async () => {
    const fetchFileContent = mock(async () => {});

    const controller = createAppRealtimeController({
      getContextId: () => "ctx-1",
      getProjectPath: () => "/repo/active",
      getSelectedPath: () => "src/main.ts",
      getFileTreeMode: () => "all",
      markAllFilesTreeStale: mock(() => {}),
      fetchDiff: mock(async () => {}),
      refreshAllFiles: mock(async () => {}),
      fetchFileContent,
      setPromptQueue: mock(() => {}),
      setQueueStatus: mock(() => {}),
      fetchActiveSessions: mock(async () => {}),
    });

    controller.connect();
    const socket = sockets[0];
    expect(socket).toBeDefined();

    socket?.onmessage?.({
      data: JSON.stringify({
        event: "file-change",
        data: {
          projectPath: "/repo/other",
          changes: [{ type: "modify", path: "src/main.ts", timestamp: 1 }],
        },
      }),
    });

    await wait(50);
    expect(fetchFileContent).not.toHaveBeenCalled();

    controller.disconnect();
  });
});
