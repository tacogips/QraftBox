/**
 * Unit tests for git push operations
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  getPushStatus,
  getUnpushedCommits,
  getRemotes,
  getAheadBehind,
  GitError,
} from "./push";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Test repository setup
 */
let testRepoPath: string;
let remoteRepoPath: string;

/**
 * Helper to execute git commands in test repo
 */
async function gitExec(
  args: string[],
  cwd: string = testRepoPath,
): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}

/**
 * Setup test repository with remote
 */
beforeAll(async () => {
  // Create temporary directories
  testRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "qraftbox-push-test-"),
  );
  remoteRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "qraftbox-push-remote-"),
  );

  // Initialize remote repository (bare)
  await gitExec(["init", "--bare"], remoteRepoPath);

  // Initialize local repository
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Test User"]);
  await gitExec(["config", "user.email", "test@example.com"]);

  // Create initial commit
  await fs.writeFile(path.join(testRepoPath, "initial.txt"), "Initial file\n");
  await gitExec(["add", "initial.txt"]);
  await gitExec(["commit", "-m", "Initial commit"]);

  // Add remote
  await gitExec(["remote", "add", "origin", remoteRepoPath]);
  await gitExec(["branch", "-M", "main"]);
});

/**
 * Cleanup test repositories
 */
afterAll(async () => {
  await fs.rm(testRepoPath, { recursive: true, force: true });
  await fs.rm(remoteRepoPath, { recursive: true, force: true });
});

describe("getAheadBehind", () => {
  test("should return ahead count when no upstream is set", async () => {
    const result = await getAheadBehind(testRepoPath);

    expect(result.ahead).toBeGreaterThan(0);
    expect(result.behind).toBe(0);
  });

  test("should return ahead and behind counts after push and pull", async () => {
    // Push to remote
    await gitExec(["push", "-u", "origin", "main"]);

    // Create a commit
    await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Content 1\n");
    await gitExec(["add", "file1.txt"]);
    await gitExec(["commit", "-m", "Add file1"]);

    const result = await getAheadBehind(testRepoPath);

    expect(result.ahead).toBe(1);
    expect(result.behind).toBe(0);

    // Push the commit
    await gitExec(["push"]);

    const resultAfterPush = await getAheadBehind(testRepoPath);
    expect(resultAfterPush.ahead).toBe(0);
    expect(resultAfterPush.behind).toBe(0);
  });
});

describe("getUnpushedCommits", () => {
  test("should return unpushed commits when ahead of remote", async () => {
    // Create another commit
    await fs.writeFile(path.join(testRepoPath, "file2.txt"), "Content 2\n");
    await gitExec(["add", "file2.txt"]);
    await gitExec(["commit", "-m", "Add file2"]);

    const commits = await getUnpushedCommits(testRepoPath);

    expect(commits.length).toBe(1);
    const commit = commits[0];
    expect(commit).toBeDefined();
    if (commit === undefined) return;

    expect(commit.hash).toMatch(/^[0-9a-f]{40}$/i);
    expect(commit.shortHash).toMatch(/^[0-9a-f]{7,8}$/i);
    expect(commit.message).toBe("Add file2");
    expect(commit.author).toBe("Test User");
    expect(commit.date).toBeGreaterThan(0);

    // Push the commit
    await gitExec(["push"]);
  });

  test("should return empty array when no unpushed commits", async () => {
    const commits = await getUnpushedCommits(testRepoPath);

    expect(commits).toEqual([]);
  });

  test("should return multiple unpushed commits", async () => {
    // Create multiple commits
    await fs.writeFile(path.join(testRepoPath, "file3.txt"), "Content 3\n");
    await gitExec(["add", "file3.txt"]);
    await gitExec(["commit", "-m", "Add file3"]);

    await fs.writeFile(path.join(testRepoPath, "file4.txt"), "Content 4\n");
    await gitExec(["add", "file4.txt"]);
    await gitExec(["commit", "-m", "Add file4"]);

    const commits = await getUnpushedCommits(testRepoPath);

    expect(commits.length).toBe(2);

    // Commits should be in reverse chronological order (newest first)
    const firstCommit = commits[0];
    expect(firstCommit).toBeDefined();
    if (firstCommit === undefined) return;
    expect(firstCommit.message).toBe("Add file4");

    const secondCommit = commits[1];
    expect(secondCommit).toBeDefined();
    if (secondCommit === undefined) return;
    expect(secondCommit.message).toBe("Add file3");

    // Cleanup
    await gitExec(["push"]);
  });
});

