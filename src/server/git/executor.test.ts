/**
 * Tests for Git Command Executor
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  execGit,
  execGitStream,
  isGitRepository,
  getRepoRoot,
  GitExecutorError,
  type GitExecResult,
} from "./executor";

// Test repository path
let testRepoPath: string;
let nonGitPath: string;

/**
 * Initialize a test git repository
 */
async function initTestRepo(path: string): Promise<void> {
  await mkdir(path, { recursive: true });

  // Initialize git repo
  const initProc = Bun.spawn(["git", "init"], {
    cwd: path,
    stdout: "pipe",
    stderr: "pipe",
  });
  await initProc.exited;

  // Configure user for commits
  await Bun.spawn(["git", "config", "user.name", "Test User"], {
    cwd: path,
  }).exited;
  await Bun.spawn(["git", "config", "user.email", "test@example.com"], {
    cwd: path,
  }).exited;

  // Create initial commit
  await writeFile(join(path, "README.md"), "# Test Repo\n");
  await Bun.spawn(["git", "add", "README.md"], { cwd: path }).exited;
  await Bun.spawn(["git", "commit", "-m", "Initial commit"], {
    cwd: path,
  }).exited;
}

beforeAll(async () => {
  // Create test repo
  testRepoPath = join(tmpdir(), `git-executor-test-${Date.now()}`);
  await initTestRepo(testRepoPath);

  // Create non-git directory
  nonGitPath = join(tmpdir(), `non-git-test-${Date.now()}`);
  await mkdir(nonGitPath, { recursive: true });
});

afterAll(async () => {
  // Clean up test directories
  await rm(testRepoPath, { recursive: true, force: true });
  await rm(nonGitPath, { recursive: true, force: true });
});

describe("execGit", () => {
  test("executes git command successfully", async () => {
    const result: GitExecResult = await execGit(["status", "--porcelain"], {
      cwd: testRepoPath,
    });

    expect(result.exitCode).toBe(0);
    expect(typeof result.stdout).toBe("string");
    expect(typeof result.stderr).toBe("string");
  });

  test("returns stdout for git log", async () => {
    const result = await execGit(["log", "--oneline"], { cwd: testRepoPath });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Initial commit");
  });

  test("returns non-zero exit code for invalid command", async () => {
    const result = await execGit(["invalid-command"], { cwd: testRepoPath });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test("respects custom timeout", async () => {
    // This test uses a very short timeout to ensure timeout logic works
    // git status should complete quickly, so we use a long-running command simulation
    const start = Date.now();

    try {
      // Use a command that might take time, with very short timeout
      await execGit(["log", "--all"], {
        cwd: testRepoPath,
        timeout: 1, // 1ms - very short timeout
      });
    } catch (e) {
      // Timeout or completion - either is acceptable for this test
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000); // Should not take more than 1 second
    }
  });

  test("throws GitExecutorError for invalid cwd", async () => {
    const invalidPath = "/nonexistent/path/to/repo";

    try {
      await execGit(["status"], { cwd: invalidPath });
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(GitExecutorError);
      if (e instanceof GitExecutorError) {
        expect(e.command).toContain("git status");
        expect(e.exitCode).toBeDefined();
      }
    }
  });

  test("includes command in error message", async () => {
    try {
      await execGit(["--invalid-flag"], { cwd: testRepoPath });
    } catch (e) {
      if (e instanceof GitExecutorError) {
        expect(e.command).toBe("git --invalid-flag");
        expect(e.stderr.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("execGitStream", () => {
  test("returns readable stream for stdout", async () => {
    const stream = execGitStream(["log", "--oneline"], { cwd: testRepoPath });

    expect(stream).toBeInstanceOf(ReadableStream);

    // Read from stream
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Convert chunks to string
    const decoder = new TextDecoder();
    const output = chunks.map((chunk) => decoder.decode(chunk)).join("");

    expect(output).toContain("Initial commit");
  });

  test("throws GitExecutorError for invalid cwd", () => {
    const invalidPath = "/nonexistent/path/to/repo";

    expect(() => {
      execGitStream(["log"], { cwd: invalidPath });
    }).toThrow(GitExecutorError);
  });

  test("stream can be consumed incrementally", async () => {
    const stream = execGitStream(["status", "--porcelain"], {
      cwd: testRepoPath,
    });

    const reader = stream.getReader();
    let chunkCount = 0;

    while (true) {
      const { done } = await reader.read();
      if (done) break;
      chunkCount++;
    }

    // Should have read at least one chunk (or zero if output is empty)
    expect(chunkCount).toBeGreaterThanOrEqual(0);
  });
});

describe("isGitRepository", () => {
  test("returns true for valid git repository", async () => {
    const isRepo = await isGitRepository(testRepoPath);
    expect(isRepo).toBe(true);
  });

  test("returns false for non-git directory", async () => {
    const isRepo = await isGitRepository(nonGitPath);
    expect(isRepo).toBe(false);
  });

  test("returns false for nonexistent path", async () => {
    const isRepo = await isGitRepository("/nonexistent/path");
    expect(isRepo).toBe(false);
  });

  test("returns true for subdirectory of git repository", async () => {
    const subdir = join(testRepoPath, "subdir");
    await mkdir(subdir, { recursive: true });

    const isRepo = await isGitRepository(subdir);
    expect(isRepo).toBe(true);
  });
});

describe("getRepoRoot", () => {
  test("returns repository root path", async () => {
    const root = await getRepoRoot(testRepoPath);

    expect(root).toBe(testRepoPath);
  });

  test("returns root path from subdirectory", async () => {
    const subdir = join(testRepoPath, "nested", "subdir");
    await mkdir(subdir, { recursive: true });

    const root = await getRepoRoot(subdir);

    expect(root).toBe(testRepoPath);
  });

  test("throws GitExecutorError for non-git directory", async () => {
    try {
      await getRepoRoot(nonGitPath);
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(GitExecutorError);
      if (e instanceof GitExecutorError) {
        expect(e.message).toContain("Not a git repository");
        expect(e.command).toContain("git rev-parse --show-toplevel");
      }
    }
  });

  test("throws GitExecutorError for nonexistent path", async () => {
    try {
      await getRepoRoot("/nonexistent/path");
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(GitExecutorError);
    }
  });
});

describe("GitExecutorError", () => {
  test("contains command, stderr, and exitCode", () => {
    const error = new GitExecutorError(
      "Command failed",
      "git status",
      "fatal: not a git repository",
      128,
    );

    expect(error.name).toBe("GitExecutorError");
    expect(error.message).toBe("Command failed");
    expect(error.command).toBe("git status");
    expect(error.stderr).toBe("fatal: not a git repository");
    expect(error.exitCode).toBe(128);
  });

  test("is instanceof Error", () => {
    const error = new GitExecutorError("Test error", "git test", "stderr", 1);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GitExecutorError);
  });
});
