import type { AIPromptContext } from "../../../../src/types/ai";
import type { FileContent } from "../../../../client-shared/src/contracts/files";
import type { QueuedAiComment } from "../../../../client-shared/src/api/ai-comments";

export interface FullFileLineRange {
  readonly startLine: number;
  readonly endLine: number;
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

export function createQueuedCommentLineRangeLabel(comment: Pick<
  QueuedAiComment,
  "startLine" | "endLine"
>): string {
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
): AIPromptContext | null {
  const firstComment = comments[0];
  if (firstComment === undefined) {
    return null;
  }

  return {
    primaryFile: {
      path: firstComment.filePath,
      startLine: firstComment.startLine,
      endLine: firstComment.endLine,
      content: "",
    },
    references: comments.map((comment) => ({
      path: comment.filePath,
      startLine: comment.startLine,
      endLine: comment.endLine,
      content: `[source:${comment.source}] ${comment.prompt}`,
    })),
    diffSummary: undefined,
  };
}
