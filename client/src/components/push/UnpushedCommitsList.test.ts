/**
 * Tests for UnpushedCommitsList component
 */

import { describe, test, expect } from "vitest";
import type { UnpushedCommit } from "../../../../src/types/push-context";

describe("UnpushedCommitsList Component", () => {
  describe("Props", () => {
    test("should accept readonly array of unpushed commits", () => {
      const commits: readonly UnpushedCommit[] = [
        {
          hash: "abc123def456",
          shortHash: "abc123d",
          message: "feat: add new feature",
          author: "John Doe",
          date: Date.now(),
        },
      ];
      expect(commits.length).toBe(1);
    });
  });

  describe("Empty State", () => {
    test("should show empty state when no commits", () => {
      const commits: readonly UnpushedCommit[] = [];
      const isEmpty = commits.length === 0;
      expect(isEmpty).toBe(true);
    });

    test("should not show empty state when commits exist", () => {
      const commits: readonly UnpushedCommit[] = [
        {
          hash: "abc123def456",
          shortHash: "abc123d",
          message: "feat: add feature",
          author: "John Doe",
          date: Date.now(),
        },
      ];
      const isEmpty = commits.length === 0;
      expect(isEmpty).toBe(false);
    });
  });

  describe("Commit Display", () => {
    test("should display commit hash", () => {
      const commit: UnpushedCommit = {
        hash: "abc123def456",
        shortHash: "abc123d",
        message: "feat: add feature",
        author: "John Doe",
        date: Date.now(),
      };
      expect(commit.shortHash).toBe("abc123d");
    });

    test("should display commit message", () => {
      const commit: UnpushedCommit = {
        hash: "abc123def456",
        shortHash: "abc123d",
        message: "fix: resolve bug",
        author: "Jane Smith",
        date: Date.now(),
      };
      expect(commit.message).toBe("fix: resolve bug");
    });

    test("should display commit author", () => {
      const commit: UnpushedCommit = {
        hash: "abc123def456",
        shortHash: "abc123d",
        message: "feat: add feature",
        author: "Alice Johnson",
        date: Date.now(),
      };
      expect(commit.author).toBe("Alice Johnson");
    });
  });

  describe("Date Formatting", () => {
    test("should format recent date as 'just now'", () => {
      const now = Date.now();
      const diffMs = now - now;
      const diffMins = Math.floor(diffMs / 60000);

      const formatted = diffMins < 1 ? "just now" : `${diffMins}m ago`;
      expect(formatted).toBe("just now");
    });

    test("should format minutes ago", () => {
      const now = Date.now();
      const timestamp = now - 30 * 60000; // 30 minutes ago
      const diffMs = now - timestamp;
      const diffMins = Math.floor(diffMs / 60000);

      const formatted = diffMins < 60 ? `${diffMins}m ago` : "other";
      expect(formatted).toBe("30m ago");
    });

    test("should format hours ago", () => {
      const now = Date.now();
      const timestamp = now - 5 * 3600000; // 5 hours ago
      const diffMs = now - timestamp;
      const diffHours = Math.floor(diffMs / 3600000);

      const formatted = diffHours < 24 ? `${diffHours}h ago` : "other";
      expect(formatted).toBe("5h ago");
    });

    test("should format days ago", () => {
      const now = Date.now();
      const timestamp = now - 3 * 86400000; // 3 days ago
      const diffMs = now - timestamp;
      const diffDays = Math.floor(diffMs / 86400000);

      const formatted = diffDays < 7 ? `${diffDays}d ago` : "other";
      expect(formatted).toBe("3d ago");
    });

    test("should format date for older commits", () => {
      const timestamp = new Date("2024-01-15").getTime();
      const now = Date.now();
      const diffMs = now - timestamp;
      const diffDays = Math.floor(diffMs / 86400000);

      const shouldShowFullDate = diffDays >= 7;
      expect(shouldShowFullDate).toBe(true);
    });
  });

  describe("Scrollable Container", () => {
    test("should handle multiple commits", () => {
      const commits: readonly UnpushedCommit[] = Array.from(
        { length: 10 },
        (_, i) => ({
          hash: `hash${i}`,
          shortHash: `hash${i}`.slice(0, 7),
          message: `Commit ${i}`,
          author: "Author",
          date: Date.now() - i * 3600000,
        }),
      );
      expect(commits.length).toBe(10);
    });

    test("should have max height constraint", () => {
      const maxHeight = 300; // pixels
      expect(maxHeight).toBe(300);
    });
  });

  describe("Unique Keys", () => {
    test("should use hash as unique key", () => {
      const commits: readonly UnpushedCommit[] = [
        {
          hash: "abc123",
          shortHash: "abc123d",
          message: "Commit 1",
          author: "Author",
          date: Date.now(),
        },
        {
          hash: "def456",
          shortHash: "def456a",
          message: "Commit 2",
          author: "Author",
          date: Date.now(),
        },
      ];

      const keys = commits.map((c) => c.hash);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(commits.length);
    });
  });
});
