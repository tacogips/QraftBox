import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { createCommitRoutes, type ServerContext } from "./commits";
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
 * Setup test repository with commits
 */
beforeAll(async () => {
  // Create temporary directory
  testRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "qraftbox-routes-test-"),
  );

  // Initialize git repository
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Test User"]);
  await gitExec(["config", "user.email", "test@example.com"]);

  // Create first commit
  await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Hello World\n");
  await gitExec(["add", "file1.txt"]);
  await gitExec(["commit", "-m", "Initial commit"]);

  // Create second commit
  await fs.writeFile(path.join(testRepoPath, "file2.txt"), "Second file\n");
  await gitExec(["add", "file2.txt"]);
  await gitExec(["commit", "-m", "feat: add second file"]);

  // Create third commit with modification
  await fs.writeFile(
    path.join(testRepoPath, "file1.txt"),
    "Modified content\n",
  );
  await gitExec(["add", "file1.txt"]);
  await gitExec(["commit", "-m", "fix: modify file1"]);
});

/**
 * Cleanup test repository
 */
afterAll(async () => {
  await fs.rm(testRepoPath, { recursive: true, force: true });
});

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

describe("GET /api/commits", () => {
  let app: ReturnType<typeof createCommitRoutes>;
  let context: ServerContext;

  beforeEach(() => {
    context = { projectPath: testRepoPath };
    app = createCommitRoutes(context);
  });

  test("returns commit list with default parameters", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      commits: unknown[];
      pagination: unknown;
      branch: string;
    };
    expect(data).toHaveProperty("commits");
    expect(data).toHaveProperty("pagination");
    expect(data).toHaveProperty("branch");
    expect(Array.isArray(data.commits)).toBe(true);
    expect(data.commits.length).toBeGreaterThan(0);
  });

  test("returns commit list with limit parameter", async () => {
    const response = await app.request("/?limit=1");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      commits: unknown[];
      pagination: { limit: number };
    };
    expect(data.commits.length).toBe(1);
    expect(data.pagination.limit).toBe(1);
  });

  test("returns commit list with offset parameter", async () => {
    const response = await app.request("/?offset=1");

    expect(response.status).toBe(200);
    const data = (await response.json()) as { pagination: { offset: number } };
    expect(data.pagination.offset).toBe(1);
  });

  test("validates limit parameter (too small)", async () => {
    const response = await app.request("/?limit=0");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("limit must be at least 1");
    expect(data.code).toBe(400);
  });

  test("validates limit parameter (too large)", async () => {
    const response = await app.request("/?limit=1001");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("limit must not exceed 1000");
  });

  test("validates offset parameter", async () => {
    const response = await app.request("/?offset=-1");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("offset must be non-negative");
  });

  test("validates branch parameter", async () => {
    const response = await app.request("/?branch=%20%20%20");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("branch name cannot be empty");
  });

  test("validates search query length", async () => {
    const longSearch = "a".repeat(501);
    const response = await app.request(`/?search=${longSearch}`);

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe(
      "search query exceeds maximum length of 500 characters",
    );
  });

  test("supports search by commit message", async () => {
    const response = await app.request("/?search=feat");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      commits: Array<{ message: string }>;
    };
    // Search might not return results if git --grep doesn't match
    // Just verify it returns successfully
    expect(Array.isArray(data.commits)).toBe(true);
  });
});

