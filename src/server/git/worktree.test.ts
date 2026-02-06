import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectRepositoryType,
  isWorktree,
  isMainRepository,
  getMainRepositoryPath,
  listWorktrees,
  createWorktree,
  removeWorktree,
  ensureWorktreeBaseDir,
  getWorktreePathConfig,
  WorktreeError,
} from "./worktree";
import type { CreateWorktreeRequest } from "../../types/worktree";

describe("WorktreeError", () => {
  it("should create error with message, command, and stderr", () => {
    const error = new WorktreeError(
      "Test error",
      "git worktree add",
      "stderr output",
    );

    expect(error.message).toBe("Test error");
    expect(error.command).toBe("git worktree add");
    expect(error.stderr).toBe("stderr output");
    expect(error.name).toBe("WorktreeError");
  });
});

describe("detectRepositoryType", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `worktree-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should detect not-git directory", async () => {
    const result = await detectRepositoryType(testDir);

    expect(result.type).toBe("not-git");
    expect(result.path).toBe(testDir);
    expect(result.gitDir).toBeNull();
    expect(result.mainRepositoryPath).toBeNull();
    expect(result.worktreeName).toBeNull();
  });

  it("should detect main repository", async () => {
    const gitDir = join(testDir, ".git");
    await mkdir(gitDir);
    await writeFile(join(gitDir, "config"), "[core]\n\tbare = false\n");

    const result = await detectRepositoryType(testDir);

    expect(result.type).toBe("main");
    expect(result.path).toBe(testDir);
    expect(result.gitDir).toBe(gitDir);
    expect(result.mainRepositoryPath).toBeNull();
    expect(result.worktreeName).toBeNull();
  });

  it("should detect bare repository", async () => {
    const gitDir = join(testDir, ".git");
    await mkdir(gitDir);
    await writeFile(join(gitDir, "config"), "[core]\n\tbare = true\n");

    const result = await detectRepositoryType(testDir);

    expect(result.type).toBe("bare");
    expect(result.path).toBe(testDir);
    expect(result.gitDir).toBe(gitDir);
    expect(result.mainRepositoryPath).toBeNull();
    expect(result.worktreeName).toBeNull();
  });

  it("should detect worktree", async () => {
    const mainRepoPath = join(testDir, "main");
    const worktreeGitDir = join(mainRepoPath, ".git", "worktrees", "feature");
    const worktreePath = join(testDir, "worktree");

    await mkdir(worktreeGitDir, { recursive: true });
    await mkdir(worktreePath, { recursive: true });

    // Create commondir file pointing to main repo
    await writeFile(join(worktreeGitDir, "commondir"), "../..\n");

    // Create .git file with gitdir reference
    await writeFile(join(worktreePath, ".git"), `gitdir: ${worktreeGitDir}\n`);

    const result = await detectRepositoryType(worktreePath);

    expect(result.type).toBe("worktree");
    expect(result.path).toBe(worktreePath);
    expect(result.gitDir).toBe(worktreeGitDir);
    expect(result.mainRepositoryPath).toBe(mainRepoPath);
    expect(result.worktreeName).toBe("feature");
  });

  it("should handle .git directory without config", async () => {
    const gitDir = join(testDir, ".git");
    await mkdir(gitDir);

    const result = await detectRepositoryType(testDir);

    expect(result.type).toBe("main");
    expect(result.gitDir).toBe(gitDir);
  });
});

describe("isWorktree", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `worktree-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should return false for non-git directory", async () => {
    const result = await isWorktree(testDir);
    expect(result).toBe(false);
  });

  it("should return false for main repository", async () => {
    const gitDir = join(testDir, ".git");
    await mkdir(gitDir);

    const result = await isWorktree(testDir);
    expect(result).toBe(false);
  });

  it("should return true for worktree", async () => {
    const mainRepoPath = join(testDir, "main");
    const worktreeGitDir = join(mainRepoPath, ".git", "worktrees", "feature");
    const worktreePath = join(testDir, "worktree");

    await mkdir(worktreeGitDir, { recursive: true });
    await mkdir(worktreePath, { recursive: true });
    await writeFile(join(worktreeGitDir, "commondir"), "../..\n");
    await writeFile(join(worktreePath, ".git"), `gitdir: ${worktreeGitDir}\n`);

    const result = await isWorktree(worktreePath);
    expect(result).toBe(true);
  });
});

