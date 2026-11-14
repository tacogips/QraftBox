import { describe, test, expect, mock } from "bun:test";
import { createWebSocketManager } from "./index";
import type { ServerWebSocket } from "bun";
import type { WebSocketMessage } from "./index";

/**
 * Mock ServerWebSocket for testing
 *
 * Creates a minimal mock that implements the ServerWebSocket interface
 * without requiring a real Bun server. Uses type assertion to bypass
 * strict type checking for test mocks.
 */
function createMockWebSocket(
  readyState: 0 | 1 | 2 | 3 = 1,
): ServerWebSocket<unknown> {
  const mock_ws = {
    readyState, // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    send: mock(() => {}),
    close: mock(() => {}),
    sendText: mock(() => 0),
    sendBinary: mock(() => 0),
    terminate: mock(() => {}),
    // Add other required properties for ServerWebSocket
    data: undefined,
    remoteAddress: "",
    binaryType: "nodebuffer" as const,
    ping: mock(() => 0),
    pong: mock(() => 0),
    publish: mock(() => 0),
    publishText: mock(() => 0),
    publishBinary: mock(() => 0),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    cork: mock((cb: () => void) => cb()),
    isSubscribed: mock(() => false),
  };

  return mock_ws as unknown as ServerWebSocket<unknown>;
}

