import type { AIPromptContext } from "../../../../src/types/ai";
import {
  transformToCurrentState,
  type CurrentStateLine,
} from "../../../../client-shared/src/contracts/current-state";
import type {
  DiffChange,
  DiffChunk,
  DiffFile,
} from "../../../../client-shared/src/contracts/diff";
import type { FileContent } from "../../../../client-shared/src/contracts/files";
import type { QueuedAiComment } from "../../../../client-shared/src/api/ai-comments";

export interface FullFileLineRange {
  readonly startLine: number;
  readonly endLine: number;
}

interface NumberedLine {
  readonly lineNumber: number;
  readonly content: string;
}

export function createFullFileLineRange(lineNumber: number): FullFileLineRange {
  return {
    startLine: lineNumber,
    endLine: lineNumber,
  };
}

export function resolveFullFileLineRange(params: {
  readonly currentRange: FullFileLineRange | null;
  readonly lineNumber: number;
  readonly extendRange: boolean;
}): FullFileLineRange {
  if (params.extendRange && params.currentRange !== null) {
    return {
      startLine: Math.min(params.currentRange.startLine, params.lineNumber),
      endLine: Math.max(params.currentRange.endLine, params.lineNumber),
    };
  }

  return createFullFileLineRange(params.lineNumber);
}

export function collectFullFileLineRangeNumbers(
  range: FullFileLineRange | null,
): readonly number[] {
  if (range === null) {
    return [];
  }

  const lineNumbers: number[] = [];
  for (
    let lineNumber = range.startLine;
    lineNumber <= range.endLine;
    lineNumber += 1
  ) {
    lineNumbers.push(lineNumber);
  }
  return lineNumbers;
}

export function createFullFileCommentPlaceholder(
  filePath: string,
  range: FullFileLineRange | null,
): string {
  if (range === null) {
    return "";
  }

  const lineLabel =
    range.startLine === range.endLine
      ? `L${range.startLine}`
      : `L${range.startLine}-L${range.endLine}`;
  return `Ask AI about ${filePath}:${lineLabel} ...`;
}

export function createFullFilePromptContext(params: {
  readonly fileContent: FileContent;
  readonly range: FullFileLineRange;
}): AIPromptContext {
  const fileLines = params.fileContent.content.split("\n");
  const selectedLines = fileLines.slice(
    params.range.startLine - 1,
    params.range.endLine,
  );

  return {
    primaryFile: {
      path: params.fileContent.path,
      startLine: params.range.startLine,
      endLine: params.range.endLine,
      content: selectedLines.join("\n"),
    },
    references: [],
    diffSummary: undefined,
  };
}

function isLineNumberWithinRange(
  lineNumber: number | undefined,
  range: FullFileLineRange,
): lineNumber is number {
  return (
    lineNumber !== undefined &&
    lineNumber >= range.startLine &&
    lineNumber <= range.endLine
  );
}

function createNumberedLineText(
  numberedLines: readonly NumberedLine[],
  emptyText: string,
): string {
  if (numberedLines.length === 0) {
    return emptyText;
  }

  return numberedLines
    .map(
      (numberedLine) => `L${numberedLine.lineNumber}: ${numberedLine.content}`,
    )
    .join("\n");
}

function collectCurrentStateSelectedLines(
  diffFile: DiffFile,
  range: FullFileLineRange,
): readonly NumberedLine[] {
  return transformToCurrentState(diffFile)
    .filter((currentStateLine) =>
      isRenderableCurrentStateSelectionLine(currentStateLine),
    )
    .filter((currentStateLine) =>
      isLineNumberWithinRange(currentStateLine.lineNumber, range),
    )
    .map((currentStateLine) => ({
      lineNumber: currentStateLine.lineNumber,
      content: currentStateLine.content,
    }));
}

function isRenderableCurrentStateSelectionLine(
  currentStateLine: CurrentStateLine,
): boolean {
  return (
    currentStateLine.content !== "" ||
    currentStateLine.changeType !== "unchanged"
  );
}