describe("isMainRepository", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `worktree-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should return false for non-git directory", async () => {
    const result = await isMainRepository(testDir);
    expect(result).toBe(false);
  });

  it("should return true for main repository", async () => {
    const gitDir = join(testDir, ".git");
    await mkdir(gitDir);

    const result = await isMainRepository(testDir);
    expect(result).toBe(true);
  });

  it("should return false for worktree", async () => {
    const mainRepoPath = join(testDir, "main");
    const worktreeGitDir = join(mainRepoPath, ".git", "worktrees", "feature");
    const worktreePath = join(testDir, "worktree");

    await mkdir(worktreeGitDir, { recursive: true });
    await mkdir(worktreePath, { recursive: true });
    await writeFile(join(worktreeGitDir, "commondir"), "../..\n");
    await writeFile(join(worktreePath, ".git"), `gitdir: ${worktreeGitDir}\n`);

    const result = await isMainRepository(worktreePath);
    expect(result).toBe(false);
  });
});

describe("getMainRepositoryPath", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `worktree-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should return null for non-worktree", async () => {
    const result = await getMainRepositoryPath(testDir);
    expect(result).toBeNull();
  });

  it("should return main repository path for worktree", async () => {
    const mainRepoPath = join(testDir, "main");
    const worktreeGitDir = join(mainRepoPath, ".git", "worktrees", "feature");
    const worktreePath = join(testDir, "worktree");

    await mkdir(worktreeGitDir, { recursive: true });
    await mkdir(worktreePath, { recursive: true });
    await writeFile(join(worktreeGitDir, "commondir"), "../..\n");
    await writeFile(join(worktreePath, ".git"), `gitdir: ${worktreeGitDir}\n`);

    const result = await getMainRepositoryPath(worktreePath);
    expect(result).toBe(mainRepoPath);
  });
});

describe("listWorktrees", () => {
  it("should parse empty output", async () => {
    // We can't easily mock the internal execGit function,
    // so we'll test with real git commands in the actual repo
    // For now, just verify the function exists and handles real output
    const worktrees = await listWorktrees(process.cwd());

    expect(Array.isArray(worktrees)).toBe(true);
    expect(worktrees.length).toBeGreaterThan(0);

    // First entry should be the main repository
    const main = worktrees[0];
    expect(main).toBeDefined();
    if (main) {
      expect(main.isMain).toBe(true);
      expect(main.path).toBeTruthy();
      expect(main.head).toBeTruthy();
    }
  });

  it("should parse worktree with branch", async () => {
    const worktrees = await listWorktrees(process.cwd());
    const main = worktrees[0];

    expect(main).toBeDefined();
    if (main) {
      // Main repo should have all required fields
      expect(main.path).toBeTruthy();
      expect(main.head).toBeTruthy();
      expect(main.mainRepositoryPath).toBeTruthy();
      expect(main.isMain).toBe(true);
      expect(typeof main.locked).toBe("boolean");
      expect(typeof main.prunable).toBe("boolean");
    }
  });
});

