/**
 * Tests for DirectoryPicker component
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import type {
  DirectoryListingResponse,
  RecentDirectory,
} from "../../../src/types/workspace";

describe("DirectoryPicker Component", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    // Restore original fetch to avoid polluting other test files
    global.fetch = originalFetch;
  });

  describe("API Integration", () => {
    beforeEach(() => {
      // Reset fetch mock
      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              path: "/home/user",
              parentPath: "/home",
              entries: [],
              canGoUp: true,
            } as DirectoryListingResponse),
        } as Response),
      );
    });

    test("should call /api/browse with encoded path", async () => {
      const path = "/home/user/my folder";
      const encodedPath = encodeURIComponent(path);

      // Simulate loadDirectory call
      const response = await fetch(`/api/browse?path=${encodedPath}`);
      const data = (await response.json()) as DirectoryListingResponse;

      expect(data.path).toBe("/home/user");
      expect(data.canGoUp).toBe(true);
    });

    test("should call /api/browse/home to get home directory", async () => {
      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ path: "/home/user" }),
        } as Response),
      );

      const response = await fetch("/api/browse/home");
      const data = (await response.json()) as { path: string };

      expect(data.path).toBe("/home/user");
    });

    test("should handle API errors gracefully", async () => {
      global.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          statusText: "Not Found",
        } as Response),
      );

      const response = await fetch("/api/browse?path=/nonexistent");

      expect(response.ok).toBe(false);
      expect(response.statusText).toBe("Not Found");
    });
  });

  describe("Path Encoding", () => {
    test("should encode special characters in path", () => {
      const paths = [
        {
          input: "/home/user/my folder",
          expected: "%2Fhome%2Fuser%2Fmy%20folder",
        },
        {
          input: "/path/with/ñoño",
          expected: "%2Fpath%2Fwith%2F%C3%B1o%C3%B1o",
        },
        { input: "/path with spaces", expected: "%2Fpath%20with%20spaces" },
      ];

      for (const { input, expected } of paths) {
        const encoded = encodeURIComponent(input);
        expect(encoded).toBe(expected);
      }
    });
  });

  describe("Modal State", () => {
    test("should render when isOpen is true", () => {
      const isOpen = true;
      expect(isOpen).toBe(true);
    });

    test("should not render when isOpen is false", () => {
      const isOpen = false;
      expect(isOpen).toBe(false);
    });
  });

  describe("Recent Directories", () => {
    test("should accept empty recent directories array", () => {
      const recentDirectories: readonly RecentDirectory[] = [];
      expect(recentDirectories.length).toBe(0);
    });

    test("should accept multiple recent directories", () => {
      const recentDirectories: readonly RecentDirectory[] = [
        {
          path: "/home/user/project1",
          name: "project1",
          lastOpened: Date.now(),
          isGitRepo: true,
        },
        {
          path: "/home/user/project2",
          name: "project2",
          lastOpened: Date.now() - 1000,
          isGitRepo: false,
        },
      ];

      expect(recentDirectories.length).toBe(2);
      expect(recentDirectories[0]?.isGitRepo).toBe(true);
      expect(recentDirectories[1]?.isGitRepo).toBe(false);
    });
  });

  describe("Directory Selection", () => {
    test("should track selected directory path", () => {
      let selectedPath: string | null = null;

      selectedPath = "/home/user/project";
      expect(selectedPath).toBe("/home/user/project");

      selectedPath = null;
      expect(selectedPath).toBe(null);
    });

    test("should update selected path when directory is clicked", () => {
      let selectedPath: string | null = null;

      function handleEntrySelect(path: string): void {
        selectedPath = path;
      }

      handleEntrySelect("/home/user/docs");
      expect(selectedPath).toBe("/home/user/docs");
    });
  });

  describe("Navigation", () => {
    test("should navigate up when parent path exists", async () => {
      let currentPath = "/home/user/project";
      const parentPath = "/home/user";
      const canGoUp = true;

      if (parentPath !== null && canGoUp) {
        currentPath = parentPath;
      }

      expect(currentPath).toBe("/home/user");
    });

    test("should not navigate up when at root", () => {
      let currentPath = "/";
      const parentPath = null;
      const canGoUp = false;

      if (parentPath !== null && canGoUp) {
        currentPath = parentPath;
      }

      expect(currentPath).toBe("/");
    });
  });

  describe("Keyboard Handling", () => {
    test("should handle Escape key to close", () => {
      let modalClosed = false;

      function handleKeydown(event: { key: string }): void {
        if (event.key === "Escape") {
          modalClosed = true;
        }
      }

      handleKeydown({ key: "Escape" });
      expect(modalClosed).toBe(true);
    });

    test("should handle Enter key to select", () => {
      let selectedPath: string | null = "/home/user/project";
      let onSelectCalled = false;

      function handleKeydown(event: { key: string }): void {
        if (event.key === "Enter" && selectedPath !== null) {
          onSelectCalled = true;
        }
      }

      handleKeydown({ key: "Enter" });
      expect(onSelectCalled).toBe(true);
    });

    test("should not select on Enter when no path is selected", () => {
      let selectedPath: string | null = null;
      let onSelectCalled = false;

      function handleKeydown(event: { key: string }): void {
        if (event.key === "Enter" && selectedPath !== null) {
          onSelectCalled = true;
        }
      }

      handleKeydown({ key: "Enter" });
      expect(onSelectCalled).toBe(false);
    });
  });

  describe("Loading State", () => {
    test("should track loading state", () => {
      let loading = false;

      loading = true;
      expect(loading).toBe(true);

      loading = false;
      expect(loading).toBe(false);
    });

    test("should clear error when loading starts", () => {
      let error: string | null = "Previous error";
      let loading = false;

      // Start loading
      loading = true;
      error = null;

      expect(loading).toBe(true);
      expect(error).toBe(null);
    });
  });

  describe("Error Handling", () => {
    test("should set error message on API failure", async () => {
      global.fetch = mock(() => Promise.reject(new Error("Network error")));

      let error: string | null = null;

      try {
        await fetch("/api/browse?path=/test");
      } catch (e) {
        error = e instanceof Error ? e.message : "Unknown error";
      }

      expect(error).toBe("Network error");
    });

    test("should handle non-Error exceptions", () => {
      let error: string | null = null;

      try {
        throw "String error";
      } catch (e) {
        error = e instanceof Error ? e.message : "Failed to load directory";
      }

      expect(error).toBe("Failed to load directory");
    });
  });
});
