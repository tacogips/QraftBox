/**
 * Tests for File API Routes
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { createFileRoutes } from "./files.js";
import type { ServerContext } from "../../types/index.js";
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
 * Setup test repository with files
 */
beforeAll(async () => {
  // Create temporary directory
  testRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "qraftbox-files-routes-test-"),
  );

  // Initialize git repository
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Test User"]);
  await gitExec(["config", "user.email", "test@example.com"]);

  // Create directory structure with files
  await fs.mkdir(path.join(testRepoPath, "src"));
  await fs.mkdir(path.join(testRepoPath, "src", "utils"));
  await fs.writeFile(
    path.join(testRepoPath, "src", "main.ts"),
    "console.log('Hello');\n",
  );
  await fs.writeFile(
    path.join(testRepoPath, "src", "lib.ts"),
    "export const x = 42;\n",
  );
  await fs.writeFile(
    path.join(testRepoPath, "src", "utils", "helper.ts"),
    "export function help() {}\n",
  );
  await fs.writeFile(path.join(testRepoPath, "README.md"), "# Test Project\n");
  await fs.writeFile(
    path.join(testRepoPath, "package.json"),
    '{"name":"test"}\n',
  );

  // Commit all files
  await gitExec(["add", "."]);
  await gitExec(["commit", "-m", "Initial commit"]);

  // Modify a file for testing working tree changes
  await fs.writeFile(
    path.join(testRepoPath, "src", "main.ts"),
    "console.log('Modified');\n",
  );
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

describe("GET /files", () => {
  let app: ReturnType<typeof createFileRoutes>;
  let context: ServerContext;

  beforeEach(() => {
    context = { projectPath: testRepoPath };
    app = createFileRoutes(context);
  });

  test("returns file tree with all files (default mode)", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      tree: { name: string; type: string };
      totalFiles: number;
      changedFiles: number;
    };
    expect(data).toHaveProperty("tree");
    expect(data).toHaveProperty("totalFiles");
    expect(data).toHaveProperty("changedFiles");
    expect(data.tree.type).toBe("directory");
    expect(data.totalFiles).toBeGreaterThan(0);
  });

  test("returns file tree with diff-only mode", async () => {
    const response = await app.request("/?mode=diff-only");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      tree: { name: string; type: string };
      totalFiles: number;
      changedFiles: number;
    };
    expect(data).toHaveProperty("tree");
    expect(data.tree.type).toBe("directory");
    // In diff-only mode, totalFiles and changedFiles should be equal
    expect(data.totalFiles).toBe(data.changedFiles);
  });

  test("returns file tree with all mode explicitly", async () => {
    const response = await app.request("/?mode=all");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      tree: { name: string; type: string };
      totalFiles: number;
    };
    expect(data.totalFiles).toBeGreaterThan(0);
  });

  test("handles git errors gracefully", async () => {
    const invalidContext: ServerContext = { projectPath: "/nonexistent/path" };
    const invalidApp = createFileRoutes(invalidContext);
    const response = await invalidApp.request("/");

    expect(response.status).toBe(500);
    const data = (await response.json()) as ErrorResponse;
    expect(data).toHaveProperty("error");
    expect(data.code).toBe(500);
  });
});