describe("getRemotes", () => {
  test("should list all remotes", async () => {
    const remotes = await getRemotes(testRepoPath);

    expect(remotes.length).toBeGreaterThan(0);

    const origin = remotes.find((r) => r.name === "origin");
    expect(origin).toBeDefined();
    if (origin === undefined) return;

    expect(origin.name).toBe("origin");
    expect(origin.url).toBe(remoteRepoPath);
    expect(origin.branch).toBe("main");
  });

  test("should handle repository with no remotes", async () => {
    // Create a new repo without remotes
    const noRemoteRepoPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "qraftbox-no-remote-"),
    );

    await gitExec(["init"], noRemoteRepoPath);
    await gitExec(["config", "user.name", "Test User"], noRemoteRepoPath);
    await gitExec(
      ["config", "user.email", "test@example.com"],
      noRemoteRepoPath,
    );

    const remotes = await getRemotes(noRemoteRepoPath);
    expect(remotes).toEqual([]);

    // Cleanup
    await fs.rm(noRemoteRepoPath, { recursive: true, force: true });
  });

  test("should handle multiple remotes", async () => {
    // Add another remote
    const secondRemotePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "qraftbox-second-remote-"),
    );
    await gitExec(["init", "--bare"], secondRemotePath);
    await gitExec(["remote", "add", "upstream", secondRemotePath]);

    const remotes = await getRemotes(testRepoPath);

    expect(remotes.length).toBeGreaterThanOrEqual(2);

    const origin = remotes.find((r) => r.name === "origin");
    expect(origin).toBeDefined();

    const upstream = remotes.find((r) => r.name === "upstream");
    expect(upstream).toBeDefined();
    if (upstream === undefined) return;

    expect(upstream.name).toBe("upstream");
    expect(upstream.url).toBe(secondRemotePath);

    // Cleanup
    await gitExec(["remote", "remove", "upstream"]);
    await fs.rm(secondRemotePath, { recursive: true, force: true });
  });
});

describe("getPushStatus", () => {
  test("should return complete push status", async () => {
    // Create a commit to have something to push
    await fs.writeFile(path.join(testRepoPath, "file5.txt"), "Content 5\n");
    await gitExec(["add", "file5.txt"]);
    await gitExec(["commit", "-m", "Add file5"]);

    const status = await getPushStatus(testRepoPath);

    expect(status.canPush).toBe(true);
    expect(status.branchName).toBe("main");
    expect(status.hasUpstream).toBe(true);
    expect(status.aheadCount).toBe(1);
    expect(status.behindCount).toBe(0);
    expect(status.unpushedCommits.length).toBe(1);
    expect(status.error).toBeUndefined();

    const commit = status.unpushedCommits[0];
    expect(commit).toBeDefined();
    if (commit === undefined) return;
    expect(commit.message).toBe("Add file5");

    expect(status.remote).not.toBeNull();
    if (status.remote === null) return;
    expect(status.remote.name).toBe("origin");
    expect(status.remote.url).toBe(remoteRepoPath);
    expect(status.remote.branch).toBe("main");

    // Cleanup
    await gitExec(["push"]);
  });

  test("should return canPush false when nothing to push", async () => {
    const status = await getPushStatus(testRepoPath);

    expect(status.canPush).toBe(false);
    expect(status.aheadCount).toBe(0);
    expect(status.unpushedCommits).toEqual([]);
  });

  test("should handle branch without upstream", async () => {
    // Create and checkout new branch
    await gitExec(["checkout", "-b", "feature-branch"]);

    const status = await getPushStatus(testRepoPath);

    expect(status.branchName).toBe("feature-branch");
    expect(status.hasUpstream).toBe(false);
    expect(status.remote).toBeNull();

    // Should still detect commits
    await fs.writeFile(path.join(testRepoPath, "feature.txt"), "Feature\n");
    await gitExec(["add", "feature.txt"]);
    await gitExec(["commit", "-m", "Add feature"]);

    const statusWithCommit = await getPushStatus(testRepoPath);
    expect(statusWithCommit.canPush).toBe(true);
    expect(statusWithCommit.aheadCount).toBeGreaterThan(0);
    expect(statusWithCommit.unpushedCommits.length).toBeGreaterThan(0);

    // Cleanup
    await gitExec(["checkout", "main"]);
    await gitExec(["branch", "-D", "feature-branch"]);
  });

  test("should detect behind status", async () => {
    // Create a commit directly on remote
    const tempClonePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "qraftbox-clone-"),
    );
    await gitExec(["clone", remoteRepoPath, tempClonePath]);
    await gitExec(["config", "user.name", "Test User"], tempClonePath);
    await gitExec(["config", "user.email", "test@example.com"], tempClonePath);

    await fs.writeFile(path.join(tempClonePath, "remote.txt"), "Remote\n");
    await gitExec(["add", "remote.txt"], tempClonePath);
    await gitExec(["commit", "-m", "Remote commit"], tempClonePath);
    await gitExec(["push"], tempClonePath);

    // Fetch in main repo
    await gitExec(["fetch"]);

    const status = await getPushStatus(testRepoPath);
    expect(status.behindCount).toBe(1);

    // Cleanup
    await gitExec(["pull", "--rebase"]);
    await fs.rm(tempClonePath, { recursive: true, force: true });
  });
});

describe("GitError", () => {
  test("should return error in status on invalid repository", async () => {
    const invalidPath = path.join(os.tmpdir(), "invalid-repo-path");

    const status = await getPushStatus(invalidPath);

    expect(status.error).toBeDefined();
    expect(status.canPush).toBe(false);
    expect(status.branchName).toBe("");
  });

  test("should throw GitError on invalid repository for direct git operations", async () => {
    const invalidPath = path.join(os.tmpdir(), "invalid-repo-path");

    await expect(getAheadBehind(invalidPath)).rejects.toThrow(GitError);
    await expect(getUnpushedCommits(invalidPath)).rejects.toThrow(GitError);
  });
});
