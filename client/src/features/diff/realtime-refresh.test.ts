import { describe, expect, mock, test } from "bun:test";
import { refreshFilesScreenFromRealtime } from "./realtime-refresh";

describe("refreshFilesScreenFromRealtime", () => {
  test("refreshes diff, tree, and selected file for git-backed files screens", async () => {
    const refreshDiff = mock(async () => {});
    const refreshAllFilesTree = mock(async () => {});
    const refreshSelectedFileContent = mock(async () => {});

    await refreshFilesScreenFromRealtime({
      activeScreen: "files",
      activeContextId: "ctx-1",
      targetContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
      refreshDiff,
      refreshAllFilesTree,
      refreshSelectedFileContent,
    });

    expect(refreshDiff).toHaveBeenCalledWith("ctx-1");
    expect(refreshAllFilesTree).toHaveBeenCalledWith("ctx-1");
    expect(refreshSelectedFileContent).toHaveBeenCalledWith("ctx-1");
  });

  test("refreshes tree and selected file without diff for non-git files screens", async () => {
    const refreshDiff = mock(async () => {});
    const refreshAllFilesTree = mock(async () => {});
    const refreshSelectedFileContent = mock(async () => {});

    await refreshFilesScreenFromRealtime({
      activeScreen: "files",
      activeContextId: "ctx-1",
      targetContextId: "ctx-1",
      activeWorkspaceIsGitRepo: false,
      refreshDiff,
      refreshAllFilesTree,
      refreshSelectedFileContent,
    });

    expect(refreshDiff).not.toHaveBeenCalled();
    expect(refreshAllFilesTree).toHaveBeenCalledWith("ctx-1");
    expect(refreshSelectedFileContent).toHaveBeenCalledWith("ctx-1");
  });

  test("refreshes the shared file context while ai-session is active", async () => {
    const refreshDiff = mock(async () => {});
    const refreshAllFilesTree = mock(async () => {});
    const refreshSelectedFileContent = mock(async () => {});

    await refreshFilesScreenFromRealtime({
      activeScreen: "ai-session",
      activeContextId: "ctx-1",
      targetContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
      refreshDiff,
      refreshAllFilesTree,
      refreshSelectedFileContent,
    });

    expect(refreshDiff).toHaveBeenCalledWith("ctx-1");
    expect(refreshAllFilesTree).toHaveBeenCalledWith("ctx-1");
    expect(refreshSelectedFileContent).toHaveBeenCalledWith("ctx-1");
  });

  test("ignores inactive files screens and stale contexts", async () => {
    const refreshDiff = mock(async () => {});
    const refreshAllFilesTree = mock(async () => {});
    const refreshSelectedFileContent = mock(async () => {});

    await refreshFilesScreenFromRealtime({
      activeScreen: "project",
      activeContextId: "ctx-1",
      targetContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
      refreshDiff,
      refreshAllFilesTree,
      refreshSelectedFileContent,
    });
    await refreshFilesScreenFromRealtime({
      activeScreen: "files",
      activeContextId: "ctx-2",
      targetContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
      refreshDiff,
      refreshAllFilesTree,
      refreshSelectedFileContent,
    });

    expect(refreshDiff).not.toHaveBeenCalled();
    expect(refreshAllFilesTree).not.toHaveBeenCalled();
    expect(refreshSelectedFileContent).not.toHaveBeenCalled();
  });
});
