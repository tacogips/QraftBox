/**
 * Tests for WebSocket Broadcast for File Watcher
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createWatcherBroadcaster } from "./broadcast.js";
import type { FileWatcher } from "./index.js";
import type { WebSocketManager } from "../websocket/index.js";
import type { FileChangeEvent } from "../../types/watcher.js";
import { createFileChangeEvent } from "../../types/watcher.js";

describe("createWatcherBroadcaster", () => {
  let mockWatcher: FileWatcher;
  let mockWsManager: WebSocketManager;
  let registeredHandler:
    | ((events: readonly FileChangeEvent[]) => void)
    | undefined;

  beforeEach(() => {
    // Reset handler capture
    registeredHandler = undefined;

    // Create mock FileWatcher that captures handler registration
    mockWatcher = {
      start: mock(() => Promise.resolve()),
      stop: mock(() => Promise.resolve()),
      getStatus: mock(() => ({
        enabled: true,
        watchedPaths: 1,
        lastUpdate: Date.now(),
      })),
      onFileChange: mock((handler) => {
        registeredHandler = handler;
      }),
    };

    // Create mock WebSocketManager
    mockWsManager = {
      handleOpen: mock(() => {}),
      handleClose: mock(() => {}),
      handleMessage: mock(() => {}),
      broadcast: mock(() => {}),
      getClientCount: mock(() => 0),
      close: mock(() => {}),
    };
  });

  describe("initialization", () => {
    test("registers handler on watcher immediately", () => {
      createWatcherBroadcaster(mockWatcher, mockWsManager);

      expect(mockWatcher.onFileChange).toHaveBeenCalledTimes(1);
      expect(registeredHandler).toBeDefined();
    });

    test("does not broadcast before start", () => {
      createWatcherBroadcaster(mockWatcher, mockWsManager);

      const events = [createFileChangeEvent("modify", "test.ts")];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).not.toHaveBeenCalled();
    });
  });

  describe("start", () => {
    test("enables broadcasting", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);

      broadcaster.start();

      const events = [createFileChangeEvent("modify", "test.ts")];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);
    });

    test("can be called multiple times safely", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);

      broadcaster.start();
      broadcaster.start();
      broadcaster.start();

      const events = [createFileChangeEvent("modify", "test.ts")];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop", () => {
    test("disables broadcasting", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);

      broadcaster.start();
      const events1 = [createFileChangeEvent("modify", "test1.ts")];
      registeredHandler?.(events1);
      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);

      broadcaster.stop();
      const events2 = [createFileChangeEvent("modify", "test2.ts")];
      registeredHandler?.(events2);

      // Still only called once (before stop)
      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);
    });

    test("can be called multiple times safely", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);

      broadcaster.start();
      broadcaster.stop();
      broadcaster.stop();
      broadcaster.stop();

      const events = [createFileChangeEvent("modify", "test.ts")];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).not.toHaveBeenCalled();
    });

    test("can be called before start", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);

      broadcaster.stop();

      const events = [createFileChangeEvent("modify", "test.ts")];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).not.toHaveBeenCalled();
    });
  });

  describe("lifecycle", () => {
    test("supports start/stop/restart cycle", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);

      // Start
      broadcaster.start();
      const events1 = [createFileChangeEvent("modify", "test1.ts")];
      registeredHandler?.(events1);
      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);

      // Stop
      broadcaster.stop();
      const events2 = [createFileChangeEvent("modify", "test2.ts")];
      registeredHandler?.(events2);
      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);

      // Restart
      broadcaster.start();
      const events3 = [createFileChangeEvent("modify", "test3.ts")];
      registeredHandler?.(events3);
      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(2);
    });
  });

  describe("event formatting", () => {
    test("broadcasts with 'file-change' event type", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      const events = [createFileChangeEvent("modify", "test.ts")];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);
      expect(mockWsManager.broadcast).toHaveBeenCalledWith(
        "file-change",
        expect.anything(),
      );
    });

    test("wraps events in changes array", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      const events = [
        createFileChangeEvent("create", "new.ts"),
        createFileChangeEvent("modify", "existing.ts"),
      ];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).toHaveBeenCalledWith("file-change", {
        changes: events,
      });
    });

    test("preserves all event properties", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      const event = createFileChangeEvent("delete", "removed.ts");
      registeredHandler?.([event]);

      const broadcastCall = (mockWsManager.broadcast as ReturnType<typeof mock>)
        .mock.calls[0];
      expect(broadcastCall).toBeDefined();

      const [eventType, data] = broadcastCall as [
        string,
        { changes: FileChangeEvent[] },
      ];
      expect(eventType).toBe("file-change");
      expect(data.changes).toHaveLength(1);
      expect(data.changes[0]).toEqual({
        type: "delete",
        path: "removed.ts",
        timestamp: expect.any(Number),
      });
    });
  });

  describe("batch handling", () => {
    test("broadcasts single event", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      const events = [createFileChangeEvent("modify", "single.ts")];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);
      const broadcastCall = (mockWsManager.broadcast as ReturnType<typeof mock>)
        .mock.calls[0];
      const [, data] = broadcastCall as [
        string,
        { changes: FileChangeEvent[] },
      ];
      expect(data.changes).toHaveLength(1);
    });

    test("broadcasts multiple events together", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      const events = [
        createFileChangeEvent("create", "a.ts"),
        createFileChangeEvent("modify", "b.ts"),
        createFileChangeEvent("delete", "c.ts"),
      ];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);
      const broadcastCall = (mockWsManager.broadcast as ReturnType<typeof mock>)
        .mock.calls[0];
      const [, data] = broadcastCall as [
        string,
        { changes: FileChangeEvent[] },
      ];
      expect(data.changes).toHaveLength(3);
    });

    test("skips empty event arrays", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      registeredHandler?.([]);

      expect(mockWsManager.broadcast).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    test("handles broadcast errors gracefully", () => {
      const errorMessage = "WebSocket send failed";
      mockWsManager.broadcast = mock(() => {
        throw new Error(errorMessage);
      });

      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      const events = [createFileChangeEvent("modify", "test.ts")];

      // Should not throw
      expect(() => {
        registeredHandler?.(events);
      }).not.toThrow();
    });

    test("continues after broadcast error", () => {
      let callCount = 0;
      mockWsManager.broadcast = mock(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error("First call fails");
        }
      });

      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      // First call throws
      const events1 = [createFileChangeEvent("modify", "test1.ts")];
      registeredHandler?.(events1);

      // Second call succeeds
      const events2 = [createFileChangeEvent("modify", "test2.ts")];
      registeredHandler?.(events2);

      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(2);
    });

    test("handles non-Error thrown objects", () => {
      mockWsManager.broadcast = mock(() => {
        throw "string error";
      });

      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      const events = [createFileChangeEvent("modify", "test.ts")];

      expect(() => {
        registeredHandler?.(events);
      }).not.toThrow();
    });
  });

  describe("integration scenarios", () => {
    test("handles rapid start/stop cycles", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);

      for (let i = 0; i < 10; i++) {
        broadcaster.start();
        broadcaster.stop();
      }

      const events = [createFileChangeEvent("modify", "test.ts")];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).not.toHaveBeenCalled();
    });

    test("handles events during state transitions", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);

      broadcaster.start();
      const events1 = [createFileChangeEvent("modify", "test1.ts")];
      registeredHandler?.(events1);

      broadcaster.stop();
      broadcaster.start();

      const events2 = [createFileChangeEvent("modify", "test2.ts")];
      registeredHandler?.(events2);

      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(2);
    });

    test("works with readonly event arrays", () => {
      const broadcaster = createWatcherBroadcaster(mockWatcher, mockWsManager);
      broadcaster.start();

      // Readonly array (as specified in FileWatcher interface)
      const events: readonly FileChangeEvent[] = [
        createFileChangeEvent("modify", "test.ts"),
      ];
      registeredHandler?.(events);

      expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1);
    });
  });
});
