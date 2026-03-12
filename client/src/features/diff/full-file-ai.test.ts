import { describe, expect, test } from "bun:test";
import {
  collectFullFileLineRangeNumbers,
  createQueuedCommentLineRangeLabel,
  createQueuedCommentsBatchContext,
  createQueuedCommentsBatchMessage,
  createFullFileCommentPlaceholder,
  createFullFilePromptContext,
  resolveFullFileLineRange,
} from "./full-file-ai";

describe("full-file ai helpers", () => {
  test("creates and extends a contiguous line range", () => {
    const initialRange = resolveFullFileLineRange({
      currentRange: null,
      lineNumber: 12,
      extendRange: false,
    });
    const extendedRange = resolveFullFileLineRange({
      currentRange: initialRange,
      lineNumber: 15,
      extendRange: true,
    });

    expect(initialRange).toEqual({
      startLine: 12,
      endLine: 12,
    });
    expect(extendedRange).toEqual({
      startLine: 12,
      endLine: 15,
    });
    expect(collectFullFileLineRangeNumbers(extendedRange)).toEqual([
      12, 13, 14, 15,
    ]);
  });

  test("formats a placeholder for a multi-line selection", () => {
    expect(
      createFullFileCommentPlaceholder("src/main.ts", {
        startLine: 7,
        endLine: 9,
      }),
    ).toBe("Ask AI about src/main.ts:L7-L9 ...");
  });

  test("creates an AI prompt context from selected full-file lines", () => {
    expect(
      createFullFilePromptContext({
        fileContent: {
          path: "src/main.ts",
          content: "alpha\nbeta\ngamma\ndelta",
          language: "text",
        },
        range: {
          startLine: 2,
          endLine: 3,
        },
      }),
    ).toEqual({
      primaryFile: {
        path: "src/main.ts",
        startLine: 2,
        endLine: 3,
        content: "beta\ngamma",
      },
      references: [],
      diffSummary: undefined,
    });
  });

  test("formats queued comment line ranges", () => {
    expect(
      createQueuedCommentLineRangeLabel({
        startLine: 8,
        endLine: 8,
      }),
    ).toBe("L8");
    expect(
      createQueuedCommentLineRangeLabel({
        startLine: 8,
        endLine: 10,
      }),
    ).toBe("L8-L10");
  });

  test("builds a consolidated batch message for queued comments", () => {
    expect(
      createQueuedCommentsBatchMessage([
        {
          id: "comment-1",
          projectPath: "/tmp/repo",
          filePath: "src/main.ts",
          startLine: 2,
          endLine: 4,
          side: "new",
          source: "full-file",
          prompt: "Summarize this section.",
          createdAt: 1,
        },
        {
          id: "comment-2",
          projectPath: "/tmp/repo",
          filePath: "src/other.ts",
          startLine: 9,
          endLine: 9,
          side: "new",
          source: "diff",
          prompt: "Review the changed line.",
          createdAt: 2,
        },
      ]),
    ).toBe(
      "Please process the following queued file comments in one batch. For items marked [DIFF], answer in terms of old-vs-new changes and review intent.\n\n1. [FULL_FILE] src/main.ts:L2-L4\nSummarize this section.\n\n2. [DIFF] src/other.ts:L9\nReview the changed line.",
    );
  });

  test("builds consolidated AI context for queued comments", () => {
    expect(
      createQueuedCommentsBatchContext([
        {
          id: "comment-1",
          projectPath: "/tmp/repo",
          filePath: "src/main.ts",
          startLine: 2,
          endLine: 4,
          side: "new",
          source: "full-file",
          prompt: "Summarize this section.",
          createdAt: 1,
        },
        {
          id: "comment-2",
          projectPath: "/tmp/repo",
          filePath: "src/other.ts",
          startLine: 9,
          endLine: 9,
          side: "new",
          source: "diff",
          prompt: "Review the changed line.",
          createdAt: 2,
        },
      ]),
    ).toEqual({
      primaryFile: {
        path: "src/main.ts",
        startLine: 2,
        endLine: 4,
        content: "",
      },
      references: [
        {
          path: "src/main.ts",
          startLine: 2,
          endLine: 4,
          content: "[source:full-file] Summarize this section.",
        },
        {
          path: "src/other.ts",
          startLine: 9,
          endLine: 9,
          content: "[source:diff] Review the changed line.",
        },
      ],
      diffSummary: undefined,
    });
  });
});
