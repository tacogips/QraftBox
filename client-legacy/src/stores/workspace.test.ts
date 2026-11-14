/**
 * Unit tests for workspace store
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  createWorkspaceStore,
  initialWorkspaceState,
  type WorkspaceStore,
} from "./workspace";

/**
 * Mock localStorage for testing
 */
class LocalStorageMock {
  private store: Map<string, string>;

  constructor() {
    this.store = new Map();
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
}

// Setup global localStorage mock
globalThis.localStorage = new LocalStorageMock() as Storage;

describe("Workspace Store", () => {
  let store: WorkspaceStore;

  beforeEach(() => {
    store = createWorkspaceStore();
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Initial State", () => {
    test("should have empty tabs initially", () => {
      expect(store.tabs).toEqual([]);
    });

    test("should have no active tab initially", () => {
      expect(store.activeTabId).toBeNull();
    });

    test("should have picker closed initially", () => {
      expect(store.isPickerOpen).toBe(false);
    });

    test("should have empty recent directories initially", () => {
      expect(store.recentDirectories).toEqual([]);
    });

    test("should not be loading initially", () => {
      expect(store.loading).toBe(false);
    });

    test("should have no error initially", () => {
      expect(store.error).toBeNull();
    });

    test("initial state matches exported constant", () => {
      const store = createWorkspaceStore();
      expect(store.tabs).toEqual(initialWorkspaceState.tabs);
      expect(store.activeTabId).toEqual(initialWorkspaceState.activeTabId);
      expect(store.isPickerOpen).toEqual(initialWorkspaceState.isPickerOpen);
      expect(store.recentDirectories).toEqual(
        initialWorkspaceState.recentDirectories,
      );
      expect(store.loading).toEqual(initialWorkspaceState.loading);
      expect(store.error).toEqual(initialWorkspaceState.error);
    });
  });

  describe("openDirectory()", () => {
    test("should open a new directory tab", async () => {
      await store.openDirectory("/test/path");

      expect(store.tabs.length).toBe(1);
      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;

      expect(tab.path).toBe("/test/path");
      expect(tab.name).toBe("path");
      expect(tab.repositoryRoot).toBe("/test/path");
      expect(tab.isGitRepo).toBe(false);
    });

    test("should activate newly opened tab", async () => {
      await store.openDirectory("/test/path");

      expect(store.activeTabId).not.toBeNull();
      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;

      expect(store.activeTabId).toBe(tab.id);
    });

    test("should close picker after opening directory", async () => {
      store.openPicker();
      expect(store.isPickerOpen).toBe(true);

      await store.openDirectory("/test/path");

      expect(store.isPickerOpen).toBe(false);
    });

    test("should add directory to recent directories", async () => {
      await store.openDirectory("/test/path");

      expect(store.recentDirectories.length).toBe(1);
      const recent = store.recentDirectories[0];
      expect(recent).toBeDefined();
      if (recent === undefined) return;

      expect(recent.path).toBe("/test/path");
      expect(recent.name).toBe("path");
      expect(recent.isGitRepo).toBe(false);
    });

    test("should extract directory name correctly", async () => {
      const testCases = [
        { path: "/home/user/project", expectedName: "project" },
        { path: "/home/user/my-app/", expectedName: "my-app" },
        { path: "C:\\Users\\test\\folder", expectedName: "folder" },
        { path: "/", expectedName: "/" },
      ];

      for (const { path, expectedName } of testCases) {
        const newStore = createWorkspaceStore();
        await newStore.openDirectory(path);
        const tab = newStore.tabs[0];
        expect(tab).toBeDefined();
        if (tab === undefined) continue;
        expect(tab.name).toBe(expectedName);
      }
    });

    test("should switch to existing tab if path already open", async () => {
      await store.openDirectory("/test/path");
      const firstTab = store.tabs[0];
      expect(firstTab).toBeDefined();
      if (firstTab === undefined) return;
      const firstTabId = firstTab.id;

      // Open another directory
      await store.openDirectory("/other/path");
      expect(store.tabs.length).toBe(2);

      // Try to open first path again
      await store.openDirectory("/test/path");

      // Should still have 2 tabs
      expect(store.tabs.length).toBe(2);
      // Should switch to first tab
      expect(store.activeTabId).toBe(firstTabId);
    });

    test("should respect MAX_TABS limit", async () => {
      // Open 10 tabs (MAX_TABS)
      for (let i = 0; i < 10; i++) {
        await store.openDirectory(`/test/path${i}`);
      }

      expect(store.tabs.length).toBe(10);
      expect(store.error).toBeNull();

      // Try to open 11th tab
      await store.openDirectory("/test/path11");

      // Should still have 10 tabs
      expect(store.tabs.length).toBe(10);
      // Should have error
      expect(store.error).toContain("Maximum");
      expect(store.error).toContain("10 tabs");
    });

    test("should generate unique context IDs", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");
      await store.openDirectory("/test/path3");

      const ids = store.tabs.map((tab) => tab.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(3);
    });

    test("should set createdAt and lastAccessedAt timestamps", async () => {
      const beforeTime = Date.now();
      await store.openDirectory("/test/path");
      const afterTime = Date.now();

      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;

      expect(tab.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(tab.createdAt).toBeLessThanOrEqual(afterTime);
      expect(tab.lastAccessedAt).toBe(tab.createdAt);
    });
  });

  describe("closeTab()", () => {
    test("should close a tab by ID", async () => {
      await store.openDirectory("/test/path");
      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;

      store.closeTab(tab.id);

      expect(store.tabs.length).toBe(0);
      expect(store.activeTabId).toBeNull();
    });

    test("should switch to next tab when closing active tab", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");
      await store.openDirectory("/test/path3");

      const firstTab = store.tabs[0];
      const secondTab = store.tabs[1];
      expect(firstTab).toBeDefined();
      expect(secondTab).toBeDefined();
      if (firstTab === undefined || secondTab === undefined) return;

      // Activate first tab
      store.activateTab(firstTab.id);
      expect(store.activeTabId).toBe(firstTab.id);

      // Close first tab
      store.closeTab(firstTab.id);

      // Should switch to second tab (which is now at index 0)
      expect(store.tabs.length).toBe(2);
      expect(store.activeTabId).toBe(secondTab.id);
    });

    test("should switch to previous tab when closing last tab", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");
      await store.openDirectory("/test/path3");

      const secondTab = store.tabs[1];
      const thirdTab = store.tabs[2];
      expect(secondTab).toBeDefined();
      expect(thirdTab).toBeDefined();
      if (secondTab === undefined || thirdTab === undefined) return;

      // Activate last tab
      store.activateTab(thirdTab.id);
      expect(store.activeTabId).toBe(thirdTab.id);

      // Close last tab
      store.closeTab(thirdTab.id);

      // Should switch to previous tab
      expect(store.tabs.length).toBe(2);
      expect(store.activeTabId).toBe(secondTab.id);
    });

    test("should not change other tab when closing non-active tab", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");

      const firstTab = store.tabs[0];
      const secondTab = store.tabs[1];
      expect(firstTab).toBeDefined();
      expect(secondTab).toBeDefined();
      if (firstTab === undefined || secondTab === undefined) return;

      // Activate second tab
      store.activateTab(secondTab.id);

      // Close first tab
      store.closeTab(firstTab.id);

      // Should keep second tab active
      expect(store.activeTabId).toBe(secondTab.id);
    });

    test("should do nothing when closing non-existent tab", () => {
      store.closeTab("non-existent-id");

      expect(store.tabs.length).toBe(0);
      expect(store.error).toBeNull();
    });
  });

