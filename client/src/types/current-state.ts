/**
 * Current State View types
 *
 * Provides types for the novel "Current State View" feature that shows
 * only the latest file state with visual diff annotations.
 */

import type { DiffFile, DiffChange } from "./diff";

/**
 * Current State Line - represents a line in current state view
 *
 * Each line shows the current (post-change) content with annotations
 * indicating whether it was added, modified, or unchanged.
 */
export interface CurrentStateLine {
  /**
   * Line number in the current (new) file
   */
  readonly lineNumber: number;

  /**
   * Content of the line
   */
  readonly content: string;

  /**
   * Type of change for this line
   * - added: New line that did not exist in original
   * - modified: Line that existed but content changed
   * - unchanged: Line that exists in both versions without changes
   */
  readonly changeType: "added" | "modified" | "unchanged";

  /**
   * Deleted block that appeared before this line (optional)
   *
   * When content is deleted, it is associated with the next
   * unchanged/added line that follows the deletion.
   */
  readonly deletedBefore?: DeletedBlock;
}

/**
 * Deleted Block - represents deleted content between lines
 *
 * Deleted content is shown as thin red lines that can be expanded.
 * Each block has a unique ID for managing expand/collapse state.
 */
export interface DeletedBlock {
  /**
   * Unique identifier for this deleted block
   * Format: "deleted-{originalStart}-{originalEnd}"
   */
  readonly id: string;

  /**
   * Lines that were deleted (content only)
   */
  readonly lines: readonly string[];

  /**
   * Line number in original file where deletion starts
   */
  readonly originalStart: number;

  /**
   * Line number in original file where deletion ends
   */
  readonly originalEnd: number;
}

/**
 * Transform diff data to current state format
 *
 * This function processes a DiffFile and extracts only the "current state"
 * (new file content), marking lines as added/modified/unchanged.
 * Deleted blocks are tracked and associated with the next visible line.
 *
 * Algorithm:
 * 1. Process each chunk in order
 * 2. For each change in the chunk:
 *    - context: Add as unchanged line
 *    - add: Add as added line
 *    - delete: Accumulate in pending deleted block
 * 3. When transitioning from delete to non-delete, attach deleted block
 *    to the next line
 *
 * @param file - DiffFile to transform
 * @returns Array of CurrentStateLine representing the current file state
 */
export function transformToCurrentState(
  file: DiffFile,
): readonly CurrentStateLine[] {
  const lines: CurrentStateLine[] = [];
  let pendingDeleted: DiffChange[] = [];
  let pendingDeletedStartLine: number | undefined = undefined;

  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      if (change.type === "delete") {
        // Accumulate deleted lines
        pendingDeleted.push(change);
        if (
          pendingDeletedStartLine === undefined &&
          change.oldLine !== undefined
        ) {
          pendingDeletedStartLine = change.oldLine;
        }
      } else {
        // Process add or context
        const deletedBlock = createDeletedBlock(
          pendingDeleted,
          pendingDeletedStartLine,
        );

        const changeType: "added" | "modified" | "unchanged" =
          change.type === "add" ? "added" : "unchanged";

        // Note: We cannot reliably determine "modified" from standard diff format
        // without additional context. In standard unified diff:
        // - Modified lines appear as delete + add pair
        // - We would need to look ahead/behind to detect this pattern
        // For now, we mark all "add" as "added" and all "context" as "unchanged"

        if (change.newLine !== undefined) {
          lines.push({
            lineNumber: change.newLine,
            content: change.content,
            changeType,
            deletedBefore: deletedBlock,
          });
        }

        // Reset pending deleted
        pendingDeleted = [];
        pendingDeletedStartLine = undefined;
      }
    }
  }

  // Handle trailing deleted block (deletion at end of file)
  if (pendingDeleted.length > 0) {
    const deletedBlock = createDeletedBlock(
      pendingDeleted,
      pendingDeletedStartLine,
    );

    if (deletedBlock !== undefined) {
      // Add a synthetic line to attach the deleted block
      // This represents "end of file" marker
      const lastLine = lines[lines.length - 1];
      const nextLineNumber =
        lastLine !== undefined ? lastLine.lineNumber + 1 : 1;

      lines.push({
        lineNumber: nextLineNumber,
        content: "",
        changeType: "unchanged",
        deletedBefore: deletedBlock,
      });
    }
  }

  return lines;
}

/**
 * Create a DeletedBlock from accumulated deleted changes
 *
 * @param deletedChanges - Array of deleted DiffChange items
 * @param startLine - Original line number where deletion starts
 * @returns DeletedBlock if there are deleted changes, undefined otherwise
 */
function createDeletedBlock(
  deletedChanges: readonly DiffChange[],
  startLine: number | undefined,
): DeletedBlock | undefined {
  if (deletedChanges.length === 0 || startLine === undefined) {
    return undefined;
  }

  const lines = deletedChanges.map((change) => change.content);
  const endLine = startLine + deletedChanges.length - 1;

  return {
    id: `deleted-${startLine}-${endLine}`,
    lines,
    originalStart: startLine,
    originalEnd: endLine,
  };
}
