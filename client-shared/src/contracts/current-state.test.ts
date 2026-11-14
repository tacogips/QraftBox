import { describe, expect, test } from "bun:test";
import type { DiffFile } from "./diff";
import { transformToCurrentState } from "./current-state";

function createDiffFile(
  changes: DiffFile["chunks"][number]["changes"],
): DiffFile {
  return {
    path: "src/example.ts",
    status: "modified",
    additions: 2,
    deletions: 1,
    isBinary: false,
    chunks: [
      {
        header: "@@ -1,2 +1,3 @@",
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 3,
        changes,
      },
    ],
  };
}

describe("current state contracts", () => {
  test("attaches deleted blocks to the next visible line", () => {
    const diffFile = createDiffFile([
      {
        type: "delete",
        content: "const oldValue = 1;",
        oldLine: 1,
      },
      {
        type: "add",
        content: "const nextValue = 2;",
        newLine: 1,
      },
    ]);

    expect(transformToCurrentState(diffFile)).toEqual([
      {
        lineNumber: 1,
        content: "const nextValue = 2;",
        changeType: "added",
        deletedBefore: {
          id: "deleted-1-1",
          lines: ["const oldValue = 1;"],
          originalStart: 1,
          originalEnd: 1,
        },
      },
    ]);
  });

  test("creates a synthetic trailing line for end-of-file deletions", () => {
    const diffFile = createDiffFile([
      {
        type: "context",
        content: "export const value = 1;",
        oldLine: 1,
        newLine: 1,
      },
      {
        type: "delete",
        content: "console.log(value);",
        oldLine: 2,
      },
    ]);

    expect(transformToCurrentState(diffFile)).toEqual([
      {
        lineNumber: 1,
        content: "export const value = 1;",
        changeType: "unchanged",
        deletedBefore: undefined,
      },
      {
        lineNumber: 2,
        content: "",
        changeType: "unchanged",
        deletedBefore: {
          id: "deleted-2-2",
          lines: ["console.log(value);"],
          originalStart: 2,
          originalEnd: 2,
        },
      },
    ]);
  });

  test("returns an empty current-state result for empty diff chunks", () => {
    const diffFile = createDiffFile([]);

    expect(transformToCurrentState(diffFile)).toEqual([]);
  });
});