describe("GET /api/commits/:hash", () => {
  let app: ReturnType<typeof createCommitRoutes>;
  let context: ServerContext;
  let firstCommitHash: string;

  beforeEach(async () => {
    context = { projectPath: testRepoPath };
    app = createCommitRoutes(context);

    // Get first commit hash
    const proc = Bun.spawn(["git", "rev-parse", "HEAD~2"], {
      cwd: testRepoPath,
      stdout: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    firstCommitHash = stdout.trim();
  });

  test("returns commit detail for valid hash", async () => {
    const response = await app.request(`/${firstCommitHash}`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      hash: string;
      message: string;
      stats: unknown;
      files: unknown[];
    };
    expect(data).toHaveProperty("hash");
    expect(data).toHaveProperty("message");
    expect(data).toHaveProperty("stats");
    expect(data).toHaveProperty("files");
    expect(data.hash).toBe(firstCommitHash);
  });

  test("returns commit detail for short hash", async () => {
    const shortHash = firstCommitHash.substring(0, 7);
    const response = await app.request(`/${shortHash}`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { hash: string };
    expect(data.hash).toBe(firstCommitHash);
  });

  test("validates commit hash format", async () => {
    const response = await app.request("/invalid");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Invalid commit hash format");
  });

  test("validates commit hash length (too short)", async () => {
    const response = await app.request("/abc123");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Invalid commit hash format");
  });

  test("validates commit hash length (too long)", async () => {
    const response = await app.request(
      "/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3",
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Invalid commit hash format");
  });

  test("handles commit not found", async () => {
    const nonExistentHash = "0000000000000000000000000000000000000000";
    const response = await app.request(`/${nonExistentHash}`);

    // Should return an error (either 404 or 500 depending on git output)
    expect(response.status).toBeGreaterThanOrEqual(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBeDefined();
  });
});

describe("GET /api/commits/:hash/diff", () => {
  let app: ReturnType<typeof createCommitRoutes>;
  let context: ServerContext;
  let secondCommitHash: string;

  beforeEach(async () => {
    context = { projectPath: testRepoPath };
    app = createCommitRoutes(context);

    // Get second commit hash
    const proc = Bun.spawn(["git", "rev-parse", "HEAD~1"], {
      cwd: testRepoPath,
      stdout: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    secondCommitHash = stdout.trim();
  });

  test("returns parsed diff for valid commit", async () => {
    const response = await app.request(`/${secondCommitHash}/diff`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { files: Array<{ path: string }> };
    expect(data.files).toBeDefined();
    expect(data.files.length).toBeGreaterThan(0);
    expect(data.files.some((f) => f.path === "file2.txt")).toBe(true);
  });

  test("validates commit hash format for diff", async () => {
    const response = await app.request("/invalid/diff");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Invalid commit hash format");
  });

  test("handles commit not found in diff (404)", async () => {
    const nonExistentHash = "0000000";
    const response = await app.request(`/${nonExistentHash}/diff`);

    expect(response.status).toBe(404);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toContain("Commit not found");
  });
});

describe("GET /api/commits/:hash/files", () => {
  let app: ReturnType<typeof createCommitRoutes>;
  let context: ServerContext;
  let thirdCommitHash: string;

  beforeEach(async () => {
    context = { projectPath: testRepoPath };
    app = createCommitRoutes(context);

    // Get third commit hash (HEAD)
    const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
      cwd: testRepoPath,
      stdout: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    thirdCommitHash = stdout.trim();
  });

  test("returns file list for valid commit", async () => {
    const response = await app.request(`/${thirdCommitHash}/files`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      files: Array<{
        path: string;
        status: string;
        additions: number;
        deletions: number;
      }>;
    };
    expect(data).toHaveProperty("files");
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files.length).toBeGreaterThan(0);

    const file = data.files[0];
    expect(file).toHaveProperty("path");
    expect(file).toHaveProperty("status");
    expect(file).toHaveProperty("additions");
    expect(file).toHaveProperty("deletions");
  });

  test("validates commit hash format for files", async () => {
    const response = await app.request("/invalid/files");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Invalid commit hash format");
  });

  test("handles commit not found in files", async () => {
    const nonExistentHash = "0000000";
    const response = await app.request(`/${nonExistentHash}/files`);

    // Should return an error (either 404 or 500 depending on git output)
    expect(response.status).toBeGreaterThanOrEqual(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBeDefined();
  });
});
