import { describe, expect, test } from "bun:test";
import type { DiffFile } from "../../../../client-shared/src/contracts/diff";
import {
  collectFullFileLineRangeNumbers,
  createCurrentStatePromptContext,
  createDiffPromptContext,
  createQueuedCommentLineRangeLabel,
  createQueuedCommentsBatchContext,
  createQueuedCommentsBatchMessage,
  createFullFileCommentPlaceholder,
  createFullFilePromptContext,
  resolveFullFileLineRange,
} from "./full-file-ai";

const TEST_DIFF_FILE: DiffFile = {
  path: "src/main.ts",
  status: "modified",
  additions: 2,
  deletions: 1,
  isBinary: false,
  chunks: [
    {
      header: "@@ -2,3 +2,4 @@",
      oldStart: 2,
      oldLines: 3,
      newStart: 2,
      newLines: 4,
      changes: [
        {
          type: "context",
          oldLine: 2,
          newLine: 2,
          content: "beta",
        },
        {
          type: "delete",
          oldLine: 3,
          content: "gamma",
        },
        {
          type: "add",
          newLine: 3,
          content: "GAMMA",
        },
        {
          type: "context",
          oldLine: 4,
          newLine: 4,
          content: "delta",
        },
        {
          type: "add",
          newLine: 5,
          content: "epsilon",
        },
      ],
    },
  ],
};

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

  test("creates current-state prompt context from the selected range", () => {
    expect(
      createCurrentStatePromptContext({
        diffFile: TEST_DIFF_FILE,
        range: {
          startLine: 3,
          endLine: 5,
        },
      }),
    ).toEqual({
      primaryFile: {
        path: "src/main.ts",
        startLine: 3,
        endLine: 5,
        content: "GAMMA\ndelta\nepsilon",
      },
      references: [],
      diffSummary: undefined,
    });
  });

  test("creates diff prompt context with before and after patch details", () => {
    const promptContext = createDiffPromptContext({
      diffFile: TEST_DIFF_FILE,
      range: {
        startLine: 3,
        endLine: 5,
      },
    });

    expect(promptContext.primaryFile).toEqual({
      path: "src/main.ts",
      startLine: 3,
      endLine: 5,
      content: "GAMMA\ndelta\nepsilon",
    });
    expect(promptContext.references).toHaveLength(1);
    expect(promptContext.references[0]).toMatchObject({
      path: "src/main.ts",
      startLine: 3,
      endLine: 5,
    });
    expect(promptContext.references[0]?.content).toContain(
      "Selected after lines (src/main.ts):",
    );
    expect(promptContext.references[0]?.content).toContain(
      "Before patch (src/main.ts):",
    );
    expect(promptContext.references[0]?.content).toContain(
      "After patch (src/main.ts):",
    );
    expect(promptContext.references[0]?.content).toContain("@@ -2,3 +2,4 @@");
    expect(promptContext.references[0]?.content).toContain("-L3: gamma");
    expect(promptContext.references[0]?.content).toContain("+L3: GAMMA");
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

  test("enriches diff queued comments with patch context when diff data is available", () => {
    const batchContext = createQueuedCommentsBatchContext(
      [
        {
          id: "comment-1",
          projectPath: "/tmp/repo",
          filePath: "src/main.ts",
          startLine: 3,
          endLine: 5,
          side: "new",
          source: "diff",
          prompt: "Review this range.",
          createdAt: 1,
        },
      ],
      [TEST_DIFF_FILE],
    );

    expect(batchContext).toEqual({
      primaryFile: {
        path: "src/main.ts",
        startLine: 3,
        endLine: 5,
        content: "GAMMA\ndelta\nepsilon",
      },
      references: [
        expect.objectContaining({
          path: "src/main.ts",
          startLine: 3,
          endLine: 5,
        }),
      ],
      diffSummary: undefined,
    });
    expect(batchContext?.references[0]?.content).toContain(
      "Prompt: Review this range.",
    );
    expect(batchContext?.references[0]?.content).toContain(
      "Before patch (src/main.ts):",
    );
    expect(batchContext?.references[0]?.content).toContain(
      "After patch (src/main.ts):",
    );
    expect(batchContext?.references[0]?.content).toContain("Patch excerpt:");
  });
});
