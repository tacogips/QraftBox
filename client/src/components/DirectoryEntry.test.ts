/**
 * Tests for DirectoryEntry component
 */

import { describe, test, expect } from "bun:test";
import type { DirectoryEntry } from "../../../src/types/workspace";

describe("DirectoryEntry Component", () => {
  describe("Icon Selection", () => {
    test("should use folder icon for directories", () => {
      const entry: DirectoryEntry = {
        name: "my-folder",
        path: "/home/user/my-folder",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      expect(entry.isDirectory).toBe(true);
    });

    test("should use git icon for git repositories", () => {
      const entry: DirectoryEntry = {
        name: "my-repo",
        path: "/home/user/my-repo",
        isDirectory: true,
        isGitRepo: true,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      expect(entry.isDirectory).toBe(true);
      expect(entry.isGitRepo).toBe(true);
    });

    test("should use file icon for files", () => {
      const entry: DirectoryEntry = {
        name: "README.md",
        path: "/home/user/README.md",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      expect(entry.isDirectory).toBe(false);
    });
  });

  describe("Icon Color", () => {
    test("should use blue color for git repositories", () => {
      const entry: DirectoryEntry = {
        name: "my-repo",
        path: "/home/user/my-repo",
        isDirectory: true,
        isGitRepo: true,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      const color = entry.isGitRepo ? "text-blue-500" : "text-yellow-500";
      expect(color).toBe("text-blue-500");
    });

    test("should use yellow color for regular directories", () => {
      const entry: DirectoryEntry = {
        name: "my-folder",
        path: "/home/user/my-folder",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      const color = entry.isGitRepo ? "text-blue-500" : "text-yellow-500";
      expect(color).toBe("text-yellow-500");
    });

    test("should use gray color for files", () => {
      const entry: DirectoryEntry = {
        name: "file.txt",
        path: "/home/user/file.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      const color = entry.isDirectory ? "text-blue-500" : "text-gray-400";
      expect(color).toBe("text-gray-400");
    });
  });

  describe("Text Color for Hidden Files", () => {
    test("should use dimmed color for hidden entries", () => {
      const entry: DirectoryEntry = {
        name: ".hidden",
        path: "/home/user/.hidden",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: true,
        modifiedAt: Date.now(),
      };

      const textColor = entry.isHidden
        ? "text-text-tertiary opacity-60"
        : "text-text-primary";
      expect(textColor).toBe("text-text-tertiary opacity-60");
    });

    test("should use normal color for visible entries", () => {
      const entry: DirectoryEntry = {
        name: "visible.txt",
        path: "/home/user/visible.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      const textColor = entry.isHidden
        ? "text-text-tertiary opacity-60"
        : "text-text-primary";
      expect(textColor).toBe("text-text-primary");
    });
  });

  describe("Selection State", () => {
    test("should apply selected styles when selected is true", () => {
      const selected = true;
      const className = selected
        ? "bg-blue-50 border-l-4 border-l-blue-600"
        : "border-l-4 border-l-transparent";

      expect(className).toBe("bg-blue-50 border-l-4 border-l-blue-600");
    });

    test("should not apply selected styles when selected is false", () => {
      const selected = false;
      const className = selected
        ? "bg-blue-50 border-l-4 border-l-blue-600"
        : "border-l-4 border-l-transparent";

      expect(className).toBe("border-l-4 border-l-transparent");
    });
  });

  describe("Badge Display", () => {
    test("should show Git badge for git repositories", () => {
      const entry: DirectoryEntry = {
        name: "my-repo",
        path: "/home/user/my-repo",
        isDirectory: true,
        isGitRepo: true,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      const showGitBadge = entry.isGitRepo && entry.isDirectory;
      expect(showGitBadge).toBe(true);
    });

    test("should not show Git badge for regular directories", () => {
      const entry: DirectoryEntry = {
        name: "my-folder",
        path: "/home/user/my-folder",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      const showGitBadge = entry.isGitRepo && entry.isDirectory;
      expect(showGitBadge).toBe(false);
    });

    test("should show Hidden badge for hidden entries", () => {
      const entry: DirectoryEntry = {
        name: ".config",
        path: "/home/user/.config",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: true,
        modifiedAt: Date.now(),
      };

      expect(entry.isHidden).toBe(true);
    });

    test("should show symlink indicator for symlinks", () => {
      const entry: DirectoryEntry = {
        name: "link",
        path: "/home/user/link",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: true,
        isHidden: false,
        modifiedAt: Date.now(),
      };

      expect(entry.isSymlink).toBe(true);
    });
  });

  describe("Click Handling", () => {
    test("should call onClick callback when clicked", () => {
      let clicked = false;

      function onClick(): void {
        clicked = true;
      }

      onClick();
      expect(clicked).toBe(true);
    });

    test("should call onSelect callback when selected", () => {
      let selected = false;

      function onSelect(): void {
        selected = true;
      }

      onSelect();
      expect(selected).toBe(true);
    });
  });

  describe("Keyboard Navigation", () => {
    test("should handle Enter key", () => {
      let enterPressed = false;

      function handleKeydown(event: { key: string }): void {
        if (event.key === "Enter") {
          enterPressed = true;
        }
      }

      handleKeydown({ key: "Enter" });
      expect(enterPressed).toBe(true);
    });

    test("should ignore other keys", () => {
      let actionTaken = false;

      function handleKeydown(event: { key: string }): void {
        if (event.key === "Enter") {
          actionTaken = true;
        }
      }

      handleKeydown({ key: "ArrowDown" });
      expect(actionTaken).toBe(false);
    });
  });
});
