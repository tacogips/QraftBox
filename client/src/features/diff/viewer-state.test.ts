import { describe, expect, test } from "bun:test";
import { createDiffOverviewState } from "../../../../client-shared/src/contracts/diff";
import { createDiffViewerState } from "./viewer-state";

const RENDERABLE_DIFF_FILE = {
  path: "src/main.ts",
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
      changes: [
        {
          type: "context",
          content: "import { app } from './app';",
          oldLine: 1,
          newLine: 1,
        },
        {
          type: "delete",
          content: "const oldValue = 1;",
          oldLine: 2,
        },
        {
          type: "add",
          content: "const nextValue = 2;",
          newLine: 2,
        },
      ],
    },
  ],
} as const;

describe("createDiffViewerState", () => {
  test("builds an inline diff preview for the selected file", () => {
    const viewerState = createDiffViewerState({
      diffOverview: createDiffOverviewState(
        [RENDERABLE_DIFF_FILE],
        "src/main.ts",
        "inline",
      ),
      selectedPath: "src/main.ts",
      fileContent: null,
    });

    expect(viewerState.visibleMode).toBe("inline");
    expect(viewerState.availableModes).toEqual([
      "side-by-side",
      "inline",
      "current-state",
      "full-file",
    ]);
    expect(viewerState.selectedFileSummaryText).toBe(
      "src/main.ts | modified | +2 | -1",
    );
    expect(viewerState.previewLines).toContain("inline @@ -1,2 +1,3 @@");
    expect(viewerState.previewLines).toContain("+2: const nextValue = 2;");
  });

  test("builds a current-state preview from shared contracts", () => {
    const viewerState = createDiffViewerState({
      diffOverview: createDiffOverviewState(
        [RENDERABLE_DIFF_FILE],
        "src/main.ts",
        "current-state",
      ),
      selectedPath: "src/main.ts",
      fileContent: null,
    });

    expect(viewerState.visibleMode).toBe("current-state");
    expect(viewerState.previewLines).toContain("deleted 2-2: 1 line folded");
    expect(viewerState.previewLines).toContain(
      "2: [added] const nextValue = 2;",
    );
  });

  test("omits the synthetic blank line used to anchor end-of-file deletions", () => {
    const viewerState = createDiffViewerState({
      diffOverview: createDiffOverviewState(
        [
          {
            path: "src/main.ts",
            status: "modified",
            additions: 0,
            deletions: 1,
            isBinary: false,
            chunks: [
              {
                header: "@@ -1,2 +1,1 @@",
                oldStart: 1,
                oldLines: 2,
                newStart: 1,
                newLines: 1,
                changes: [
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
                ],
              },
            ],
          },
        ],
        "src/main.ts",
        "current-state",
      ),
      selectedPath: "src/main.ts",
      fileContent: null,
    });

    expect(viewerState.previewLines).toContain("deleted 2-2: 1 line folded");
    expect(viewerState.previewLines).toContain(
      "1: [unchanged] export const value = 1;",
    );
    expect(viewerState.previewLines).not.toContain("2: [unchanged] ");
  });

  test("falls back to a binary-file message when the selected file is binary", () => {
    const viewerState = createDiffViewerState({
      diffOverview: createDiffOverviewState(
        [
          {
            ...RENDERABLE_DIFF_FILE,
            path: "assets/logo.png",
            isBinary: true,
            chunks: [],
          },
        ],
        "assets/logo.png",
      ),
      selectedPath: "assets/logo.png",
      fileContent: null,
    });

    expect(viewerState.visibleMode).toBe("full-file");
    expect(viewerState.availableModes).toEqual(["full-file"]);
    expect(viewerState.previewLines).toEqual([
      "Binary files are not previewed in the migration viewer.",
    ]);
  });

  test("renders a full-file preview when a non-diff file is selected", () => {
    const viewerState = createDiffViewerState({
      diffOverview: createDiffOverviewState(
        [RENDERABLE_DIFF_FILE],
        "src/main.ts",
        "full-file",
      ),
      selectedPath: "src/extra.ts",
      fileContent: {
        path: "src/extra.ts",
        content: "export const value = 1;\nconsole.log(value);",
        language: "typescript",
      },
    });

    expect(viewerState.visibleMode).toBe("full-file");
    expect(viewerState.availableModes).toEqual(["full-file"]);
    expect(viewerState.previewLines).toContain("1: export const value = 1;");
  });

  test("does not render diff lines while full-file content is still loading", () => {
    const viewerState = createDiffViewerState({
      diffOverview: createDiffOverviewState(
        [RENDERABLE_DIFF_FILE],
        "src/main.ts",
        "full-file",
      ),
      selectedPath: "src/main.ts",
      fileContent: null,
    });

    expect(viewerState.visibleMode).toBe("full-file");
    expect(viewerState.previewLines).toEqual([]);
  });
});
