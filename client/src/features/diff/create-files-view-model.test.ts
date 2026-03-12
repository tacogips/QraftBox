import { describe, expect, test } from "bun:test";
import { createRenderEffect, createRoot } from "solid-js";
import type { FilesApiClient } from "../../../../client-shared/src/api/files";
import { createDiffOverviewState } from "../../../../client-shared/src/contracts/diff";
import { createFilesViewModel } from "./create-files-view-model";

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
  "full-file",
);

describe("createFilesViewModel", () => {
  test("does not notify fileContent subscribers when only directory expansion changes", async () => {
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
        totalFiles: 1,
        changedFiles: 1,
      }),
      fetchDirectoryChildren: async () => [
        {
          name: "nested",
          path: "src/nested",
          isDirectory: true,
        },
      ],
      fetchFileContent: async (_contextId, filePath) => ({
        path: filePath,
        content: "export const value = 1;",
        language: "typescript",
      }),
    };

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            const filesViewModel = createFilesViewModel({ filesApiClient });
            let fileContentNotificationCount = 0;

            createRenderEffect(() => {
              filesViewModel.fileContent();
              fileContentNotificationCount += 1;
            });

            await filesViewModel.synchronize({
              screen: "files",
              activeContextId: "ctx-reactivity",
              activeWorkspaceIsGitRepo: true,
              diffOverview: DIFF_OVERVIEW,
              preferredViewMode: "full-file",
            });

            await Promise.resolve();
            const notificationCountAfterInitialLoad =
              fileContentNotificationCount;

            await filesViewModel.setFileTreeMode("ctx-reactivity", "all");
            await Promise.resolve();
            const notificationCountAfterModeChange = fileContentNotificationCount;

            await filesViewModel.toggleDirectory("ctx-reactivity", "src");
            await Promise.resolve();

            expect(notificationCountAfterInitialLoad).toBeGreaterThan(0);
            expect(notificationCountAfterModeChange).toBe(
              notificationCountAfterInitialLoad,
            );
            expect(fileContentNotificationCount).toBe(
              notificationCountAfterModeChange,
            );

            dispose();
            resolve();
          } catch (error) {
            dispose();
            reject(error);
          }
        })();
      });
    });
  });
});