describe("GET /file/*path", () => {
  let app: ReturnType<typeof createFileRoutes>;
  let context: ServerContext;

  beforeEach(() => {
    context = { projectPath: testRepoPath };
    app = createFileRoutes(context);
  });

  test("returns file content from working tree", async () => {
    const response = await app.request("/file/src/main.ts");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      path: string;
      content: string;
      language: string;
      lineCount: number;
      size: number;
      isBinary: boolean;
    };
    expect(data.path).toBe("src/main.ts");
    expect(data.content).toContain("console.log('Modified')");
    expect(data.language).toBe("typescript");
    expect(data.lineCount).toBeGreaterThan(0);
    expect(data.size).toBeGreaterThan(0);
    expect(data.isBinary).toBe(false);
  });

  test("returns file content from specific ref", async () => {
    const response = await app.request("/file/src/main.ts?ref=HEAD");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      path: string;
      content: string;
    };
    expect(data.path).toBe("src/main.ts");
    expect(data.content).toContain("console.log('Hello')");
  });

  test("detects language correctly", async () => {
    const testCases = [
      { path: "/file/src/main.ts", expected: "typescript" },
      { path: "/file/README.md", expected: "markdown" },
      { path: "/file/package.json", expected: "json" },
    ];

    for (const testCase of testCases) {
      const response = await app.request(testCase.path);
      expect(response.status).toBe(200);
      const data = (await response.json()) as { language: string };
      expect(data.language).toBe(testCase.expected);
    }
  });

  test("returns 404 for non-existent file", async () => {
    const response = await app.request("/file/nonexistent.txt");

    expect(response.status).toBe(404);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toContain("File not found");
    expect(data.code).toBe(404);
  });

  test("returns 400 for empty path", async () => {
    const response = await app.request("/file/");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toContain("File path is required");
    expect(data.code).toBe(400);
  });

  test("handles nested file paths", async () => {
    const response = await app.request("/file/src/utils/helper.ts");

    expect(response.status).toBe(200);
    const data = (await response.json()) as { path: string; content: string };
    expect(data.path).toBe("src/utils/helper.ts");
    expect(data.content).toContain("help()");
  });

  test("handles file with unknown extension", async () => {
    // Create a file with unknown extension
    await fs.writeFile(path.join(testRepoPath, "test.xyz"), "unknown file\n");
    await gitExec(["add", "test.xyz"]);
    await gitExec(["commit", "-m", "Add unknown file"]);

    const response = await app.request("/file/test.xyz");

    expect(response.status).toBe(200);
    const data = (await response.json()) as { language: string };
    expect(data.language).toBe("plaintext");
  });

  test("detects binary files by extension and returns empty content", async () => {
    // Create a binary file (PDF)
    const binaryContent = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
    ]); // %PDF-1.4
    await fs.writeFile(path.join(testRepoPath, "test.pdf"), binaryContent);
    await gitExec(["add", "test.pdf"]);
    await gitExec(["commit", "-m", "Add binary PDF file"]);

    const response = await app.request("/file/test.pdf");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      isBinary: boolean;
      isImage?: boolean;
      badge?: string;
      content: string;
      mimeType?: string;
    };
    expect(data.isBinary).toBe(true);
    expect(data.isImage).toBeUndefined();
    expect(data.badge).toBe("BIN");
    expect(data.content).toBe("");
    expect(data.mimeType).toBe("application/pdf");
  });

  test("detects image files and returns base64 content", async () => {
    // Create a minimal PNG file (1x1 transparent pixel)
    const pngContent = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    await fs.writeFile(path.join(testRepoPath, "test.png"), pngContent);
    await gitExec(["add", "test.png"]);
    await gitExec(["commit", "-m", "Add PNG image"]);

    const response = await app.request("/file/test.png");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      isBinary: boolean;
      isImage?: boolean;
      badge?: string;
      content: string;
      mimeType?: string;
    };
    expect(data.isBinary).toBe(true);
    expect(data.isImage).toBe(true);
    expect(data.badge).toBe("IMG");
    expect(data.content.length).toBeGreaterThan(0); // Base64 encoded
    expect(data.mimeType).toBe("image/png");
  });

  test("handles large text files with partial content", async () => {
    // Create a large text file (>1MB)
    const largeContent = "x".repeat(2_000_000); // 2MB of text
    await fs.writeFile(path.join(testRepoPath, "large.txt"), largeContent);
    await gitExec(["add", "large.txt"]);
    await gitExec(["commit", "-m", "Add large file"]);

    const response = await app.request("/file/large.txt");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      isPartial?: boolean;
      fullSize?: number;
      content: string;
      isBinary: boolean;
    };
    expect(data.isPartial).toBe(true);
    expect(data.fullSize).toBeGreaterThan(1_000_000);
    expect(data.content.length).toBeLessThan(largeContent.length);
    expect(data.isBinary).toBe(false);
  });

  test("loads full content for large files with ?full=true", async () => {
    // Use the large file created in previous test
    const response = await app.request("/file/large.txt?full=true");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      isPartial?: boolean;
      fullSize?: number;
      content: string;
    };
    expect(data.isPartial).toBeUndefined();
    expect(data.fullSize).toBeUndefined();
    expect(data.content.length).toBeGreaterThan(1_000_000);
  });

  test("detects binary content without binary extension", async () => {
    // Create a file with text extension but binary content (null bytes)
    const binaryContent = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0x00]);
    await fs.writeFile(path.join(testRepoPath, "fake.txt"), binaryContent);
    await gitExec(["add", "fake.txt"]);
    await gitExec(["commit", "-m", "Add fake text file"]);

    const response = await app.request("/file/fake.txt");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      isBinary: boolean;
      badge?: string;
      content: string;
    };
    expect(data.isBinary).toBe(true);
    expect(data.badge).toBe("BIN");
    expect(data.content).toBe("");
  });

  test("handles small binary files correctly", async () => {
    // Create small binary file (<1MB) with known binary extension (zip)
    const smallBinary = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00,
    ]); // ZIP header
    await fs.writeFile(path.join(testRepoPath, "small.zip"), smallBinary);
    await gitExec(["add", "small.zip"]);
    await gitExec(["commit", "-m", "Add small binary"]);

    const response = await app.request("/file/small.zip");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      isBinary: boolean;
      isPartial?: boolean;
      content: string;
      mimeType?: string;
    };
    expect(data.isBinary).toBe(true);
    expect(data.isPartial).toBeUndefined(); // Not partial, just binary
    expect(data.content).toBe(""); // Binary non-image content is empty
    expect(data.mimeType).toBe("application/zip");
  });
});

