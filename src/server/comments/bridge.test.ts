/**
 * Comment Bridge Tests
 *
 * Tests git notes integration for comment storage using real temporary git repositories.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommentBridge } from "./bridge.js";
import type { CommentBridge } from "./bridge.js";
import { execGit } from "../git/executor.js";
import {
  createAuthor,
  createNewComment,
  createNewReply,
} from "../../types/comments.js";

describe("Comment Bridge", () => {
  let tempDir: string;
  let bridge: CommentBridge;
  let commitHash: string;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(join(tmpdir(), "qraftbox-bridge-test-"));

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

    // Create bridge
    bridge = createCommentBridge(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("getComments", () => {
    test("returns empty array when no comments exist", async () => {
      const comments = await bridge.getComments(commitHash);
      expect(comments).toEqual([]);
    });

    test("returns all comments for a commit", async () => {
      // Add two comments
      const comment1 = await bridge.addComment(
        commitHash,
        createNewComment("file1.ts", 10, "First comment"),
      );
      const comment2 = await bridge.addComment(
        commitHash,
        createNewComment("file2.ts", 20, "Second comment"),
      );

      const comments = await bridge.getComments(commitHash);
      expect(comments).toHaveLength(2);
      expect(comments[0]?.id).toBe(comment1.id);
      expect(comments[1]?.id).toBe(comment2.id);
    });
  });

  describe("getFileComments", () => {
    test("returns only comments for specified file", async () => {
      // Add comments to different files
      await bridge.addComment(
        commitHash,
        createNewComment("file1.ts", 10, "Comment on file1"),
      );
      const file2Comment = await bridge.addComment(
        commitHash,
        createNewComment("file2.ts", 20, "Comment on file2"),
      );
      await bridge.addComment(
        commitHash,
        createNewComment("file1.ts", 30, "Another comment on file1"),
      );

      const file2Comments = await bridge.getFileComments(
        commitHash,
        "file2.ts",
      );
      expect(file2Comments).toHaveLength(1);
      expect(file2Comments[0]?.id).toBe(file2Comment.id);
      expect(file2Comments[0]?.filePath).toBe("file2.ts");
    });

    test("returns empty array when no comments for file", async () => {
      await bridge.addComment(
        commitHash,
        createNewComment("file1.ts", 10, "Comment on file1"),
      );

      const comments = await bridge.getFileComments(commitHash, "file2.ts");
      expect(comments).toEqual([]);
    });
  });

  describe("addComment", () => {
    test("creates comment with generated ID and timestamp", async () => {
      const newComment = createNewComment("test.ts", 42, "Test comment");

      const comment = await bridge.addComment(commitHash, newComment);

      expect(comment.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(comment.commitHash).toBe(commitHash);
      expect(comment.filePath).toBe("test.ts");
      expect(comment.lineNumber).toBe(42);
      expect(comment.body).toBe("Test comment");
      expect(comment.createdAt).toBeGreaterThan(0);
      expect(comment.replies).toEqual([]);
    });

    test("uses default author from git config", async () => {
      const newComment = createNewComment("test.ts", 10, "Comment body");

      const comment = await bridge.addComment(commitHash, newComment);

      expect(comment.author.name).toBe("Test User");
      expect(comment.author.email).toBe("test@example.com");
    });

    test("uses provided author when specified", async () => {
      const customAuthor = createAuthor("Custom Author", "custom@example.com");
      const newComment = createNewComment("test.ts", 10, "Comment body", {
        author: customAuthor,
      });

      const comment = await bridge.addComment(commitHash, newComment);

      expect(comment.author.name).toBe("Custom Author");
      expect(comment.author.email).toBe("custom@example.com");
    });

    test("supports multi-line comments with endLineNumber", async () => {
      const newComment = createNewComment("test.ts", 10, "Multi-line comment", {
        endLineNumber: 15,
      });

      const comment = await bridge.addComment(commitHash, newComment);

      expect(comment.lineNumber).toBe(10);
      expect(comment.endLineNumber).toBe(15);
    });

    test("persists comment to git notes", async () => {
      await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Persisted comment"),
      );

      // Create new bridge instance to verify persistence
      const newBridge = createCommentBridge(tempDir);
      const comments = await newBridge.getComments(commitHash);

      expect(comments).toHaveLength(1);
      expect(comments[0]?.body).toBe("Persisted comment");
    });
  });

  describe("updateComment", () => {
    test("updates comment body and sets updatedAt timestamp", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Original body"),
      );

      const beforeUpdate = Date.now();
      const updated = await bridge.updateComment(
        commitHash,
        comment.id,
        "Updated body",
      );

      expect(updated.id).toBe(comment.id);
      expect(updated.body).toBe("Updated body");
      expect(updated.updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
      expect(updated.createdAt).toBe(comment.createdAt);
    });

    test("preserves other comment fields when updating", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Original", { endLineNumber: 20 }),
      );

      const updated = await bridge.updateComment(
        commitHash,
        comment.id,
        "Updated",
      );

      expect(updated.filePath).toBe(comment.filePath);
      expect(updated.lineNumber).toBe(comment.lineNumber);
      expect(updated.endLineNumber).toBe(comment.endLineNumber);
      expect(updated.author).toEqual(comment.author);
    });

    test("throws error when comment not found", async () => {
      await expect(
        bridge.updateComment(commitHash, "nonexistent-id", "New body"),
      ).rejects.toThrow("Comment nonexistent-id not found");
    });

    test("persists update to git notes", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Original"),
      );
      await bridge.updateComment(commitHash, comment.id, "Updated");

      // Verify with new bridge instance
      const newBridge = createCommentBridge(tempDir);
      const comments = await newBridge.getComments(commitHash);

      expect(comments[0]?.body).toBe("Updated");
      expect(comments[0]?.updatedAt).toBeGreaterThan(0);
    });
  });

  describe("deleteComment", () => {
    test("removes comment and returns true", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "To be deleted"),
      );

      const deleted = await bridge.deleteComment(commitHash, comment.id);

      expect(deleted).toBe(true);

      const comments = await bridge.getComments(commitHash);
      expect(comments).toHaveLength(0);
    });

    test("returns false when comment not found", async () => {
      const deleted = await bridge.deleteComment(commitHash, "nonexistent-id");
      expect(deleted).toBe(false);
    });

    test("only deletes specified comment", async () => {
      const comment1 = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Keep this"),
      );
      const comment2 = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 20, "Delete this"),
      );

      await bridge.deleteComment(commitHash, comment2.id);

      const comments = await bridge.getComments(commitHash);
      expect(comments).toHaveLength(1);
      expect(comments[0]?.id).toBe(comment1.id);
    });

    test("persists deletion to git notes", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "To delete"),
      );
      await bridge.deleteComment(commitHash, comment.id);

      // Verify with new bridge instance
      const newBridge = createCommentBridge(tempDir);
      const comments = await newBridge.getComments(commitHash);

      expect(comments).toHaveLength(0);
    });
  });

  describe("replyToComment", () => {
    test("adds reply to comment", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Original comment"),
      );

      const reply = await bridge.replyToComment(
        commitHash,
        comment.id,
        createNewReply("Reply text"),
      );

      expect(reply.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(reply.body).toBe("Reply text");
      expect(reply.createdAt).toBeGreaterThan(0);
    });

    test("uses default author from git config", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Comment"),
      );

      const reply = await bridge.replyToComment(
        commitHash,
        comment.id,
        createNewReply("Reply"),
      );

      expect(reply.author.name).toBe("Test User");
      expect(reply.author.email).toBe("test@example.com");
    });

    test("uses provided author when specified", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Comment"),
      );
      const customAuthor = createAuthor("Reply Author", "reply@example.com");

      const reply = await bridge.replyToComment(
        commitHash,
        comment.id,
        createNewReply("Reply", customAuthor),
      );

      expect(reply.author.name).toBe("Reply Author");
      expect(reply.author.email).toBe("reply@example.com");
    });

    test("appends reply to comment replies array", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Comment"),
      );

      await bridge.replyToComment(
        commitHash,
        comment.id,
        createNewReply("First reply"),
      );
      await bridge.replyToComment(
        commitHash,
        comment.id,
        createNewReply("Second reply"),
      );

      const comments = await bridge.getComments(commitHash);
      expect(comments[0]?.replies).toHaveLength(2);
      expect(comments[0]?.replies[0]?.body).toBe("First reply");
      expect(comments[0]?.replies[1]?.body).toBe("Second reply");
    });

    test("throws error when comment not found", async () => {
      await expect(
        bridge.replyToComment(
          commitHash,
          "nonexistent-id",
          createNewReply("Reply"),
        ),
      ).rejects.toThrow("Comment nonexistent-id not found");
    });

    test("persists reply to git notes", async () => {
      const comment = await bridge.addComment(
        commitHash,
        createNewComment("test.ts", 10, "Comment"),
      );
      await bridge.replyToComment(
        commitHash,
        comment.id,
        createNewReply("Reply"),
      );

      // Verify with new bridge instance
      const newBridge = createCommentBridge(tempDir);
      const comments = await newBridge.getComments(commitHash);

      expect(comments[0]?.replies).toHaveLength(1);
      expect(comments[0]?.replies[0]?.body).toBe("Reply");
    });
  });

  describe("getDefaultAuthor", () => {
    test("returns author from git config", async () => {
      const author = await bridge.getDefaultAuthor();

      expect(author.name).toBe("Test User");
      expect(author.email).toBe("test@example.com");
    });

    test("returns local config when set", async () => {
      // Override with local config
      await execGit(["config", "--local", "user.name", "Local User"], {
        cwd: tempDir,
      });
      await execGit(["config", "--local", "user.email", "local@example.com"], {
        cwd: tempDir,
      });

      const author = await bridge.getDefaultAuthor();

      expect(author.name).toBe("Local User");
      expect(author.email).toBe("local@example.com");
    });
  });

  describe("integration scenarios", () => {
    test("multiple operations on same commit", async () => {
      // Add multiple comments
      const comment1 = await bridge.addComment(
        commitHash,
        createNewComment("file1.ts", 10, "Comment 1"),
      );
      const comment2 = await bridge.addComment(
        commitHash,
        createNewComment("file2.ts", 20, "Comment 2"),
      );

      // Add reply to first comment
      await bridge.replyToComment(
        commitHash,
        comment1.id,
        createNewReply("Reply to comment 1"),
      );

      // Update second comment
      await bridge.updateComment(commitHash, comment2.id, "Updated comment 2");

      // Verify final state
      const comments = await bridge.getComments(commitHash);
      expect(comments).toHaveLength(2);
      expect(comments[0]?.replies).toHaveLength(1);
      expect(comments[1]?.body).toBe("Updated comment 2");
    });

    test("handles multiple commits with separate comment threads", async () => {
      // Create second commit
      await execGit(["commit", "--allow-empty", "-m", "Second commit"], {
        cwd: tempDir,
      });
      const result = await execGit(["rev-parse", "HEAD"], { cwd: tempDir });
      const commit2Hash = result.stdout.trim();

      // Add comments to both commits
      await bridge.addComment(
        commitHash,
        createNewComment("file.ts", 10, "Comment on first commit"),
      );
      await bridge.addComment(
        commit2Hash,
        createNewComment("file.ts", 20, "Comment on second commit"),
      );

      // Verify isolation
      const commit1Comments = await bridge.getComments(commitHash);
      const commit2Comments = await bridge.getComments(commit2Hash);

      expect(commit1Comments).toHaveLength(1);
      expect(commit1Comments[0]?.body).toBe("Comment on first commit");
      expect(commit2Comments).toHaveLength(1);
      expect(commit2Comments[0]?.body).toBe("Comment on second commit");
    });
  });
});
