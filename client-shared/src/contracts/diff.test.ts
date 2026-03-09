import { describe, expect, test } from "bun:test";
import {
  createDiffOverviewState,
  normalizeDiffResponse,
  type DiffFile,
} from "./diff";

const SAMPLE_DIFF_FILES: readonly DiffFile[] = [
  {
    path: "src/app.ts",
    status: "modified",
    additions: 7,
    deletions: 2,
    chunks: [],
    isBinary: false,
  },
  {
    path: "README.md",
    status: "added",
    additions: 3,
    deletions: 0,
    chunks: [],
    isBinary: false,
  },
] as const;

describe("diff contracts", () => {
  test("normalizes diff responses and falls back to computed stats", () => {
    expect(
      normalizeDiffResponse({
        files: SAMPLE_DIFF_FILES,
      }),
    ).toEqual({
      files: SAMPLE_DIFF_FILES,
      stats: {
        totalFiles: 2,
        additions: 10,
        deletions: 2,
      },
    });
  });

  test("prefers the requested selection when it exists", () => {
    const diffOverview = createDiffOverviewState(
      SAMPLE_DIFF_FILES,
      "README.md",
      "inline",
    );

    expect(diffOverview.selectedPath).toBe("README.md");
    expect(diffOverview.selectedFile?.path).toBe("README.md");
    expect(diffOverview.preferredViewMode).toBe("inline");
  });

  test("falls back to the first file when the requested path is missing", () => {
    const diffOverview = createDiffOverviewState(
      SAMPLE_DIFF_FILES,
      "missing.txt",
    );

    expect(diffOverview.selectedPath).toBe("src/app.ts");
    expect(diffOverview.selectedFile?.path).toBe("src/app.ts");
    expect(diffOverview.stats.totalFiles).toBe(2);
  });

  test("handles an empty diff result", () => {
    const diffOverview = createDiffOverviewState([], null);

    expect(diffOverview.selectedPath).toBeNull();
    expect(diffOverview.selectedFile).toBeNull();
    expect(diffOverview.isEmpty).toBe(true);
  });

  test("preserves server-provided diff stats in overview state", () => {
    const diffOverview = createDiffOverviewState(
      SAMPLE_DIFF_FILES,
      "src/app.ts",
      "side-by-side",
      {
        totalFiles: 99,
        additions: 123,
        deletions: 45,
      },
    );

    expect(diffOverview.stats).toEqual({
      totalFiles: 99,
      additions: 123,
      deletions: 45,
    });
  });
});
