/**
 * Sync Manager Tests
 *
 * Tests git notes synchronization using real temporary git repositories.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncManager } from "./sync.js";
import type { SyncManager } from "./sync.js";
import { createCommentBridge } from "./bridge.js";
import { execGit } from "../git/executor.js";
import { createNewComment } from "../../types/comments.js";

describe("Sync Manager", () => {
  let tempDir: string;
  let manager: SyncManager;
  let commitHash: string;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-test-"));

    // Initialize git repository
    await execGit(["init"], { cwd: tempDir });
    await execGit(["config", "user.name", "Test User"], { cwd: tempDir });
    await execGit(["config", "user.email", "test@example.com"], {
      cwd: tempDir,
    });

    // Create initial commit
    await execGit(["commit", "--allow-empty", "-m", "Initial commit"], {
      cwd: tempDir,
    });

    // Get commit hash
    const result = await execGit(["rev-parse", "HEAD"], { cwd: tempDir });
    commitHash = result.stdout.trim();

    // Create sync manager
    manager = createSyncManager(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("getSyncMode / setSyncMode", () => {
    test("defaults to manual mode", () => {
      expect(manager.getSyncMode()).toBe("manual");
    });

    test("can set and get sync mode", () => {
      manager.setSyncMode("auto-push");
      expect(manager.getSyncMode()).toBe("auto-push");

      manager.setSyncMode("auto-pull");
      expect(manager.getSyncMode()).toBe("auto-pull");

      manager.setSyncMode("auto");
      expect(manager.getSyncMode()).toBe("auto");

      manager.setSyncMode("manual");
      expect(manager.getSyncMode()).toBe("manual");
    });

    test("accepts initial mode in constructor", () => {
      const managerWithMode = createSyncManager(tempDir, "auto-push");
      expect(managerWithMode.getSyncMode()).toBe("auto-push");
    });
  });

  describe("getSyncStatus", () => {
    test("returns status with no notes", async () => {
      const status = await manager.getSyncStatus();

      expect(status.localCount).toBe(0);
      expect(status.remoteCount).toBe(0);
      expect(status.syncMode).toBe("manual");
      expect(status.lastSyncAt).toBeNull();
      expect(status.hasUnsyncedChanges).toBe(false);
    });

    test("returns status with local notes", async () => {
      // Add a comment via bridge
      const bridge = createCommentBridge(tempDir);
      await bridge.addComment(
        commitHash,
        createNewComment("file.ts", 10, "Test comment"),
      );

      const status = await manager.getSyncStatus();

      expect(status.localCount).toBe(1);
      expect(status.remoteCount).toBe(0);
      expect(status.syncMode).toBe("manual");
      expect(status.lastSyncAt).toBeNull();
      expect(status.hasUnsyncedChanges).toBe(false);
    });

    test("includes sync mode from manager state", async () => {
      manager.setSyncMode("auto-push");

      const status = await manager.getSyncStatus();

      expect(status.syncMode).toBe("auto-push");
    });
  });

  describe("markAsChanged", () => {
    test("sets hasUnsyncedChanges to true", async () => {
      manager.markAsChanged();

      const status = await manager.getSyncStatus();
      expect(status.hasUnsyncedChanges).toBe(true);
    });

    test("remains true until sync operation", async () => {
      manager.markAsChanged();

      const status1 = await manager.getSyncStatus();
      expect(status1.hasUnsyncedChanges).toBe(true);

      const status2 = await manager.getSyncStatus();
      expect(status2.hasUnsyncedChanges).toBe(true);
    });
  });

  describe("pushNotes", () => {
    test("throws error when no remote configured", async () => {
      await expect(manager.pushNotes()).rejects.toThrow(
        /No remote 'origin' configured/,
      );
    });

    test("updates lastSyncAt after successful push", async () => {
      // Create a bare remote repository
      const remoteDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-remote-"));
      await execGit(["init", "--bare"], { cwd: remoteDir });

      try {
        // Add remote to local repo
        await execGit(["remote", "add", "origin", remoteDir], {
          cwd: tempDir,
        });

        // Push should succeed (even with no notes)
        await manager.pushNotes();

        const status = await manager.getSyncStatus();
        expect(status.lastSyncAt).not.toBeNull();
        expect(status.lastSyncAt).toBeGreaterThan(0);
      } finally {
        await rm(remoteDir, { recursive: true, force: true });
      }
    });

    test("clears hasUnsyncedChanges after successful push", async () => {
      // Create a bare remote repository
      const remoteDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-remote-"));
      await execGit(["init", "--bare"], { cwd: remoteDir });

      try {
        // Add remote to local repo
        await execGit(["remote", "add", "origin", remoteDir], {
          cwd: tempDir,
        });

        // Mark as changed
        manager.markAsChanged();
        const statusBefore = await manager.getSyncStatus();
        expect(statusBefore.hasUnsyncedChanges).toBe(true);

        // Push
        await manager.pushNotes();

        const statusAfter = await manager.getSyncStatus();
        expect(statusAfter.hasUnsyncedChanges).toBe(false);
      } finally {
        await rm(remoteDir, { recursive: true, force: true });
      }
    });

    test("pushes notes to remote", async () => {
      // Create a bare remote repository
      const remoteDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-remote-"));
      await execGit(["init", "--bare"], { cwd: remoteDir });

      try {
        // Add remote to local repo
        await execGit(["remote", "add", "origin", remoteDir], {
          cwd: tempDir,
        });

        // Add a comment
        const bridge = createCommentBridge(tempDir);
        await bridge.addComment(
          commitHash,
          createNewComment("file.ts", 10, "Test comment"),
        );

        // Push notes
        await manager.pushNotes();

        // Verify notes exist in remote
        const remoteCheckResult = await execGit(
          ["ls-remote", "origin", "refs/notes/qraftbox-comments"],
          { cwd: tempDir },
        );

        expect(remoteCheckResult.exitCode).toBe(0);
        expect(remoteCheckResult.stdout).toContain("refs/notes/qraftbox-comments");
      } finally {
        await rm(remoteDir, { recursive: true, force: true });
      }
    });
  });

  describe("pullNotes", () => {
    test("throws error when no remote configured", async () => {
      await expect(manager.pullNotes()).rejects.toThrow(
        /No remote 'origin' configured/,
      );
    });

    test("updates lastSyncAt after successful pull", async () => {
      // Create a bare remote repository
      const remoteDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-remote-"));
      await execGit(["init", "--bare"], { cwd: remoteDir });

      try {
        // Add remote to local repo
        await execGit(["remote", "add", "origin", remoteDir], {
          cwd: tempDir,
        });

        // Pull should succeed (even with no notes)
        // Note: fetch will succeed but won't find the ref - that's OK
        try {
          await manager.pullNotes();
        } catch (e) {
          // Pull may fail if ref doesn't exist, but we're testing lastSyncAt update
          // in the successful case below
        }

        // Push a note first, then pull in a clone
        const bridge = createCommentBridge(tempDir);
        await bridge.addComment(
          commitHash,
          createNewComment("file.ts", 10, "Test comment"),
        );
        await manager.pushNotes();

        // Create a clone and pull
        const cloneDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-clone-"));
        await execGit(["clone", tempDir, cloneDir], { cwd: tmpdir() });
        const cloneManager = createSyncManager(cloneDir);

        await cloneManager.pullNotes();

        const status = await cloneManager.getSyncStatus();
        expect(status.lastSyncAt).not.toBeNull();
        expect(status.lastSyncAt).toBeGreaterThan(0);

        await rm(cloneDir, { recursive: true, force: true });
      } finally {
        await rm(remoteDir, { recursive: true, force: true });
      }
    });

    test("clears hasUnsyncedChanges after successful pull", async () => {
      // Create a bare remote repository
      const remoteDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-remote-"));
      await execGit(["init", "--bare"], { cwd: remoteDir });

      try {
        // Add remote to local repo
        await execGit(["remote", "add", "origin", remoteDir], {
          cwd: tempDir,
        });

        // Add and push a comment
        const bridge = createCommentBridge(tempDir);
        await bridge.addComment(
          commitHash,
          createNewComment("file.ts", 10, "Test comment"),
        );
        await manager.pushNotes();

        // Create a clone
        const cloneDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-clone-"));
        await execGit(["clone", tempDir, cloneDir], { cwd: tmpdir() });
        const cloneManager = createSyncManager(cloneDir);

        // Mark as changed
        cloneManager.markAsChanged();
        const statusBefore = await cloneManager.getSyncStatus();
        expect(statusBefore.hasUnsyncedChanges).toBe(true);

        // Pull
        await cloneManager.pullNotes();

        const statusAfter = await cloneManager.getSyncStatus();
        expect(statusAfter.hasUnsyncedChanges).toBe(false);

        await rm(cloneDir, { recursive: true, force: true });
      } finally {
        await rm(remoteDir, { recursive: true, force: true });
      }
    });

    test("pulls notes from remote", async () => {
      // Create a bare remote repository
      const remoteDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-remote-"));
      await execGit(["init", "--bare"], { cwd: remoteDir });

      try {
        // Add remote to local repo
        await execGit(["remote", "add", "origin", remoteDir], {
          cwd: tempDir,
        });

        // Add and push a comment
        const bridge = createCommentBridge(tempDir);
        const addedComment = await bridge.addComment(
          commitHash,
          createNewComment("file.ts", 10, "Test comment"),
        );
        await manager.pushNotes();

        // Create a clone
        const cloneDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-clone-"));
        await execGit(["clone", tempDir, cloneDir], { cwd: tmpdir() });
        const cloneBridge = createCommentBridge(cloneDir);
        const cloneManager = createSyncManager(cloneDir);

        // Pull notes
        await cloneManager.pullNotes();

        // Verify notes exist in clone
        const comments = await cloneBridge.getComments(commitHash);
        expect(comments).toHaveLength(1);
        expect(comments[0]?.id).toBe(addedComment.id);
        expect(comments[0]?.body).toBe("Test comment");

        await rm(cloneDir, { recursive: true, force: true });
      } finally {
        await rm(remoteDir, { recursive: true, force: true });
      }
    });
  });

  describe("integration scenarios", () => {
    test("push and pull workflow with multiple comments", async () => {
      // Create a bare remote repository
      const remoteDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-remote-"));
      await execGit(["init", "--bare"], { cwd: remoteDir });

      try {
        // Add remote to local repo
        await execGit(["remote", "add", "origin", remoteDir], {
          cwd: tempDir,
        });

        // Add multiple comments
        const bridge = createCommentBridge(tempDir);
        await bridge.addComment(
          commitHash,
          createNewComment("file1.ts", 10, "Comment 1"),
        );
        await bridge.addComment(
          commitHash,
          createNewComment("file2.ts", 20, "Comment 2"),
        );

        // Check status before push
        const statusBeforePush = await manager.getSyncStatus();
        expect(statusBeforePush.localCount).toBe(1); // 1 commit with notes

        // Push
        await manager.pushNotes();

        // Create a clone
        const cloneDir = await mkdtemp(join(tmpdir(), "qraftbox-sync-clone-"));
        await execGit(["clone", tempDir, cloneDir], { cwd: tmpdir() });
        const cloneBridge = createCommentBridge(cloneDir);
        const cloneManager = createSyncManager(cloneDir);

        // Pull notes
        await cloneManager.pullNotes();

        // Verify all comments pulled
        const comments = await cloneBridge.getComments(commitHash);
        expect(comments).toHaveLength(2);

        await rm(cloneDir, { recursive: true, force: true });
      } finally {
        await rm(remoteDir, { recursive: true, force: true });
      }
    });

    test("sync status reflects mode changes", async () => {
      manager.setSyncMode("auto-push");
      const status1 = await manager.getSyncStatus();
      expect(status1.syncMode).toBe("auto-push");

      manager.setSyncMode("auto");
      const status2 = await manager.getSyncStatus();
      expect(status2.syncMode).toBe("auto");
    });
  });
});
