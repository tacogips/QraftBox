/**
 * Unit tests for git commit log operations
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  getCommitLog,
  getCommitDetail,
  getCommitFiles,
  getCommitCount,
  searchCommits,
  GitError,
} from "./commit-log";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Test repository setup
 */
let testRepoPath: string;

/**
 * Helper to execute git commands in test repo
 */
async function gitExec(args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: testRepoPath,
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}

/**
 * Setup test repository with commits
 */
beforeAll(async () => {
  // Create temporary directory
  testRepoPath = await fs.mkdtemp(path.join(os.tmpdir(), "qraftbox-test-"));

  // Initialize git repository
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Test User"]);
  await gitExec(["config", "user.email", "test@example.com"]);

  // Create first commit
  await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Hello World\n");
  await gitExec(["add", "file1.txt"]);
  await gitExec([
    "commit",
    "-m",
    "Initial commit",
    "-m",
    "This is the first commit",
  ]);

  // Create second commit with modification
  await fs.writeFile(
    path.join(testRepoPath, "file1.txt"),
    "Hello World\nSecond line\n",
  );
  await gitExec(["add", "file1.txt"]);
  await gitExec(["commit", "-m", "Update file1", "-m", "Added second line"]);

  // Create third commit with new file
  await fs.writeFile(path.join(testRepoPath, "file2.txt"), "New file\n");
  await gitExec(["add", "file2.txt"]);
  await gitExec(["commit", "-m", "Add file2", "-m", "Created new file"]);

  // Create fourth commit with deletion
  await fs.unlink(path.join(testRepoPath, "file2.txt"));
  await gitExec(["add", "file2.txt"]);
  await gitExec(["commit", "-m", "Delete file2"]);

  // Create fifth commit with rename
  await gitExec(["mv", "file1.txt", "renamed.txt"]);
  await gitExec(["commit", "-m", "Rename file1 to renamed"]);
});

/**
 * Cleanup test repository
 */
afterAll(async () => {
  await fs.rm(testRepoPath, { recursive: true, force: true });
});

