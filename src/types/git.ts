/**
 * Git Types for the qraftbox git operations layer
 *
 * This module defines types for git operations including file status,
 * diff generation, file tree representation, and working tree state.
 */

/**
 * File status codes for git changes
 */
export type FileStatusCode =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored";

/**
 * File status information for a single file
 */
export interface FileStatus {
  readonly path: string;
  readonly status: FileStatusCode;
  readonly oldPath?: string | undefined;
  readonly staged: boolean;
}

/**
 * A file in a diff with all change information
 */
export interface DiffFile {
  readonly path: string;
  readonly status: FileStatusCode;
  readonly oldPath?: string | undefined;
  readonly additions: number;
  readonly deletions: number;
  readonly chunks: readonly DiffChunk[];
  readonly isBinary: boolean;
  readonly fileSize?: number | undefined;
}

/**
 * A chunk within a diff file (hunk in git terminology)
 *
 * Represents a contiguous block of changes with context lines.
 */
export interface DiffChunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly header: string;
  readonly changes: readonly DiffChange[];
}

/**
 * A single line change within a diff chunk
 */
export interface DiffChange {
  readonly type: "add" | "delete" | "context";
  readonly oldLine?: number | undefined;
  readonly newLine?: number | undefined;
  readonly content: string;
}

/**
 * A node in a file tree (file or directory)
 */
export interface FileNode {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "directory";
  readonly children?: readonly FileNode[] | undefined;
  readonly status?: FileStatusCode | undefined;
  readonly isBinary?: boolean | undefined;
}

/**
 * Working tree status information
 */
export interface WorkingTreeStatus {
  readonly clean: boolean;
  readonly staged: readonly string[];
  readonly modified: readonly string[];
  readonly untracked: readonly string[];
  readonly conflicts: readonly string[];
}

/**
 * Type guard to check if a string is a valid FileStatusCode
 *
 * @param value - String to check
 * @returns True if value is a valid FileStatusCode
 */
export function isFileStatusCode(value: string): value is FileStatusCode {
  return (
    value === "added" ||
    value === "modified" ||
    value === "deleted" ||
    value === "renamed" ||
    value === "copied" ||
    value === "untracked" ||
    value === "ignored"
  );
}

/**
 * Create an empty DiffFile with minimal required fields
 *
 * @param path - File path
 * @param status - File status code
 * @returns Empty DiffFile with zero additions/deletions and no chunks
 */
export function createEmptyDiffFile(
  path: string,
  status: FileStatusCode,
): DiffFile {
  return {
    path,
    status,
    oldPath: undefined,
    additions: 0,
    deletions: 0,
    chunks: [],
    isBinary: false,
    fileSize: undefined,
  };
}

/**
 * Create a FileNode (file or directory)
 *
 * @param name - Name of the file or directory
 * @param path - Full path to the file or directory
 * @param type - Type of node (file or directory)
 * @returns A new FileNode
 */
export function createFileNode(
  name: string,
  path: string,
  type: "file" | "directory",
): FileNode {
  return {
    name,
    path,
    type,
    children: type === "directory" ? [] : undefined,
    status: undefined,
    isBinary: undefined,
  };
}

/**
 * Create an empty WorkingTreeStatus representing a clean working tree
 *
 * @returns Empty WorkingTreeStatus with clean: true
 */
export function createCleanWorkingTreeStatus(): WorkingTreeStatus {
  return {
    clean: true,
    staged: [],
    modified: [],
    untracked: [],
    conflicts: [],
  };
}

/**
 * Check if a working tree is clean
 *
 * @param status - WorkingTreeStatus to check
 * @returns True if working tree has no changes
 */
export function isWorkingTreeClean(status: WorkingTreeStatus): boolean {
  return (
    status.staged.length === 0 &&
    status.modified.length === 0 &&
    status.untracked.length === 0 &&
    status.conflicts.length === 0
  );
}

/**
 * File badge types for display in file tree
 *
 * - M: Modified file
 * - +: Added file
 * - -: Deleted file
 * - R: Renamed file
 * - ?: Untracked file
 * - I: Ignored file
 * - IMG: Image file (binary)
 * - BIN: Binary file (non-image)
 */
export type FileBadge = "M" | "+" | "-" | "R" | "?" | "I" | "IMG" | "BIN";

/**
 * Image file extensions that can be previewed
 */
const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
] as const;

/**
 * Get badge type for a file node based on its properties
 *
 * Priority order:
 * 1. Binary files (IMG for images, BIN for other binaries)
 * 2. Status-based badges (+, -, R, M)
 *
 * @param node - FileNode to get badge for
 * @returns FileBadge type or undefined if no badge applies
 */
export function getFileBadge(node: FileNode): FileBadge | undefined {
  // Check for binary files first
  if (node.isBinary === true) {
    const extension = node.path.split(".").pop()?.toLowerCase();
    if (
      extension !== undefined &&
      IMAGE_EXTENSIONS.includes(extension as (typeof IMAGE_EXTENSIONS)[number])
    ) {
      return "IMG";
    }
    return "BIN";
  }

  // Status-based badges
  if (node.status === "added") {
    return "+";
  }
  if (node.status === "deleted") {
    return "-";
  }
  if (node.status === "renamed") {
    return "R";
  }
  if (node.status === "modified") {
    return "M";
  }
  if (node.status === "untracked") {
    return "?";
  }
  if (node.status === "ignored") {
    return "I";
  }

  return undefined;
}
