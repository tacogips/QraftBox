import { describe, expect, test } from "bun:test";
import type { ScreenRouteState } from "../../../client-shared/src/contracts/navigation";
import { resolveUiSynchronizedRouteState } from "./route-sync";

describe("resolveUiSynchronizedRouteState", () => {
  test("preserves an in-flight route-selected path and line until the files state catches up", () => {
    const currentRoute: ScreenRouteState = {
      projectSlug: "repo",
      screen: "files",
      contextId: null,
      selectedPath: "client/src/features/ai-session/state.ts",
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: 14,
    };

    expect(
      resolveUiSynchronizedRouteState({
        currentRoute,
        filesSelectedPath: "client/src/features/ai-session/state.test.ts",
        preferredViewMode: "side-by-side",
        fileTreeMode: "diff",
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual(currentRoute);
  });

  test("uses the files selection once the route and files state match", () => {
    const currentRoute: ScreenRouteState = {
      projectSlug: "repo",
      screen: "files",
      contextId: null,
      selectedPath: "client/src/features/ai-session/state.ts",
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: 14,
    };

    expect(
      resolveUiSynchronizedRouteState({
        currentRoute,
        filesSelectedPath: "client/src/features/ai-session/state.ts",
        preferredViewMode: "full-file",
        fileTreeMode: "all",
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual({
      ...currentRoute,
      selectedPath: "client/src/features/ai-session/state.ts",
      selectedLineNumber: 14,
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
    });
  });

  test("preserves the line anchor while the route-selected file is still pending", () => {
    const currentRoute: ScreenRouteState = {
      projectSlug: "repo",
      screen: "files",
      contextId: null,
      selectedPath: "client/src/features/ai-session/state.ts",
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: 14,
    };

    expect(
      resolveUiSynchronizedRouteState({
        currentRoute,
        filesSelectedPath: null,
        preferredViewMode: "side-by-side",
        fileTreeMode: "diff",
        activeWorkspaceIsGitRepo: true,
      }).selectedLineNumber,
    ).toBe(14);
  });

  test("drops the line anchor when no route-selected file remains", () => {
    const currentRoute: ScreenRouteState = {
      projectSlug: "repo",
      screen: "files",
      contextId: null,
      selectedPath: null,
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: 14,
    };

    expect(
      resolveUiSynchronizedRouteState({
        currentRoute,
        filesSelectedPath: "client/src/features/ai-session/state.ts",
        preferredViewMode: "side-by-side",
        fileTreeMode: "diff",
        activeWorkspaceIsGitRepo: true,
      }).selectedLineNumber,
    ).toBeNull();
  });

  test("clears file-specific selection state outside the files screen", () => {
    const currentRoute: ScreenRouteState = {
      projectSlug: "repo",
      screen: "ai-session",
      contextId: null,
      selectedPath: "client/src/features/ai-session/state.ts",
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: 14,
      filesTab: "search",
      searchPattern: "TODO",
      searchScope: "all",
      searchCaseSensitive: true,
      searchExcludeFileNames: "Cargo.lock",
      searchShowIgnored: true,
      searchShowAllFiles: true,
    };

    expect(
      resolveUiSynchronizedRouteState({
        currentRoute,
        filesSelectedPath: "client/src/features/ai-session/state.ts",
        preferredViewMode: "side-by-side",
        fileTreeMode: "diff",
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual({
      ...currentRoute,
      selectedPath: null,
      selectedViewMode: null,
      fileTreeMode: null,
      selectedLineNumber: null,
      filesTab: undefined,
      searchPattern: undefined,
      searchScope: undefined,
      searchCaseSensitive: undefined,
      searchExcludeFileNames: undefined,
      searchShowIgnored: undefined,
      searchShowAllFiles: undefined,
    });
  });

  test("forces non-git files routes into full-file all-files mode", () => {
    const currentRoute: ScreenRouteState = {
      projectSlug: "repo",
      screen: "files",
      contextId: null,
      selectedPath: "notes.txt",
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: null,
    };

    expect(
      resolveUiSynchronizedRouteState({
        currentRoute,
        filesSelectedPath: "notes.txt",
        preferredViewMode: "side-by-side",
        fileTreeMode: "all",
        activeWorkspaceIsGitRepo: false,
      }),
    ).toEqual({
      ...currentRoute,
      selectedViewMode: "full-file",
      fileTreeMode: "all",
    });
  });

  test("restores git defaults for a pathless full-file all-files route", () => {
    const currentRoute: ScreenRouteState = {
      projectSlug: "repo",
      screen: "files",
      contextId: null,
      selectedPath: null,
      selectedViewMode: "full-file",
      fileTreeMode: "all",
      selectedLineNumber: null,
    };

    expect(
      resolveUiSynchronizedRouteState({
        currentRoute,
        filesSelectedPath: null,
        preferredViewMode: "side-by-side",
        fileTreeMode: "diff",
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual({
      ...currentRoute,
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
    });
  });
});
