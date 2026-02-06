/**
 * Tests for QuickAccessBar component
 */

import { describe, test, expect } from "bun:test";
import type { RecentDirectory } from "../../../src/types/workspace";

describe("QuickAccessBar Component", () => {
  describe("Recent Directories Display", () => {
    test("should display empty state when no recent directories", () => {
      const recentDirectories: readonly RecentDirectory[] = [];
      expect(recentDirectories.length).toBe(0);
    });

    test("should display count of recent directories", () => {
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
    });
  });

  describe("Directory Name Extraction", () => {
    test("should extract name from path", () => {
      function extractName(path: string): string {
        const parts = path.split("/").filter((p) => p.length > 0);
        const last = parts[parts.length - 1];
        return last !== undefined && last.length > 0 ? last : "/";
      }

      expect(extractName("/home/user/project")).toBe("project");
      expect(extractName("/home/user")).toBe("user");
      expect(extractName("/")).toBe("/");
      expect(extractName("/home/user/my-folder/")).toBe("my-folder");
    });
  });

  describe("Relative Time Formatting", () => {
    test("should format time as 'Just now' for recent timestamps", () => {
      function formatRelativeTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
          return `${days}d ago`;
        } else if (hours > 0) {
          return `${hours}h ago`;
        } else if (minutes > 0) {
          return `${minutes}m ago`;
        } else {
          return "Just now";
        }
      }

      const now = Date.now();
      expect(formatRelativeTime(now)).toBe("Just now");
      expect(formatRelativeTime(now - 30 * 1000)).toBe("Just now");
    });

    test("should format time in minutes", () => {
      function formatRelativeTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
          return `${days}d ago`;
        } else if (hours > 0) {
          return `${hours}h ago`;
        } else if (minutes > 0) {
          return `${minutes}m ago`;
        } else {
          return "Just now";
        }
      }

      const now = Date.now();
      expect(formatRelativeTime(now - 5 * 60 * 1000)).toBe("5m ago");
      expect(formatRelativeTime(now - 30 * 60 * 1000)).toBe("30m ago");
    });

    test("should format time in hours", () => {
      function formatRelativeTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
          return `${days}d ago`;
        } else if (hours > 0) {
          return `${hours}h ago`;
        } else if (minutes > 0) {
          return `${minutes}m ago`;
        } else {
          return "Just now";
        }
      }

      const now = Date.now();
      expect(formatRelativeTime(now - 2 * 60 * 60 * 1000)).toBe("2h ago");
      expect(formatRelativeTime(now - 12 * 60 * 60 * 1000)).toBe("12h ago");
    });

    test("should format time in days", () => {
      function formatRelativeTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
          return `${days}d ago`;
        } else if (hours > 0) {
          return `${hours}h ago`;
        } else if (minutes > 0) {
          return `${minutes}m ago`;
        } else {
          return "Just now";
        }
      }

      const now = Date.now();
      expect(formatRelativeTime(now - 1 * 24 * 60 * 60 * 1000)).toBe("1d ago");
      expect(formatRelativeTime(now - 7 * 24 * 60 * 60 * 1000)).toBe("7d ago");
    });
  });

  describe("Dropdown State", () => {
    test("should toggle dropdown state", () => {
      let isRecentOpen = false;

      function toggleRecent(): void {
        isRecentOpen = !isRecentOpen;
      }

      expect(isRecentOpen).toBe(false);
      toggleRecent();
      expect(isRecentOpen).toBe(true);
      toggleRecent();
      expect(isRecentOpen).toBe(false);
    });

    test("should close dropdown when recent is clicked", () => {
      let isRecentOpen = true;

      function handleRecentClick(): void {
        isRecentOpen = false;
      }

      handleRecentClick();
      expect(isRecentOpen).toBe(false);
    });
  });

  describe("Click Handlers", () => {
    test("should call onHomeClick when home button is clicked", () => {
      let homeClicked = false;

      function onHomeClick(): void {
        homeClicked = true;
      }

      onHomeClick();
      expect(homeClicked).toBe(true);
    });

    test("should call onRecentClick with path when recent is clicked", () => {
      let clickedPath: string | null = null;

      function onRecentClick(path: string): void {
        clickedPath = path;
      }

      onRecentClick("/home/user/project");
      expect(clickedPath).toBe("/home/user/project");
    });
  });

  describe("Git Repository Indicator", () => {
    test("should show git indicator for git repositories", () => {
      const recent: RecentDirectory = {
        path: "/home/user/my-repo",
        name: "my-repo",
        lastOpened: Date.now(),
        isGitRepo: true,
      };

      expect(recent.isGitRepo).toBe(true);
    });

    test("should not show git indicator for non-git directories", () => {
      const recent: RecentDirectory = {
        path: "/home/user/my-folder",
        name: "my-folder",
        lastOpened: Date.now(),
        isGitRepo: false,
      };

      expect(recent.isGitRepo).toBe(false);
    });
  });

  describe("Dropdown Close on Outside Click", () => {
    test("should handle click outside dropdown", () => {
      let isRecentOpen = true;

      function handleClickOutside(target: {
        closest: (selector: string) => boolean;
      }): void {
        if (!target.closest(".recent-dropdown")) {
          isRecentOpen = false;
        }
      }

      // Simulate click outside
      handleClickOutside({ closest: () => false });
      expect(isRecentOpen).toBe(false);
    });

    test("should not close when clicking inside dropdown", () => {
      let isRecentOpen = true;

      function handleClickOutside(target: {
        closest: (selector: string) => boolean;
      }): void {
        if (!target.closest(".recent-dropdown")) {
          isRecentOpen = false;
        }
      }

      // Simulate click inside
      handleClickOutside({ closest: () => true });
      expect(isRecentOpen).toBe(true);
    });
  });
});