export function createCurrentStatePromptContext(params: {
  readonly diffFile: DiffFile;
  readonly range: FullFileLineRange;
}): AIPromptContext {
  const selectedLines = collectCurrentStateSelectedLines(
    params.diffFile,
    params.range,
  );

  return {
    primaryFile: {
      path: params.diffFile.path,
      startLine: params.range.startLine,
      endLine: params.range.endLine,
      content: selectedLines
        .map((selectedLine) => selectedLine.content)
        .join("\n"),
    },
    references: [],
    diffSummary: undefined,
  };
}

function collectIntersectingDiffChunks(
  diffFile: DiffFile,
  range: FullFileLineRange,
): readonly DiffChunk[] {
  return diffFile.chunks.filter((diffChunk) =>
    diffChunk.changes.some((diffChange) =>
      isLineNumberWithinRange(diffChange.newLine, range),
    ),
  );
}

function collectSelectedAfterLines(
  diffChunks: readonly DiffChunk[],
  range: FullFileLineRange,
): readonly NumberedLine[] {
  return diffChunks.flatMap((diffChunk) =>
    diffChunk.changes
      .filter((diffChange) =>
        isLineNumberWithinRange(diffChange.newLine, range),
      )
      .map((diffChange) => ({
        lineNumber: diffChange.newLine!,
        content: diffChange.content,
      })),
  );
}

function collectPatchLines(
  diffChunks: readonly DiffChunk[],
  side: "old" | "new",
): readonly NumberedLine[] {
  return diffChunks.flatMap((diffChunk) =>
    diffChunk.changes.flatMap((diffChange) => {
      const lineNumber =
        side === "old" ? diffChange.oldLine : diffChange.newLine;
      if (lineNumber === undefined) {
        return [];
      }

      return [
        {
          lineNumber,
          content: diffChange.content,
        },
      ];
    }),
  );
}

function formatDiffChangeForPrompt(diffChange: DiffChange): string {
  if (diffChange.type === "add") {
    return `+L${diffChange.newLine ?? "?"}: ${diffChange.content}`;
  }

  if (diffChange.type === "delete") {
    return `-L${diffChange.oldLine ?? "?"}: ${diffChange.content}`;
  }

  return ` L${diffChange.newLine ?? diffChange.oldLine ?? "?"}: ${diffChange.content}`;
}

function createDiffPatchExcerpt(diffChunks: readonly DiffChunk[]): string {
  return diffChunks
    .map((diffChunk) =>
      [
        diffChunk.header,
        ...diffChunk.changes.map(formatDiffChangeForPrompt),
      ].join("\n"),
    )
    .join("\n\n");
}

function createDiffSelectionReferenceContent(params: {
  readonly diffFile: DiffFile;
  readonly range: FullFileLineRange;
}): string {
  const intersectingDiffChunks = collectIntersectingDiffChunks(
    params.diffFile,
    params.range,
  );
  const selectedAfterLines = collectSelectedAfterLines(
    intersectingDiffChunks,
    params.range,
  );
  const beforePatchLines = collectPatchLines(intersectingDiffChunks, "old");
  const afterPatchLines = collectPatchLines(intersectingDiffChunks, "new");
  const beforePath = params.diffFile.oldPath ?? params.diffFile.path;

  return [
    `Selected after lines (${params.diffFile.path}):`,
    createNumberedLineText(
      selectedAfterLines,
      "No current-side lines were available for the selected range.",
    ),
    `Before patch (${beforePath}):`,
    createNumberedLineText(
      beforePatchLines,
      "No corresponding before-patch lines were available for this selected range.",
    ),
    `After patch (${params.diffFile.path}):`,
    createNumberedLineText(
      afterPatchLines,
      "No after-patch lines were available for this selected range.",
    ),
    "Patch excerpt:",
    createDiffPatchExcerpt(intersectingDiffChunks),
  ].join("\n\n");
}

