import type { DiffViewMode } from "../../../client-shared/src/contracts/diff";
import type { FileTreeMode } from "../../../client-shared/src/contracts/files";
import type { ScreenRouteState } from "../../../client-shared/src/contracts/navigation";

function resolveFilesRouteSelectedPath(params: {
  readonly currentRouteSelectedPath: string | null;
  readonly filesSelectedPath: string | null;
}): string | null {
  return params.currentRouteSelectedPath !== null &&
    params.currentRouteSelectedPath !== params.filesSelectedPath
    ? params.currentRouteSelectedPath
    : (params.filesSelectedPath ?? params.currentRouteSelectedPath);
}

function resolveFilesRouteSelectedLineNumber(params: {
  readonly currentRouteSelectedPath: string | null;
  readonly filesSelectedPath: string | null;
  readonly currentRouteSelectedLineNumber: number | null;
}): number | null {
  return params.currentRouteSelectedPath !== null &&
    params.currentRouteSelectedPath === params.filesSelectedPath
    ? params.currentRouteSelectedLineNumber
    : null;
}

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
      selectedPath: resolveFilesRouteSelectedPath({
        currentRouteSelectedPath: currentRoute.selectedPath,
        filesSelectedPath,
      }),
      selectedLineNumber: resolveFilesRouteSelectedLineNumber({
        currentRouteSelectedPath: currentRoute.selectedPath,
        filesSelectedPath,
        currentRouteSelectedLineNumber: currentRoute.selectedLineNumber,
      }),
      selectedViewMode: "full-file",
      fileTreeMode: "all",
    };
  }

  return {
    ...currentRoute,
    selectedPath: resolveFilesRouteSelectedPath({
      currentRouteSelectedPath: currentRoute.selectedPath,
      filesSelectedPath,
    }),
    selectedLineNumber: resolveFilesRouteSelectedLineNumber({
      currentRouteSelectedPath: currentRoute.selectedPath,
      filesSelectedPath,
      currentRouteSelectedLineNumber: currentRoute.selectedLineNumber,
    }),
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
