import type { DiffChange, DiffFile } from "./diff";

export interface CurrentStateLine {
  readonly lineNumber: number;
  readonly content: string;
  readonly changeType: "added" | "modified" | "unchanged";
  readonly deletedBefore?: DeletedBlock | undefined;
}

export interface DeletedBlock {
  readonly id: string;
  readonly lines: readonly string[];
  readonly originalStart: number;
  readonly originalEnd: number;
}

export function transformToCurrentState(
  diffFile: DiffFile,
): readonly CurrentStateLine[] {
  const currentStateLines: CurrentStateLine[] = [];
  let pendingDeletedChanges: DiffChange[] = [];
  let pendingDeletedStartLine: number | undefined = undefined;

  for (const diffChunk of diffFile.chunks) {
    for (const diffChange of diffChunk.changes) {
      if (diffChange.type === "delete") {
        pendingDeletedChanges.push(diffChange);
        if (
          pendingDeletedStartLine === undefined &&
          diffChange.oldLine !== undefined
        ) {
          pendingDeletedStartLine = diffChange.oldLine;
        }
        continue;
      }

      const deletedBlock = createDeletedBlock(
        pendingDeletedChanges,
        pendingDeletedStartLine,
      );
      const changeType: CurrentStateLine["changeType"] =
        diffChange.type === "add" ? "added" : "unchanged";

      if (diffChange.newLine !== undefined) {
        currentStateLines.push({
          lineNumber: diffChange.newLine,
          content: diffChange.content,
          changeType,
          deletedBefore: deletedBlock,
        });
      }

      pendingDeletedChanges = [];
      pendingDeletedStartLine = undefined;
    }
  }

  if (pendingDeletedChanges.length === 0) {
    return currentStateLines;
  }

  const trailingDeletedBlock = createDeletedBlock(
    pendingDeletedChanges,
    pendingDeletedStartLine,
  );
  if (trailingDeletedBlock === undefined) {
    return currentStateLines;
  }

  const lastVisibleLine = currentStateLines[currentStateLines.length - 1];
  const trailingLineNumber =
    lastVisibleLine !== undefined ? lastVisibleLine.lineNumber + 1 : 1;

  currentStateLines.push({
    lineNumber: trailingLineNumber,
    content: "",
    changeType: "unchanged",
    deletedBefore: trailingDeletedBlock,
  });

  return currentStateLines;
}

function createDeletedBlock(
  deletedChanges: readonly DiffChange[],
  startLine: number | undefined,
): DeletedBlock | undefined {
  if (deletedChanges.length === 0 || startLine === undefined) {
    return undefined;
  }

  const deletedLines = deletedChanges.map(
    (deletedChange) => deletedChange.content,
  );
  const endLine = startLine + deletedChanges.length - 1;

  return {
    id: `deleted-${startLine}-${endLine}`,
    lines: deletedLines,
    originalStart: startLine,
    originalEnd: endLine,
  };
}
