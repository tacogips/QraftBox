/**
 * Comment Bridge Module
 *
 * Wraps git notes operations to store and retrieve comments as JSON.
 * Uses git notes with a custom ref (aynd-comments) for persistent storage.
 */

import type {
  Comment,
  CommentReply,
  NewComment,
  NewReply,
  Author,
} from "../../types/comments.js";
import {
  createComment,
  createCommentReply,
  createAuthor,
} from "../../types/comments.js";
import { execGit } from "../git/executor.js";

/**
 * Comment Bridge interface for managing commit comments via git notes
 */
export interface CommentBridge {
  /**
   * Get all comments for a commit
   *
   * @param commitHash - Git commit hash
   * @returns Promise resolving to array of comments
   */
  getComments(commitHash: string): Promise<readonly Comment[]>;

  /**
   * Get comments for a specific file in a commit
   *
   * @param commitHash - Git commit hash
   * @param filePath - Path to file within repository
   * @returns Promise resolving to array of comments for the file
   */
  getFileComments(
    commitHash: string,
    filePath: string,
  ): Promise<readonly Comment[]>;

  /**
   * Add a new comment to a commit
   *
   * @param commitHash - Git commit hash
   * @param comment - New comment data
   * @returns Promise resolving to created comment
   */
  addComment(commitHash: string, comment: NewComment): Promise<Comment>;

  /**
   * Update an existing comment body
   *
   * @param commitHash - Git commit hash
   * @param commentId - Comment ID to update
   * @param body - New comment body text
   * @returns Promise resolving to updated comment
   * @throws Error if comment not found
   */
  updateComment(
    commitHash: string,
    commentId: string,
    body: string,
  ): Promise<Comment>;

  /**
   * Delete a comment
   *
   * @param commitHash - Git commit hash
   * @param commentId - Comment ID to delete
   * @returns Promise resolving to true if deleted, false if not found
   */
  deleteComment(commitHash: string, commentId: string): Promise<boolean>;

  /**
   * Add a reply to an existing comment
   *
   * @param commitHash - Git commit hash
   * @param commentId - Comment ID to reply to
   * @param reply - New reply data
   * @returns Promise resolving to created reply
   * @throws Error if comment not found
   */
  replyToComment(
    commitHash: string,
    commentId: string,
    reply: NewReply,
  ): Promise<CommentReply>;

  /**
   * Get default author from git config
   *
   * @returns Promise resolving to author with user.name and user.email
   * @throws Error if git config is not set
   */
  getDefaultAuthor(): Promise<Author>;
}

/**
 * Git notes reference for storing comments
 */
const NOTES_REF = "aynd-comments";

/**
 * Create a Comment Bridge instance for a git repository
 *
 * @param projectPath - Path to git repository
 * @returns CommentBridge interface
 *
 * @example
 * ```typescript
 * const bridge = createCommentBridge('/path/to/repo');
 * const comments = await bridge.getComments('abc123');
 * ```
 */
