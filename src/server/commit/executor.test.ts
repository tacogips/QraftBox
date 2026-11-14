/**
 * Tests for Commit Executor
 *
 * Integration tests that work with real git repositories.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  buildContext,
  executeCommit,
  previewCommit,
  getCurrentBranchName,
  CommitError,
} from "./executor";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Helper to create a test git repository
 */
async function createTestRepo(): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qraftbox-test-"));

  // Initialize git repo
  await Bun.spawn(["git", "init"], { cwd: tmpDir }).exited;
  await Bun.spawn(["git", "config", "user.name", "Test User"], {
    cwd: tmpDir,
  }).exited;
  await Bun.spawn(["git", "config", "user.email", "test@example.com"], {
    cwd: tmpDir,
  }).exited;

  return tmpDir;
}

/**
 * Helper to cleanup test repository
 */
function cleanupTestRepo(repoPath: string): void {
  fs.rmSync(repoPath, { recursive: true, force: true });
}

/**
 * Helper to create a file in the test repo
 */
function createFile(repoPath: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(repoPath, filename), content, "utf-8");
}

/**
 * Helper to stage a file
 */
async function stageFile(repoPath: string, filename: string): Promise<void> {
  await Bun.spawn(["git", "add", filename], { cwd: repoPath }).exited;
}

/**
 * Helper to create a commit
 */
async function createCommit(repoPath: string, message: string): Promise<void> {
  await Bun.spawn(["git", "commit", "-m", message], { cwd: repoPath }).exited;
}

describe("getCurrentBranchName", () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = await createTestRepo();
  });

  afterEach(() => {
    cleanupTestRepo(testRepo);
  });

  test("should return current branch name", async () => {
    // Create initial commit to establish branch
    createFile(testRepo, "test.txt", "initial");
    await stageFile(testRepo, "test.txt");
    await createCommit(testRepo, "Initial commit");

    const branchName = await getCurrentBranchName(testRepo);

    expect(branchName).toBe("main");
  });

  test("should return branch name after checkout", async () => {
    // Create initial commit
    createFile(testRepo, "test.txt", "initial");
    await stageFile(testRepo, "test.txt");
    await createCommit(testRepo, "Initial commit");

    // Create and checkout new branch
    await Bun.spawn(["git", "checkout", "-b", "feature/test"], {
      cwd: testRepo,
    }).exited;

    const branchName = await getCurrentBranchName(testRepo);

    expect(branchName).toBe("feature/test");
  });

  test("should throw CommitError for invalid repository", async () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "non-git-"));

    try {
      await expect(getCurrentBranchName(nonGitDir)).rejects.toThrow(
        CommitError,
      );
    } finally {
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

describe("buildContext", () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = await createTestRepo();

    // Create initial commit to establish history
    createFile(testRepo, "initial.txt", "initial content");
    await stageFile(testRepo, "initial.txt");
    await createCommit(testRepo, "Initial commit");
  });

  afterEach(() => {
    cleanupTestRepo(testRepo);
  });

  test("should build context with staged files", async () => {
    // Create and stage files
    createFile(testRepo, "file1.txt", "content 1");
    createFile(testRepo, "file2.txt", "content 2");
    await stageFile(testRepo, "file1.txt");
    await stageFile(testRepo, "file2.txt");

    const context = await buildContext(testRepo);

    expect(context.stagedFiles).toHaveLength(2);
    expect(context.stagedFiles[0]?.path).toBe("file1.txt");
    expect(context.stagedFiles[0]?.status).toBe("A");
    expect(context.stagedFiles[1]?.path).toBe("file2.txt");
    expect(context.stagedFiles[1]?.status).toBe("A");
  });

  test("should include staged diff in context", async () => {
    createFile(testRepo, "test.txt", "test content\n");
    await stageFile(testRepo, "test.txt");

    const context = await buildContext(testRepo);

    expect(context.stagedDiff).toContain("test.txt");
    expect(context.stagedDiff).toContain("test content");
  });

  test("should include branch name in context", async () => {
    createFile(testRepo, "test.txt", "content");
    await stageFile(testRepo, "test.txt");

    const context = await buildContext(testRepo);

    expect(context.branchName).toBe("main");
  });

  test("should include recent commits in context", async () => {
    // Create additional commits
    createFile(testRepo, "file1.txt", "content 1");
    await stageFile(testRepo, "file1.txt");
    await createCommit(testRepo, "Add file1");

    createFile(testRepo, "file2.txt", "content 2");
    await stageFile(testRepo, "file2.txt");
    await createCommit(testRepo, "Add file2");

    // Stage new changes
    createFile(testRepo, "file3.txt", "content 3");
    await stageFile(testRepo, "file3.txt");

    const context = await buildContext(testRepo);

    expect(context.recentCommits.length).toBeGreaterThan(0);
    expect(context.recentCommits[0]?.message).toBe("Add file2");
    expect(context.recentCommits[1]?.message).toBe("Add file1");
  });

  test("should include repository root in context", async () => {
    createFile(testRepo, "test.txt", "content");
    await stageFile(testRepo, "test.txt");

    const context = await buildContext(testRepo);

    expect(context.repositoryRoot).toBe(testRepo);
  });

  test("should handle modified files", async () => {
    // Modify and stage the initial file
    createFile(testRepo, "initial.txt", "modified content");
    await stageFile(testRepo, "initial.txt");

    const context = await buildContext(testRepo);

    expect(context.stagedFiles).toHaveLength(1);
    expect(context.stagedFiles[0]?.path).toBe("initial.txt");
    expect(context.stagedFiles[0]?.status).toBe("M");
  });
});

