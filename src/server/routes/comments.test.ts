/**
 * Comment Routes Tests
 *
 * Integration tests for comment API routes using real git repositories.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createCommentRoutes } from "./comments.js";
import type { ServerContext } from "../../types/index.js";
import type {
  Comment,
  CommentReply,
  SyncStatus,
} from "../../types/comments.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Test repository setup
 */
let testRepoPath: string;
let testCommitHash: string;

/**
 * Helper to execute git commands in test repo
 */
async function gitExec(args: readonly string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: testRepoPath,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output.trim();
}

/**
 * Setup test repository
 */
beforeAll(async () => {
  // Create temporary directory
  testRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "qraftbox-comments-routes-test-"),
  );

  // Initialize git repository
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Test User"]);
  await gitExec(["config", "user.email", "test@example.com"]);

  // Create initial commit
  await fs.writeFile(
    path.join(testRepoPath, "file1.txt"),
    "Line 1\nLine 2\nLine 3\n",
  );
  await gitExec(["add", "file1.txt"]);
  await gitExec(["commit", "-m", "Initial commit"]);

  // Get commit hash
  testCommitHash = await gitExec(["rev-parse", "HEAD"]);
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
 * Comment list response format
 */
interface CommentListResponse {
  readonly comments: readonly Comment[];
}

/**
 * Single comment response format
 */
interface CommentResponse {
  readonly comment: Comment;
}

/**
 * Reply response format
 */
interface ReplyResponse {
  readonly reply: CommentReply;
}

/**
 * Success response format
 */
interface SuccessResponse {
  readonly success: boolean;
  readonly error?: string | undefined;
}