describe("getCommitLog", () => {
  test("should return commits with default pagination", async () => {
    const result = await getCommitLog(testRepoPath);

    expect(result.commits).toBeDefined();
    expect(result.commits.length).toBe(5);
    expect(result.pagination.offset).toBe(0);
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.total).toBe(5);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.branch).toBe("HEAD");
  });

  test("should return commits with custom limit", async () => {
    const result = await getCommitLog(testRepoPath, { limit: 2 });

    expect(result.commits.length).toBe(2);
    expect(result.pagination.limit).toBe(2);
    expect(result.pagination.hasMore).toBe(true);
  });

  test("should return commits with offset", async () => {
    const result = await getCommitLog(testRepoPath, { offset: 2, limit: 2 });

    expect(result.commits.length).toBe(2);
    expect(result.pagination.offset).toBe(2);
    expect(result.pagination.hasMore).toBe(true);
  });

  test("should return commits with branch parameter", async () => {
    const result = await getCommitLog(testRepoPath, { branch: "HEAD" });

    expect(result.commits.length).toBe(5);
    expect(result.branch).toBe("HEAD");
  });

  test("should parse commit information correctly", async () => {
    const result = await getCommitLog(testRepoPath, { limit: 1 });
    const commit = result.commits[0];

    expect(commit).toBeDefined();
    if (commit === undefined) return;

    expect(commit.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(commit.shortHash).toMatch(/^[0-9a-f]{7,}$/);
    expect(commit.message).toBe("Rename file1 to renamed");
    expect(commit.author.name).toBe("Test User");
    expect(commit.author.email).toBe("test@example.com");
    expect(commit.committer.name).toBe("Test User");
    expect(commit.committer.email).toBe("test@example.com");
    expect(commit.date).toBeGreaterThan(0);
    expect(commit.parentHashes.length).toBeGreaterThan(0);
  });

  test("should include commit body", async () => {
    const result = await getCommitLog(testRepoPath, { limit: 5 });
    const commitWithBody = result.commits.find(
      (c) => c.message === "Initial commit",
    );

    expect(commitWithBody).toBeDefined();
    if (commitWithBody === undefined) return;

    expect(commitWithBody.body).toBe("This is the first commit");
  });

  test("should handle empty repository", async () => {
    const emptyRepoPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "qraftbox-empty-"),
    );
    await Bun.spawn(["git", "init"], { cwd: emptyRepoPath }).exited;

    await expect(getCommitLog(emptyRepoPath)).rejects.toThrow(GitError);

    await fs.rm(emptyRepoPath, { recursive: true, force: true });
  });

  test("should search commits by message", async () => {
    const result = await getCommitLog(testRepoPath, { search: "file2" });

    expect(result.commits.length).toBeGreaterThan(0);
    expect(result.commits.some((c) => c.message.includes("file2"))).toBe(true);
    // Should return correct total count from search results, not all commits
    expect(result.pagination.total).toBeLessThan(5);
  });

  test("should search commits case-insensitively", async () => {
    const result = await getCommitLog(testRepoPath, { search: "RENAME" });

    expect(result.commits.length).toBeGreaterThan(0);
    expect(
      result.commits.some((c) => c.message.toLowerCase().includes("rename")),
    ).toBe(true);
  });

  test("should search commits by author", async () => {
    const result = await getCommitLog(testRepoPath, { search: "Test User" });

    expect(result.commits.length).toBe(5);
    expect(result.commits.every((c) => c.author.name === "Test User")).toBe(
      true,
    );
    expect(result.pagination.total).toBe(5);
  });

  test("should use OR logic for search (message OR author)", async () => {
    // Search for a term that appears in message but not author
    const result = await getCommitLog(testRepoPath, { search: "Rename" });

    expect(result.commits.length).toBeGreaterThan(0);
    // Should find commits where message matches, even though author doesn't match "Rename"
    expect(result.commits.some((c) => c.message.includes("Rename"))).toBe(true);
  });

  test("should handle search with pagination", async () => {
    const result = await getCommitLog(testRepoPath, {
      search: "file",
      limit: 2,
    });

    expect(result.commits.length).toBeLessThanOrEqual(2);
    expect(result.pagination.limit).toBe(2);
    // If there are more than 2 results, hasMore should be true
    if (result.pagination.total > 2) {
      expect(result.pagination.hasMore).toBe(true);
    }
  });

  test("should handle search with offset", async () => {
    const firstPage = await getCommitLog(testRepoPath, {
      search: "file",
      limit: 2,
      offset: 0,
    });
    const secondPage = await getCommitLog(testRepoPath, {
      search: "file",
      limit: 2,
      offset: 2,
    });

    // Should return different commits
    if (firstPage.commits[0] && secondPage.commits[0]) {
      expect(firstPage.commits[0].hash).not.toBe(secondPage.commits[0].hash);
    }
    // Both should have the same total count
    expect(firstPage.pagination.total).toBe(secondPage.pagination.total);
  });

  test("should return empty results for no search matches", async () => {
    const result = await getCommitLog(testRepoPath, {
      search: "nonexistent_query_xyz",
    });

    expect(result.commits).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });
});