describe("WebSocketManager", () => {
  describe("createWebSocketManager", () => {
    test("creates manager instance", () => {
      const manager = createWebSocketManager();
      expect(manager).toBeDefined();
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe("handleOpen", () => {
    test("tracks new connection", () => {
      const manager = createWebSocketManager();
      const ws = createMockWebSocket();

      manager.handleOpen(ws);
      expect(manager.getClientCount()).toBe(1);
    });

    test("tracks multiple connections", () => {
      const manager = createWebSocketManager();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.handleOpen(ws1);
      manager.handleOpen(ws2);

      expect(manager.getClientCount()).toBe(2);
    });
  });

  describe("handleClose", () => {
    test("removes disconnected client", () => {
      const manager = createWebSocketManager();
      const ws = createMockWebSocket();

      manager.handleOpen(ws);
      expect(manager.getClientCount()).toBe(1);

      manager.handleClose(ws);
      expect(manager.getClientCount()).toBe(0);
    });

    test("handles close for unknown client", () => {
      const manager = createWebSocketManager();
      const ws = createMockWebSocket();

      // Close without opening should not throw
      manager.handleClose(ws);
      expect(manager.getClientCount()).toBe(0);
    });

    test("removes only specified client", () => {
      const manager = createWebSocketManager();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.handleOpen(ws1);
      manager.handleOpen(ws2);
      expect(manager.getClientCount()).toBe(2);

      manager.handleClose(ws1);
      expect(manager.getClientCount()).toBe(1);
    });
  });

  describe("handleMessage", () => {
    test("handles ping message with pong response", () => {
      const manager = createWebSocketManager();
      const ws = createMockWebSocket();
      const sendMock = ws.send as ReturnType<typeof mock>;

      manager.handleOpen(ws);

      const pingMessage: WebSocketMessage = {
        event: "ping",
        data: { timestamp: Date.now() },
      };

      manager.handleMessage(ws, JSON.stringify(pingMessage));

      expect(sendMock).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse(
        sendMock.mock.calls[0]?.[0] as string,
      ) as WebSocketMessage;
      expect(sentMessage.event).toBe("pong");
      expect(sentMessage.data).toEqual(pingMessage.data);
    });

    test("handles Buffer message", () => {
      const manager = createWebSocketManager();
      const ws = createMockWebSocket();
      const sendMock = ws.send as ReturnType<typeof mock>;

      manager.handleOpen(ws);

      const pingMessage: WebSocketMessage = {
        event: "ping",
        data: null,
      };

      const buffer = Buffer.from(JSON.stringify(pingMessage));
      manager.handleMessage(ws, buffer);

      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    test("handles invalid JSON gracefully", () => {
      const manager = createWebSocketManager();
      const ws = createMockWebSocket();

      manager.handleOpen(ws);

      // Should not throw
      manager.handleMessage(ws, "invalid json");
      expect(manager.getClientCount()).toBe(1); // Client still connected
    });

    test("logs non-ping messages without response", () => {
      const manager = createWebSocketManager();
      const ws = createMockWebSocket();
      const sendMock = ws.send as ReturnType<typeof mock>;

      manager.handleOpen(ws);

      const customMessage: WebSocketMessage = {
        event: "custom",
        data: { foo: "bar" },
      };

      manager.handleMessage(ws, JSON.stringify(customMessage));

      // Should not send response for non-ping messages
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe("broadcast", () => {
    test("broadcasts to all connected clients", () => {
      const manager = createWebSocketManager();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const sendMock1 = ws1.send as ReturnType<typeof mock>;
      const sendMock2 = ws2.send as ReturnType<typeof mock>;

      manager.handleOpen(ws1);
      manager.handleOpen(ws2);

      manager.broadcast("test-event", { message: "hello" });

      expect(sendMock1).toHaveBeenCalledTimes(1);
      expect(sendMock2).toHaveBeenCalledTimes(1);

      const message1 = JSON.parse(
        sendMock1.mock.calls[0]?.[0] as string,
      ) as WebSocketMessage;
      const message2 = JSON.parse(
        sendMock2.mock.calls[0]?.[0] as string,
      ) as WebSocketMessage;

      expect(message1.event).toBe("test-event");
      expect(message1.data).toEqual({ message: "hello" });
      expect(message2.event).toBe("test-event");
      expect(message2.data).toEqual({ message: "hello" });
    });

    test("skips clients not in OPEN state", () => {
      const manager = createWebSocketManager();
      const ws1 = createMockWebSocket(1); // OPEN
      const ws2 = createMockWebSocket(2); // CLOSING
      const sendMock1 = ws1.send as ReturnType<typeof mock>;
      const sendMock2 = ws2.send as ReturnType<typeof mock>;

      manager.handleOpen(ws1);
      manager.handleOpen(ws2);

      manager.broadcast("test-event", { message: "hello" });

      // Only ws1 should receive the message
      expect(sendMock1).toHaveBeenCalledTimes(1);
      expect(sendMock2).not.toHaveBeenCalled();
    });

    test("handles send error gracefully", () => {
      const manager = createWebSocketManager();
      const ws = createMockWebSocket();

      // Make send throw error
      (ws.send as ReturnType<typeof mock>).mockImplementation(() => {
        throw new Error("Send failed");
      });

      manager.handleOpen(ws);

      // Should not throw
      manager.broadcast("test-event", { message: "hello" });

      expect(manager.getClientCount()).toBe(1); // Client still tracked
    });

    test("broadcasts to no clients when none connected", () => {
      const manager = createWebSocketManager();

      // Should not throw
      manager.broadcast("test-event", { message: "hello" });
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe("getClientCount", () => {
    test("returns zero for new manager", () => {
      const manager = createWebSocketManager();
      expect(manager.getClientCount()).toBe(0);
    });

    test("returns correct count after connections", () => {
      const manager = createWebSocketManager();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();

      manager.handleOpen(ws1);
      expect(manager.getClientCount()).toBe(1);

      manager.handleOpen(ws2);
      expect(manager.getClientCount()).toBe(2);

      manager.handleOpen(ws3);
      expect(manager.getClientCount()).toBe(3);
    });

    test("returns correct count after disconnections", () => {
      const manager = createWebSocketManager();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.handleOpen(ws1);
      manager.handleOpen(ws2);
      expect(manager.getClientCount()).toBe(2);

      manager.handleClose(ws1);
      expect(manager.getClientCount()).toBe(1);

      manager.handleClose(ws2);
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe("close", () => {
    test("closes all connections", () => {
      const manager = createWebSocketManager();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const closeMock1 = ws1.close as ReturnType<typeof mock>;
      const closeMock2 = ws2.close as ReturnType<typeof mock>;

      manager.handleOpen(ws1);
      manager.handleOpen(ws2);
      expect(manager.getClientCount()).toBe(2);

      manager.close();

      expect(closeMock1).toHaveBeenCalledTimes(1);
      expect(closeMock2).toHaveBeenCalledTimes(1);
      expect(manager.getClientCount()).toBe(0);
    });

    test("handles close error gracefully", () => {
      const manager = createWebSocketManager();
      const ws = createMockWebSocket();

      // Make close throw error
      (ws.close as ReturnType<typeof mock>).mockImplementation(() => {
        throw new Error("Close failed");
      });

      manager.handleOpen(ws);

      // Should not throw
      manager.close();

      expect(manager.getClientCount()).toBe(0);
    });

    test("closes when no clients connected", () => {
      const manager = createWebSocketManager();

      // Should not throw
      manager.close();
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe("integration scenario", () => {
    test("handles complete lifecycle", () => {
      const manager = createWebSocketManager();

      // Connect clients
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      manager.handleOpen(ws1);
      manager.handleOpen(ws2);
      expect(manager.getClientCount()).toBe(2);

      // Receive ping from client 1
      const pingMessage: WebSocketMessage = {
        event: "ping",
        data: { timestamp: 123 },
      };
      manager.handleMessage(ws1, JSON.stringify(pingMessage));

      const sendMock1 = ws1.send as ReturnType<typeof mock>;
      expect(sendMock1).toHaveBeenCalled();

      // Broadcast to all clients
      manager.broadcast("update", { value: 42 });

      const sendMock2 = ws2.send as ReturnType<typeof mock>;
      expect(sendMock1.mock.calls.length).toBeGreaterThan(0);
      expect(sendMock2).toHaveBeenCalled();

      // Disconnect one client
      manager.handleClose(ws1);
      expect(manager.getClientCount()).toBe(1);

      // Close all
      manager.close();
      expect(manager.getClientCount()).toBe(0);
    });
  });
});