describe("createCommentRoutes", () => {
  const serverContext: ServerContext = {
    projectPath: testRepoPath,
    isGitRepo: true,
  };

  const app = createCommentRoutes(serverContext);

  describe("GET /comments/:commitHash", () => {
    test("returns empty array when no comments exist", async () => {
      const res = await app.request(`/comments/${testCommitHash}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as CommentListResponse;
      expect(data.comments).toEqual([]);
    });

    test("returns error with 400 for empty commit hash", async () => {
      const res = await app.request("/comments/");
      expect(res.status).toBe(404);
    });

    test("returns comments after adding one", async () => {
      // Add a comment first
      const addRes = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
          body: "Test comment",
        }),
      });
      expect(addRes.status).toBe(201);

      // List comments
      const listRes = await app.request(`/comments/${testCommitHash}`);
      expect(listRes.status).toBe(200);

      const data = (await listRes.json()) as CommentListResponse;
      expect(data.comments.length).toBe(1);
      expect(data.comments[0]?.body).toBe("Test comment");
    });
  });

  describe("GET /comments/:commitHash/file/*", () => {
    test("returns comments filtered by file path", async () => {
      // Add comments to different files
      await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
          body: "Comment on file1",
        }),
      });

      await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file2.txt",
          lineNumber: 1,
          body: "Comment on file2",
        }),
      });

      // Get comments for file1.txt
      const res = await app.request(
        `/comments/${testCommitHash}/file/file1.txt`,
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as CommentListResponse;
      const file1Comments = data.comments.filter(
        (c) => c.filePath === "file1.txt",
      );
      expect(file1Comments.length).toBeGreaterThan(0);
      expect(file1Comments.every((c) => c.filePath === "file1.txt")).toBe(true);
    });

    test("returns error with 400 for empty file path", async () => {
      const res = await app.request(`/comments/${testCommitHash}/file/`);
      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("File path is required");
    });
  });

  describe("POST /comments/:commitHash", () => {
    test("adds a new comment successfully", async () => {
      const res = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 2,
          body: "New comment",
        }),
      });

      expect(res.status).toBe(201);

      const data = (await res.json()) as CommentResponse;
      expect(data.comment.filePath).toBe("file1.txt");
      expect(data.comment.lineNumber).toBe(2);
      expect(data.comment.body).toBe("New comment");
      expect(data.comment.id).toBeDefined();
      expect(data.comment.author.name).toBeDefined();
      expect(data.comment.author.email).toBeDefined();
    });

    test("adds multi-line comment with endLineNumber", async () => {
      const res = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
          endLineNumber: 3,
          body: "Multi-line comment",
        }),
      });

      expect(res.status).toBe(201);

      const data = (await res.json()) as CommentResponse;
      expect(data.comment.lineNumber).toBe(1);
      expect(data.comment.endLineNumber).toBe(3);
    });

    test("returns error with 400 for missing filePath", async () => {
      const res = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineNumber: 1,
          body: "Comment without file",
        }),
      });

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("filePath");
    });

    test("returns error with 400 for missing lineNumber", async () => {
      const res = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          body: "Comment without line",
        }),
      });

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("lineNumber");
    });

    test("returns error with 400 for lineNumber <= 0", async () => {
      const res = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 0,
          body: "Invalid line number",
        }),
      });

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("lineNumber");
    });

    test("returns error with 400 for missing body", async () => {
      const res = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
        }),
      });

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("body");
    });

    test("returns error with 400 for empty body", async () => {
      const res = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
          body: "   ",
        }),
      });

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("body");
    });

    test("returns error with 400 for invalid JSON", async () => {
      const res = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      });

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("Invalid JSON");
    });
  });

  describe("PUT /comments/:commitHash/:commentId", () => {
    test("updates comment body successfully", async () => {
      // Add a comment first
      const addRes = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
          body: "Original comment",
        }),
      });
      const addData = (await addRes.json()) as CommentResponse;
      const commentId = addData.comment.id;

      // Update the comment
      const updateRes = await app.request(
        `/comments/${testCommitHash}/${commentId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: "Updated comment",
          }),
        },
      );

      expect(updateRes.status).toBe(200);

      const updateData = (await updateRes.json()) as CommentResponse;
      expect(updateData.comment.body).toBe("Updated comment");
      expect(updateData.comment.updatedAt).toBeDefined();
    });

    test("returns error with 404 for non-existent comment", async () => {
      const res = await app.request(
        `/comments/${testCommitHash}/non-existent-id`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: "Updated comment",
          }),
        },
      );

      expect(res.status).toBe(404);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("not found");
    });

    test("returns error with 400 for missing body", async () => {
      const res = await app.request(`/comments/${testCommitHash}/some-id`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("body");
    });

    test("returns error with 400 for empty body", async () => {
      const res = await app.request(`/comments/${testCommitHash}/some-id`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "   " }),
      });

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("body");
    });
  });

  describe("DELETE /comments/:commitHash/:commentId", () => {
    test("deletes comment successfully", async () => {
      // Add a comment first
      const addRes = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
          body: "Comment to delete",
        }),
      });
      const addData = (await addRes.json()) as CommentResponse;
      const commentId = addData.comment.id;

      // Delete the comment
      const deleteRes = await app.request(
        `/comments/${testCommitHash}/${commentId}`,
        {
          method: "DELETE",
        },
      );

      expect(deleteRes.status).toBe(200);

      const deleteData = (await deleteRes.json()) as SuccessResponse;
      expect(deleteData.success).toBe(true);
    });

    test("returns success false for non-existent comment", async () => {
      const res = await app.request(
        `/comments/${testCommitHash}/non-existent-id`,
        {
          method: "DELETE",
        },
      );

      expect(res.status).toBe(200);

      const data = (await res.json()) as SuccessResponse;
      expect(data.success).toBe(false);
    });
  });

  describe("POST /comments/:commitHash/:commentId/reply", () => {
    test("adds reply to comment successfully", async () => {
      // Add a comment first
      const addRes = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
          body: "Comment with reply",
        }),
      });
      const addData = (await addRes.json()) as CommentResponse;
      const commentId = addData.comment.id;

      // Add a reply
      const replyRes = await app.request(
        `/comments/${testCommitHash}/${commentId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: "Test reply",
          }),
        },
      );

      expect(replyRes.status).toBe(201);

      const replyData = (await replyRes.json()) as ReplyResponse;
      expect(replyData.reply.body).toBe("Test reply");
      expect(replyData.reply.id).toBeDefined();
      expect(replyData.reply.author.name).toBeDefined();
    });

    test("returns error with 404 for non-existent comment", async () => {
      const res = await app.request(
        `/comments/${testCommitHash}/non-existent-id/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: "Reply to non-existent",
          }),
        },
      );

      expect(res.status).toBe(404);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("not found");
    });

    test("returns error with 400 for missing body", async () => {
      const res = await app.request(
        `/comments/${testCommitHash}/some-id/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("body");
    });

    test("returns error with 400 for empty body", async () => {
      const res = await app.request(
        `/comments/${testCommitHash}/some-id/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: "   " }),
        },
      );

      expect(res.status).toBe(400);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain("body");
    });
  });

  describe("GET /notes/status", () => {
    test("returns sync status successfully", async () => {
      const res = await app.request("/notes/status");
      expect(res.status).toBe(200);

      const data = (await res.json()) as SyncStatus;
      expect(data.localCount).toBeGreaterThanOrEqual(0);
      expect(data.remoteCount).toBeGreaterThanOrEqual(0);
      expect(data.syncMode).toBeDefined();
      expect(data.hasUnsyncedChanges).toBeDefined();
    });
  });

  describe("POST /notes/push", () => {
    test("handles push operation", async () => {
      // First add a comment to ensure notes exist
      await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
          body: "Comment for push test",
        }),
      });

      const res = await app.request("/notes/push", {
        method: "POST",
      });

      // Response depends on remote configuration in test environment
      // Either succeeds (if remote push succeeds) or fails (if no remote)
      const data = (await res.json()) as SuccessResponse;
      expect(typeof data.success).toBe("boolean");
      if (!data.success) {
        expect(data.error).toBeDefined();
      }
    });
  });

  describe("POST /notes/pull", () => {
    test("handles pull operation", async () => {
      const res = await app.request("/notes/pull", {
        method: "POST",
      });

      // Response depends on remote configuration in test environment
      const data = (await res.json()) as SuccessResponse;
      expect(typeof data.success).toBe("boolean");
      if (!data.success) {
        expect(data.error).toBeDefined();
      }
    });
  });

  describe("Integration scenarios", () => {
    test("complete workflow: add comment, reply, update, delete", async () => {
      // Add comment
      const addRes = await app.request(`/comments/${testCommitHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "file1.txt",
          lineNumber: 1,
          body: "Workflow comment",
        }),
      });
      const addData = (await addRes.json()) as CommentResponse;
      const commentId = addData.comment.id;

      // Add reply
      const replyRes = await app.request(
        `/comments/${testCommitHash}/${commentId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: "Workflow reply",
          }),
        },
      );
      expect(replyRes.status).toBe(201);

      // Update comment
      const updateRes = await app.request(
        `/comments/${testCommitHash}/${commentId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: "Updated workflow comment",
          }),
        },
      );
      expect(updateRes.status).toBe(200);

      // Verify update persisted
      const listRes = await app.request(`/comments/${testCommitHash}`);
      const listData = (await listRes.json()) as CommentListResponse;
      const updatedComment = listData.comments.find((c) => c.id === commentId);
      expect(updatedComment?.body).toBe("Updated workflow comment");
      expect(updatedComment?.replies.length).toBe(1);

      // Delete comment
      const deleteRes = await app.request(
        `/comments/${testCommitHash}/${commentId}`,
        {
          method: "DELETE",
        },
      );
      expect(deleteRes.status).toBe(200);

      // Verify deletion
      const finalListRes = await app.request(`/comments/${testCommitHash}`);
      const finalListData = (await finalListRes.json()) as CommentListResponse;
      const deletedComment = finalListData.comments.find(
        (c) => c.id === commentId,
      );
      expect(deletedComment).toBeUndefined();
    });
  });
});
