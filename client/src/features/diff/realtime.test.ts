import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createDiffRealtimeController } from "./realtime";

type MockSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close: () => void;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createDiffRealtimeController", () => {
  const sockets: MockSocket[] = [];

  beforeEach(() => {
    sockets.length = 0;
  });

  afterEach(() => {
    mock.restore();
  });

  test("refreshes the active diff after a file-change event", async () => {
    const refreshDiff = mock(async () => {});
    const diffRealtimeController = createDiffRealtimeController({
      debounceMs: 20,
      locationSource: {
        protocol: "http:",
        host: "localhost:7155",
      },
      webSocketFactory: (_url: string) => {
        const socket: MockSocket = {
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
          readyState: WebSocket.CONNECTING,
          close: () => {
            socket.readyState = WebSocket.CLOSED;
          },
        };
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      getContextId: () => "ctx-1",
      getProjectPath: () => "/repo/active",
      getSelectedPath: () => "src/main.ts",
      refreshDiff,
    });

    diffRealtimeController.connect();
    const activeSocket = sockets[0];
    expect(activeSocket).toBeDefined();

    activeSocket?.onmessage?.({
      data: JSON.stringify({
        event: "file-change",
        data: {
          projectPath: "/repo/active",
          changes: [{ type: "modify", path: "src/main.ts", timestamp: 1 }],
        },
      }),
    });

    await wait(30);

    expect(refreshDiff).toHaveBeenCalledWith("ctx-1");
    diffRealtimeController.disconnect();
  });

  test("ignores malformed realtime payloads", async () => {
    const refreshDiff = mock(async () => {});
    const diffRealtimeController = createDiffRealtimeController({
      debounceMs: 20,
      locationSource: {
        protocol: "http:",
        host: "localhost:7155",
      },
      webSocketFactory: (_url: string) => {
        const socket: MockSocket = {
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
          readyState: WebSocket.CONNECTING,
          close: () => {
            socket.readyState = WebSocket.CLOSED;
          },
        };
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      getContextId: () => "ctx-1",
      getProjectPath: () => "/repo/active",
      getSelectedPath: () => null,
      refreshDiff,
    });

    diffRealtimeController.connect();
    sockets[0]?.onmessage?.({
      data: "{",
    });
    await wait(30);

    expect(refreshDiff).not.toHaveBeenCalled();
    diffRealtimeController.disconnect();
  });
});