describe("executeCommit", () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = await createTestRepo();

    // Create initial commit
    createFile(testRepo, "initial.txt", "initial");
    await stageFile(testRepo, "initial.txt");
    await createCommit(testRepo, "Initial commit");
  });

  afterEach(() => {
    cleanupTestRepo(testRepo);
  });

  test("should successfully commit staged changes", async () => {
    // Stage changes
    createFile(testRepo, "test.txt", "test content");
    await stageFile(testRepo, "test.txt");

    const result = await executeCommit(testRepo, "Test commit message");

    expect(result.success).toBe(true);
    expect(result.commitHash).toBeTruthy();
    expect(result.commitHash).toHaveLength(40); // Full SHA-1 hash
    expect(result.message).toBe("Test commit message");
    expect(result.error).toBeNull();
  });

  test("should return commit hash for successful commit", async () => {
    createFile(testRepo, "file1.txt", "content");
    await stageFile(testRepo, "file1.txt");

    const result = await executeCommit(testRepo, "Add file1");

    expect(result.success).toBe(true);
    expect(result.commitHash).toMatch(/^[0-9a-f]{40}$/);
  });

  test("should fail when commit message is empty", async () => {
    createFile(testRepo, "test.txt", "content");
    await stageFile(testRepo, "test.txt");

    const result = await executeCommit(testRepo, "");

    expect(result.success).toBe(false);
    expect(result.commitHash).toBeNull();
    expect(result.error).toBe("Commit message cannot be empty");
  });

  test("should fail when commit message is whitespace only", async () => {
    createFile(testRepo, "test.txt", "content");
    await stageFile(testRepo, "test.txt");

    const result = await executeCommit(testRepo, "   ");

    expect(result.success).toBe(false);
    expect(result.commitHash).toBeNull();
    expect(result.error).toBe("Commit message cannot be empty");
  });

  test("should fail when no changes are staged", async () => {
    // No staged changes
    const result = await executeCommit(testRepo, "Test commit");

    expect(result.success).toBe(false);
    expect(result.commitHash).toBeNull();
    expect(result.error).toContain("Commit failed");
  });

  test("should handle multiline commit messages", async () => {
    createFile(testRepo, "test.txt", "content");
    await stageFile(testRepo, "test.txt");

    const message = "feat: add feature\n\nDetailed description here";
    const result = await executeCommit(testRepo, message);

    expect(result.success).toBe(true);
    expect(result.message).toBe(message);
  });
});

describe("previewCommit", () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = await createTestRepo();

    // Create initial commit
    createFile(testRepo, "initial.txt", "initial");
    await stageFile(testRepo, "initial.txt");
    await createCommit(testRepo, "Initial commit");
  });

  afterEach(() => {
    cleanupTestRepo(testRepo);
  });

  test("should generate preview text", async () => {
    // Stage changes
    createFile(testRepo, "file1.txt", "content 1");
    createFile(testRepo, "file2.txt", "content 2");
    await stageFile(testRepo, "file1.txt");
    await stageFile(testRepo, "file2.txt");

    const context = await buildContext(testRepo);
    const preview = await previewCommit(context, "test-template");

    expect(preview).toContain("Commit Prompt Preview");
    expect(preview).toContain("Template: test-template");
    expect(preview).toContain("Branch: main");
    expect(preview).toContain("file1.txt");
    expect(preview).toContain("file2.txt");
  });

  test("should include staged files in preview", async () => {
    createFile(testRepo, "test.txt", "test");
    await stageFile(testRepo, "test.txt");

    const context = await buildContext(testRepo);
    const preview = await previewCommit(context, "template");

    expect(preview).toContain("Staged Files");
    expect(preview).toContain("test.txt");
    expect(preview).toContain("A"); // Added status
  });

  test("should include recent commits in preview", async () => {
    // Create another commit
    createFile(testRepo, "file1.txt", "content");
    await stageFile(testRepo, "file1.txt");
    await createCommit(testRepo, "Add file1");

    // Stage new changes
    createFile(testRepo, "file2.txt", "content");
    await stageFile(testRepo, "file2.txt");

    const context = await buildContext(testRepo);
    const preview = await previewCommit(context, "template");

    expect(preview).toContain("Recent Commits");
    expect(preview).toContain("Add file1");
  });

  test("should include diff in preview", async () => {
    createFile(testRepo, "test.txt", "line1\nline2\n");
    await stageFile(testRepo, "test.txt");

    const context = await buildContext(testRepo);
    const preview = await previewCommit(context, "template");

    expect(preview).toContain("Staged Diff");
    expect(preview).toContain("test.txt");
  });

  test("should truncate long diffs in preview", async () => {
    // Create a large diff
    const largeContent = "x".repeat(1000);
    createFile(testRepo, "large.txt", largeContent);
    await stageFile(testRepo, "large.txt");

    const context = await buildContext(testRepo);
    const preview = await previewCommit(context, "template");

    expect(preview).toContain("(truncated)");
  });

  test("should include repository path in preview", async () => {
    createFile(testRepo, "test.txt", "content");
    await stageFile(testRepo, "test.txt");

    const context = await buildContext(testRepo);
    const preview = await previewCommit(context, "template");

    expect(preview).toContain(`Repository: ${testRepo}`);
  });
});
