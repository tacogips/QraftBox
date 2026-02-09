/**
 * Unit tests for git staged files operations
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  getStagedFiles,
  getStagedDiff,
  hasStagedChanges,
  GitError,
} from "./staged";
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
 * Setup test repository
 */
beforeAll(async () => {
  // Create temporary directory
  testRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "qraftbox-staged-test-"),
  );

  // Initialize git repository
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Test User"]);
  await gitExec(["config", "user.email", "test@example.com"]);

  // Create initial commit
  await fs.writeFile(path.join(testRepoPath, "initial.txt"), "Initial file\n");
  await gitExec(["add", "initial.txt"]);
  await gitExec(["commit", "-m", "Initial commit"]);
});

/**
 * Cleanup test repository
 */
afterAll(async () => {
  await fs.rm(testRepoPath, { recursive: true, force: true });
});

describe("getStagedFiles", () => {
  test("should return empty array when nothing is staged", async () => {
    const files = await getStagedFiles(testRepoPath);
    expect(files).toEqual([]);
  });

  test("should detect added file", async () => {
    const filePath = path.join(testRepoPath, "new-file.txt");
    await fs.writeFile(filePath, "New file content\n");
    await gitExec(["add", "new-file.txt"]);

    const files = await getStagedFiles(testRepoPath);

    expect(files.length).toBe(1);
    const file = files[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("new-file.txt");
    expect(file.status).toBe("A");
    expect(file.additions).toBeGreaterThan(0);
    expect(file.deletions).toBe(0);
    expect(file.oldPath).toBeUndefined();

    // Cleanup
    await gitExec(["reset", "HEAD", "new-file.txt"]);
    await fs.unlink(filePath);
  });

  test("should detect modified file", async () => {
    const filePath = path.join(testRepoPath, "initial.txt");
    await fs.writeFile(filePath, "Initial file\nModified content\n");
    await gitExec(["add", "initial.txt"]);

    const files = await getStagedFiles(testRepoPath);

    expect(files.length).toBe(1);
    const file = files[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("initial.txt");
    expect(file.status).toBe("M");
    expect(file.additions).toBeGreaterThan(0);

    // Cleanup
    await gitExec(["reset", "HEAD", "initial.txt"]);
    await gitExec(["checkout", "initial.txt"]);
  });

  test("should detect deleted file", async () => {
    const filePath = path.join(testRepoPath, "to-delete.txt");
    await fs.writeFile(filePath, "Will be deleted\n");
    await gitExec(["add", "to-delete.txt"]);
    await gitExec(["commit", "-m", "Add file to delete"]);
    await fs.unlink(filePath);
    await gitExec(["add", "to-delete.txt"]);

    const files = await getStagedFiles(testRepoPath);

    expect(files.length).toBe(1);
    const file = files[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("to-delete.txt");
    expect(file.status).toBe("D");
    expect(file.additions).toBe(0);
    expect(file.deletions).toBeGreaterThan(0);

    // Cleanup
    await gitExec(["reset", "HEAD", "to-delete.txt"]);
  });

  test("should detect renamed file", async () => {
    const oldPath = path.join(testRepoPath, "old-name.txt");
    const newPath = path.join(testRepoPath, "new-name.txt");
    await fs.writeFile(oldPath, "File to rename\n");
    await gitExec(["add", "old-name.txt"]);
    await gitExec(["commit", "-m", "Add file to rename"]);
    await gitExec(["mv", "old-name.txt", "new-name.txt"]);

    const files = await getStagedFiles(testRepoPath);

    expect(files.length).toBe(1);
    const file = files[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("new-name.txt");
    expect(file.status).toBe("R");
    expect(file.oldPath).toBe("old-name.txt");

    // Cleanup
    await gitExec(["reset", "HEAD"]);
    await gitExec(["checkout", "old-name.txt"]);
    await fs.rm(newPath, { force: true });
  });

  test("should handle multiple staged files", async () => {
    const file1Path = path.join(testRepoPath, "multi1.txt");
    const file2Path = path.join(testRepoPath, "multi2.txt");
    await fs.writeFile(file1Path, "First file\n");
    await fs.writeFile(file2Path, "Second file\n");
    await gitExec(["add", "multi1.txt", "multi2.txt"]);

    const files = await getStagedFiles(testRepoPath);

    expect(files.length).toBe(2);
    expect(files.some((f) => f.path === "multi1.txt")).toBe(true);
    expect(files.some((f) => f.path === "multi2.txt")).toBe(true);

    // Cleanup
    await gitExec(["reset", "HEAD"]);
    await fs.unlink(file1Path);
    await fs.unlink(file2Path);
  });

  test("should throw GitError for invalid repository", async () => {
    const invalidPath = path.join(os.tmpdir(), "not-a-git-repo");
    await fs.mkdir(invalidPath, { recursive: true });

    await expect(getStagedFiles(invalidPath)).rejects.toThrow(GitError);

    await fs.rm(invalidPath, { recursive: true, force: true });
  });
});

describe("getStagedDiff", () => {
  test("should return empty string when nothing is staged", async () => {
    const diff = await getStagedDiff(testRepoPath);
    expect(diff).toBe("");
  });

  test("should return diff for staged changes", async () => {
    const filePath = path.join(testRepoPath, "diff-test.txt");
    await fs.writeFile(filePath, "Line 1\n");
    await gitExec(["add", "diff-test.txt"]);

    const diff = await getStagedDiff(testRepoPath);

    expect(diff).toContain("diff --git");
    expect(diff).toContain("diff-test.txt");
    expect(diff).toContain("+Line 1");

    // Cleanup
    await gitExec(["reset", "HEAD"]);
    await fs.unlink(filePath);
  });

  test("should return diff for modified file", async () => {
    const filePath = path.join(testRepoPath, "initial.txt");
    const originalContent = await fs.readFile(filePath, "utf-8");
    await fs.writeFile(filePath, originalContent + "New line\n");
    await gitExec(["add", "initial.txt"]);

    const diff = await getStagedDiff(testRepoPath);

    expect(diff).toContain("diff --git");
    expect(diff).toContain("initial.txt");
    expect(diff).toContain("+New line");

    // Cleanup
    await gitExec(["reset", "HEAD"]);
    await gitExec(["checkout", "initial.txt"]);
  });

  test("should include context lines in diff", async () => {
    const filePath = path.join(testRepoPath, "context-test.txt");
    await fs.writeFile(filePath, "Line 1\nLine 2\nLine 3\n");
    await gitExec(["add", "context-test.txt"]);
    await gitExec(["commit", "-m", "Add context test file"]);

    await fs.writeFile(filePath, "Line 1\nModified Line 2\nLine 3\n");
    await gitExec(["add", "context-test.txt"]);

    const diff = await getStagedDiff(testRepoPath);

    expect(diff).toContain("Line 1");
    expect(diff).toContain("Line 3");
    expect(diff).toContain("-Line 2");
    expect(diff).toContain("+Modified Line 2");

    // Cleanup
    await gitExec(["reset", "HEAD"]);
    await gitExec(["checkout", "context-test.txt"]);
  });

  test("should throw GitError for invalid repository", async () => {
    const invalidPath = "/nonexistent/path";
    await expect(getStagedDiff(invalidPath)).rejects.toThrow(GitError);
  });
});

describe("hasStagedChanges", () => {
  test("should return false when nothing is staged", async () => {
    const hasChanges = await hasStagedChanges(testRepoPath);
    expect(hasChanges).toBe(false);
  });

  test("should return true when file is added", async () => {
    const filePath = path.join(testRepoPath, "has-changes-test.txt");
    await fs.writeFile(filePath, "Test content\n");
    await gitExec(["add", "has-changes-test.txt"]);

    const hasChanges = await hasStagedChanges(testRepoPath);
    expect(hasChanges).toBe(true);

    // Cleanup
    await gitExec(["reset", "HEAD"]);
    await fs.unlink(filePath);
  });

  test("should return true when file is modified", async () => {
    const filePath = path.join(testRepoPath, "initial.txt");
    const originalContent = await fs.readFile(filePath, "utf-8");
    await fs.writeFile(filePath, originalContent + "Modified\n");
    await gitExec(["add", "initial.txt"]);

    const hasChanges = await hasStagedChanges(testRepoPath);
    expect(hasChanges).toBe(true);

    // Cleanup
    await gitExec(["reset", "HEAD"]);
    await gitExec(["checkout", "initial.txt"]);
  });

  test("should return true when file is deleted", async () => {
    const filePath = path.join(testRepoPath, "to-check-delete.txt");
    await fs.writeFile(filePath, "Will be deleted\n");
    await gitExec(["add", "to-check-delete.txt"]);
    await gitExec(["commit", "-m", "Add file to check delete"]);
    await fs.unlink(filePath);
    await gitExec(["add", "to-check-delete.txt"]);

    const hasChanges = await hasStagedChanges(testRepoPath);
    expect(hasChanges).toBe(true);

    // Cleanup
    await gitExec(["reset", "HEAD"]);
  });

  test("should return false after unstaging all changes", async () => {
    const filePath = path.join(testRepoPath, "unstage-test.txt");
    await fs.writeFile(filePath, "Test content\n");
    await gitExec(["add", "unstage-test.txt"]);

    let hasChanges = await hasStagedChanges(testRepoPath);
    expect(hasChanges).toBe(true);

    await gitExec(["reset", "HEAD"]);

    hasChanges = await hasStagedChanges(testRepoPath);
    expect(hasChanges).toBe(false);

    // Cleanup
    await fs.unlink(filePath);
  });

  test("should throw GitError for invalid repository", async () => {
    const invalidPath = "/nonexistent/path";
    await expect(hasStagedChanges(invalidPath)).rejects.toThrow(GitError);
  });
});

describe("GitError", () => {
  test("should contain command and error details", async () => {
    try {
      await getStagedFiles("/nonexistent/path");
      expect.fail("Should have thrown GitError");
    } catch (e) {
      expect(e).toBeInstanceOf(GitError);
      if (e instanceof GitError) {
        expect(e.command).toContain("git");
        expect(e.message).toBeDefined();
        expect(e.name).toBe("GitError");
        expect(e.stderr).toBeDefined();
      }
    }
  });

  test("should include git command that failed", async () => {
    try {
      await hasStagedChanges("/nonexistent/path");
      expect.fail("Should have thrown GitError");
    } catch (e) {
      expect(e).toBeInstanceOf(GitError);
      if (e instanceof GitError) {
        expect(e.command).toBe("git diff --cached --quiet");
      }
    }
  });
});
