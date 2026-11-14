import type { AppScreen } from "../../../../client-shared/src/contracts/navigation";
import { ownsDiffAndFilesContext } from "./shared-screen-context";

export interface FilesScreenRealtimeRefreshOptions {
  readonly activeScreen: AppScreen;
  readonly activeContextId: string | null;
  readonly targetContextId: string;
  readonly activeWorkspaceIsGitRepo: boolean;
  refreshDiff(targetContextId: string): Promise<void>;
  refreshAllFilesTree(targetContextId: string): Promise<void>;
  refreshSelectedFileContent(targetContextId: string): Promise<void>;
}

export async function refreshFilesScreenFromRealtime(
  options: FilesScreenRealtimeRefreshOptions,
): Promise<void> {
  if (
    !ownsDiffAndFilesContext(options.activeScreen) ||
    options.activeContextId !== options.targetContextId
  ) {
    return;
  }

  const refreshOperations: Promise<void>[] = [
    options.refreshAllFilesTree(options.targetContextId),
    options.refreshSelectedFileContent(options.targetContextId),
  ];

  if (options.activeWorkspaceIsGitRepo) {
    refreshOperations.unshift(options.refreshDiff(options.targetContextId));
  }

  await Promise.all(refreshOperations);
}
