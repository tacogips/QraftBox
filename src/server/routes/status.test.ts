import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { createStatusRoutes, type ServerContext } from "./status";
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
async function gitExec(args: readonly string[]): Promise<void> {
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
  testRepoPath = await fs.mkdtemp(path.join(os.tmpdir(), "aynd-status-test-"));

  // Initialize git repository
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Test User"]);
  await gitExec(["config", "user.email", "test@example.com"]);

  // Create initial commit
  await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Initial content\n");
  await gitExec(["add", "file1.txt"]);
  await gitExec(["commit", "-m", "Initial commit"]);
});

/**
 * Cleanup test repository
 */
afterAll(async () => {
  await fs.rm(testRepoPath, { recursive: true, force: true });
});

/**
 * Status response format
 */
interface StatusResponse {
  readonly clean: boolean;
  readonly staged: readonly string[];
  readonly modified: readonly string[];
  readonly untracked: readonly string[];
  readonly conflicts: readonly string[];
  readonly branch: string;
}

describe("GET /api/status", () => {
  let app: ReturnType<typeof createStatusRoutes>;
  let context: ServerContext;

  beforeEach(() => {
    context = { projectPath: testRepoPath };
    app = createStatusRoutes(context);
  });

  test("returns clean status for clean repository", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as StatusResponse;

    expect(data.clean).toBe(true);
    expect(data.staged).toEqual([]);
    expect(data.modified).toEqual([]);
    expect(data.untracked).toEqual([]);
    expect(data.conflicts).toEqual([]);
    expect(data.branch).toBe("main");
  });

  test("returns untracked files", async () => {
    // Create untracked file
    await fs.writeFile(path.join(testRepoPath, "untracked.txt"), "Untracked\n");

    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as StatusResponse;

    expect(data.clean).toBe(false);
    expect(data.untracked).toContain("untracked.txt");
    expect(data.staged).toEqual([]);
    expect(data.modified).toEqual([]);

    // Cleanup
    await fs.unlink(path.join(testRepoPath, "untracked.txt"));
  });

  test("returns modified files", async () => {
    // Modify existing file
    await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Modified\n");

    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as StatusResponse;

    expect(data.clean).toBe(false);
    expect(data.modified).toContain("file1.txt");
    expect(data.staged).toEqual([]);
    expect(data.untracked).toEqual([]);

    // Cleanup: restore original content
    await fs.writeFile(
      path.join(testRepoPath, "file1.txt"),
      "Initial content\n",
    );
  });

  test("returns staged files", async () => {
    // Create and stage a new file
    await fs.writeFile(path.join(testRepoPath, "staged.txt"), "Staged\n");
    await gitExec(["add", "staged.txt"]);

    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as StatusResponse;

    expect(data.clean).toBe(false);
    expect(data.staged).toContain("staged.txt");
    expect(data.modified).toEqual([]);
    expect(data.untracked).toEqual([]);

    // Cleanup
    await gitExec(["reset", "HEAD", "staged.txt"]);
    await fs.unlink(path.join(testRepoPath, "staged.txt"));
  });

  test("returns both staged and modified for same file", async () => {
    // Stage a change, then modify again
    await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Staged change\n");
    await gitExec(["add", "file1.txt"]);
    await fs.writeFile(
      path.join(testRepoPath, "file1.txt"),
      "Modified after staging\n",
    );

    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as StatusResponse;

    expect(data.clean).toBe(false);
    expect(data.staged).toContain("file1.txt");
    expect(data.modified).toContain("file1.txt");

    // Cleanup
    await gitExec(["reset", "HEAD", "file1.txt"]);
    await fs.writeFile(
      path.join(testRepoPath, "file1.txt"),
      "Initial content\n",
    );
  });

  test("returns current branch name", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as StatusResponse;

    expect(data.branch).toBe("main");
  });

  test("returns branch name after branch switch", async () => {
    // Create and switch to a new branch
    await gitExec(["checkout", "-b", "test-branch"]);

    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as StatusResponse;

    expect(data.branch).toBe("test-branch");

    // Cleanup: switch back to main
    await gitExec(["checkout", "main"]);
    await gitExec(["branch", "-D", "test-branch"]);
  });

  test("returns conflict files after merge conflict", async () => {
    // Create a conflicting situation
    // 1. Create a branch and modify file1.txt
    await gitExec(["checkout", "-b", "conflict-branch"]);
    await fs.writeFile(
      path.join(testRepoPath, "file1.txt"),
      "Branch modification\n",
    );
    await gitExec(["add", "file1.txt"]);
    await gitExec(["commit", "-m", "Modify file1 on branch"]);

    // 2. Switch back to main and modify the same file
    await gitExec(["checkout", "main"]);
    await fs.writeFile(
      path.join(testRepoPath, "file1.txt"),
      "Main modification\n",
    );
    await gitExec(["add", "file1.txt"]);
    await gitExec(["commit", "-m", "Modify file1 on main"]);

    // 3. Try to merge (this will create a conflict)
    const mergeProc = Bun.spawn(["git", "merge", "conflict-branch"], {
      cwd: testRepoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    await mergeProc.exited;

    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as StatusResponse;

    expect(data.clean).toBe(false);
    expect(data.conflicts).toContain("file1.txt");

    // Cleanup: abort merge and delete branch
    await gitExec(["merge", "--abort"]);
    await gitExec(["branch", "-D", "conflict-branch"]);
    await gitExec(["reset", "--hard", "HEAD~1"]);
    await fs.writeFile(
      path.join(testRepoPath, "file1.txt"),
      "Initial content\n",
    );
  });

  test("handles mixed status (untracked, modified, staged)", async () => {
    // Create untracked file
    await fs.writeFile(path.join(testRepoPath, "untracked.txt"), "Untracked\n");

    // Modify existing file
    await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Modified\n");

    // Create and stage a new file
    await fs.writeFile(path.join(testRepoPath, "staged.txt"), "Staged\n");
    await gitExec(["add", "staged.txt"]);

    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as StatusResponse;

    expect(data.clean).toBe(false);
    expect(data.untracked).toContain("untracked.txt");
    expect(data.modified).toContain("file1.txt");
    expect(data.staged).toContain("staged.txt");
    expect(data.conflicts).toEqual([]);

    // Cleanup
    await fs.unlink(path.join(testRepoPath, "untracked.txt"));
    await fs.writeFile(
      path.join(testRepoPath, "file1.txt"),
      "Initial content\n",
    );
    await gitExec(["reset", "HEAD", "staged.txt"]);
    await fs.unlink(path.join(testRepoPath, "staged.txt"));
  });
});
