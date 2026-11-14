/**
 * Comment Types for git-xnotes integration
 *
 * This module defines types for managing persistent commit comments via git notes,
 * including thread support, synchronization status, and author information.
 */

/**
 * Author of a comment or reply
 *
 * Contains user identity information from git config or provided explicitly.
 */
export interface Author {
  readonly name: string;
  readonly email: string;
}

/**
 * A comment attached to a specific commit and file location
 *
 * Supports single or multi-line comments with threading (one level of replies).
 */
export interface Comment {
  readonly id: string;
  readonly commitHash: string;
  readonly filePath: string;
  readonly lineNumber: number;
  readonly endLineNumber?: number | undefined;
  readonly body: string;
  readonly author: Author;
  readonly createdAt: number;
  readonly updatedAt?: number | undefined;
  readonly replies: readonly CommentReply[];
}

/**
 * A reply to a comment
 *
 * One-level threading only - replies cannot have nested replies.
 */
export interface CommentReply {
  readonly id: string;
  readonly body: string;
  readonly author: Author;
  readonly createdAt: number;
}

/**
 * Input data for creating a new comment
 *
 * Author is optional and will default to git config user.name/email.
 */
export interface NewComment {
  readonly filePath: string;
  readonly lineNumber: number;
  readonly endLineNumber?: number | undefined;
  readonly body: string;
  readonly author?: Author | undefined;
}

/**
 * Input data for creating a new reply
 *
 * Author is optional and will default to git config user.name/email.
 */
export interface NewReply {
  readonly body: string;
  readonly author?: Author | undefined;
}

/**
 * Synchronization mode for git notes
 *
 * - manual: No automatic sync
 * - auto-push: Automatically push after writes
 * - auto-pull: Automatically pull before reads
 * - auto: Both auto-push and auto-pull
 */
export type SyncMode = "manual" | "auto-push" | "auto-pull" | "auto";

/**
 * Current synchronization status
 *
 * Tracks local/remote note counts and sync state.
 */
export interface SyncStatus {
  readonly localCount: number;
  readonly remoteCount: number;
  readonly syncMode: SyncMode;
  readonly lastSyncAt: number | null;
  readonly hasUnsyncedChanges: boolean;
}

/**
 * Create an Author with name and email
 *
 * @param name - Author name
 * @param email - Author email address
 * @returns Author with provided information
 */
export function createAuthor(name: string, email: string): Author {
  return {
    name,
    email,
  };
}

/**
 * Create a Comment with all required fields
 *
 * @param id - Unique comment identifier
 * @param commitHash - Git commit hash
 * @param filePath - Path to file within repository
 * @param lineNumber - Starting line number (1-indexed)
 * @param body - Comment text content
 * @param author - Comment author
 * @param createdAt - Creation timestamp (milliseconds since epoch)
 * @param overrides - Optional partial Comment to override defaults
 * @returns Complete Comment object
 */
export function createComment(
  id: string,
  commitHash: string,
  filePath: string,
  lineNumber: number,
  body: string,
  author: Author,
  createdAt: number,
  overrides?: Partial<Comment>,
): Comment {
  return {
    id,
    commitHash,
    filePath,
    lineNumber,
    endLineNumber: undefined,
    body,
    author,
    createdAt,
    updatedAt: undefined,
    replies: [],
    ...overrides,
  };
}

/**
 * Create a CommentReply with all required fields
 *
 * @param id - Unique reply identifier
 * @param body - Reply text content
 * @param author - Reply author
 * @param createdAt - Creation timestamp (milliseconds since epoch)
 * @returns Complete CommentReply object
 */
export function createCommentReply(
  id: string,
  body: string,
  author: Author,
  createdAt: number,
): CommentReply {
  return {
    id,
    body,
    author,
    createdAt,
  };
}

/**
 * Create a NewComment for adding a new comment
 *
 * @param filePath - Path to file within repository
 * @param lineNumber - Starting line number (1-indexed)
 * @param body - Comment text content
 * @param overrides - Optional partial NewComment to override defaults
 * @returns NewComment object ready for submission
 */
export function createNewComment(
  filePath: string,
  lineNumber: number,
  body: string,
  overrides?: Partial<NewComment>,
): NewComment {
  return {
    filePath,
    lineNumber,
    endLineNumber: undefined,
    body,
    author: undefined,
    ...overrides,
  };
}

