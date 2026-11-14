/**
 * Diff types shared between client and server
 */

export type DiffStatus = "added" | "modified" | "deleted" | "renamed";

export type DiffChangeType = "add" | "delete" | "context";

export type ViewMode =
  | "side-by-side"
  | "inline"
  | "current-state"
  | "full-file";

/**
 * Represents a single change line in a diff chunk
 */
export interface DiffChange {
  readonly type: DiffChangeType;
  readonly content: string;
  readonly oldLine: number | undefined;
  readonly newLine: number | undefined;
}

/**
 * Represents a chunk (hunk) of changes within a file
 */
export interface DiffChunk {
  readonly header: string;
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly changes: readonly DiffChange[];
}

/**
 * Represents a file in a diff
 */
export interface DiffFile {
  readonly path: string;
  readonly status: DiffStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly chunks: readonly DiffChunk[];
  /**
   * Original path before rename (only present when status is 'renamed')
   */
  readonly oldPath?: string;
}
