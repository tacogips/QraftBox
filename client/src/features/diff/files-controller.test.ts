import { describe, expect, test } from "bun:test";
import type { FilesApiClient } from "../../../../client-shared/src/api/files";
import { createDiffOverviewState } from "../../../../client-shared/src/contracts/diff";
import { createFilesController } from "./files-controller";

const DIFF_OVERVIEW = createDiffOverviewState(
  [
    {
      path: "src/main.ts",
      status: "modified",
      additions: 3,
      deletions: 1,
      chunks: [],
      isBinary: false,
    },
  ],
  "src/main.ts",
);

describe("createFilesController", () => {
  test("keeps files-screen selection independent from diff-only selection", async () => {
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async () => ({
        tree: {
          name: "",
          path: "",
          isDirectory: true,
          children: [
            {
              name: "src",
              path: "src",
              isDirectory: true,
            },
          ],
        },
        totalFiles: 3,
        changedFiles: 1,
      }),
      fetchDirectoryChildren: async () => [
        {
          name: "extra.ts",
          path: "src/extra.ts",
          isDirectory: false,
        },
      ],
      fetchFileContent: async (contextId, filePath) => ({
        path: filePath,
        content: `content for ${contextId}:${filePath}`,
        language: "typescript",
      }),
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "side-by-side",
    });
    await filesController.setFileTreeMode("ctx-1", "all");
    await filesController.toggleDirectory("ctx-1", "src");
    await filesController.selectPath("ctx-1", "src/extra.ts");

    expect(filesController.getState().selectedPath).toBe("src/extra.ts");
    expect(filesController.getState().fileContent?.path).toBe("src/extra.ts");
  });

  test("loads file content for full-file mode on diff-backed paths", async () => {
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async () => ({
        tree: {
          name: "",
          path: "",
          isDirectory: true,
          children: [],
        },
        totalFiles: 0,
        changedFiles: 0,
      }),
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: "full file body",
        language: "typescript",
      }),
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-2",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "full-file",
    });

    expect(filesController.getState().selectedPath).toBe("src/main.ts");
    expect(filesController.getState().fileContent?.content).toBe(
      "full file body",
    );
  });

  test("does not load file content for diff-backed paths outside full-file mode", async () => {
    let fetchFileContentCalls = 0;
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async () => ({
        tree: {
          name: "",
          path: "",
          isDirectory: true,
          children: [],
        },
        totalFiles: 0,
        changedFiles: 0,
      }),
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (_contextId, filePath) => {
        fetchFileContentCalls += 1;
        return {
          path: filePath,
          content: "diff-backed body",
          language: "typescript",
          mimeType: "text/typescript",
        };
      },
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-diff-preview",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "side-by-side",
    });

    expect(fetchFileContentCalls).toBe(0);
    expect(filesController.getState().selectedPath).toBe("src/main.ts");
    expect(filesController.getState().fileContent).toBeNull();
  });

  test("marks the all-files tree stale and refreshes it on demand", async () => {
    let fetchCount = 0;
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async () => {
        fetchCount += 1;
        return {
          tree: {
            name: "",
            path: "",
            isDirectory: true,
            children: [],
          },
          totalFiles: 0,
          changedFiles: 0,
        };
      },
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: "",
        language: "plaintext",
      }),
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-3",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "side-by-side",
    });
    await filesController.setFileTreeMode("ctx-3", "all");
    filesController.markAllFilesTreeStale();
    await filesController.refreshAllFilesTree("ctx-3");

    expect(fetchCount).toBe(2);
    expect(filesController.getState().isAllFilesTreeStale).toBeFalse();
  });

  test("loads a complete all-files tree on demand for file-name filtering", async () => {
    const shallowRequests: boolean[] = [];
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async (_contextId, shallow) => {
        shallowRequests.push(shallow);
        return {
          tree: {
            name: "",
            path: "",
            isDirectory: true,
            children: [
              shallow
                ? {
                    name: "src",
                    path: "src",
                    isDirectory: true,
                  }
                : {
                    name: "src",
                    path: "src",
                    isDirectory: true,
                    children: [
                      {
                        name: "feature.ts",
                        path: "src/feature.ts",
                        isDirectory: false,
                      },
                    ],
                  },
            ],
          },
          totalFiles: 1,
          changedFiles: 0,
        };
      },
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: filePath,
        language: "typescript",
      }),
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-filter-complete-tree",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "side-by-side",
    });
    await filesController.setFileTreeMode("ctx-filter-complete-tree", "all");
    await filesController.ensureCompleteAllFilesTree(
      "ctx-filter-complete-tree",
    );

    expect(shallowRequests).toEqual([true, false]);
    expect(filesController.getState().isAllFilesTreeComplete).toBeTrue();
    expect(
      filesController.getState().allFilesTree?.children?.[0]?.children?.[0]
        ?.path,
    ).toBe("src/feature.ts");
  });

  test("does not keep diff-only expanded folders when switching to all-files mode", async () => {
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async () => ({
        tree: {
          name: "",
          path: "",
          isDirectory: true,
          children: [
            {
              name: "client",
              path: "client",
              isDirectory: true,
            },
          ],
        },
        totalFiles: 1,
        changedFiles: 1,
      }),
      fetchDirectoryChildren: async (contextId, directoryPath) => [
        {
          name: "src",
          path: `${directoryPath}/src`,
          isDirectory: true,
        },
      ],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: filePath,
        language: "typescript",
      }),
    };
    const filesController = createFilesController({ filesApiClient });
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "client/src/app/route-sync.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
      ],
      "client/src/app/route-sync.ts",
    );

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-all-mode-toggle",
      activeWorkspaceIsGitRepo: true,
      diffOverview,
      preferredViewMode: "side-by-side",
    });

    expect(Array.from(filesController.getState().expandedPaths)).toEqual([
      "client",
      "client/src",
      "client/src/app",
    ]);

    await filesController.setFileTreeMode("ctx-all-mode-toggle", "all");

    expect(Array.from(filesController.getState().expandedPaths)).toEqual([]);

    await filesController.toggleDirectory("ctx-all-mode-toggle", "client");

    expect(Array.from(filesController.getState().expandedPaths)).toEqual([
      "client",
    ]);
    expect(
      filesController.getState().allFilesTree?.children?.[0]?.children?.[0]
        ?.path,
    ).toBe("client/src");
  });

  test("clears stale all-files state immediately when switching contexts", async () => {
    let resolveCtx2TreeLoad: () => void = () => {};
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async (contextId) => {
        if (contextId === "ctx-2") {
          await new Promise<void>((resolve) => {
            resolveCtx2TreeLoad = resolve;
          });
        }

        return {
          tree: {
            name: "",
            path: "",
            isDirectory: true,
            children: [
              {
                name: `${contextId}.ts`,
                path: `${contextId}.ts`,
                isDirectory: false,
              },
            ],
          },
          totalFiles: 1,
          changedFiles: 0,
        };
      },
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: `body for ${filePath}`,
        language: "typescript",
      }),
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "side-by-side",
    });
    await filesController.setFileTreeMode("ctx-1", "all");
    await filesController.selectPath("ctx-1", "ctx-1.ts");

    expect(filesController.getState().allFilesTree?.children?.[0]?.path).toBe(
      "ctx-1.ts",
    );
    expect(filesController.getState().fileContent?.path).toBe("ctx-1.ts");

    const switchContextPromise = filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-2",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "full-file",
    });

    expect(filesController.getState().allFilesTree).toBeNull();
    expect(filesController.getState().fileContent).toBeNull();

    resolveCtx2TreeLoad();
    await switchContextPromise;

    expect(filesController.getState().allFilesTree?.children?.[0]?.path).toBe(
      "ctx-2.ts",
    );
    expect(filesController.getState().fileContent?.path).toBe("src/main.ts");
  });

  test("preserves selected file context when switching from files to ai-session", async () => {
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async () => ({
        tree: {
          name: "",
          path: "",
          isDirectory: true,
          children: [],
        },
        totalFiles: 0,
        changedFiles: 1,
      }),
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: `body for ${filePath}`,
        language: "typescript",
      }),
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-ai",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "full-file",
    });
    await filesController.synchronize({
      screen: "ai-session",
      activeContextId: "ctx-ai",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "full-file",
    });

    expect(filesController.getState().selectedPath).toBe("src/main.ts");
    expect(filesController.getState().fileContent?.path).toBe("src/main.ts");
  });

  test("expands all diff directories when entering the files screen from ai-session", async () => {
    const filesController = createFilesController();
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/nested/main.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
        {
          path: "docs/guides/setup.md",
          status: "added",
          additions: 8,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
      ],
      "src/nested/main.ts",
    );

    await filesController.synchronize({
      screen: "ai-session",
      activeContextId: "ctx-enter-files",
      activeWorkspaceIsGitRepo: true,
      diffOverview,
      preferredViewMode: "side-by-side",
    });
    await filesController.toggleDirectory("ctx-enter-files", "docs");

    expect(Array.from(filesController.getState().expandedPaths).sort()).toEqual(
      ["docs/guides", "src", "src/nested"],
    );

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-enter-files",
      activeWorkspaceIsGitRepo: true,
      diffOverview,
      preferredViewMode: "side-by-side",
    });

    expect(Array.from(filesController.getState().expandedPaths).sort()).toEqual(
      ["docs", "docs/guides", "src", "src/nested"],
    );
  });

  test("auto-expands ancestor directories for the selected diff file", async () => {
    const filesController = createFilesController();

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-4",
      activeWorkspaceIsGitRepo: true,
      diffOverview: createDiffOverviewState(
        [
          {
            path: "src/nested/main.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            chunks: [],
            isBinary: false,
          },
        ],
        "src/nested/main.ts",
      ),
      preferredViewMode: "side-by-side",
    });

    expect(Array.from(filesController.getState().expandedPaths)).toEqual([
      "src",
      "src/nested",
    ]);
  });

  test("expands all diff directories by default on first synchronize", async () => {
    const filesController = createFilesController();

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-expand-all",
      activeWorkspaceIsGitRepo: true,
      diffOverview: createDiffOverviewState(
        [
          {
            path: "src/nested/main.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            chunks: [],
            isBinary: false,
          },
          {
            path: "docs/guides/setup.md",
            status: "added",
            additions: 8,
            deletions: 0,
            chunks: [],
            isBinary: false,
          },
        ],
        "src/nested/main.ts",
      ),
      preferredViewMode: "side-by-side",
    });

    expect(Array.from(filesController.getState().expandedPaths).sort()).toEqual(
      ["docs", "docs/guides", "src", "src/nested"],
    );
  });

  test("preserves manual diff directory collapse across synchronize when selection is unchanged", async () => {
    const filesController = createFilesController();
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/nested/main.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
      ],
      "src/nested/main.ts",
    );

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-collapse-persist",
      activeWorkspaceIsGitRepo: true,
      diffOverview,
      preferredViewMode: "side-by-side",
    });

    await filesController.toggleDirectory("ctx-collapse-persist", "src");
    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-collapse-persist",
      activeWorkspaceIsGitRepo: true,
      diffOverview,
      preferredViewMode: "side-by-side",
    });

    expect(Array.from(filesController.getState().expandedPaths)).toEqual([
      "src/nested",
    ]);
  });

  test("expands every diff directory when expand-all is requested", async () => {
    const filesController = createFilesController();
    const diffOverview = createDiffOverviewState(
      [
        {
          path: "src/nested/main.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
        {
          path: "docs/guides/setup.md",
          status: "added",
          additions: 1,
          deletions: 0,
          chunks: [],
          isBinary: false,
        },
      ],
      "src/nested/main.ts",
    );

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-expand-command",
      activeWorkspaceIsGitRepo: true,
      diffOverview,
      preferredViewMode: "side-by-side",
    });
    await filesController.toggleDirectory("ctx-expand-command", "src");

    filesController.expandAllDirectories();

    expect(Array.from(filesController.getState().expandedPaths).sort()).toEqual(
      ["docs", "docs/guides", "src", "src/nested"],
    );
  });

  test("clears all expanded diff directories when collapse-all is requested", async () => {
    const filesController = createFilesController();

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-collapse-command",
      activeWorkspaceIsGitRepo: true,
      diffOverview: createDiffOverviewState(
        [
          {
            path: "src/nested/main.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            chunks: [],
            isBinary: false,
          },
        ],
        "src/nested/main.ts",
      ),
      preferredViewMode: "side-by-side",
    });

    filesController.collapseAllDirectories();

    expect(Array.from(filesController.getState().expandedPaths)).toEqual([]);
  });

  test("ignores a stale all-files tree response after switching contexts", async () => {
    let resolveCtx1TreeLoad: () => void = () => {};
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async (contextId) => {
        if (contextId === "ctx-1") {
          await new Promise<void>((resolve) => {
            resolveCtx1TreeLoad = resolve;
          });
        }

        return {
          tree: {
            name: "",
            path: "",
            isDirectory: true,
            children: [
              {
                name: `${contextId}.ts`,
                path: `${contextId}.ts`,
                isDirectory: false,
              },
            ],
          },
          totalFiles: 1,
          changedFiles: 0,
        };
      },
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: filePath,
        language: "typescript",
      }),
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "side-by-side",
    });
    const ctx1AllFilesPromise = filesController.setFileTreeMode("ctx-1", "all");

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-2",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "side-by-side",
    });
    await filesController.setFileTreeMode("ctx-2", "all");

    resolveCtx1TreeLoad();
    await ctx1AllFilesPromise;

    expect(filesController.getState().allFilesTree?.children?.[0]?.path).toBe(
      "ctx-2.ts",
    );
  });

  test("ignores a stale file-content response after switching contexts", async () => {
    let resolveCtx1FileContent: () => void = () => {};
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async () => ({
        tree: {
          name: "",
          path: "",
          isDirectory: true,
          children: [],
        },
        totalFiles: 0,
        changedFiles: 0,
      }),
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (contextId, filePath) => {
        if (contextId === "ctx-1") {
          await new Promise<void>((resolve) => {
            resolveCtx1FileContent = resolve;
          });
        }

        return {
          path: filePath,
          content: `${contextId}:${filePath}`,
          language: "typescript",
        };
      },
    };
    const filesController = createFilesController({ filesApiClient });

    const ctx1SynchronizationPromise = filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "full-file",
    });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-2",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "full-file",
    });

    resolveCtx1FileContent();
    await ctx1SynchronizationPromise;

    expect(filesController.getState().fileContent?.content).toBe(
      "ctx-2:src/main.ts",
    );
  });

  test("ignores a stale all-files tree response after filters change", async () => {
    let resolveFirstTreeLoad: () => void = () => {};
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async (_contextId, _expand, options = {}) => {
        if (options.showIgnored === false) {
          await new Promise<void>((resolve) => {
            resolveFirstTreeLoad = resolve;
          });
        }

        return {
          tree: {
            name: "",
            path: "",
            isDirectory: true,
            children: [
              {
                name: options.showIgnored ? "ignored.ts" : "visible.ts",
                path: options.showIgnored ? "ignored.ts" : "visible.ts",
                isDirectory: false,
              },
            ],
          },
          totalFiles: 1,
          changedFiles: 0,
        };
      },
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: filePath,
        language: "typescript",
      }),
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
      diffOverview: DIFF_OVERVIEW,
      preferredViewMode: "side-by-side",
    });
    const firstTreeLoadPromise = filesController.setFileTreeMode(
      "ctx-1",
      "all",
    );

    await filesController.setShowIgnored("ctx-1", true);
    resolveFirstTreeLoad();
    await firstTreeLoadPromise;

    expect(filesController.getState().allFilesTree?.children?.[0]?.path).toBe(
      "ignored.ts",
    );
  });

  test("forces non-git workspaces into all-files mode and keeps the tree usable", async () => {
    let fetchAllFilesTreeCalls = 0;
    const filesApiClient: FilesApiClient = {
      fetchAllFilesTree: async () => {
        fetchAllFilesTreeCalls += 1;
        return {
          tree: {
            name: "",
            path: "",
            isDirectory: true,
            children: [
              {
                name: "notes.txt",
                path: "notes.txt",
                isDirectory: false,
              },
            ],
          },
          totalFiles: 1,
          changedFiles: 0,
        };
      },
      fetchDirectoryChildren: async () => [],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: "plain file",
        language: "text",
      }),
    };
    const filesController = createFilesController({ filesApiClient });

    await filesController.synchronize({
      screen: "files",
      activeContextId: "ctx-non-git",
      activeWorkspaceIsGitRepo: false,
      diffOverview: createDiffOverviewState([], null),
      preferredViewMode: "side-by-side",
    });

    expect(filesController.getState().fileTreeMode).toBe("all");
    expect(filesController.getState().showAllFiles).toBeTrue();
    expect(filesController.getState().allFilesTree?.children?.[0]?.path).toBe(
      "notes.txt",
    );
    expect(fetchAllFilesTreeCalls).toBe(1);

    await filesController.setFileTreeMode("ctx-non-git", "diff");

    expect(filesController.getState().fileTreeMode).toBe("all");
  });
});
