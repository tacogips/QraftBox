/**
 * Comment API Routes
 *
 * Provides REST API endpoints for comment CRUD operations and git notes sync.
 * Integrates with git-xnotes via CommentBridge and SyncManager.
 */

import { Hono } from "hono";
import type { ServerContext } from "../../types/index.js";
import type {
  Comment,
  CommentReply,
  NewComment,
  NewReply,
  SyncStatus,
} from "../../types/comments.js";
import { createCommentBridge } from "../comments/bridge.js";
import { createSyncManager } from "../comments/sync.js";

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
 * Success response format for delete and sync operations
 */
interface SuccessResponse {
  readonly success: boolean;
  readonly error?: string | undefined;
}

/**
 * Hono context variables type extension for middleware
 */
type ContextVariables = {
  serverContext: ServerContext;
};

/**
 * Create comment routes
 *
 * Routes:
 * - GET /comments/:commitHash - List all comments for a commit
 * - GET /comments/:commitHash/file/* - List comments for a specific file
 * - POST /comments/:commitHash - Add a new comment
 * - PUT /comments/:commitHash/:commentId - Update comment body
 * - DELETE /comments/:commitHash/:commentId - Delete a comment
 * - POST /comments/:commitHash/:commentId/reply - Reply to a comment
 * - GET /notes/status - Get sync status
 * - POST /notes/push - Push notes to remote
 * - POST /notes/pull - Pull notes from remote
 *
 * @param context - Optional server context with project path (for standalone use)
 * @returns Hono app with comment routes mounted
 *
 * @example
 * ```typescript
 * // Standalone usage with explicit context
 * const app = createCommentRoutes({ projectPath: '/path/to/repo' });
 *
 * // Middleware usage (context from Hono variables)
 * const app = new Hono();
 * app.use('*', async (c, next) => {
 *   c.set('serverContext', { projectPath: '/path/to/repo' });
 *   await next();
 * });
 * app.route('/api', createCommentRoutes());
 * ```
 */
