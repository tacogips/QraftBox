import type { AIPromptContext } from "../../../../src/types/ai";
import type { FileContent } from "../../../../client-shared/src/contracts/files";

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
