import { describe, expect, test } from "bun:test";
import type { BranchesApiClient } from "../../../../client-shared/src/api/branches";
import type { DiffApiClient } from "../../../../client-shared/src/api/diff";
import type {
  DiffFile,
  DiffStats,
} from "../../../../client-shared/src/contracts/diff";
import { createDiffController } from "./diff-controller";

function createDeferredPromise<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve(value: T): void {
      resolvePromise(value);
    },
    reject(reason: unknown): void {
      rejectPromise(reason);
    },
  };
}

function createDiffFile(path: string): DiffFile {
  return {
    path,
    status: "modified",
    additions: 3,
    deletions: 1,
    chunks: [],
    isBinary: false,
  };
}

describe("createDiffController", () => {
  test("preserves loaded diff state when switching from files to ai-session", async () => {
    const diffApiClient: DiffApiClient = {
      fetchContextDiff: async () => ({
        files: [createDiffFile("src/app.ts")],
        stats: {
          totalFiles: 4,
          additions: 11,
          deletions: 5,
        },
      }),
    };
    const diffController = createDiffController({ diffApiClient });

    await diffController.synchronize({
      screen: "files",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
    });
    await diffController.synchronize({
      screen: "ai-session",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
    });

    expect(diffController.getState().diffOverview.files).toEqual([
      createDiffFile("src/app.ts"),
    ]);
    expect(diffController.getState().diffOverview.selectedPath).toBe(
      "src/app.ts",
    );
  });

  test("clears loaded diff state when the shared files context becomes inactive", async () => {
    const diffApiClient: DiffApiClient = {
      fetchContextDiff: async () => ({
        files: [createDiffFile("src/app.ts")],
        stats: {
          totalFiles: 4,
          additions: 11,
          deletions: 5,
        },
      }),
    };
    const diffController = createDiffController({ diffApiClient });

    await diffController.synchronize({
      screen: "files",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
    });

    expect(diffController.getState().diffOverview.selectedPath).toBe(
      "src/app.ts",
    );

    await diffController.synchronize({
      screen: "project",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
    });

    expect(diffController.getState().diffOverview.files).toEqual([]);
    expect(diffController.getState().diffOverview.selectedPath).toBeNull();
    expect(diffController.getState().errorMessage).toBeNull();
    expect(diffController.getState().unsupportedMessage).toBeNull();
    expect(diffController.getState().isLoading).toBeFalse();
  });

  test("ignores stale in-flight responses after leaving the shared files context", async () => {
    const deferredDiffResponse = createDeferredPromise<{
      readonly files: readonly DiffFile[];
      readonly stats: DiffStats;
    }>();
    const diffApiClient: DiffApiClient = {
      fetchContextDiff: () => deferredDiffResponse.promise,
    };
    const diffController = createDiffController({ diffApiClient });

    const inFlightLoad = diffController.synchronize({
      screen: "files",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
    });

    await diffController.synchronize({
      screen: "project",
      activeContextId: "ctx-1",
      activeWorkspaceIsGitRepo: true,
    });

    deferredDiffResponse.resolve({
      files: [createDiffFile("src/late.ts")],
      stats: {
        totalFiles: 1,
        additions: 3,
        deletions: 1,
      },
    });
    await inFlightLoad;

    expect(diffController.getState().diffOverview.files).toEqual([]);
    expect(diffController.getState().diffOverview.selectedPath).toBeNull();
    expect(diffController.getState().isLoading).toBeFalse();
  });

  test("preserves server-provided stats after selecting another file", async () => {
    const diffApiClient: DiffApiClient = {
      fetchContextDiff: async () => ({
        files: [createDiffFile("src/a.ts"), createDiffFile("src/b.ts")],
        stats: {
          totalFiles: 10,
          additions: 120,
          deletions: 44,
        },
      }),
    };
    const diffController = createDiffController({ diffApiClient });

    await diffController.synchronize({
      screen: "files",
      activeContextId: "ctx-2",
      activeWorkspaceIsGitRepo: true,
    });
    diffController.selectPath("ctx-2", "src/b.ts");

    expect(diffController.getState().diffOverview.selectedPath).toBe(
      "src/b.ts",
    );
    expect(diffController.getState().diffOverview.stats).toEqual({
      totalFiles: 10,
      additions: 120,
      deletions: 44,
    });
  });

  test("preserves the preferred diff view mode across reloads and resets", async () => {
    const diffApiClient: DiffApiClient = {
      fetchContextDiff: async () => ({
        files: [createDiffFile("src/a.ts")],
        stats: {
          totalFiles: 1,
          additions: 3,
          deletions: 1,
        },
      }),
    };
    const diffController = createDiffController({ diffApiClient });

    diffController.setPreferredViewMode("current-state");
    await diffController.synchronize({
      screen: "files",
      activeContextId: "ctx-3",
      activeWorkspaceIsGitRepo: true,
    });

    expect(diffController.getState().diffOverview.preferredViewMode).toBe(
      "current-state",
    );

    await diffController.synchronize({
      screen: "project",
      activeContextId: "ctx-3",
      activeWorkspaceIsGitRepo: true,
    });

    expect(diffController.getState().diffOverview.preferredViewMode).toBe(
      "current-state",
    );
  });

  test("defaults the diff base branch to the repository default branch", async () => {
    const diffRequests: Array<{
      readonly contextId: string;
      readonly base?: string | undefined;
    }> = [];
    const diffApiClient: DiffApiClient = {
      fetchContextDiff: async (contextId, options) => {
        diffRequests.push({
          contextId,
          base: options?.base,
        });
        return {
          files: [createDiffFile("src/main.ts")],
          stats: {
            totalFiles: 1,
            additions: 3,
            deletions: 1,
          },
        };
      },
    };
    const branchesApiClient: BranchesApiClient = {
      listBranches: async () => ({
        branches: [],
        current: "feature/current",
        defaultBranch: "main",
        total: 0,
        offset: 0,
        limit: 1,
      }),
      checkoutBranch: async () => ({
        success: true,
        previousBranch: "main",
        currentBranch: "feature/current",
      }),
    };
    const diffController = createDiffController({
      diffApiClient,
      branchesApiClient,
    });

    await diffController.synchronize({
      screen: "files",
      activeContextId: "ctx-base",
      activeWorkspaceIsGitRepo: true,
    });

    expect(diffRequests).toEqual([
      {
        contextId: "ctx-base",
        base: "main",
      },
    ]);
    expect(diffController.getState().selectedBaseBranch).toBe("main");
    expect(diffController.getState().defaultBaseBranch).toBe("main");
  });

  test("reloads the diff when the selected base branch changes", async () => {
    const diffRequests: Array<{
      readonly contextId: string;
      readonly base?: string | undefined;
    }> = [];
    const diffApiClient: DiffApiClient = {
      fetchContextDiff: async (contextId, options) => {
        diffRequests.push({
          contextId,
          base: options?.base,
        });
        return {
          files: [
            createDiffFile(
              options?.base === undefined
                ? "src/working-tree.ts"
                : `src/${options.base.replaceAll("/", "-")}.ts`,
            ),
          ],
          stats: {
            totalFiles: 1,
            additions: 3,
            deletions: 1,
          },
        };
      },
    };
    const branchesApiClient: BranchesApiClient = {
      listBranches: async () => ({
        branches: [],
        current: "feature/current",
        defaultBranch: "main",
        total: 0,
        offset: 0,
        limit: 1,
      }),
      checkoutBranch: async () => ({
        success: true,
        previousBranch: "main",
        currentBranch: "feature/current",
      }),
    };
    const diffController = createDiffController({
      diffApiClient,
      branchesApiClient,
    });

    await diffController.synchronize({
      screen: "files",
      activeContextId: "ctx-switch",
      activeWorkspaceIsGitRepo: true,
    });
    await diffController.setBaseBranch("ctx-switch", "release/1.0");

    expect(diffRequests).toEqual([
      {
        contextId: "ctx-switch",
        base: "main",
      },
      {
        contextId: "ctx-switch",
        base: "release/1.0",
      },
    ]);
    expect(diffController.getState().selectedBaseBranch).toBe("release/1.0");
    expect(diffController.getState().diffOverview.selectedPath).toBe(
      "src/release-1.0.ts",
    );
  });

  test("clears stale base-branch state immediately when switching contexts", async () => {
    const deferredSecondContextBranches = createDeferredPromise<{
      readonly branches: readonly [];
      readonly current: string;
      readonly defaultBranch: string;
      readonly total: number;
      readonly offset: number;
      readonly limit: number;
    }>();
    const diffApiClient: DiffApiClient = {
      fetchContextDiff: async (_contextId, options) => ({
        files: [
          createDiffFile(
            options?.base === undefined ? "src/working-tree.ts" : "src/base.ts",
          ),
        ],
        stats: {
          totalFiles: 1,
          additions: 3,
          deletions: 1,
        },
      }),
    };
    const branchesApiClient: BranchesApiClient = {
      listBranches: async (contextId) => {
        if (contextId === "ctx-first") {
          return {
            branches: [],
            current: "feature/current",
            defaultBranch: "main",
            total: 0,
            offset: 0,
            limit: 1,
          };
        }

        return deferredSecondContextBranches.promise;
      },
      checkoutBranch: async () => ({
        success: true,
        previousBranch: "main",
        currentBranch: "feature/current",
      }),
    };
    const diffController = createDiffController({
      diffApiClient,
      branchesApiClient,
    });

    await diffController.synchronize({
      screen: "files",
      activeContextId: "ctx-first",
      activeWorkspaceIsGitRepo: true,
    });
    expect(diffController.getState().selectedBaseBranch).toBe("main");

    const secondContextLoad = diffController.synchronize({
      screen: "files",
      activeContextId: "ctx-second",
      activeWorkspaceIsGitRepo: true,
    });

    expect(diffController.getState().selectedBaseBranch).toBeNull();
    expect(diffController.getState().defaultBaseBranch).toBeNull();

    deferredSecondContextBranches.resolve({
      branches: [],
      current: "feature/second",
      defaultBranch: "develop",
      total: 0,
      offset: 0,
      limit: 1,
    });
    await secondContextLoad;

    expect(diffController.getState().selectedBaseBranch).toBe("develop");
    expect(diffController.getState().defaultBaseBranch).toBe("develop");
  });
});
