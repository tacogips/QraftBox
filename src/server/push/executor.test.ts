/**
 * Unit tests for Push Executor
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  buildContext,
  executePush,
  previewPush,
  getPushStatus,
  getRemotes,
  PushError,
  type PushOptions,
  type Remote,
} from "./executor";
import type { PushPromptContext } from "../../types/push-context";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

/**
 * Helper to create a temporary git repository for testing
 */
async function createTestRepo(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aynd-push-test-"));

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
async function cleanupTestRepo(repoPath: string): Promise<void> {
  await fs.rm(repoPath, { recursive: true, force: true });
}

/**
 * Helper to create a commit in test repo
 */
async function createCommit(
  repoPath: string,
  filename: string,
  content: string,
  message: string,
): Promise<void> {
  const filePath = path.join(repoPath, filename);
  await fs.writeFile(filePath, content);
  await Bun.spawn(["git", "add", filename], { cwd: repoPath }).exited;
  await Bun.spawn(["git", "commit", "-m", message], { cwd: repoPath }).exited;
}

/**
 * Helper to add remote to test repo
 */
async function addRemote(
  repoPath: string,
  name: string,
  url: string,
): Promise<void> {
  await Bun.spawn(["git", "remote", "add", name, url], {
    cwd: repoPath,
  }).exited;
}

describe("PushError", () => {
  test("creates error with command and stderr", () => {
    const error = new PushError(
      "Test error",
      "git push origin main",
      "Permission denied",
    );

    expect(error.message).toBe("Test error");
    expect(error.command).toBe("git push origin main");
    expect(error.stderr).toBe("Permission denied");
    expect(error.name).toBe("PushError");
  });
});

describe("getPushStatus", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await createTestRepo();
  });

  afterEach(async () => {
    await cleanupTestRepo(repoPath);
  });

  test("returns push status for repository", async () => {
    await createCommit(repoPath, "test.txt", "initial", "Initial commit");

    const status = await getPushStatus(repoPath);

    expect(status).toBeDefined();
    expect(status.branchName).toBe("main");
    expect(status.canPush).toBe(true);
    expect(status.hasUpstream).toBe(false);
    expect(status.aheadCount).toBeGreaterThan(0);
    expect(status.behindCount).toBe(0);
  });
});

describe("getRemotes", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await createTestRepo();
  });

  afterEach(async () => {
    await cleanupTestRepo(repoPath);
  });

  test("returns empty array when no remotes", async () => {
    const remotes = await getRemotes(repoPath);

    expect(remotes).toEqual([]);
  });

  test("returns remotes with fetchUrl and pushUrl", async () => {
    await addRemote(repoPath, "origin", "https://github.com/user/repo.git");
    await addRemote(repoPath, "upstream", "https://github.com/upstream/repo.git");

    const remotes = await getRemotes(repoPath);

    expect(remotes.length).toBe(2);

    const origin = remotes.find((r) => r.name === "origin");
    expect(origin).toBeDefined();
    if (origin !== undefined) {
      expect(origin.fetchUrl).toBe("https://github.com/user/repo.git");
      expect(origin.pushUrl).toBe("https://github.com/user/repo.git");
    }

    const upstream = remotes.find((r) => r.name === "upstream");
    expect(upstream).toBeDefined();
    if (upstream !== undefined) {
      expect(upstream.fetchUrl).toBe("https://github.com/upstream/repo.git");
      expect(upstream.pushUrl).toBe("https://github.com/upstream/repo.git");
    }
  });

  test("returns Remote type with correct shape", async () => {
    await addRemote(repoPath, "origin", "https://github.com/user/repo.git");

    const remotes = await getRemotes(repoPath);

    expect(remotes.length).toBe(1);

    const remote: Remote = remotes[0]!;
    expect(remote).toHaveProperty("name");
    expect(remote).toHaveProperty("fetchUrl");
    expect(remote).toHaveProperty("pushUrl");
    expect(typeof remote.name).toBe("string");
    expect(typeof remote.fetchUrl).toBe("string");
    expect(typeof remote.pushUrl).toBe("string");
  });
});

