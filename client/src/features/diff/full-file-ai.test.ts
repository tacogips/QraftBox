import { describe, expect, test } from "bun:test";
import {
  collectFullFileLineRangeNumbers,
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
});
