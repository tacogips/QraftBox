import { describe, expect, test } from "bun:test";
import {
  resolveDefaultFilesSearchState,
  resolveFilesSearchState,
} from "./search-state";

describe("search-state", () => {
  test("defaults to changed-files search from diff tree mode", () => {
    expect(
      resolveDefaultFilesSearchState({
        fileTreeMode: "diff",
        showIgnored: true,
        showAllFiles: true,
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual({
      searchScope: "changed",
      searchCaseSensitive: false,
      searchShowIgnored: false,
      searchShowAllFiles: false,
    });
  });

  test("defaults to all-files search from all tree mode", () => {
    expect(
      resolveDefaultFilesSearchState({
        fileTreeMode: "all",
        showIgnored: true,
        showAllFiles: false,
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual({
      searchScope: "all",
      searchCaseSensitive: false,
      searchShowIgnored: true,
      searchShowAllFiles: false,
    });
  });

  test("forces all-files defaults for non-git workspaces", () => {
    expect(
      resolveDefaultFilesSearchState({
        fileTreeMode: "diff",
        showIgnored: false,
        showAllFiles: false,
        activeWorkspaceIsGitRepo: false,
      }),
    ).toEqual({
      searchScope: "all",
      searchCaseSensitive: false,
      searchShowIgnored: true,
      searchShowAllFiles: true,
    });
  });

  test("prefers explicit route state over derived defaults", () => {
    expect(
      resolveFilesSearchState({
        route: {
          filesTab: "search",
          searchPattern: "TODO",
          searchScope: "all",
          searchCaseSensitive: true,
          searchExcludeFileNames: "Cargo.lock,pnpm-lock.yaml",
          searchShowIgnored: false,
          searchShowAllFiles: true,
        },
        defaults: {
          fileTreeMode: "diff",
          showIgnored: false,
          showAllFiles: false,
          activeWorkspaceIsGitRepo: true,
        },
      }),
    ).toEqual({
      filesTab: "search",
      searchPattern: "TODO",
      searchScope: "all",
      searchCaseSensitive: true,
      searchExcludeFileNames: "Cargo.lock,pnpm-lock.yaml",
      searchShowIgnored: false,
      searchShowAllFiles: true,
    });
  });
});
