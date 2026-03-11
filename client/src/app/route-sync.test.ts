import { describe, expect, test } from "bun:test";
import type { ScreenRouteState } from "../../../client-shared/src/contracts/navigation";
import { resolveUiSynchronizedRouteState } from "./route-sync";

describe("resolveUiSynchronizedRouteState", () => {
  test("preserves an in-flight route-selected path until the files state catches up", () => {
    const currentRoute: ScreenRouteState = {
      projectSlug: "repo",
      screen: "files",
      contextId: null,
      selectedPath: "client/src/features/ai-session/state.ts",
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: null,
    };

    expect(
      resolveUiSynchronizedRouteState({
        currentRoute,
        filesSelectedPath: "client/src/features/ai-session/state.test.ts",
        preferredViewMode: "side-by-side",
        fileTreeMode: "diff",
        activeWorkspaceIsGitRepo: true,
      }).selectedPath,
    ).toBe("client/src/features/ai-session/state.ts");
  });

  test("uses the files selection once the route and files state match", () => {
    const currentRoute: ScreenRouteState = {
      projectSlug: "repo",
      screen: "files",
      contextId: null,
      selectedPath: "client/src/features/ai-session/state.ts",
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: null,
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
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
    });
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
});