export function createCommentBridge(projectPath: string): CommentBridge {
  /**
   * Read comments from git notes for a commit
   */
  async function readCommentsFromNotes(commitHash: string): Promise<Comment[]> {
    const result = await execGit(
      ["notes", "--ref", NOTES_REF, "show", commitHash],
      { cwd: projectPath },
    );

    // No notes exist - return empty array
    if (result.exitCode !== 0) {
      return [];
    }

    const notesContent = result.stdout.trim();
    if (notesContent.length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(notesContent) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("Notes content is not an array");
      }
      return parsed as Comment[];
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Failed to parse comments from git notes: ${errorMessage}`,
      );
    }
  }

  /**
   * Write comments to git notes for a commit
   */
  async function writeCommentsToNotes(
    commitHash: string,
    comments: readonly Comment[],
  ): Promise<void> {
    const json = JSON.stringify(comments, null, 2);

    const result = await execGit(
      ["notes", "--ref", NOTES_REF, "add", "-f", "-m", json, commitHash],
      { cwd: projectPath },
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to write comments to git notes: ${result.stderr}`,
      );
    }
  }

  return {
    async getComments(commitHash: string): Promise<readonly Comment[]> {
      return readCommentsFromNotes(commitHash);
    },

    async getFileComments(
      commitHash: string,
      filePath: string,
    ): Promise<readonly Comment[]> {
      const allComments = await readCommentsFromNotes(commitHash);
      return allComments.filter((comment) => comment.filePath === filePath);
    },

    async addComment(
      commitHash: string,
      comment: NewComment,
    ): Promise<Comment> {
      // Get default author if not provided
      const author = comment.author ?? (await this.getDefaultAuthor());

      // Generate unique ID
      const id = crypto.randomUUID();

      // Create comment object
      const newComment = createComment(
        id,
        commitHash,
        comment.filePath,
        comment.lineNumber,
        comment.body,
        author,
        Date.now(),
        {
          endLineNumber: comment.endLineNumber,
        },
      );

      // Read existing comments
      const existingComments = await readCommentsFromNotes(commitHash);

      // Append new comment
      const updatedComments = [...existingComments, newComment];

      // Write back to notes
      await writeCommentsToNotes(commitHash, updatedComments);

      return newComment;
    },

    async updateComment(
      commitHash: string,
      commentId: string,
      body: string,
    ): Promise<Comment> {
      // Read existing comments
      const existingComments = await readCommentsFromNotes(commitHash);

      // Find comment to update
      const commentIndex = existingComments.findIndex(
        (c) => c.id === commentId,
      );

      if (commentIndex === -1) {
        throw new Error(`Comment ${commentId} not found`);
      }

      const existingComment = existingComments[commentIndex];
      if (existingComment === undefined) {
        throw new Error(`Comment ${commentId} not found`);
      }

      // Create updated comment
      const updatedComment: Comment = {
        ...existingComment,
        body,
        updatedAt: Date.now(),
      };

      // Replace in array
      const updatedComments = [...existingComments];
      updatedComments[commentIndex] = updatedComment;

      // Write back to notes
      await writeCommentsToNotes(commitHash, updatedComments);

      return updatedComment;
    },

    async deleteComment(
      commitHash: string,
      commentId: string,
    ): Promise<boolean> {
      // Read existing comments
      const existingComments = await readCommentsFromNotes(commitHash);

      // Filter out the comment to delete
      const updatedComments = existingComments.filter(
        (c) => c.id !== commentId,
      );

      // Check if anything was deleted
      if (updatedComments.length === existingComments.length) {
        return false;
      }

      // Write back to notes
      await writeCommentsToNotes(commitHash, updatedComments);

      return true;
    },

    async replyToComment(
      commitHash: string,
      commentId: string,
      reply: NewReply,
    ): Promise<CommentReply> {
      // Get default author if not provided
      const author = reply.author ?? (await this.getDefaultAuthor());

      // Generate unique ID for reply
      const replyId = crypto.randomUUID();

      // Create reply object
      const newReply = createCommentReply(
        replyId,
        reply.body,
        author,
        Date.now(),
      );

      // Read existing comments
      const existingComments = await readCommentsFromNotes(commitHash);

      // Find comment to add reply to
      const commentIndex = existingComments.findIndex(
        (c) => c.id === commentId,
      );

      if (commentIndex === -1) {
        throw new Error(`Comment ${commentId} not found`);
      }

      const existingComment = existingComments[commentIndex];
      if (existingComment === undefined) {
        throw new Error(`Comment ${commentId} not found`);
      }

      // Add reply to comment
      const updatedComment: Comment = {
        ...existingComment,
        replies: [...existingComment.replies, newReply],
      };

      // Replace in array
      const updatedComments = [...existingComments];
      updatedComments[commentIndex] = updatedComment;

      // Write back to notes
      await writeCommentsToNotes(commitHash, updatedComments);

      return newReply;
    },

    async getDefaultAuthor(): Promise<Author> {
      // Get user.name
      const nameResult = await execGit(["config", "user.name"], {
        cwd: projectPath,
      });

      if (nameResult.exitCode !== 0 || nameResult.stdout.trim().length === 0) {
        throw new Error(
          "git config user.name is not set. Run: git config user.name 'Your Name'",
        );
      }

      // Get user.email
      const emailResult = await execGit(["config", "user.email"], {
        cwd: projectPath,
      });

      if (
        emailResult.exitCode !== 0 ||
        emailResult.stdout.trim().length === 0
      ) {
        throw new Error(
          "git config user.email is not set. Run: git config user.email 'your.email@example.com'",
        );
      }

      return createAuthor(nameResult.stdout.trim(), emailResult.stdout.trim());
    },
  };
}
