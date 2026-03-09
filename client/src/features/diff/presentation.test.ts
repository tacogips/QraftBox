import { describe, expect, test } from "bun:test";
import { createDiffOverviewState } from "../../../../client-shared/src/contracts/diff";
import {
  resolveDiffParityScenario,
  resolveDiffParityFixtures,
} from "../../../../client-shared/src/testing/diff-parity";
import { evaluateParityScenario } from "../../../../client-shared/src/testing/parity";
import { collectDiffScreenText } from "./presentation";

describe("solid diff presentation", () => {
  test("matches the shared populated diff parity scenario", () => {
    const populatedFixtureResponse = resolveDiffParityFixtures(
      "diff-populated-state",
    )[0]?.payload.response;
    const diffOverview = createDiffOverviewState(
      "files" in (populatedFixtureResponse ?? {})
        ? (populatedFixtureResponse.files ?? [])
        : [],
      "src/main.ts",
    );

    const parityResult = evaluateParityScenario(
      resolveDiffParityScenario("diff-populated-state"),
      collectDiffScreenText({
        diffOverview,
        selectedPath: "src/main.ts",
        fileContent: null,
        isLoading: false,
        unsupportedMessage: null,
        errorMessage: null,
      }),
      "solid",
    );

    expect(parityResult.passed).toBe(true);
  });

  test("includes selected-file preview copy for a renderable diff", () => {
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/main.ts",
          status: "modified",
          additions: 2,
          deletions: 1,
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
                  type: "add",
                  content: "const nextValue = 2;",
                  newLine: 2,
                },
              ],
            },
          ],
          isBinary: false,
        },
      ],
      "src/main.ts",
      "inline",
    );

    const collectedText = collectDiffScreenText({
      diffOverview,
      selectedPath: "src/main.ts",
      fileContent: null,
      isLoading: false,
      unsupportedMessage: null,
      errorMessage: null,
    });

    expect(collectedText).toContain("Selected file preview");
    expect(collectedText).toContain("Preview mode: inline");
    expect(collectedText).toContain("src/main.ts | modified | +2 | -1");
    expect(collectedText).toContain("inline @@ -1,2 +1,3 @@");
  });

  test("matches the shared empty diff parity scenario", () => {
    const diffOverview = createDiffOverviewState([], null);

    const parityResult = evaluateParityScenario(
      resolveDiffParityScenario("diff-empty-state"),
      collectDiffScreenText({
        diffOverview,
        selectedPath: null,
        fileContent: null,
        isLoading: false,
        unsupportedMessage: null,
        errorMessage: null,
      }),
      "solid",
    );

    expect(parityResult.passed).toBe(true);
  });

  test("matches the shared loading diff parity scenario", () => {
    const parityResult = evaluateParityScenario(
      resolveDiffParityScenario("diff-loading-state"),
      collectDiffScreenText({
        diffOverview: createDiffOverviewState([], null),
        selectedPath: null,
        fileContent: null,
        isLoading: true,
        unsupportedMessage: null,
        errorMessage: null,
      }),
      "solid",
    );

    expect(parityResult.passed).toBe(true);
  });

  test("matches the shared error diff parity scenario", () => {
    const parityResult = evaluateParityScenario(
      resolveDiffParityScenario("diff-error-state"),
      collectDiffScreenText({
        diffOverview: createDiffOverviewState([], null),
        selectedPath: null,
        fileContent: null,
        isLoading: false,
        unsupportedMessage: null,
        errorMessage: "diff backend offline",
      }),
      "solid",
    );

    expect(parityResult.passed).toBe(true);
  });

  test("matches the shared non-git diff parity scenario", () => {
    const parityResult = evaluateParityScenario(
      resolveDiffParityScenario("diff-non-git-state"),
      collectDiffScreenText({
        diffOverview: createDiffOverviewState([], null),
        selectedPath: null,
        fileContent: null,
        isLoading: false,
        unsupportedMessage: "Diff view is unavailable for non-Git workspaces.",
        errorMessage: null,
      }),
      "solid",
    );

    expect(parityResult.passed).toBe(true);
  });

  test("renders server-provided diff stats instead of recomputing them", () => {
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/main.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          chunks: [],
          isBinary: false,
        },
      ],
      "src/main.ts",
      "side-by-side",
      {
        totalFiles: 7,
        additions: 42,
        deletions: 9,
      },
    );

    expect(
      collectDiffScreenText({
        diffOverview,
        selectedPath: "src/main.ts",
        fileContent: null,
        isLoading: false,
        unsupportedMessage: null,
        errorMessage: null,
      }),
    ).toContain("Changed files: 7 | +42 | -9");
  });

  test("surfaces a binary-file preview message when the selection is not renderable", () => {
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "assets/logo.png",
          status: "modified",
          additions: 0,
          deletions: 0,
          chunks: [],
          isBinary: true,
        },
      ],
      "assets/logo.png",
    );

    expect(
      collectDiffScreenText({
        diffOverview,
        selectedPath: "assets/logo.png",
        fileContent: null,
        isLoading: false,
        unsupportedMessage: null,
        errorMessage: null,
      }),
    ).toContain("Binary files are not previewed in the migration viewer.");
  });

  test("uses the screen-owned selected path for a full-file preview", () => {
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/main.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
      ],
      "src/main.ts",
      "full-file",
    );

    expect(
      collectDiffScreenText({
        diffOverview,
        selectedPath: "src/extra.ts",
        fileContent: {
          path: "src/extra.ts",
          content: "export const extra = true;",
          language: "typescript",
        },
        isLoading: false,
        unsupportedMessage: null,
        errorMessage: null,
      }),
    ).toContain("Selected file: src/extra.ts");
  });
});