  describe("activateTab()", () => {
    test("should activate a tab by ID", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");

      const firstTab = store.tabs[0];
      expect(firstTab).toBeDefined();
      if (firstTab === undefined) return;

      store.activateTab(firstTab.id);

      expect(store.activeTabId).toBe(firstTab.id);
    });

    test("should update lastAccessedAt timestamp", async () => {
      await store.openDirectory("/test/path");
      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;

      const originalTimestamp = tab.lastAccessedAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      store.activateTab(tab.id);

      const updatedTab = store.tabs[0];
      expect(updatedTab).toBeDefined();
      if (updatedTab === undefined) return;

      expect(updatedTab.lastAccessedAt).toBeGreaterThan(originalTimestamp);
    });

    test("should set error when activating non-existent tab", () => {
      store.activateTab("non-existent-id");

      expect(store.error).toContain("not found");
    });
  });

  describe("reorderTabs()", () => {
    test("should reorder tabs from start to end", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");
      await store.openDirectory("/test/path3");

      const firstTab = store.tabs[0];
      expect(firstTab).toBeDefined();
      if (firstTab === undefined) return;

      store.reorderTabs(0, 2);

      expect(store.tabs.length).toBe(3);
      expect(store.tabs[2]?.id).toBe(firstTab.id);
      expect(store.tabs[2]?.path).toBe("/test/path1");
    });

    test("should reorder tabs from end to start", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");
      await store.openDirectory("/test/path3");

      const thirdTab = store.tabs[2];
      expect(thirdTab).toBeDefined();
      if (thirdTab === undefined) return;

      store.reorderTabs(2, 0);

      expect(store.tabs.length).toBe(3);
      expect(store.tabs[0]?.id).toBe(thirdTab.id);
      expect(store.tabs[0]?.path).toBe("/test/path3");
    });

    test("should reorder tabs in the middle", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");
      await store.openDirectory("/test/path3");
      await store.openDirectory("/test/path4");

      const secondTab = store.tabs[1];
      expect(secondTab).toBeDefined();
      if (secondTab === undefined) return;

      store.reorderTabs(1, 2);

      expect(store.tabs[2]?.id).toBe(secondTab.id);
    });

    test("should do nothing with invalid indices", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");

      const originalTabs = [...store.tabs];

      // Invalid fromIndex
      store.reorderTabs(-1, 1);
      expect(store.tabs).toEqual(originalTabs);

      // Invalid toIndex
      store.reorderTabs(0, 10);
      expect(store.tabs).toEqual(originalTabs);

      // Same index
      store.reorderTabs(0, 0);
      expect(store.tabs).toEqual(originalTabs);
    });
  });

  describe("Picker State", () => {
    test("should open picker", () => {
      store.openPicker();

      expect(store.isPickerOpen).toBe(true);
    });

    test("should close picker", () => {
      store.openPicker();
      store.closePicker();

      expect(store.isPickerOpen).toBe(false);
    });
  });

  describe("Recent Directories", () => {
    test("should track recently opened directories", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");

      expect(store.recentDirectories.length).toBe(2);
      expect(store.recentDirectories[0]?.path).toBe("/test/path2");
      expect(store.recentDirectories[1]?.path).toBe("/test/path1");
    });

    test("should update existing recent directory on reopen", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      await store.openDirectory("/test/path1");

      // Should still have 2 recent directories
      expect(store.recentDirectories.length).toBe(2);
      // path1 should be at the top now
      expect(store.recentDirectories[0]?.path).toBe("/test/path1");
      expect(store.recentDirectories[1]?.path).toBe("/test/path2");
    });

    test("should limit recent directories to MAX_RECENT", async () => {
      // Open 25 directories (MAX_RECENT is 20)
      // Close tabs as we go to avoid hitting MAX_TABS limit
      for (let i = 0; i < 25; i++) {
        await store.openDirectory(`/test/path${i}`);

        // Close tabs when we hit the limit to make room for more
        if (store.tabs.length >= 10) {
          const firstTab = store.tabs[0];
          if (firstTab !== undefined) {
            store.closeTab(firstTab.id);
          }
        }
      }

      expect(store.recentDirectories.length).toBe(20);
      // Most recent should be path24
      expect(store.recentDirectories[0]?.path).toBe("/test/path24");
      // Oldest should be path5 (path0-4 dropped)
      expect(store.recentDirectories[19]?.path).toBe("/test/path5");
    });
  });

  describe("Workspace Persistence", () => {
    test("should save workspace to localStorage", async () => {
      await store.openDirectory("/test/path");
      await store.saveWorkspace();

      const stored = localStorage.getItem("qraftbox:workspace");
      expect(stored).not.toBeNull();
      if (stored === null) return;

      const data = JSON.parse(stored);
      expect(data.tabs).toBeDefined();
      expect(data.tabs.length).toBe(1);
      expect(data.activeTabId).not.toBeNull();
    });

    test("should restore workspace from localStorage", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");
      const activeId = store.activeTabId;
      await store.saveWorkspace();

      // Create new store and restore
      const newStore = createWorkspaceStore();
      await newStore.restoreWorkspace();

      expect(newStore.tabs.length).toBe(2);
      expect(newStore.tabs[0]?.path).toBe("/test/path1");
      expect(newStore.tabs[1]?.path).toBe("/test/path2");
      expect(newStore.activeTabId).toBe(activeId);
    });

    test("should handle missing localStorage data gracefully", async () => {
      await store.restoreWorkspace();

      expect(store.tabs.length).toBe(0);
      expect(store.error).toBeNull();
    });

    test("should handle corrupted localStorage data gracefully", async () => {
      localStorage.setItem("qraftbox:workspace", "invalid json");

      await store.restoreWorkspace();

      expect(store.tabs.length).toBe(0);
      expect(store.error).toBeNull();
    });
  });

  describe("reset()", () => {
    test("should reset to initial state", async () => {
      await store.openDirectory("/test/path1");
      await store.openDirectory("/test/path2");
      store.openPicker();

      store.reset();

      expect(store.tabs).toEqual([]);
      expect(store.activeTabId).toBeNull();
      expect(store.isPickerOpen).toBe(false);
      expect(store.recentDirectories).toEqual([]);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    test("should clear localStorage on reset", async () => {
      await store.openDirectory("/test/path");
      await store.saveWorkspace();

      expect(localStorage.getItem("qraftbox:workspace")).not.toBeNull();

      store.reset();

      expect(localStorage.getItem("qraftbox:workspace")).toBeNull();
    });
  });

  describe("Type Safety", () => {
    test("tabs should be readonly array", async () => {
      await store.openDirectory("/test/path");

      // TypeScript should prevent this at compile time
      // @ts-expect-error - tabs is readonly
      store.tabs.push({
        id: "test",
        path: "/test",
        name: "test",
        repositoryRoot: "/test",
        isGitRepo: false,
        createdAt: 0,
        lastAccessedAt: 0,
      });
    });

    test("tab properties should be readonly", async () => {
      await store.openDirectory("/test/path");
      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;

      // TypeScript should prevent this at compile time
      // @ts-expect-error - tab.path is readonly
      tab.path = "/modified";
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty path", async () => {
      await store.openDirectory("");

      expect(store.tabs.length).toBe(1);
      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;
      expect(tab.path).toBe("");
    });

    test("should handle paths with trailing slashes", async () => {
      await store.openDirectory("/test/path/");

      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;
      expect(tab.name).toBe("path");
    });

    test("should handle Windows-style paths", async () => {
      await store.openDirectory("C:\\Users\\test\\project");

      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;
      expect(tab.name).toBe("project");
    });

    test("should handle root path", async () => {
      await store.openDirectory("/");

      const tab = store.tabs[0];
      expect(tab).toBeDefined();
      if (tab === undefined) return;
      expect(tab.name).toBe("/");
    });
  });
});