describe("buildContext", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await createTestRepo();
  });

  afterEach(async () => {
    await cleanupTestRepo(repoPath);
  });

  test("builds context for repo without upstream", async () => {
    // Create initial commit
    await createCommit(repoPath, "test.txt", "initial", "Initial commit");

    const context = await buildContext(repoPath);

    expect(context.branchName).toBe("main");
    expect(context.remoteName).toBe("origin"); // Default when no remotes
    expect(context.hasUpstream).toBe(false);
    expect(context.aheadCount).toBeGreaterThan(0);
    expect(context.behindCount).toBe(0);
    expect(context.unpushedCommits.length).toBeGreaterThan(0);
    expect(context.customVariables).toEqual({});
  });

  test("builds context with origin remote", async () => {
    // Add origin remote
    await addRemote(repoPath, "origin", "git@github.com:user/repo.git");
    await createCommit(repoPath, "test.txt", "initial", "Initial commit");

    const context = await buildContext(repoPath);

    expect(context.remoteName).toBe("origin");
    expect(context.branchName).toBe("main");
  });

  test("builds context with non-origin remote when origin doesn't exist", async () => {
    // Add upstream remote (not origin)
    await addRemote(repoPath, "upstream", "git@github.com:upstream/repo.git");
    await createCommit(repoPath, "test.txt", "initial", "Initial commit");

    const context = await buildContext(repoPath);

    // Should use first available remote
    expect(context.remoteName).toBe("upstream");
  });

  test("includes unpushed commits in context", async () => {
    await createCommit(repoPath, "file1.txt", "content1", "Commit 1");
    await createCommit(repoPath, "file2.txt", "content2", "Commit 2");

    const context = await buildContext(repoPath);

    expect(context.unpushedCommits.length).toBeGreaterThanOrEqual(2);
    expect(context.aheadCount).toBeGreaterThanOrEqual(2);

    // Check commit structure
    const commit = context.unpushedCommits[0];
    expect(commit).toBeDefined();
    if (commit !== undefined) {
      expect(commit.hash).toBeDefined();
      expect(commit.shortHash).toBeDefined();
      expect(commit.message).toBeDefined();
      expect(commit.author).toBeDefined();
      expect(commit.date).toBeGreaterThan(0);
    }
  });
});

describe("executePush", () => {
  let repoPath: string;
  let remoteRepoPath: string;

  beforeEach(async () => {
    // Create main repo
    repoPath = await createTestRepo();

    // Create a bare remote repo
    remoteRepoPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "aynd-push-remote-"),
    );
    await Bun.spawn(["git", "init", "--bare"], { cwd: remoteRepoPath }).exited;

    // Add remote to main repo
    await addRemote(repoPath, "origin", remoteRepoPath);

    // Create initial commit
    await createCommit(repoPath, "test.txt", "initial", "Initial commit");
  });

  afterEach(async () => {
    await cleanupTestRepo(repoPath);
    await cleanupTestRepo(remoteRepoPath);
  });

  test("pushes commits successfully with default options", async () => {
    const options: PushOptions = {};

    const result = await executePush(repoPath, options);

    expect(result.success).toBe(true);
    expect(result.remote).toBe("origin");
    expect(result.branch).toBe("main");
    expect(result.pushedCommits).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
    expect(result.sessionId).toMatch(/^push-\d+$/);
  });

  test("pushes with setUpstream flag", async () => {
    const options: PushOptions = {
      setUpstream: true,
    };

    const result = await executePush(repoPath, options);

    expect(result.success).toBe(true);
    expect(result.remote).toBe("origin");
    expect(result.branch).toBe("main");
  });

  test("pushes with custom remote and branch", async () => {
    // Add another remote
    const customRemotePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "aynd-push-custom-"),
    );
    await Bun.spawn(["git", "init", "--bare"], {
      cwd: customRemotePath,
    }).exited;
    await addRemote(repoPath, "custom", customRemotePath);

    const options: PushOptions = {
      remote: "custom",
      branch: "main",
    };

    const result = await executePush(repoPath, options);

    expect(result.success).toBe(true);
    expect(result.remote).toBe("custom");
    expect(result.branch).toBe("main");

    await cleanupTestRepo(customRemotePath);
  });

  test("handles push to non-existent remote", async () => {
    const options: PushOptions = {
      remote: "nonexistent",
      branch: "main",
    };

    const result = await executePush(repoPath, options);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Push failed");
    expect(result.sessionId).toMatch(/^push-error-\d+$/);
  });

  test("handles push with no commits", async () => {
    // Push once to sync
    await executePush(repoPath, { setUpstream: true });

    // Try to push again (no new commits)
    const result = await executePush(repoPath, {});

    // Git push with no new commits succeeds with "Everything up-to-date" message
    expect(result.success).toBe(true);
  });

  test("returns session ID for tracking", async () => {
    const result = await executePush(repoPath, {});

    expect(result.sessionId).toBeDefined();
    expect(result.sessionId).toMatch(/^push-\d+$/);
  });
});

