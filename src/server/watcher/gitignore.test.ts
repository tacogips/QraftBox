import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execGit } from "../git/executor.js";
import { createGitignoreFilter } from "./gitignore.js";

describe("createGitignoreFilter", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "gitignore-test-"));

    // Initialize git repo
    await execGit(["init"], { cwd: testDir });
    await execGit(["config", "user.name", "Test User"], { cwd: testDir });
    await execGit(["config", "user.email", "test@example.com"], {
      cwd: testDir,
    });
  });

  afterEach(async () => {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("isIgnored returns true for gitignored files", async () => {
    // Create .gitignore
    await writeFile(join(testDir, ".gitignore"), "*.log\nnode_modules/\n");

    const filter = createGitignoreFilter(testDir);

    expect(await filter.isIgnored("debug.log")).toBe(true);
    expect(await filter.isIgnored("error.log")).toBe(true);
    expect(await filter.isIgnored("node_modules/package/index.js")).toBe(true);
  });

  test("isIgnored returns false for tracked files", async () => {
    // Create .gitignore
    await writeFile(join(testDir, ".gitignore"), "*.log\n");

    const filter = createGitignoreFilter(testDir);

    expect(await filter.isIgnored("src/main.ts")).toBe(false);
    expect(await filter.isIgnored("README.md")).toBe(false);
    expect(await filter.isIgnored("package.json")).toBe(false);
  });

  test("isIgnored always returns true for .git/ paths", async () => {
    const filter = createGitignoreFilter(testDir);

    expect(await filter.isIgnored(".git")).toBe(true);
    expect(await filter.isIgnored(".git/config")).toBe(true);
    expect(await filter.isIgnored(".git/objects/abc123")).toBe(true);
  });

  test("isIgnoredBatch checks multiple files efficiently", async () => {
    // Create .gitignore
    await writeFile(
      join(testDir, ".gitignore"),
      "*.log\nnode_modules/\ndist/\n",
    );

    const filter = createGitignoreFilter(testDir);

    const paths = [
      "src/main.ts", // not ignored
      "debug.log", // ignored
      "node_modules/dep/index.js", // ignored
      "README.md", // not ignored
      "dist/bundle.js", // ignored
    ] as const;

    const results = await filter.isIgnoredBatch(paths);

    expect(results.length).toBe(5);
    expect(results[0]).toBe(false); // src/main.ts
    expect(results[1]).toBe(true); // debug.log
    expect(results[2]).toBe(true); // node_modules/dep/index.js
    expect(results[3]).toBe(false); // README.md
    expect(results[4]).toBe(true); // dist/bundle.js
  });

  test("isIgnoredBatch handles .git/ paths", async () => {
    const filter = createGitignoreFilter(testDir);

    const paths = ["src/main.ts", ".git", ".git/config", "README.md"] as const;

    const results = await filter.isIgnoredBatch(paths);

    expect(results.length).toBe(4);
    expect(results[0]).toBe(false); // src/main.ts
    expect(results[1]).toBe(true); // .git
    expect(results[2]).toBe(true); // .git/config
    expect(results[3]).toBe(false); // README.md
  });

  test("isIgnoredBatch returns empty array for empty input", async () => {
    const filter = createGitignoreFilter(testDir);

    const results = await filter.isIgnoredBatch([]);

    expect(results.length).toBe(0);
  });

  test("cache works correctly", async () => {
    // Create .gitignore
    await writeFile(join(testDir, ".gitignore"), "*.log\n");

    const filter = createGitignoreFilter(testDir);

    // First call - hits git
    const result1 = await filter.isIgnored("debug.log");
    expect(result1).toBe(true);

    // Second call - hits cache (should be fast)
    const result2 = await filter.isIgnored("debug.log");
    expect(result2).toBe(true);

    // Verify cached result is consistent
    expect(result1).toBe(result2);
  });

  test("clearCache clears the internal cache", async () => {
    // Create .gitignore
    await writeFile(join(testDir, ".gitignore"), "*.log\n");

    const filter = createGitignoreFilter(testDir);

    // Populate cache
    await filter.isIgnored("debug.log");
    await filter.isIgnored("src/main.ts");

    // Clear cache
    filter.clearCache();

    // These should work even after clearing cache
    expect(await filter.isIgnored("debug.log")).toBe(true);
    expect(await filter.isIgnored("src/main.ts")).toBe(false);
  });

  test("handles empty .gitignore", async () => {
    // Create empty .gitignore
    await writeFile(join(testDir, ".gitignore"), "");

    const filter = createGitignoreFilter(testDir);

    // No files should be ignored (except .git)
    expect(await filter.isIgnored("any-file.txt")).toBe(false);
    expect(await filter.isIgnored("src/main.ts")).toBe(false);

    // .git should still be ignored
    expect(await filter.isIgnored(".git")).toBe(true);
  });

  test("handles repository without .gitignore", async () => {
    // No .gitignore file created

    const filter = createGitignoreFilter(testDir);

    // No files should be ignored (except .git)
    expect(await filter.isIgnored("any-file.txt")).toBe(false);
    expect(await filter.isIgnored("src/main.ts")).toBe(false);

    // .git should still be ignored
    expect(await filter.isIgnored(".git")).toBe(true);
  });

  test("nested .gitignore patterns work correctly", async () => {
    // Create nested directory structure
    await mkdir(join(testDir, "src"));
    await mkdir(join(testDir, "src", "test"));

    // Root .gitignore
    await writeFile(join(testDir, ".gitignore"), "*.log\n");

    // Nested .gitignore in src/
    await writeFile(join(testDir, "src", ".gitignore"), "*.tmp\n");

    const filter = createGitignoreFilter(testDir);

    // Root pattern should apply everywhere
    expect(await filter.isIgnored("debug.log")).toBe(true);
    expect(await filter.isIgnored("src/debug.log")).toBe(true);

    // Nested pattern should apply in src/
    expect(await filter.isIgnored("src/temp.tmp")).toBe(true);
    expect(await filter.isIgnored("src/test/temp.tmp")).toBe(true);

    // But not at root
    expect(await filter.isIgnored("temp.tmp")).toBe(false);
  });

  test("isIgnoredBatch caches results for subsequent calls", async () => {
    // Create .gitignore
    await writeFile(join(testDir, ".gitignore"), "*.log\n");

    const filter = createGitignoreFilter(testDir);

    // First batch call
    const paths1 = ["debug.log", "src/main.ts"] as const;
    const results1 = await filter.isIgnoredBatch(paths1);

    expect(results1[0]).toBe(true);
    expect(results1[1]).toBe(false);

    // Second batch call with overlapping paths (should use cache)
    const paths2 = ["debug.log", "error.log", "src/main.ts"] as const;
    const results2 = await filter.isIgnoredBatch(paths2);

    expect(results2[0]).toBe(true); // cached
    expect(results2[1]).toBe(true); // new
    expect(results2[2]).toBe(false); // cached
  });

  test("handles paths with special characters", async () => {
    // Create .gitignore
    await writeFile(join(testDir, ".gitignore"), "file with spaces.txt\n");

    const filter = createGitignoreFilter(testDir);

    expect(await filter.isIgnored("file with spaces.txt")).toBe(true);
    expect(await filter.isIgnored("normal-file.txt")).toBe(false);
  });
});
