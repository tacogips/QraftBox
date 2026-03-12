import { describe, expect, test } from "bun:test";
import { createDiffOverviewState } from "../../../../client-shared/src/contracts/diff";
import type { FileTreeNode } from "../../../../client-shared/src/contracts/files";
import {
  collectFileContentMetadata,
  collectVisibleFileTreeEntries,
  formatDiffStatusLabel,
  resolveDiffPathNavigation,
  resolveViewModeForFileTreeModeChange,
  resolveViewModeForPathSelection,
} from "./screen-state";

const SAMPLE_FILE_TREE: FileTreeNode = {
  name: "",
  path: "",
  isDirectory: true,
  children: [
    {
      name: "src",
      path: "src",
      isDirectory: true,
      children: [
        {
          name: "main.ts",
          path: "src/main.ts",
          isDirectory: false,
          status: "modified",
        },
        {
          name: "nested",
          path: "src/nested",
          isDirectory: true,
          children: [
            {
              name: "feature.ts",
              path: "src/nested/feature.ts",
              isDirectory: false,
              status: "added",
            },
          ],
        },
      ],
    },
    {
      name: "README.md",
      path: "README.md",
      isDirectory: false,
    },
  ],
};

describe("screen-state", () => {
  test("collects only visible entries from expanded tree branches", () => {
    expect(
      collectVisibleFileTreeEntries(
        SAMPLE_FILE_TREE,
        new Set<string>(["src", "src/nested"]),
      ),
    ).toEqual([
      {
        path: "src",
        name: "src",
        depth: 0,
        isDirectory: true,
        status: undefined,
        isExpanded: true,
        isExpandable: true,
      },
      {
        path: "src/main.ts",
        name: "main.ts",
        depth: 1,
        isDirectory: false,
        status: "modified",
        isExpanded: false,
        isExpandable: false,
      },
      {
        path: "src/nested",
        name: "nested",
        depth: 1,
        isDirectory: true,
        status: undefined,
        isExpanded: true,
        isExpandable: true,
      },
      {
        path: "src/nested/feature.ts",
        name: "feature.ts",
        depth: 2,
        isDirectory: false,
        status: "added",
        isExpanded: false,
        isExpandable: false,
      },
      {
        path: "README.md",
        name: "README.md",
        depth: 0,
        isDirectory: false,
        status: undefined,
        isExpanded: false,
        isExpandable: false,
      },
    ]);
  });

  test("resolves previous and next diff paths around the current selection", () => {
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/zeta.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
        {
          path: "src/nested/beta.ts",
          status: "added",
          additions: 4,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
        {
          path: "src/nested/gamma.ts",
          status: "deleted",
          additions: 0,
          deletions: 3,
          chunks: [],
          isBinary: false,
        },
        {
          path: "README.md",
          status: "modified",
          additions: 1,
          deletions: 1,
          chunks: [],
          isBinary: false,
        },
      ],
      "src/nested/beta.ts",
    );

    expect(
      resolveDiffPathNavigation(diffOverview, "src/nested/beta.ts"),
    ).toEqual({
      previousPath: null,
      nextPath: "src/nested/gamma.ts",
    });

    expect(
      resolveDiffPathNavigation(diffOverview, "src/nested/gamma.ts"),
    ).toEqual({
      previousPath: "src/nested/beta.ts",
      nextPath: "src/zeta.ts",
    });

    expect(resolveDiffPathNavigation(diffOverview, "src/zeta.ts")).toEqual({
      previousPath: "src/nested/gamma.ts",
      nextPath: "README.md",
    });

    expect(resolveDiffPathNavigation(diffOverview, "README.md")).toEqual({
      previousPath: "src/zeta.ts",
      nextPath: null,
    });
  });

  test("offers the first tree-ordered file when the current selection is missing", () => {
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/zeta.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
        {
          path: "src/nested/beta.ts",
          status: "added",
          additions: 4,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
      ],
      null,
    );

    expect(resolveDiffPathNavigation(diffOverview, "missing.ts")).toEqual({
      previousPath: null,
      nextPath: "src/nested/beta.ts",
    });
  });

  test("offers the first changed file as the next target when nothing is selected", () => {
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/alpha.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
      ],
      null,
    );

    expect(resolveDiffPathNavigation(diffOverview, null)).toEqual({
      previousPath: null,
      nextPath: "src/alpha.ts",
    });
  });

  test("collects file metadata for a loaded full-file preview", () => {
    expect(
      collectFileContentMetadata({
        path: "docs/spec.md",
        content: "# Spec",
        language: "markdown",
        lineCount: 12,
        size: 144,
        badge: "preview",
        isPartial: true,
        fullSize: 300,
        mimeType: "text/markdown",
      }),
    ).toEqual([
      "markdown",
      "12 lines",
      "144 bytes",
      "preview",
      "partial preview of 300 bytes",
      "text/markdown",
    ]);
  });

  test("formats hyphenated status labels for display", () => {
    expect(formatDiffStatusLabel("untracked")).toBe("untracked");
    expect(formatDiffStatusLabel("ignored")).toBe("ignored");
    expect(formatDiffStatusLabel(undefined)).toBeNull();
  });

  test("restores a diff-capable viewer mode when returning from all-files full-file browsing", () => {
    expect(
      resolveViewModeForFileTreeModeChange({
        previousFileTreeMode: "all",
        nextFileTreeMode: "diff",
        preferredViewMode: "full-file",
      }),
    ).toBe("side-by-side");

    expect(
      resolveViewModeForFileTreeModeChange({
        previousFileTreeMode: "diff",
        nextFileTreeMode: "all",
        preferredViewMode: "full-file",
      }),
    ).toBe("full-file");
  });

  test("forces full-file mode when selecting a file outside the diff set", () => {
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/alpha.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
      ],
      "src/alpha.ts",
      "side-by-side",
    );

    expect(
      resolveViewModeForPathSelection({
        selectedPath: "docs/readme.md",
        diffOverview,
        preferredViewMode: "side-by-side",
      }),
    ).toBe("full-file");

    expect(
      resolveViewModeForPathSelection({
        selectedPath: "src/alpha.ts",
        diffOverview,
        preferredViewMode: "inline",
      }),
    ).toBe("inline");
  });
});