describe("GET /files/autocomplete", () => {
  let app: ReturnType<typeof createFileRoutes>;
  let context: ServerContext;

  beforeEach(() => {
    context = { projectPath: testRepoPath };
    app = createFileRoutes(context);
  });

  test("autocompletes file paths with query", async () => {
    const response = await app.request("/autocomplete?q=main");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      results: readonly { path: string; status?: string }[];
    };
    expect(data).toHaveProperty("results");
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0]?.path).toContain("main");
  });

  test("autocomplete is case-insensitive", async () => {
    const response = await app.request("/autocomplete?q=MAIN");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      results: readonly { path: string }[];
    };
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0]?.path.toLowerCase()).toContain("main");
  });

  test("respects limit parameter", async () => {
    const response = await app.request("/autocomplete?q=.ts&limit=2");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      results: readonly { path: string }[];
    };
    expect(data.results.length).toBeLessThanOrEqual(2);
  });

  test("returns 400 for missing query parameter", async () => {
    const response = await app.request("/autocomplete");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toContain("Query parameter 'q' is required");
    expect(data.code).toBe(400);
  });

  test("returns 400 for invalid limit", async () => {
    const response = await app.request("/autocomplete?q=test&limit=0");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toContain("Limit must be between 1 and 100");
  });

  test("returns 400 for limit exceeding max", async () => {
    const response = await app.request("/autocomplete?q=test&limit=101");

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toContain("Limit must be between 1 and 100");
  });

  test("includes file status when file has changes", async () => {
    const response = await app.request("/autocomplete?q=main");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      results: readonly { path: string; status?: string }[];
    };
    const mainFile = data.results.find((r) => r.path.includes("main"));
    expect(mainFile).toBeDefined();
    // main.ts was modified, so it should have a status
    expect(mainFile?.status).toBe("modified");
  });

  test("handles partial directory paths", async () => {
    const response = await app.request("/autocomplete?q=src/");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      results: readonly { path: string }[];
    };
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results.every((r) => r.path.startsWith("src/"))).toBe(true);
  });

  test("returns empty results for no matches", async () => {
    const response = await app.request("/autocomplete?q=nonexistentfile");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      results: readonly { path: string }[];
    };
    expect(data.results.length).toBe(0);
  });
});
