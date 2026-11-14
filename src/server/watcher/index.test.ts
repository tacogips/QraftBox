import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileWatcher } from "./index.js";
import type { FileChangeEvent } from "../../types/watcher.js";
import { execSync } from "node:child_process";

describe("createFileWatcher", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = await mkdtemp(join(tmpdir(), "watcher-test-"));

    // Initialize as git repository
    execSync("git init", { cwd: testDir, stdio: "ignore" });
    execSync('git config user.email "test@example.com"', {
      cwd: testDir,
      stdio: "ignore",
    });
    execSync('git config user.name "Test User"', {
      cwd: testDir,
      stdio: "ignore",
    });
  });

  afterEach(async () => {
    // Clean up test directory
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("lifecycle", () => {
    test("starts and stops successfully", async () => {
      const watcher = createFileWatcher(testDir);

      const statusBefore = watcher.getStatus();
      expect(statusBefore.enabled).toBe(false);
      expect(statusBefore.watchedPaths).toBe(0);

      await watcher.start();

      const statusAfter = watcher.getStatus();
      expect(statusAfter.enabled).toBe(true);
      expect(statusAfter.watchedPaths).toBe(1);
      expect(statusAfter.lastUpdate).toBeGreaterThan(0);

      await watcher.stop();

      const statusStopped = watcher.getStatus();
      expect(statusStopped.enabled).toBe(false);
      expect(statusStopped.watchedPaths).toBe(0);
    });

    test("throws error when starting already active watcher", async () => {
      const watcher = createFileWatcher(testDir);
      await watcher.start();

      await expect(watcher.start()).rejects.toThrow(
        "Watcher is already started",
      );

      await watcher.stop();
    });

    test("stop() is idempotent", async () => {
      const watcher = createFileWatcher(testDir);
      await watcher.start();

      await watcher.stop();
      await watcher.stop(); // Should not throw

      const status = watcher.getStatus();
      expect(status.enabled).toBe(false);
    });

    test("throws error for non-existent directory", async () => {
      const watcher = createFileWatcher("/non/existent/path");

      await expect(watcher.start()).rejects.toThrow("does not exist");
    });

    test("throws error for non-directory path", async () => {
      const filePath = join(testDir, "file.txt");
      await writeFile(filePath, "test");

      const watcher = createFileWatcher(filePath);

      await expect(watcher.start()).rejects.toThrow("not a directory");
    });
  });

  describe("file change detection", () => {
    test("detects file creation", async () => {
      let detectedEvents: readonly FileChangeEvent[] = [];
      const watcher = createFileWatcher(testDir, { debounceMs: 100 });

      watcher.onFileChange((events) => {
        detectedEvents = events;
      });

      await watcher.start();

      // Create a new file
      const filePath = join(testDir, "new-file.txt");
      await writeFile(filePath, "test content");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(detectedEvents.length).toBeGreaterThan(0);
      // File creation may trigger create or modify event
      const fileEvent = detectedEvents.find((e) =>
        e.path.includes("new-file.txt"),
      );
      expect(fileEvent).toBeDefined();
      expect(fileEvent?.type).toMatch(/create|modify/);

      await watcher.stop();
    });

    test("detects file modification", async () => {
      // Create file before starting watcher
      const filePath = join(testDir, "existing-file.txt");
      await writeFile(filePath, "initial content");

      let detectedEvents: readonly FileChangeEvent[] = [];
      const watcher = createFileWatcher(testDir, { debounceMs: 100 });

      watcher.onFileChange((events) => {
        detectedEvents = events;
      });

      await watcher.start();

      // Modify the file
      await writeFile(filePath, "modified content");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(detectedEvents.length).toBeGreaterThan(0);
      const modifyEvent = detectedEvents.find(
        (e) => e.type === "modify" && e.path === "existing-file.txt",
      );
      expect(modifyEvent).toBeDefined();

      await watcher.stop();
    });

    test("detects file deletion", async () => {
      let detectedEvents: readonly FileChangeEvent[] = [];
      const watcher = createFileWatcher(testDir, { debounceMs: 100 });

      watcher.onFileChange((events) => {
        detectedEvents = events;
      });

      await watcher.start();

      // Create a file first (so watcher is definitely active)
      const filePath = join(testDir, "to-delete.txt");
      await writeFile(filePath, "content");

      // Wait for creation event
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Clear events
      detectedEvents = [];

      // Delete the file
      await unlink(filePath);

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should detect deletion (or at least some event)
      expect(detectedEvents.length).toBeGreaterThan(0);
      const deleteEvent = detectedEvents.find(
        (e) => e.type === "delete" && e.path.includes("to-delete.txt"),
      );
      expect(deleteEvent).toBeDefined();

      await watcher.stop();
    });

    test("detects nested file changes with recursive: true", async () => {
      let allDetectedEvents: FileChangeEvent[] = [];
      const watcher = createFileWatcher(testDir, {
        debounceMs: 100,
        recursive: true,
      });

      watcher.onFileChange((events) => {
        allDetectedEvents.push(...events);
      });

      await watcher.start();

      // Create nested directory and file
      const nestedDir = join(testDir, "nested");
      await mkdir(nestedDir);

      // Wait a bit after directory creation
      await new Promise((resolve) => setTimeout(resolve, 50));

      const filePath = join(nestedDir, "nested-file.txt");
      await writeFile(filePath, "nested content");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(allDetectedEvents.length).toBeGreaterThan(0);
      const nestedEvent = allDetectedEvents.find(
        (e) => e.path.includes("nested-file.txt") || e.path.includes("nested"),
      );
      expect(nestedEvent).toBeDefined();

      await watcher.stop();
    });
  });

  describe("gitignore filtering", () => {
    test("excludes gitignored files when ignoreGitignored: true", async () => {
      // Create .gitignore
      const gitignorePath = join(testDir, ".gitignore");
      await writeFile(gitignorePath, "*.log\nnode_modules/\n");

      let detectedEvents: readonly FileChangeEvent[] = [];
      const watcher = createFileWatcher(testDir, {
        debounceMs: 100,
        ignoreGitignored: true,
      });

      watcher.onFileChange((events) => {
        detectedEvents = events;
      });

      await watcher.start();

      // Create ignored file
      const ignoredFile = join(testDir, "test.log");
      await writeFile(ignoredFile, "log content");

      // Create non-ignored file
      const trackedFile = join(testDir, "test.txt");
      await writeFile(trackedFile, "tracked content");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should detect test.txt but not test.log
      expect(detectedEvents.length).toBeGreaterThan(0);
      const logEvent = detectedEvents.find((e) => e.path === "test.log");
      expect(logEvent).toBeUndefined();

      const txtEvent = detectedEvents.find((e) => e.path === "test.txt");
      expect(txtEvent).toBeDefined();

      await watcher.stop();
    });

    test("includes gitignored files when ignoreGitignored: false", async () => {
      // Create .gitignore
      const gitignorePath = join(testDir, ".gitignore");
      await writeFile(gitignorePath, "*.log\n");

      let detectedEvents: readonly FileChangeEvent[] = [];
      const watcher = createFileWatcher(testDir, {
        debounceMs: 100,
        ignoreGitignored: false,
      });

      watcher.onFileChange((events) => {
        detectedEvents = events;
      });

      await watcher.start();

      // Create ignored file
      const ignoredFile = join(testDir, "test.log");
      await writeFile(ignoredFile, "log content");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should detect test.log even though it's gitignored
      expect(detectedEvents.length).toBeGreaterThan(0);
      const logEvent = detectedEvents.find((e) => e.path === "test.log");
      expect(logEvent).toBeDefined();

      await watcher.stop();
    });
  });

  describe("debouncing", () => {
    test("batches multiple rapid changes", async () => {
      let callCount = 0;
      let lastEventBatch: readonly FileChangeEvent[] = [];
      const watcher = createFileWatcher(testDir, { debounceMs: 100 });

      watcher.onFileChange((events) => {
        callCount++;
        lastEventBatch = events;
      });

      await watcher.start();

      // Create multiple files rapidly
      await writeFile(join(testDir, "file1.txt"), "content1");
      await writeFile(join(testDir, "file2.txt"), "content2");
      await writeFile(join(testDir, "file3.txt"), "content3");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should be called once with multiple events batched
      expect(callCount).toBe(1);
      expect(lastEventBatch.length).toBeGreaterThan(0);

      await watcher.stop();
    });

    test("deduplicates events for same file path", async () => {
      let lastEventBatch: readonly FileChangeEvent[] = [];
      const watcher = createFileWatcher(testDir, { debounceMs: 100 });

      watcher.onFileChange((events) => {
        lastEventBatch = events;
      });

      await watcher.start();

      const filePath = join(testDir, "modified.txt");
      await writeFile(filePath, "v1");

      // Modify same file multiple times rapidly
      await writeFile(filePath, "v2");
      await writeFile(filePath, "v3");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have deduplicated events for same path
      const modifiedEvents = lastEventBatch.filter(
        (e) => e.path === "modified.txt",
      );
      expect(modifiedEvents.length).toBe(1);

      await watcher.stop();
    });
  });

  describe("multiple handlers", () => {
    test("calls all registered handlers", async () => {
      let handler1Called = false;
      let handler2Called = false;

      const watcher = createFileWatcher(testDir, { debounceMs: 100 });

      watcher.onFileChange(() => {
        handler1Called = true;
      });

      watcher.onFileChange(() => {
        handler2Called = true;
      });

      await watcher.start();

      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);

      await watcher.stop();
    });

    test("handles errors in handlers gracefully", async () => {
      let handler2Called = false;

      const watcher = createFileWatcher(testDir, { debounceMs: 100 });

      // First handler throws error
      watcher.onFileChange(() => {
        throw new Error("Handler 1 error");
      });

      // Second handler should still be called
      watcher.onFileChange(() => {
        handler2Called = true;
      });

      await watcher.start();

      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Second handler should have been called despite first handler error
      expect(handler2Called).toBe(true);

      await watcher.stop();
    });
  });

  describe("configuration", () => {
    test("uses default config when none provided", () => {
      const watcher = createFileWatcher(testDir);
      const status = watcher.getStatus();

      // Status should reflect default state
      expect(status.enabled).toBe(false);
      expect(status.watchedPaths).toBe(0);
      expect(status.lastUpdate).toBeNull();
    });

    test("merges partial config with defaults", async () => {
      const watcher = createFileWatcher(testDir, {
        debounceMs: 200,
        // recursive and ignoreGitignored should use defaults
      });

      await watcher.start();
      const status = watcher.getStatus();
      expect(status.enabled).toBe(true);
      await watcher.stop();
    });

    test("uses custom debounce delay", async () => {
      let callCount = 0;
      const watcher = createFileWatcher(testDir, { debounceMs: 50 });

      watcher.onFileChange(() => {
        callCount++;
      });

      await watcher.start();

      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content");

      // Wait for shorter debounce (50ms) + buffer
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callCount).toBe(1);

      await watcher.stop();
    });
  });

  describe("status tracking", () => {
    test("updates lastUpdate on file changes", async () => {
      const watcher = createFileWatcher(testDir, { debounceMs: 100 });

      await watcher.start();
      const statusBefore = watcher.getStatus();
      const lastUpdateBefore = statusBefore.lastUpdate;

      expect(lastUpdateBefore).toBeGreaterThan(0);

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 50));

      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content");

      // Wait for debounce + buffer
      await new Promise((resolve) => setTimeout(resolve, 200));

      const statusAfter = watcher.getStatus();
      expect(statusAfter.lastUpdate).toBeGreaterThan(lastUpdateBefore!);

      await watcher.stop();
    });

    test("watchedPaths reflects active state", async () => {
      const watcher = createFileWatcher(testDir);

      expect(watcher.getStatus().watchedPaths).toBe(0);

      await watcher.start();
      expect(watcher.getStatus().watchedPaths).toBe(1);

      await watcher.stop();
      expect(watcher.getStatus().watchedPaths).toBe(0);
    });
  });
});
