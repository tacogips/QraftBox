/**
 * Browse API Routes Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createBrowseRoutes } from "./browse";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("Browse Routes", () => {
  let app: ReturnType<typeof createBrowseRoutes>;
  let testDir: string;
  let gitRepoDir: string;

  beforeAll(async () => {
    app = createBrowseRoutes();

    // Create temporary test directory structure
    testDir = path.join(os.tmpdir(), `browse-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create test files
    await fs.writeFile(path.join(testDir, "file1.txt"), "test content");
    await fs.writeFile(path.join(testDir, "file2.txt"), "test content");
    await fs.writeFile(path.join(testDir, ".hidden"), "hidden file");

    // Create subdirectories
    await fs.mkdir(path.join(testDir, "subdir1"));
    await fs.mkdir(path.join(testDir, "subdir2"));
    await fs.mkdir(path.join(testDir, ".hidden-dir"));

    // Create git repository
    gitRepoDir = path.join(testDir, "git-repo");
    await fs.mkdir(gitRepoDir, { recursive: true });
    await fs.mkdir(path.join(gitRepoDir, ".git"));
    await fs.writeFile(path.join(gitRepoDir, "README.md"), "# Test Repo");
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("GET /", () => {
    test("lists directory contents", async () => {
      const response = await app.request(
        `/?path=${encodeURIComponent(testDir)}`,
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        path: string;
        parentPath: string | null;
        entries: Array<{ isDirectory: boolean }>;
        canGoUp: boolean;
      };
      expect(body).toHaveProperty("path");
      expect(body).toHaveProperty("parentPath");
      expect(body).toHaveProperty("entries");
      expect(body).toHaveProperty("canGoUp");

      expect(body.path).toBe(testDir);
      expect(Array.isArray(body.entries)).toBe(true);

      // Should have directories and files
      const entries = body.entries;
      expect(entries.length).toBeGreaterThan(0);

      // Check that entries are sorted (directories first)
      const firstFileIndex = entries.findIndex((e) => !e.isDirectory);
      const lastDirIndex = entries.findLastIndex((e) => e.isDirectory);

      if (firstFileIndex !== -1 && lastDirIndex !== -1) {
        expect(lastDirIndex).toBeLessThan(firstFileIndex);
      }
    });

    test("detects git repositories", async () => {
      const response = await app.request(
        `/?path=${encodeURIComponent(testDir)}`,
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        entries: Array<{
          name: string;
          isGitRepo: boolean;
          isDirectory: boolean;
        }>;
      };
      const gitRepoEntry = body.entries.find((e) => e.name === "git-repo");

      expect(gitRepoEntry).toBeDefined();
      expect(gitRepoEntry?.isGitRepo).toBe(true);
      expect(gitRepoEntry?.isDirectory).toBe(true);
    });

    test("includes entry metadata", async () => {
      const response = await app.request(
        `/?path=${encodeURIComponent(testDir)}`,
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        entries: Array<{
          name: string;
          path: string;
          isDirectory: boolean;
          isGitRepo: boolean;
          isSymlink: boolean;
          isHidden: boolean;
          modifiedAt: number;
        }>;
      };
      const firstEntry = body.entries[0];

      expect(firstEntry).toHaveProperty("name");
      expect(firstEntry).toHaveProperty("path");
      expect(firstEntry).toHaveProperty("isDirectory");
      expect(firstEntry).toHaveProperty("isGitRepo");
      expect(firstEntry).toHaveProperty("isSymlink");
      expect(firstEntry).toHaveProperty("isHidden");
      expect(firstEntry).toHaveProperty("modifiedAt");

      expect(typeof firstEntry?.name).toBe("string");
      expect(typeof firstEntry?.path).toBe("string");
      expect(typeof firstEntry?.isDirectory).toBe("boolean");
      expect(typeof firstEntry?.isGitRepo).toBe("boolean");
      expect(typeof firstEntry?.isSymlink).toBe("boolean");
      expect(typeof firstEntry?.isHidden).toBe("boolean");
      expect(typeof firstEntry?.modifiedAt).toBe("number");
    });

    test("identifies hidden files and directories", async () => {
      const response = await app.request(
        `/?path=${encodeURIComponent(testDir)}`,
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        entries: Array<{ name: string; isHidden: boolean }>;
      };
      const hiddenFile = body.entries.find((e) => e.name === ".hidden");
      const hiddenDir = body.entries.find((e) => e.name === ".hidden-dir");

      expect(hiddenFile?.isHidden).toBe(true);
      expect(hiddenDir?.isHidden).toBe(true);
    });

    test("returns 400 when path parameter is missing", async () => {
      const response = await app.request("/");

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toBe("Missing required parameter: path");
      expect(body.code).toBe(400);
    });

    test("returns 400 when path parameter is empty", async () => {
      const response = await app.request("/?path=");

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      // Empty string in query parameter is treated as missing
      expect(body.error).toBe("Missing required parameter: path");
      expect(body.code).toBe(400);
    });

    test("returns 400 when path is not a directory", async () => {
      const filePath = path.join(testDir, "file1.txt");
      const response = await app.request(
        `/?path=${encodeURIComponent(filePath)}`,
      );

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Path is not a directory");
      expect(body.code).toBe(400);
    });

    test("returns 500 when directory does not exist", async () => {
      const nonExistentPath = path.join(testDir, "does-not-exist");
      const response = await app.request(
        `/?path=${encodeURIComponent(nonExistentPath)}`,
      );

      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toBeDefined();
      expect(body.code).toBe(500);
    });

    test("returns 400 when path contains null byte", async () => {
      const response = await app.request(
        `/?path=/tmp/test${encodeURIComponent("\0")}/dir`,
      );

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("null byte");
      expect(body.code).toBe(400);
    });

    test("sets canGoUp correctly for non-root directories", async () => {
      const response = await app.request(
        `/?path=${encodeURIComponent(testDir)}`,
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        canGoUp: boolean;
        parentPath: string | null;
      };
      expect(body.canGoUp).toBe(true);
      expect(body.parentPath).toBeDefined();
      expect(body.parentPath).not.toBe(testDir);
    });

    test("handles root directory correctly", async () => {
      const rootPath = process.platform === "win32" ? "C:\\" : "/";
      const response = await app.request(
        `/?path=${encodeURIComponent(rootPath)}`,
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        path: string;
        entries: unknown[];
      };
      expect(body.path).toBe(rootPath);
      expect(Array.isArray(body.entries)).toBe(true);
    });
  });

  describe("POST /validate", () => {
    test("validates existing directory", async () => {
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: testDir }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        valid: boolean;
        isGitRepo: boolean;
        error?: string;
      };
      expect(body.valid).toBe(true);
      expect(body.isGitRepo).toBe(false);
      expect(body.error).toBeUndefined();
    });

    test("validates git repository", async () => {
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: gitRepoDir }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        valid: boolean;
        isGitRepo: boolean;
        repositoryRoot?: string;
        error?: string;
      };
      expect(body.valid).toBe(true);
      expect(body.isGitRepo).toBe(true);
      expect(body.repositoryRoot).toBe(gitRepoDir);
      expect(body.error).toBeUndefined();
    });

    test("returns invalid for non-existent directory", async () => {
      const nonExistentPath = path.join(testDir, "does-not-exist");
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: nonExistentPath }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        valid: boolean;
        isGitRepo: boolean;
        error?: string;
      };
      expect(body.valid).toBe(false);
      expect(body.isGitRepo).toBe(false);
      expect(body.error).toBeDefined();
    });

    test("returns invalid for file path", async () => {
      const filePath = path.join(testDir, "file1.txt");
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        valid: boolean;
        isGitRepo: boolean;
        error?: string;
      };
      expect(body.valid).toBe(false);
      expect(body.isGitRepo).toBe(false);
      expect(body.error).toBe("Path is not a directory");
    });

    test("returns 400 when path is missing", async () => {
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toBe("Missing required field: path");
      expect(body.code).toBe(400);
    });

    test("returns 400 when path is empty string", async () => {
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "" }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toBe("path must be a non-empty string");
      expect(body.code).toBe(400);
    });

    test("returns 400 when path is not a string", async () => {
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: 123 }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toBe("path must be a non-empty string");
      expect(body.code).toBe(400);
    });

    test("returns 400 when request body is invalid JSON", async () => {
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json{",
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toBe("Invalid JSON in request body");
      expect(body.code).toBe(400);
    });

    test("returns invalid when path contains null byte", async () => {
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/test\0/dir" }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        valid: boolean;
        error?: string;
      };
      expect(body.valid).toBe(false);
      expect(body.error).toContain("null byte");
    });
  });

  describe("GET /home", () => {
    test("returns user home directory", async () => {
      const response = await app.request("/home");

      expect(response.status).toBe(200);

      const body = (await response.json()) as { path: string };
      expect(body).toHaveProperty("path");
      expect(typeof body.path).toBe("string");
      expect(body.path.length).toBeGreaterThan(0);

      // Should match os.homedir()
      const expectedHome = os.homedir();
      expect(body.path).toBe(expectedHome);
    });
  });

  describe("GET /roots", () => {
    test("returns filesystem roots", async () => {
      const response = await app.request("/roots");

      expect(response.status).toBe(200);

      const body = (await response.json()) as { roots: string[] };
      expect(body).toHaveProperty("roots");
      expect(Array.isArray(body.roots)).toBe(true);
      expect(body.roots.length).toBeGreaterThan(0);

      // Check platform-specific roots
      const platform = process.platform;
      if (platform === "win32") {
        expect(body.roots).toContain("C:\\");
      } else {
        expect(body.roots).toContain("/");
      }
    });
  });

  describe("Edge cases", () => {
    test("handles relative paths by resolving to absolute", async () => {
      const response = await app.request("/?path=.");

      expect(response.status).toBe(200);
    });

    test("handles path with trailing slash", async () => {
      const pathWithSlash = testDir + path.sep;
      const response = await app.request(
        `/?path=${encodeURIComponent(pathWithSlash)}`,
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as { path: string };
      expect(body.path).toBeDefined();
    });

    test("handles path with multiple slashes", async () => {
      const pathWithSlashes = testDir.replace(/\//g, "//");
      const response = await app.request(
        `/?path=${encodeURIComponent(pathWithSlashes)}`,
      );

      expect(response.status).toBe(200);
    });
  });
});
