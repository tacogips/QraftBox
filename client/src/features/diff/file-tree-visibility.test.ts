import { describe, expect, test } from "bun:test";
import {
  shouldShowAllFilesFilters,
  shouldShowDiffDirectoryControls,
  shouldShowFileTreeModeControls,
} from "./file-tree-visibility";

describe("file tree visibility", () => {
  test("hides git-only controls for non-git workspaces", () => {
    expect(shouldShowFileTreeModeControls(false)).toBeFalse();
    expect(
      shouldShowAllFilesFilters({
        supportsDiff: false,
        isFileTreeCollapsed: false,
        fileTreeMode: "all",
      }),
    ).toBeFalse();
    expect(
      shouldShowDiffDirectoryControls({
        supportsDiff: false,
        isFileTreeCollapsed: false,
        fileTreeMode: "diff",
      }),
    ).toBeFalse();
  });

  test("shows the matching controls for git workspaces", () => {
    expect(shouldShowFileTreeModeControls(true)).toBeTrue();
    expect(
      shouldShowAllFilesFilters({
        supportsDiff: true,
        isFileTreeCollapsed: false,
        fileTreeMode: "all",
      }),
    ).toBeTrue();
    expect(
      shouldShowDiffDirectoryControls({
        supportsDiff: true,
        isFileTreeCollapsed: false,
        fileTreeMode: "diff",
      }),
    ).toBeTrue();
  });
});
