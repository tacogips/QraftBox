import type { DiffViewMode } from "../../../client-shared/src/contracts/diff";
import type { FileTreeMode } from "../../../client-shared/src/contracts/files";
import type { ScreenRouteState } from "../../../client-shared/src/contracts/navigation";

export function resolveUiSynchronizedRouteState(options: {
  readonly currentRoute: ScreenRouteState;
  readonly filesSelectedPath: string | null;
  readonly preferredViewMode: DiffViewMode;
  readonly fileTreeMode: FileTreeMode;
  readonly activeWorkspaceIsGitRepo: boolean;
}): ScreenRouteState {
  const {
    currentRoute,
    filesSelectedPath,
    preferredViewMode,
    fileTreeMode,
    activeWorkspaceIsGitRepo,
  } = options;

  if (currentRoute.screen !== "files") {
    return {
      ...currentRoute,
      selectedPath: null,
      selectedViewMode: null,
      fileTreeMode: null,
      selectedLineNumber: null,
    };
  }

  if (!activeWorkspaceIsGitRepo) {
    return {
      ...currentRoute,
      selectedPath:
        currentRoute.selectedPath !== null &&
        currentRoute.selectedPath !== filesSelectedPath
          ? currentRoute.selectedPath
          : (filesSelectedPath ?? currentRoute.selectedPath),
      selectedViewMode: "full-file",
      fileTreeMode: "all",
    };
  }

  return {
    ...currentRoute,
    selectedPath:
      currentRoute.selectedPath !== null &&
      currentRoute.selectedPath !== filesSelectedPath
        ? currentRoute.selectedPath
        : (filesSelectedPath ?? currentRoute.selectedPath),
    selectedViewMode:
      currentRoute.selectedViewMode !== null &&
      currentRoute.selectedViewMode !== preferredViewMode
        ? currentRoute.selectedViewMode
        : preferredViewMode,
    fileTreeMode:
      currentRoute.fileTreeMode !== null &&
      currentRoute.fileTreeMode !== fileTreeMode
        ? currentRoute.fileTreeMode
        : fileTreeMode,
  };
}
