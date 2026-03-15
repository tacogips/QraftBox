import type { FileTreeMode } from "../../../../client-shared/src/contracts/files";
import type {
  FilesSearchScope,
  FilesTab,
  ScreenRouteState,
} from "../../../../client-shared/src/contracts/navigation";

export interface FilesSearchDefaultsInput {
  readonly fileTreeMode: FileTreeMode;
  readonly showIgnored: boolean;
  readonly showAllFiles: boolean;
  readonly activeWorkspaceIsGitRepo: boolean;
}

export interface FilesSearchState {
  readonly filesTab: FilesTab;
  readonly searchPattern: string;
  readonly searchScope: FilesSearchScope;
  readonly searchCaseSensitive: boolean;
  readonly searchExcludeFileNames: string;
  readonly searchShowIgnored: boolean;
  readonly searchShowAllFiles: boolean;
}

export function resolveDefaultFilesSearchState(
  options: FilesSearchDefaultsInput,
): Omit<
  FilesSearchState,
  "filesTab" | "searchPattern" | "searchExcludeFileNames"
> {
  if (!options.activeWorkspaceIsGitRepo) {
    return {
      searchScope: "all",
      searchCaseSensitive: false,
      searchShowIgnored: true,
      searchShowAllFiles: true,
    };
  }

  if (options.fileTreeMode === "all") {
    return {
      searchScope: "all",
      searchCaseSensitive: false,
      searchShowIgnored: options.showIgnored,
      searchShowAllFiles: options.showAllFiles,
    };
  }

  return {
    searchScope: "changed",
    searchCaseSensitive: false,
    searchShowIgnored: false,
    searchShowAllFiles: false,
  };
}

export function resolveFilesSearchState(params: {
  readonly route: Pick<
    ScreenRouteState,
    | "filesTab"
    | "searchPattern"
    | "searchScope"
    | "searchCaseSensitive"
    | "searchExcludeFileNames"
    | "searchShowIgnored"
    | "searchShowAllFiles"
  >;
  readonly defaults: FilesSearchDefaultsInput;
}): FilesSearchState {
  const defaultState = resolveDefaultFilesSearchState(params.defaults);

  return {
    filesTab: params.route.filesTab ?? "file",
    searchPattern: params.route.searchPattern ?? "",
    searchScope: params.route.searchScope ?? defaultState.searchScope,
    searchCaseSensitive:
      params.route.searchCaseSensitive ?? defaultState.searchCaseSensitive,
    searchExcludeFileNames: params.route.searchExcludeFileNames ?? "",
    searchShowIgnored:
      params.route.searchShowIgnored ?? defaultState.searchShowIgnored,
    searchShowAllFiles:
      params.route.searchShowAllFiles ?? defaultState.searchShowAllFiles,
  };
}