describe("getCommitDetail", () => {
  test("should return detailed commit information", async () => {
    const logResult = await getCommitLog(testRepoPath, { limit: 1 });
    const latestCommit = logResult.commits[0];
    if (latestCommit === undefined) {
      throw new Error("No commits found");
    }

    const detail = await getCommitDetail(testRepoPath, latestCommit.hash);

    expect(detail.hash).toBe(latestCommit.hash);
    expect(detail.message).toBe(latestCommit.message);
    expect(detail.stats).toBeDefined();
    expect(detail.stats.filesChanged).toBeGreaterThan(0);
    expect(detail.files).toBeDefined();
    expect(detail.files.length).toBeGreaterThan(0);
  });

  test("should include file statistics", async () => {
    const logResult = await getCommitLog(testRepoPath);
    const addCommit = logResult.commits.find((c) => c.message === "Add file2");
    if (addCommit === undefined) {
      throw new Error("Add commit not found");
    }

    const detail = await getCommitDetail(testRepoPath, addCommit.hash);

    expect(detail.stats.filesChanged).toBe(1);
    expect(detail.stats.additions).toBeGreaterThan(0);
  });

  test("should work with short hash", async () => {
    const logResult = await getCommitLog(testRepoPath, { limit: 1 });
    const latestCommit = logResult.commits[0];
    if (latestCommit === undefined) {
      throw new Error("No commits found");
    }

    const detail = await getCommitDetail(testRepoPath, latestCommit.shortHash);

    expect(detail.hash).toBe(latestCommit.hash);
  });

  test("should throw error for invalid hash", async () => {
    await expect(
      getCommitDetail(testRepoPath, "invalid_hash_12345"),
    ).rejects.toThrow(GitError);
  });

  test("should include file changes", async () => {
    const logResult = await getCommitLog(testRepoPath);
    const addCommit = logResult.commits.find((c) => c.message === "Add file2");
    if (addCommit === undefined) {
      throw new Error("Add commit not found");
    }

    const detail = await getCommitDetail(testRepoPath, addCommit.hash);

    expect(detail.files.length).toBe(1);
    const file = detail.files[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("file2.txt");
    expect(file.status).toBe("A");
    expect(file.additions).toBeGreaterThan(0);
  });
});

describe("getCommitFiles", () => {
  test("should return files for added file", async () => {
    const logResult = await getCommitLog(testRepoPath);
    const addCommit = logResult.commits.find((c) => c.message === "Add file2");
    if (addCommit === undefined) {
      throw new Error("Add commit not found");
    }

    const files = await getCommitFiles(testRepoPath, addCommit.hash);

    expect(files.length).toBe(1);
    const file = files[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("file2.txt");
    expect(file.status).toBe("A");
    expect(file.additions).toBeGreaterThan(0);
    expect(file.deletions).toBe(0);
  });

  test("should return files for modified file", async () => {
    const logResult = await getCommitLog(testRepoPath);
    const updateCommit = logResult.commits.find(
      (c) => c.message === "Update file1",
    );
    if (updateCommit === undefined) {
      throw new Error("Update commit not found");
    }

    const files = await getCommitFiles(testRepoPath, updateCommit.hash);

    expect(files.length).toBe(1);
    const file = files[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("file1.txt");
    expect(file.status).toBe("M");
    expect(file.additions).toBeGreaterThan(0);
  });

  test("should return files for deleted file", async () => {
    const logResult = await getCommitLog(testRepoPath);
    const deleteCommit = logResult.commits.find(
      (c) => c.message === "Delete file2",
    );
    if (deleteCommit === undefined) {
      throw new Error("Delete commit not found");
    }

    const files = await getCommitFiles(testRepoPath, deleteCommit.hash);

    expect(files.length).toBe(1);
    const file = files[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("file2.txt");
    expect(file.status).toBe("D");
    expect(file.deletions).toBeGreaterThan(0);
  });

  test("should return files for renamed file", async () => {
    const logResult = await getCommitLog(testRepoPath);
    const renameCommit = logResult.commits.find(
      (c) => c.message === "Rename file1 to renamed",
    );
    if (renameCommit === undefined) {
      throw new Error("Rename commit not found");
    }

    const files = await getCommitFiles(testRepoPath, renameCommit.hash);

    expect(files.length).toBe(1);
    const file = files[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("renamed.txt");
    expect(file.status).toBe("R");
    expect(file.oldPath).toBe("file1.txt");
  });
});

describe("getCommitCount", () => {
  test("should return total commit count", async () => {
    const count = await getCommitCount(testRepoPath);
    expect(count).toBe(5);
  });

  test("should return count for specific branch", async () => {
    const count = await getCommitCount(testRepoPath, "HEAD");
    expect(count).toBe(5);
  });

  test("should throw error for invalid branch", async () => {
    await expect(
      getCommitCount(testRepoPath, "nonexistent-branch"),
    ).rejects.toThrow(GitError);
  });
});

describe("searchCommits", () => {
  test("should search commits by message", async () => {
    const results = await searchCommits(testRepoPath, "file2");

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((c) => c.message.includes("file2"))).toBe(true);
  });

  test("should search commits case-insensitively", async () => {
    const results = await searchCommits(testRepoPath, "RENAME");

    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((c) => c.message.toLowerCase().includes("rename")),
    ).toBe(true);
  });

  test("should respect limit option", async () => {
    const results = await searchCommits(testRepoPath, "file", { limit: 2 });

    expect(results.length).toBeLessThanOrEqual(2);
  });

  test("should search by author", async () => {
    const results = await searchCommits(testRepoPath, "Test User");

    expect(results.length).toBe(5);
    expect(results.every((c) => c.author.name === "Test User")).toBe(true);
  });

  test("should return empty array for no matches", async () => {
    const results = await searchCommits(testRepoPath, "nonexistent_query_xyz");

    expect(results).toEqual([]);
  });

  test("should search in specific branch", async () => {
    const results = await searchCommits(testRepoPath, "commit", {
      branch: "HEAD",
    });

    expect(results.length).toBeGreaterThan(0);
  });
});

describe("GitError", () => {
  test("should include command and stderr information", async () => {
    try {
      await getCommitLog("/nonexistent/path");
      expect.fail("Should have thrown GitError");
    } catch (e) {
      expect(e).toBeInstanceOf(GitError);
      if (e instanceof GitError) {
        expect(e.command).toContain("git");
        expect(e.message).toBeDefined();
        expect(e.name).toBe("GitError");
      }
    }
  });
});