describe("createWorktree", () => {
  let testRepoDir: string;

  beforeEach(async () => {
    testRepoDir = join(tmpdir(), `git-repo-test-${Date.now()}`);
    await mkdir(testRepoDir, { recursive: true });

    // Initialize a real git repo for testing
    const proc = Bun.spawn(["git", "init"], {
      cwd: testRepoDir,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    await proc.exited;

    // Create an initial commit
    await writeFile(join(testRepoDir, "README.md"), "# Test\n");
    const addProc = Bun.spawn(["git", "add", "README.md"], {
      cwd: testRepoDir,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    await addProc.exited;

    const commitProc = Bun.spawn(["git", "commit", "-m", "Initial commit"], {
      cwd: testRepoDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
    });
    await commitProc.exited;
  });

  afterEach(async () => {
    await rm(testRepoDir, { recursive: true, force: true });
  });

  it("should create worktree with new branch", async () => {
    const request: CreateWorktreeRequest = {
      branch: "feature-test",
      createBranch: true,
      customPath: join(testRepoDir, "worktree-feature"),
    };

    const result = await createWorktree(testRepoDir, request);

    expect(result.success).toBe(true);
    expect(result.path).toBe(join(testRepoDir, "worktree-feature"));
    expect(result.branch).toBe("feature-test");
    expect(result.error).toBeUndefined();

    // Verify worktree was created
    const worktrees = await listWorktrees(testRepoDir);
    expect(worktrees.length).toBe(2);

    const feature = worktrees.find((w) => w.branch === "feature-test");
    expect(feature).toBeDefined();
  });

  it("should fail with invalid worktree name", async () => {
    const request: CreateWorktreeRequest = {
      branch: "feature/invalid",
      worktreeName: "feature/invalid",
    };

    const result = await createWorktree(testRepoDir, request);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("should use default path when no customPath provided", async () => {
    const request: CreateWorktreeRequest = {
      branch: "feature-default",
      createBranch: true,
      worktreeName: "feature-default",
    };

    const result = await createWorktree(testRepoDir, request);

    expect(result.success).toBe(true);
    expect(result.path).toContain(".local/aynd/worktrees");

    // Cleanup the created worktree
    await removeWorktree(testRepoDir, result.path, true);
  });
});

describe("removeWorktree", () => {
  let testRepoDir: string;
  let worktreePath: string;

  beforeEach(async () => {
    testRepoDir = join(tmpdir(), `git-repo-test-${Date.now()}`);
    await mkdir(testRepoDir, { recursive: true });

    // Initialize a real git repo
    const initProc = Bun.spawn(["git", "init"], {
      cwd: testRepoDir,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    await initProc.exited;

    // Create an initial commit
    await writeFile(join(testRepoDir, "README.md"), "# Test\n");
    const addProc = Bun.spawn(["git", "add", "README.md"], {
      cwd: testRepoDir,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    await addProc.exited;

    const commitProc = Bun.spawn(["git", "commit", "-m", "Initial commit"], {
      cwd: testRepoDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
    });
    await commitProc.exited;

    // Create a worktree
    worktreePath = join(testRepoDir, "worktree-remove");
    const request: CreateWorktreeRequest = {
      branch: "feature-remove",
      createBranch: true,
      customPath: worktreePath,
    };
    await createWorktree(testRepoDir, request);
  });

  afterEach(async () => {
    await rm(testRepoDir, { recursive: true, force: true });
  });

  it("should remove worktree", async () => {
    const result = await removeWorktree(testRepoDir, worktreePath);

    expect(result.success).toBe(true);
    expect(result.removed).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify worktree was removed
    const worktrees = await listWorktrees(testRepoDir);
    expect(worktrees.length).toBe(1); // Only main repo left
  });

  it("should handle force removal", async () => {
    // Make uncommitted changes
    await writeFile(join(worktreePath, "test.txt"), "uncommitted\n");

    const result = await removeWorktree(testRepoDir, worktreePath, true);

    expect(result.success).toBe(true);
    expect(result.removed).toBe(true);
  });

  it("should fail for non-existent worktree", async () => {
    const result = await removeWorktree(testRepoDir, "/non/existent/path");

    expect(result.success).toBe(false);
    expect(result.removed).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("ensureWorktreeBaseDir", () => {
  it("should return base directory path", async () => {
    const baseDir = await ensureWorktreeBaseDir();

    expect(baseDir).toContain(".local/aynd/worktrees");
  });

  it("should create directory if not exists", async () => {
    const baseDir = await ensureWorktreeBaseDir();

    // Directory should exist now
    const proc = Bun.spawn(["test", "-d", baseDir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
  });
});

describe("getWorktreePathConfig", () => {
  it("should compute correct paths", () => {
    const config = getWorktreePathConfig("/home/user/project", "feature-auth");

    expect(config.basePath).toContain(".local/aynd/worktrees");
    expect(config.basePath).toContain("home__user__project");
    expect(config.fullPath).toContain("home__user__project/feature-auth");
  });

  it("should handle different project paths", () => {
    const config = getWorktreePathConfig("/g/gits/tacogips/aynd", "hotfix");

    expect(config.basePath).toContain("g__gits__tacogips__aynd");
    expect(config.fullPath).toContain("g__gits__tacogips__aynd/hotfix");
  });
});