export function createDiffPromptContext(params: {
  readonly diffFile: DiffFile;
  readonly range: FullFileLineRange;
}): AIPromptContext {
  const intersectingDiffChunks = collectIntersectingDiffChunks(
    params.diffFile,
    params.range,
  );
  const selectedAfterLines = collectSelectedAfterLines(
    intersectingDiffChunks,
    params.range,
  );

  return {
    primaryFile: {
      path: params.diffFile.path,
      startLine: params.range.startLine,
      endLine: params.range.endLine,
      content: selectedAfterLines
        .map((selectedLine) => selectedLine.content)
        .join("\n"),
    },
    references: [
      {
        path: params.diffFile.path,
        startLine: params.range.startLine,
        endLine: params.range.endLine,
        content: createDiffSelectionReferenceContent(params),
      },
    ],
    diffSummary: undefined,
  };
}

export function createQueuedCommentLineRangeLabel(
  comment: Pick<QueuedAiComment, "startLine" | "endLine">,
): string {
  return comment.startLine === comment.endLine
    ? `L${comment.startLine}`
    : `L${comment.startLine}-L${comment.endLine}`;
}

export function createQueuedCommentsBatchMessage(
  comments: readonly QueuedAiComment[],
): string {
  const hasDiffContextComments = comments.some(
    (comment) =>
      comment.source === "diff" || comment.source === "current-state",
  );
  const batchHeader = hasDiffContextComments
    ? "Please process the following queued file comments in one batch. For items marked [DIFF], answer in terms of old-vs-new changes and review intent."
    : "Please process the following queued file comments in one batch and provide a single consolidated response.";

  const sections = comments.map((comment, index) => {
    const sourceLabel = comment.source === "full-file" ? "FULL_FILE" : "DIFF";
    return `${index + 1}. [${sourceLabel}] ${comment.filePath}:${createQueuedCommentLineRangeLabel(
      comment,
    )}\n${comment.prompt}`;
  });

  return `${batchHeader}\n\n${sections.join("\n\n")}`;
}

export function createQueuedCommentsBatchContext(
  comments: readonly QueuedAiComment[],
  diffFiles: readonly DiffFile[] = [],
): AIPromptContext | null {
  const firstComment = comments[0];
  if (firstComment === undefined) {
    return null;
  }

  const firstCommentDiffFile =
    firstComment.source !== "full-file"
      ? (diffFiles.find(
          (diffFile) => diffFile.path === firstComment.filePath,
        ) ?? null)
      : null;
  const firstCommentRange = {
    startLine: firstComment.startLine,
    endLine: firstComment.endLine,
  };
  const primaryFileContent =
    firstComment.source === "diff" && firstCommentDiffFile !== null
      ? (createDiffPromptContext({
          diffFile: firstCommentDiffFile,
          range: firstCommentRange,
        }).primaryFile?.content ?? "")
      : firstComment.source === "current-state" && firstCommentDiffFile !== null
        ? (createCurrentStatePromptContext({
            diffFile: firstCommentDiffFile,
            range: firstCommentRange,
          }).primaryFile?.content ?? "")
        : "";

  return {
    primaryFile: {
      path: firstComment.filePath,
      startLine: firstComment.startLine,
      endLine: firstComment.endLine,
      content: primaryFileContent,
    },
    references: comments.map((comment) => {
      const matchingDiffFile =
        comment.source !== "full-file"
          ? (diffFiles.find((diffFile) => diffFile.path === comment.filePath) ??
            null)
          : null;
      const commentRange = {
        startLine: comment.startLine,
        endLine: comment.endLine,
      };
      const content =
        comment.source === "diff" && matchingDiffFile !== null
          ? [
              `[source:${comment.source} side:${comment.side}]`,
              `Prompt: ${comment.prompt}`,
              createDiffSelectionReferenceContent({
                diffFile: matchingDiffFile,
                range: commentRange,
              }),
            ].join("\n\n")
          : comment.source === "current-state" && matchingDiffFile !== null
            ? [
                `[source:${comment.source} side:${comment.side}]`,
                `Prompt: ${comment.prompt}`,
                "Selected current lines:",
                createNumberedLineText(
                  collectCurrentStateSelectedLines(
                    matchingDiffFile,
                    commentRange,
                  ),
                  "No current-state lines were available for the selected range.",
                ),
              ].join("\n\n")
            : `[source:${comment.source}] ${comment.prompt}`;

      return {
        path: comment.filePath,
        startLine: comment.startLine,
        endLine: comment.endLine,
        content,
      };
    }),
    diffSummary: undefined,
  };
}
