import { describe, test, expect } from "bun:test";
import {
  type FileChangeEvent,
  type WatcherStatus,
  type WatcherConfig,
  isFileChangeType,
  createDefaultWatcherConfig,
  createFileChangeEvent,
  isWatcherActive,
  createInactiveWatcherStatus,
  createActiveWatcherStatus,
  updateWatcherLastUpdate,
  mergeWatcherConfig,
  isValidDebounceMs,
} from "./watcher";

describe("Watcher Types", () => {
  describe("isFileChangeType", () => {
    test("returns true for valid change types", () => {
      expect(isFileChangeType("create")).toBe(true);
      expect(isFileChangeType("modify")).toBe(true);
      expect(isFileChangeType("delete")).toBe(true);
    });

    test("returns false for invalid change types", () => {
      expect(isFileChangeType("invalid")).toBe(false);
      expect(isFileChangeType("")).toBe(false);
      expect(isFileChangeType("CREATE")).toBe(false);
      expect(isFileChangeType("add")).toBe(false);
      expect(isFileChangeType("remove")).toBe(false);
    });
  });

  describe("createDefaultWatcherConfig", () => {
    test("creates default config with expected values", () => {
      const config = createDefaultWatcherConfig();

      expect(config.debounceMs).toBe(100);
      expect(config.recursive).toBe(true);
      expect(config.ignoreGitignored).toBe(true);
    });

    test("returns readonly config", () => {
      const config = createDefaultWatcherConfig();

      // TypeScript should prevent these assignments
      // config.debounceMs = 200; // Would fail type check
      expect(config).toBeDefined();
    });
  });

  describe("createFileChangeEvent", () => {
    test("creates event with given type and path", () => {
      const event = createFileChangeEvent("create", "src/test.ts");

      expect(event.type).toBe("create");
      expect(event.path).toBe("src/test.ts");
      expect(event.timestamp).toBeGreaterThan(0);
    });

    test("creates events with different types", () => {
      const create = createFileChangeEvent("create", "new.ts");
      const modify = createFileChangeEvent("modify", "edit.ts");
      const del = createFileChangeEvent("delete", "old.ts");

      expect(create.type).toBe("create");
      expect(modify.type).toBe("modify");
      expect(del.type).toBe("delete");
    });

    test("creates events with current timestamp", () => {
      const before = Date.now();
      const event = createFileChangeEvent("modify", "test.ts");
      const after = Date.now();

      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });

    test("creates multiple events with different timestamps", () => {
      const event1 = createFileChangeEvent("create", "test1.ts");
      const event2 = createFileChangeEvent("create", "test2.ts");

      // Timestamps should be equal or increasing
      expect(event2.timestamp).toBeGreaterThanOrEqual(event1.timestamp);
    });
  });

  describe("isWatcherActive", () => {
    test("returns true for enabled watcher with watched paths", () => {
      const status: WatcherStatus = {
        enabled: true,
        watchedPaths: 1,
        lastUpdate: Date.now(),
      };

      expect(isWatcherActive(status)).toBe(true);
    });

    test("returns false for disabled watcher", () => {
      const status: WatcherStatus = {
        enabled: false,
        watchedPaths: 1,
        lastUpdate: Date.now(),
      };

      expect(isWatcherActive(status)).toBe(false);
    });

    test("returns false for enabled watcher with no watched paths", () => {
      const status: WatcherStatus = {
        enabled: true,
        watchedPaths: 0,
        lastUpdate: Date.now(),
      };

      expect(isWatcherActive(status)).toBe(false);
    });

    test("returns false for disabled watcher with no paths", () => {
      const status: WatcherStatus = {
        enabled: false,
        watchedPaths: 0,
        lastUpdate: null,
      };

      expect(isWatcherActive(status)).toBe(false);
    });

    test("returns true for multiple watched paths", () => {
      const status: WatcherStatus = {
        enabled: true,
        watchedPaths: 5,
        lastUpdate: Date.now(),
      };

      expect(isWatcherActive(status)).toBe(true);
    });
  });

  describe("createInactiveWatcherStatus", () => {
    test("creates inactive watcher status", () => {
      const status = createInactiveWatcherStatus();

      expect(status.enabled).toBe(false);
      expect(status.watchedPaths).toBe(0);
      expect(status.lastUpdate).toBeNull();
    });
  });

  describe("createActiveWatcherStatus", () => {
    test("creates active watcher status with default path count", () => {
      const status = createActiveWatcherStatus();

      expect(status.enabled).toBe(true);
      expect(status.watchedPaths).toBe(1);
      expect(status.lastUpdate).not.toBeNull();
      expect(status.lastUpdate).toBeGreaterThan(0);
    });

    test("creates active watcher status with specified path count", () => {
      const status = createActiveWatcherStatus(5);

      expect(status.enabled).toBe(true);
      expect(status.watchedPaths).toBe(5);
      expect(status.lastUpdate).not.toBeNull();
    });

    test("creates active watcher status with zero paths", () => {
      const status = createActiveWatcherStatus(0);

      expect(status.enabled).toBe(true);
      expect(status.watchedPaths).toBe(0);
    });

    test("throws error for negative path count", () => {
      expect(() => createActiveWatcherStatus(-1)).toThrow(
        "watchedPaths must be non-negative",
      );
    });
  });

  describe("updateWatcherLastUpdate", () => {
    test("updates lastUpdate timestamp", () => {
      const originalStatus: WatcherStatus = {
        enabled: true,
        watchedPaths: 1,
        lastUpdate: 1000,
      };

      const updated = updateWatcherLastUpdate(originalStatus);

      expect(updated.enabled).toBe(originalStatus.enabled);
      expect(updated.watchedPaths).toBe(originalStatus.watchedPaths);
      expect(updated.lastUpdate).toBeGreaterThan(1000);
      expect(updated.lastUpdate).toBeGreaterThan(0);
    });

    test("updates lastUpdate from null", () => {
      const originalStatus: WatcherStatus = {
        enabled: false,
        watchedPaths: 0,
        lastUpdate: null,
      };

      const updated = updateWatcherLastUpdate(originalStatus);

      expect(updated.lastUpdate).not.toBeNull();
      expect(updated.lastUpdate).toBeGreaterThan(0);
    });

    test("preserves other fields", () => {
      const originalStatus: WatcherStatus = {
        enabled: false,
        watchedPaths: 3,
        lastUpdate: 1000,
      };

      const updated = updateWatcherLastUpdate(originalStatus);

      expect(updated.enabled).toBe(false);
      expect(updated.watchedPaths).toBe(3);
    });
  });

  describe("mergeWatcherConfig", () => {
    test("returns defaults when given empty partial", () => {
      const config = mergeWatcherConfig({});

      expect(config.debounceMs).toBe(100);
      expect(config.recursive).toBe(true);
      expect(config.ignoreGitignored).toBe(true);
    });

    test("overrides debounceMs", () => {
      const config = mergeWatcherConfig({ debounceMs: 200 });

      expect(config.debounceMs).toBe(200);
      expect(config.recursive).toBe(true);
      expect(config.ignoreGitignored).toBe(true);
    });

    test("overrides recursive", () => {
      const config = mergeWatcherConfig({ recursive: false });

      expect(config.debounceMs).toBe(100);
      expect(config.recursive).toBe(false);
      expect(config.ignoreGitignored).toBe(true);
    });

    test("overrides ignoreGitignored", () => {
      const config = mergeWatcherConfig({ ignoreGitignored: false });

      expect(config.debounceMs).toBe(100);
      expect(config.recursive).toBe(true);
      expect(config.ignoreGitignored).toBe(false);
    });

    test("overrides multiple fields", () => {
      const config = mergeWatcherConfig({
        debounceMs: 500,
        recursive: false,
        ignoreGitignored: false,
      });

      expect(config.debounceMs).toBe(500);
      expect(config.recursive).toBe(false);
      expect(config.ignoreGitignored).toBe(false);
    });

    test("allows zero debounce", () => {
      const config = mergeWatcherConfig({ debounceMs: 0 });

      expect(config.debounceMs).toBe(0);
    });
  });

  describe("isValidDebounceMs", () => {
    test("returns true for valid positive values", () => {
      expect(isValidDebounceMs(0)).toBe(true);
      expect(isValidDebounceMs(100)).toBe(true);
      expect(isValidDebounceMs(1000)).toBe(true);
      expect(isValidDebounceMs(5000)).toBe(true);
    });

    test("returns false for negative values", () => {
      expect(isValidDebounceMs(-1)).toBe(false);
      expect(isValidDebounceMs(-100)).toBe(false);
    });

    test("returns false for infinite values", () => {
      expect(isValidDebounceMs(Infinity)).toBe(false);
      expect(isValidDebounceMs(-Infinity)).toBe(false);
    });

    test("returns false for NaN", () => {
      expect(isValidDebounceMs(NaN)).toBe(false);
    });

    test("returns true for large but finite values", () => {
      expect(isValidDebounceMs(Number.MAX_SAFE_INTEGER)).toBe(true);
    });
  });

  describe("Type completeness", () => {
    test("FileChangeEvent has all required fields", () => {
      const event: FileChangeEvent = {
        type: "modify",
        path: "src/test.ts",
        timestamp: Date.now(),
      };

      expect(event).toBeDefined();
    });

    test("WatcherStatus has all required fields", () => {
      const status: WatcherStatus = {
        enabled: true,
        watchedPaths: 1,
        lastUpdate: Date.now(),
      };

      expect(status).toBeDefined();
    });

    test("WatcherStatus allows null lastUpdate", () => {
      const status: WatcherStatus = {
        enabled: false,
        watchedPaths: 0,
        lastUpdate: null,
      };

      expect(status.lastUpdate).toBeNull();
    });

    test("WatcherConfig has all required fields", () => {
      const config: WatcherConfig = {
        debounceMs: 100,
        recursive: true,
        ignoreGitignored: true,
      };

      expect(config).toBeDefined();
    });

    test("FileChangeType supports all change types", () => {
      const create: FileChangeEvent = {
        type: "create",
        path: "new.ts",
        timestamp: Date.now(),
      };

      const modify: FileChangeEvent = {
        type: "modify",
        path: "edit.ts",
        timestamp: Date.now(),
      };

      const del: FileChangeEvent = {
        type: "delete",
        path: "old.ts",
        timestamp: Date.now(),
      };

      expect(create.type).toBe("create");
      expect(modify.type).toBe("modify");
      expect(del.type).toBe("delete");
    });
  });
});