export function createCommentRoutes(
  context?: ServerContext | undefined,
): Hono<{ Variables: ContextVariables }> {
  const app = new Hono<{ Variables: ContextVariables }>();

  /**
   * GET /comments/:commitHash
   *
   * List all comments for a commit.
   *
   * Path parameters:
   * - commitHash: Git commit hash
   *
   * Returns:
   * - comments: Array of Comment objects
   */
  app.get("/comments/:commitHash", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract commit hash from path parameter
    const commitHash = c.req.param("commitHash");

    if (commitHash === undefined || commitHash.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Commit hash is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Create bridge and fetch comments
      const bridge = createCommentBridge(serverContext.projectPath);
      const comments = await bridge.getComments(commitHash);

      const response: CommentListResponse = {
        comments,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve comments";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /comments/:commitHash/file/*
   *
   * List comments for a specific file in a commit.
   *
   * Path parameters:
   * - commitHash: Git commit hash
   * - path: File path (captured by wildcard)
   *
   * Returns:
   * - comments: Array of Comment objects for the file
   */
  app.get("/comments/:commitHash/file/*", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract commit hash from path parameter
    const commitHash = c.req.param("commitHash");

    if (commitHash === undefined || commitHash.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Commit hash is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Extract file path from wildcard parameter
    const filePath = c.req.path.replace(`/comments/${commitHash}/file/`, "");

    if (filePath.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "File path is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Create bridge and fetch file comments
      const bridge = createCommentBridge(serverContext.projectPath);
      const comments = await bridge.getFileComments(commitHash, filePath);

      const response: CommentListResponse = {
        comments,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve file comments";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /comments/:commitHash
   *
   * Add a new comment to a commit.
   *
   * Path parameters:
   * - commitHash: Git commit hash
   *
   * Request body (NewComment):
   * - filePath (required): Path to file
   * - lineNumber (required): Starting line number (must be > 0)
   * - body (required): Comment text
   * - endLineNumber (optional): Ending line number for multi-line comments
   * - author (optional): Author information (defaults to git config)
   *
   * Returns:
   * - comment: Created Comment object
   */
  app.post("/comments/:commitHash", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract commit hash from path parameter
    const commitHash = c.req.param("commitHash");

    if (commitHash === undefined || commitHash.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Commit hash is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Parse request body
    let newComment: NewComment;
    try {
      const body = await c.req.json();
      newComment = body as NewComment;
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Validate required fields
    if (
      newComment.filePath === undefined ||
      newComment.filePath.trim().length === 0
    ) {
      const errorResponse: ErrorResponse = {
        error: "filePath is required and cannot be empty",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (newComment.lineNumber === undefined || newComment.lineNumber <= 0) {
      const errorResponse: ErrorResponse = {
        error: "lineNumber is required and must be greater than 0",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (newComment.body === undefined || newComment.body.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "body is required and cannot be empty",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Create bridge and add comment
      const bridge = createCommentBridge(serverContext.projectPath);
      const comment = await bridge.addComment(commitHash, newComment);

      const response: CommentResponse = {
        comment,
      };

      return c.json(response, 201);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to add comment";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * PUT /comments/:commitHash/:commentId
   *
   * Update an existing comment's body.
   *
   * Path parameters:
   * - commitHash: Git commit hash
   * - commentId: Comment ID to update
   *
   * Request body:
   * - body (required): New comment text
   *
   * Returns:
   * - comment: Updated Comment object
   */
  app.put("/comments/:commitHash/:commentId", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract path parameters
    const commitHash = c.req.param("commitHash");
    const commentId = c.req.param("commentId");

    if (commitHash === undefined || commitHash.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Commit hash is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (commentId === undefined || commentId.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Comment ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Parse request body
    let updateBody: { readonly body: string };
    try {
      const body = await c.req.json();
      updateBody = body as { readonly body: string };
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Validate body field
    if (updateBody.body === undefined || updateBody.body.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "body is required and cannot be empty",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Create bridge and update comment
      const bridge = createCommentBridge(serverContext.projectPath);
      const comment = await bridge.updateComment(
        commitHash,
        commentId,
        updateBody.body,
      );

      const response: CommentResponse = {
        comment,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to update comment";

      // Return 404 if comment not found
      const statusCode = errorMessage.includes("not found") ? 404 : 500;
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: statusCode,
      };
      return c.json(errorResponse, statusCode);
    }
  });

  /**
   * DELETE /comments/:commitHash/:commentId
   *
   * Delete a comment.
   *
   * Path parameters:
   * - commitHash: Git commit hash
   * - commentId: Comment ID to delete
   *
   * Returns:
   * - success: Boolean indicating if deletion succeeded
   */
  app.delete("/comments/:commitHash/:commentId", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract path parameters
    const commitHash = c.req.param("commitHash");
    const commentId = c.req.param("commentId");

    if (commitHash === undefined || commitHash.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Commit hash is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (commentId === undefined || commentId.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Comment ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Create bridge and delete comment
      const bridge = createCommentBridge(serverContext.projectPath);
      const success = await bridge.deleteComment(commitHash, commentId);

      const response: SuccessResponse = {
        success,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to delete comment";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /comments/:commitHash/:commentId/reply
   *
   * Add a reply to an existing comment.
   *
   * Path parameters:
   * - commitHash: Git commit hash
   * - commentId: Comment ID to reply to
   *
   * Request body (NewReply):
   * - body (required): Reply text
   * - author (optional): Author information (defaults to git config)
   *
   * Returns:
   * - reply: Created CommentReply object
   */
  app.post("/comments/:commitHash/:commentId/reply", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Extract path parameters
    const commitHash = c.req.param("commitHash");
    const commentId = c.req.param("commentId");

    if (commitHash === undefined || commitHash.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Commit hash is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (commentId === undefined || commentId.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Comment ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Parse request body
    let newReply: NewReply;
    try {
      const body = await c.req.json();
      newReply = body as NewReply;
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Validate body field
    if (newReply.body === undefined || newReply.body.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "body is required and cannot be empty",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Create bridge and add reply
      const bridge = createCommentBridge(serverContext.projectPath);
      const reply = await bridge.replyToComment(
        commitHash,
        commentId,
        newReply,
      );

      const response: ReplyResponse = {
        reply,
      };

      return c.json(response, 201);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to add reply";

      // Return 404 if comment not found
      const statusCode = errorMessage.includes("not found") ? 404 : 500;
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: statusCode,
      };
      return c.json(errorResponse, statusCode);
    }
  });

  /**
   * GET /notes/status
   *
   * Get current synchronization status for git notes.
   *
   * Returns:
   * - SyncStatus object with counts and sync state
   */
  app.get("/notes/status", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    try {
      // Create sync manager and get status
      const syncManager = createSyncManager(serverContext.projectPath);
      const status: SyncStatus = await syncManager.getSyncStatus();

      return c.json(status);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get sync status";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /notes/push
   *
   * Push git notes to remote.
   *
   * Returns:
   * - success: Boolean indicating if push succeeded
   * - error: Error message if push failed
   */
  app.post("/notes/push", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    try {
      // Create sync manager and push notes
      const syncManager = createSyncManager(serverContext.projectPath);
      await syncManager.pushNotes();

      const response: SuccessResponse = {
        success: true,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to push notes";

      const response: SuccessResponse = {
        success: false,
        error: errorMessage,
      };

      return c.json(response, 500);
    }
  });

  /**
   * POST /notes/pull
   *
   * Pull git notes from remote.
   *
   * Returns:
   * - success: Boolean indicating if pull succeeded
   * - error: Error message if pull failed
   */
  app.post("/notes/pull", async (c) => {
    // Get serverContext from middleware or fallback to parameter
    const serverContext = c.get("serverContext") ?? context;

    if (serverContext === undefined) {
      const errorResponse: ErrorResponse = {
        error: "Server context not available",
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    try {
      // Create sync manager and pull notes
      const syncManager = createSyncManager(serverContext.projectPath);
      await syncManager.pullNotes();

      const response: SuccessResponse = {
        success: true,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to pull notes";

      const response: SuccessResponse = {
        success: false,
        error: errorMessage,
      };

      return c.json(response, 500);
    }
  });

  return app;
}
