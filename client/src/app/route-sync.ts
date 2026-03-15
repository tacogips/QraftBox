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
  readonly currentRouteSelectedLineNumber: number | null;
}): number | null {
  if (params.currentRouteSelectedLineNumber === null) {
    return null;
  }

  return params.currentRouteSelectedPath !== null
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
      filesTab: undefined,
      searchPattern: undefined,
      searchScope: undefined,
      searchCaseSensitive: undefined,
      searchExcludeFileNames: undefined,
      searchShowIgnored: undefined,
      searchShowAllFiles: undefined,
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
        currentRouteSelectedLineNumber: currentRoute.selectedLineNumber,
      }),
      selectedViewMode: "full-file",
      fileTreeMode: "all",
    };
  }

  const shouldResetGitFilesRouteDefaults =
    currentRoute.selectedPath === null &&
    currentRoute.selectedViewMode === "full-file" &&
    currentRoute.fileTreeMode === "all";

  return {
    ...currentRoute,
    selectedPath: resolveFilesRouteSelectedPath({
      currentRouteSelectedPath: currentRoute.selectedPath,
      filesSelectedPath,
    }),
    selectedLineNumber: resolveFilesRouteSelectedLineNumber({
      currentRouteSelectedPath: currentRoute.selectedPath,
      currentRouteSelectedLineNumber: currentRoute.selectedLineNumber,
    }),
    selectedViewMode: shouldResetGitFilesRouteDefaults
      ? preferredViewMode
      : currentRoute.selectedViewMode !== null &&
          currentRoute.selectedViewMode !== preferredViewMode
        ? currentRoute.selectedViewMode
        : preferredViewMode,
    fileTreeMode: shouldResetGitFilesRouteDefaults
      ? fileTreeMode
      : currentRoute.fileTreeMode !== null &&
          currentRoute.fileTreeMode !== fileTreeMode
        ? currentRoute.fileTreeMode
        : fileTreeMode,
  };
}