/**
 * Create a NewReply for adding a reply to a comment
 *
 * @param body - Reply text content
 * @param author - Optional author (defaults to git config user)
 * @returns NewReply object ready for submission
 */
export function createNewReply(
  body: string,
  author?: Author | undefined,
): NewReply {
  return {
    body,
    author,
  };
}

/**
 * Create a SyncStatus with all required fields
 *
 * @param localCount - Number of local notes
 * @param remoteCount - Number of remote notes
 * @param syncMode - Current synchronization mode
 * @param overrides - Optional partial SyncStatus to override defaults
 * @returns SyncStatus object
 */
export function createSyncStatus(
  localCount: number,
  remoteCount: number,
  syncMode: SyncMode,
  overrides?: Partial<SyncStatus>,
): SyncStatus {
  return {
    localCount,
    remoteCount,
    syncMode,
    lastSyncAt: null,
    hasUnsyncedChanges: false,
    ...overrides,
  };
}

/**
 * Type guard to check if a string is a valid SyncMode
 *
 * @param value - String to check
 * @returns True if value is a valid SyncMode
 */
export function isSyncMode(value: string): value is SyncMode {
  return (
    value === "manual" ||
    value === "auto-push" ||
    value === "auto-pull" ||
    value === "auto"
  );
}

/**
 * Type guard to check if an object is a valid Author
 *
 * @param value - Value to check
 * @returns True if value is a valid Author
 */
export function isValidAuthor(value: unknown): value is Author {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj["name"] === "string" &&
    obj["name"].trim().length > 0 &&
    typeof obj["email"] === "string" &&
    obj["email"].trim().length > 0 &&
    obj["email"].includes("@")
  );
}

/**
 * Type guard to check if an object is a valid Comment
 *
 * @param value - Value to check
 * @returns True if value is a valid Comment
 */
export function isValidComment(value: unknown): value is Comment {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj["id"] === "string" &&
    obj["id"].trim().length > 0 &&
    typeof obj["commitHash"] === "string" &&
    obj["commitHash"].trim().length > 0 &&
    typeof obj["filePath"] === "string" &&
    obj["filePath"].trim().length > 0 &&
    typeof obj["lineNumber"] === "number" &&
    obj["lineNumber"] > 0 &&
    Number.isInteger(obj["lineNumber"]) &&
    typeof obj["body"] === "string" &&
    obj["body"].trim().length > 0 &&
    isValidAuthor(obj["author"]) &&
    typeof obj["createdAt"] === "number" &&
    obj["createdAt"] > 0 &&
    Array.isArray(obj["replies"])
  );
}

/**
 * Validate that a line number is valid (positive integer)
 *
 * @param lineNumber - Line number to validate
 * @returns True if valid
 */
export function isValidLineNumber(lineNumber: number): boolean {
  return Number.isInteger(lineNumber) && lineNumber > 0;
}

/**
 * Validate that a line range is valid
 *
 * @param startLine - Starting line number
 * @param endLine - Optional ending line number
 * @returns True if valid (endLine must be >= startLine if provided)
 */
export function isValidLineRange(
  startLine: number,
  endLine?: number | undefined,
): boolean {
  if (!isValidLineNumber(startLine)) {
    return false;
  }

  if (endLine !== undefined) {
    return isValidLineNumber(endLine) && endLine >= startLine;
  }

  return true;
}

/**
 * Check if a comment has been updated after creation
 *
 * @param comment - Comment to check
 * @returns True if comment has an updatedAt timestamp
 */
export function isCommentUpdated(comment: Comment): boolean {
  return comment.updatedAt !== undefined && comment.updatedAt > 0;
}

/**
 * Check if a comment has replies
 *
 * @param comment - Comment to check
 * @returns True if comment has at least one reply
 */
export function hasReplies(comment: Comment): boolean {
  return comment.replies.length > 0;
}

/**
 * Check if a comment is a multi-line comment
 *
 * @param comment - Comment to check
 * @returns True if comment spans multiple lines
 */
export function isMultiLineComment(comment: Comment): boolean {
  return (
    comment.endLineNumber !== undefined &&
    comment.endLineNumber > comment.lineNumber
  );
}