describe("previewPush", () => {
  test("generates preview with unpushed commits", async () => {
    const context: PushPromptContext = {
      branchName: "feature-branch",
      remoteName: "origin",
      remoteBranch: "main",
      hasUpstream: true,
      aheadCount: 2,
      behindCount: 0,
      unpushedCommits: [
        {
          hash: "abc123def456abc123def456abc123def456abc1",
          shortHash: "abc123d",
          message: "Add new feature",
          author: "Alice",
          date: 1704067200000, // 2024-01-01 00:00:00 UTC
        },
        {
          hash: "def456abc123def456abc123def456abc123def4",
          shortHash: "def456a",
          message: "Fix bug",
          author: "Bob",
          date: 1704153600000, // 2024-01-02 00:00:00 UTC
        },
      ],
      customVariables: {},
    };

    const preview = await previewPush(context, "default-push");

    expect(preview).toContain("Template: default-push");
    expect(preview).toContain("Branch: feature-branch");
    expect(preview).toContain("Remote: origin");
    expect(preview).toContain("Target Branch: main");
    expect(preview).toContain("Tracking: origin/main");
    expect(preview).toContain("Ahead: 2 commit(s)");
    expect(preview).toContain("Behind: 0 commit(s)");
    expect(preview).toContain("abc123d Add new feature");
    expect(preview).toContain("def456a Fix bug");
  });

  test("generates preview without upstream", async () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      hasUpstream: false,
      aheadCount: 1,
      behindCount: 0,
      unpushedCommits: [
        {
          hash: "abc123def456abc123def456abc123def456abc1",
          shortHash: "abc123d",
          message: "Initial commit",
          author: "Alice",
          date: 1704067200000,
        },
      ],
      customVariables: {},
    };

    const preview = await previewPush(context, "initial-push");

    expect(preview).toContain("No upstream tracking");
    expect(preview).not.toContain("Tracking:");
  });

  test("generates preview with behind warning", async () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      hasUpstream: true,
      aheadCount: 1,
      behindCount: 3,
      unpushedCommits: [
        {
          hash: "abc123def456abc123def456abc123def456abc1",
          shortHash: "abc123d",
          message: "Local commit",
          author: "Alice",
          date: 1704067200000,
        },
      ],
      customVariables: {},
    };

    const preview = await previewPush(context, "force-push");

    expect(preview).toContain("WARNING: Local branch is 3 commit(s) behind");
    expect(preview).toContain("Behind: 3 commit(s)");
  });

  test("generates preview with no commits", async () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      unpushedCommits: [],
      customVariables: {},
    };

    const preview = await previewPush(context, "empty-push");

    expect(preview).toContain("Unpushed Commits (0):");
    expect(preview).toContain("(no unpushed commits)");
  });

  test("formats commit dates correctly", async () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      hasUpstream: true,
      aheadCount: 1,
      behindCount: 0,
      unpushedCommits: [
        {
          hash: "abc123def456abc123def456abc123def456abc1",
          shortHash: "abc123d",
          message: "Test commit",
          author: "Alice",
          date: 1704067200000, // Should format as ISO string
        },
      ],
      customVariables: {},
    };

    const preview = await previewPush(context, "test");

    expect(preview).toContain("2024-01-01T00:00:00.000Z");
  });
});
