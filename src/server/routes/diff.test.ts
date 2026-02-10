import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { createDiffRoutes } from "./diff.js";
import type { ServerContext } from "../../types/index.js";
import type { DiffFile } from "../../types/git.js";
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
    path.join(os.tmpdir(), "qraftbox-diff-routes-test-"),
  );

  // Initialize git repository
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Test User"]);
  await gitExec(["config", "user.email", "test@example.com"]);

  // Create first commit
  await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Line 1\nLine 2\n");
  await gitExec(["add", "file1.txt"]);
  await gitExec(["commit", "-m", "Initial commit"]);

  // Create second commit
  await fs.writeFile(
    path.join(testRepoPath, "file1.txt"),
    "Line 1\nLine 2 modified\nLine 3\n",
  );
  await gitExec(["add", "file1.txt"]);
  await gitExec(["commit", "-m", "Second commit"]);

  // Modify file1.txt for working tree diff testing
  await fs.writeFile(
    path.join(testRepoPath, "file1.txt"),
    "Line 1\nLine 2 modified again\nLine 3\nLine 4\n",
  );

  // Create new file for testing
  await fs.writeFile(path.join(testRepoPath, "file2.txt"), "New file\n");
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

/**
 * Diff response format
 */
interface DiffResponse {
  readonly files: readonly DiffFile[];
  readonly stats: {
    readonly totalFiles: number;
    readonly additions: number;
    readonly deletions: number;
  };
}

/**
 * Single file diff response format
 */
interface FileDiffResponse {
  readonly file: DiffFile;
}

describe("GET /diff", () => {
  let app: ReturnType<typeof createDiffRoutes>;
  let context: ServerContext;

  beforeEach(() => {
    context = { projectPath: testRepoPath, isGitRepo: true };
    app = createDiffRoutes(context);
  });

  test("returns diff with default parameters", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as DiffResponse;
    expect(data).toHaveProperty("files");
    expect(data).toHaveProperty("stats");
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files.length).toBeGreaterThan(0);

    // Verify stats
    expect(data.stats).toHaveProperty("totalFiles");
    expect(data.stats).toHaveProperty("additions");
    expect(data.stats).toHaveProperty("deletions");
    expect(data.stats.totalFiles).toBe(data.files.length);
  });

  test("returns diff with base parameter", async () => {
    const response = await app.request("/?base=HEAD");

    expect(response.status).toBe(200);
    const data = (await response.json()) as DiffResponse;
    expect(Array.isArray(data.files)).toBe(true);
  });

  test("returns diff with target parameter", async () => {
    const response = await app.request("/?base=HEAD~1&target=HEAD");

    expect(response.status).toBe(200);
    const data = (await response.json()) as DiffResponse;
    expect(Array.isArray(data.files)).toBe(true);
  });

  test("returns diff with path filter", async () => {
    const response = await app.request("/?path=file1.txt");

    expect(response.status).toBe(200);
    const data = (await response.json()) as DiffResponse;
    expect(Array.isArray(data.files)).toBe(true);

    // If there are files, verify path matches
    if (data.files.length > 0) {
      const file = data.files[0];
      expect(file).toBeDefined();
      if (file !== undefined) {
        expect(file.path).toBe("file1.txt");
      }
    }
  });

  test("returns diff with contextLines parameter", async () => {
    const response = await app.request("/?contextLines=5");

    expect(response.status).toBe(200);
    const data = (await response.json()) as DiffResponse;
    expect(Array.isArray(data.files)).toBe(true);
  });

  test("validates contextLines parameter (non-numeric)", async () => {
    const response = await app.request("/?contextLines=invalid");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("contextLines must be a non-negative number");
    expect(data.code).toBe(400);
  });

  test("validates contextLines parameter (negative)", async () => {
    const response = await app.request("/?contextLines=-1");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("contextLines must be a non-negative number");
  });

  test("calculates correct statistics", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as DiffResponse;

    // Verify stats match file counts
    const manualAdditions = data.files.reduce(
      (sum, file) => sum + file.additions,
      0,
    );
    const manualDeletions = data.files.reduce(
      (sum, file) => sum + file.deletions,
      0,
    );

    expect(data.stats.additions).toBe(manualAdditions);
    expect(data.stats.deletions).toBe(manualDeletions);
    expect(data.stats.totalFiles).toBe(data.files.length);
  });

  test("handles missing server context", async () => {
    const appWithoutContext = createDiffRoutes();
    const response = await appWithoutContext.request("/");

    expect(response.status).toBe(500);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Server context not available");
  });
});

describe("GET /diff/file/:path", () => {
  let app: ReturnType<typeof createDiffRoutes>;
  let context: ServerContext;

  beforeEach(() => {
    context = { projectPath: testRepoPath, isGitRepo: true };
    app = createDiffRoutes(context);
  });

  test("returns single file diff for valid path", async () => {
    const response = await app.request("/file/file1.txt");

    expect(response.status).toBe(200);
    const data = (await response.json()) as FileDiffResponse;
    expect(data).toHaveProperty("file");
    expect(data.file).toBeDefined();
    expect(data.file.path).toBe("file1.txt");
    expect(data.file).toHaveProperty("additions");
    expect(data.file).toHaveProperty("deletions");
    expect(data.file).toHaveProperty("status");
  });

  test("returns single file diff with base parameter", async () => {
    const response = await app.request("/file/file1.txt?base=HEAD");

    expect(response.status).toBe(200);
    const data = (await response.json()) as FileDiffResponse;
    expect(data.file.path).toBe("file1.txt");
  });

  test("returns single file diff with target parameter", async () => {
    const response = await app.request(
      "/file/file1.txt?base=HEAD~1&target=HEAD",
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as FileDiffResponse;
    expect(data.file.path).toBe("file1.txt");
  });

  test("returns single file diff with contextLines parameter", async () => {
    const response = await app.request("/file/file1.txt?contextLines=5");

    expect(response.status).toBe(200);
    const data = (await response.json()) as FileDiffResponse;
    expect(data.file.path).toBe("file1.txt");
  });

  test("handles file path with slashes", async () => {
    // Create subdirectory with file
    const subdir = path.join(testRepoPath, "subdir");
    await fs.mkdir(subdir, { recursive: true });
    await fs.writeFile(path.join(subdir, "nested.txt"), "Nested file\n");

    const response = await app.request("/file/subdir/nested.txt");

    // Could be 200 if file exists and has diff, or 404 if no diff
    expect([200, 404]).toContain(response.status);
  });

  test("validates contextLines parameter (non-numeric)", async () => {
    const response = await app.request("/file/file1.txt?contextLines=invalid");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("contextLines must be a non-negative number");
  });

  test("validates contextLines parameter (negative)", async () => {
    const response = await app.request("/file/file1.txt?contextLines=-1");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("contextLines must be a non-negative number");
  });

  test("handles file with no diff (404)", async () => {
    // Request diff for file that doesn't have changes
    // Create a committed file with no working tree changes
    await fs.writeFile(path.join(testRepoPath, "nochange.txt"), "No changes\n");
    await gitExec(["add", "nochange.txt"]);
    await gitExec(["commit", "-m", "Add nochange.txt"]);

    const response = await app.request("/file/nochange.txt");

    expect(response.status).toBe(404);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toContain("No diff found");
  });

  test("validates empty file path", async () => {
    const response = await app.request("/file/");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("File path is required");
  });

  test("handles missing server context", async () => {
    const appWithoutContext = createDiffRoutes();
    const response = await appWithoutContext.request("/file/file1.txt");

    expect(response.status).toBe(500);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Server context not available");
  });
});
