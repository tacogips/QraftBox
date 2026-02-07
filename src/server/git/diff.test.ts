/**
 * Tests for Git Diff Generation Module
 *
 * Uses a real temporary git repository for integration testing.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execGit } from "./executor.js";
import {
  getDiff,
  getFileDiff,
  getFileContent,
  getChangedFiles,
} from "./diff.js";

describe("diff module", () => {
  let repoPath: string;

  beforeEach(async () => {
    // Create temporary directory for test repository
    repoPath = await mkdtemp(join(tmpdir(), "qraftbox-diff-test-"));

    // Initialize git repository
    await execGit(["init"], { cwd: repoPath });
    await execGit(["config", "user.name", "Test User"], { cwd: repoPath });
    await execGit(["config", "user.email", "test@example.com"], {
      cwd: repoPath,
    });
  });

  afterEach(async () => {
    // Clean up temporary repository
    await rm(repoPath, { recursive: true, force: true });
  });

  describe("getDiff", () => {
    test("returns empty array for clean repository", async () => {
      const diff = await getDiff(repoPath);
      expect(diff).toEqual([]);
    });

    test("detects added file in working tree", async () => {
      // Create a file but don't commit it
      await writeFile(join(repoPath, "new-file.txt"), "Hello, World!");
      await execGit(["add", "new-file.txt"], { cwd: repoPath });

      const diff = await getDiff(repoPath);
      expect(diff.length).toBe(1);
      expect(diff[0]?.path).toBe("new-file.txt");
      expect(diff[0]?.status).toBe("added");
    });

    test("detects modified file in working tree", async () => {
      // Create and commit a file
      await writeFile(join(repoPath, "file.txt"), "Initial content");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial commit"], { cwd: repoPath });

      // Modify the file
      await writeFile(join(repoPath, "file.txt"), "Modified content");
      await execGit(["add", "file.txt"], { cwd: repoPath });

      const diff = await getDiff(repoPath);
      expect(diff.length).toBe(1);
      expect(diff[0]?.path).toBe("file.txt");
      expect(diff[0]?.status).toBe("modified");
      expect(diff[0]?.additions).toBeGreaterThan(0);
      expect(diff[0]?.deletions).toBeGreaterThan(0);
    });

    test("compares two commits with base and target", async () => {
      // Create initial commit
      await writeFile(join(repoPath, "file.txt"), "Version 1");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "First commit"], { cwd: repoPath });

      // Create second commit
      await writeFile(join(repoPath, "file.txt"), "Version 2");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Second commit"], { cwd: repoPath });

      const diff = await getDiff(repoPath, {
        base: "HEAD~1",
        target: "HEAD",
      });
      expect(diff.length).toBe(1);
      expect(diff[0]?.path).toBe("file.txt");
      expect(diff[0]?.status).toBe("modified");
    });

    test("filters by paths", async () => {
      // Create multiple files
      await writeFile(join(repoPath, "file1.txt"), "Content 1");
      await writeFile(join(repoPath, "file2.txt"), "Content 2");
      await execGit(["add", "."], { cwd: repoPath });

      const diff = await getDiff(repoPath, { paths: ["file1.txt"] });
      expect(diff.length).toBe(1);
      expect(diff[0]?.path).toBe("file1.txt");
    });

    test("handles binary files", async () => {
      // Create a binary file (non-text content)
      const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
      await writeFile(join(repoPath, "binary.bin"), binaryData);
      await execGit(["add", "binary.bin"], { cwd: repoPath });

      const diff = await getDiff(repoPath);
      expect(diff.length).toBe(1);
      expect(diff[0]?.path).toBe("binary.bin");
      expect(diff[0]?.isBinary).toBe(true);
    });

    test("supports custom context lines", async () => {
      // Create and commit a file
      await writeFile(
        join(repoPath, "file.txt"),
        "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
      );
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial"], { cwd: repoPath });

      // Modify middle line
      await writeFile(
        join(repoPath, "file.txt"),
        "Line 1\nLine 2\nModified Line 3\nLine 4\nLine 5",
      );
      await execGit(["add", "file.txt"], { cwd: repoPath });

      const diff = await getDiff(repoPath, { contextLines: 1 });
      expect(diff.length).toBe(1);
      // Context lines affect the diff format but not the result structure
    });
  });

  describe("getFileDiff", () => {
    test("returns undefined for unchanged file", async () => {
      // Create and commit a file
      await writeFile(join(repoPath, "file.txt"), "Content");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial"], { cwd: repoPath });

      const diff = await getFileDiff(repoPath, "file.txt");
      expect(diff).toBeUndefined();
    });

    test("returns DiffFile for changed file", async () => {
      // Create and commit a file
      await writeFile(join(repoPath, "file.txt"), "Initial");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial"], { cwd: repoPath });

      // Modify the file
      await writeFile(join(repoPath, "file.txt"), "Modified");
      await execGit(["add", "file.txt"], { cwd: repoPath });

      const diff = await getFileDiff(repoPath, "file.txt");
      expect(diff).toBeDefined();
      expect(diff?.path).toBe("file.txt");
      expect(diff?.status).toBe("modified");
    });

    test("works with base and target options", async () => {
      // Create initial commit
      await writeFile(join(repoPath, "file.txt"), "Version 1");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "First"], { cwd: repoPath });

      // Create second commit
      await writeFile(join(repoPath, "file.txt"), "Version 2");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Second"], { cwd: repoPath });

      const diff = await getFileDiff(repoPath, "file.txt", {
        base: "HEAD~1",
        target: "HEAD",
      });
      expect(diff).toBeDefined();
      expect(diff?.path).toBe("file.txt");
    });
  });

  describe("getFileContent", () => {
    test("reads file from working tree", async () => {
      const content = "Hello from working tree";
      await writeFile(join(repoPath, "file.txt"), content);

      const result = await getFileContent(repoPath, "file.txt");
      expect(result).toBe(content);
    });

    test("reads file from specific commit", async () => {
      // Create and commit a file
      const initialContent = "Initial version";
      await writeFile(join(repoPath, "file.txt"), initialContent);
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial"], { cwd: repoPath });

      // Modify the file (not committed)
      await writeFile(join(repoPath, "file.txt"), "Modified version");

      // Read from HEAD should get initial version
      const result = await getFileContent(repoPath, "file.txt", "HEAD");
      expect(result).toBe(initialContent);
    });

    test("reads file from branch", async () => {
      // Create and commit a file on main
      await writeFile(join(repoPath, "file.txt"), "Main branch content");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial"], { cwd: repoPath });

      // Create a branch and modify the file
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });
      await writeFile(join(repoPath, "file.txt"), "Feature branch content");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Feature"], { cwd: repoPath });

      // Switch back to main
      await execGit(["checkout", "main"], { cwd: repoPath });

      // Read from feature branch
      const result = await getFileContent(repoPath, "file.txt", "feature");
      expect(result).toBe("Feature branch content");
    });

    test("throws error for non-existent file in working tree", async () => {
      await expect(
        getFileContent(repoPath, "nonexistent.txt"),
      ).rejects.toThrow();
    });

    test("throws error for non-existent file at ref", async () => {
      // Create a commit without the file
      await writeFile(join(repoPath, "other.txt"), "Other");
      await execGit(["add", "other.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial"], { cwd: repoPath });

      await expect(
        getFileContent(repoPath, "nonexistent.txt", "HEAD"),
      ).rejects.toThrow();
    });
  });

  describe("getChangedFiles", () => {
    test("returns empty array for clean working tree", async () => {
      // Create initial commit
      await writeFile(join(repoPath, "file.txt"), "Content");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial"], { cwd: repoPath });

      const files = await getChangedFiles(repoPath);
      expect(files).toEqual([]);
    });

    test("detects staged files", async () => {
      await writeFile(join(repoPath, "new-file.txt"), "New content");
      await execGit(["add", "new-file.txt"], { cwd: repoPath });

      const files = await getChangedFiles(repoPath);
      expect(files.length).toBeGreaterThan(0);
      const newFile = files.find((f) => f.path === "new-file.txt");
      expect(newFile).toBeDefined();
      expect(newFile?.status).toBe("added");
      expect(newFile?.staged).toBe(true);
    });

    test("detects unstaged modifications", async () => {
      // Create and commit a file
      await writeFile(join(repoPath, "file.txt"), "Initial");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial"], { cwd: repoPath });

      // Modify without staging
      await writeFile(join(repoPath, "file.txt"), "Modified");

      const files = await getChangedFiles(repoPath);
      expect(files.length).toBeGreaterThan(0);
      const modifiedFile = files.find((f) => f.path === "file.txt");
      expect(modifiedFile).toBeDefined();
      expect(modifiedFile?.status).toBe("modified");
      expect(modifiedFile?.staged).toBe(false);
    });

    test("detects untracked files", async () => {
      await writeFile(join(repoPath, "untracked.txt"), "Untracked");

      const files = await getChangedFiles(repoPath);
      expect(files.length).toBeGreaterThan(0);
      const untrackedFile = files.find((f) => f.path === "untracked.txt");
      expect(untrackedFile).toBeDefined();
      expect(untrackedFile?.status).toBe("untracked");
    });

    test("compares against base ref", async () => {
      // Create initial commit
      await writeFile(join(repoPath, "file1.txt"), "Content 1");
      await execGit(["add", "file1.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "First"], { cwd: repoPath });

      // Create second commit with new file
      await writeFile(join(repoPath, "file2.txt"), "Content 2");
      await execGit(["add", "file2.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Second"], { cwd: repoPath });

      const files = await getChangedFiles(repoPath, "HEAD~1");
      expect(files.length).toBe(1);
      expect(files[0]?.path).toBe("file2.txt");
      expect(files[0]?.status).toBe("added");
    });

    test("detects deleted files", async () => {
      // Create and commit a file
      await writeFile(join(repoPath, "file.txt"), "Content");
      await execGit(["add", "file.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Initial"], { cwd: repoPath });

      // Delete the file
      await execGit(["rm", "file.txt"], { cwd: repoPath });

      const files = await getChangedFiles(repoPath);
      expect(files.length).toBeGreaterThan(0);
      const deletedFile = files.find((f) => f.path === "file.txt");
      expect(deletedFile).toBeDefined();
      expect(deletedFile?.status).toBe("deleted");
    });
  });
});
