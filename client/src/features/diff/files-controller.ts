import {
  createFilesApiClient,
  type FilesApiClient,
} from "../../../../client-shared/src/api/files";
import type {
  FileContent,
  FileTreeMode,
  FileTreeNode,
} from "../../../../client-shared/src/contracts/files";
import {
  buildDiffFileTree,
  collectAncestorDirectoryPaths,
  insertChildrenIntoFileTree,
} from "../../../../client-shared/src/contracts/files";
import type {
  DiffOverviewState,
  DiffViewMode,
} from "../../../../client-shared/src/contracts/diff";
import { ownsDiffAndFilesContext } from "./shared-screen-context";

export interface FilesControllerState {
  readonly fileTreeMode: FileTreeMode;
  readonly selectedPath: string | null;
  readonly allFilesTree: FileTreeNode | null;
  readonly expandedPaths: ReadonlySet<string>;
  readonly isAllFilesLoading: boolean;
  readonly isFileContentLoading: boolean;
  readonly showIgnored: boolean;
  readonly showAllFiles: boolean;
  readonly fileContent: FileContent | null;
  readonly fileContentError: string | null;
  readonly allFilesError: string | null;
  readonly isAllFilesTreeStale: boolean;
}

export interface FilesSynchronizationOptions {
  readonly screen: string;
  readonly activeContextId: string | null;
  readonly activeWorkspaceIsGitRepo: boolean;
  readonly diffOverview: DiffOverviewState;
  readonly preferredViewMode: DiffViewMode;
}

export interface CreateFilesControllerOptions {
  readonly apiBaseUrl?: string | undefined;
  readonly filesApiClient?: FilesApiClient | undefined;
  readonly onStateChange?: ((state: FilesControllerState) => void) | undefined;
}

export interface FilesController {
  getState(): FilesControllerState;
  synchronize(options: FilesSynchronizationOptions): Promise<void>;
  selectPath(activeContextId: string | null, path: string): Promise<void>;
  setFileTreeMode(
    activeContextId: string | null,
    mode: FileTreeMode,
  ): Promise<void>;
  toggleDirectory(
    activeContextId: string | null,
    directoryPath: string,
  ): Promise<void>;
  setShowIgnored(activeContextId: string | null, value: boolean): Promise<void>;
  setShowAllFiles(
    activeContextId: string | null,
    value: boolean,
  ): Promise<void>;
  markAllFilesTreeStale(): void;
  refreshAllFilesTree(activeContextId: string | null): Promise<void>;
  refreshSelectedFileContent(activeContextId: string | null): Promise<void>;
}

function toErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

function serializeFileTree(tree: FileTreeNode | null): string {
  return JSON.stringify(tree);
}

function serializeFileContent(fileContent: FileContent | null): string {
  return JSON.stringify(fileContent);
}

export function createInitialFilesControllerState(): FilesControllerState {
  return {
    fileTreeMode: "diff",
    selectedPath: null,
    allFilesTree: null,
    expandedPaths: new Set<string>(),
    isAllFilesLoading: false,
    isFileContentLoading: false,
    showIgnored: false,
    showAllFiles: false,
    fileContent: null,
    fileContentError: null,
    allFilesError: null,
    isAllFilesTreeStale: false,
  };
}

function expandDirectoriesForSelection(
  expandedPaths: ReadonlySet<string>,
  selectedPath: string | null,
): ReadonlySet<string> {
  if (selectedPath === null) {
    return expandedPaths;
  }

  const nextExpandedPaths = new Set(expandedPaths);
  for (const directoryPath of collectAncestorDirectoryPaths(selectedPath)) {
    nextExpandedPaths.add(directoryPath);
  }
  return nextExpandedPaths;
}

function shouldLoadFileContent(
  selectedPath: string | null,
  _diffOverview: DiffOverviewState,
  _preferredViewMode: DiffViewMode,
): boolean {
  return selectedPath !== null;
}

export function createFilesController(
  options: CreateFilesControllerOptions = {},
): FilesController {
  const filesApiClient =
    options.filesApiClient ??
    createFilesApiClient({
      apiBaseUrl: options.apiBaseUrl,
    });
  const notifyStateChange = options.onStateChange ?? (() => {});
  let state = createInitialFilesControllerState();
  let lastSynchronizationOptions: FilesSynchronizationOptions | null = null;
  let loadedAllFilesContextId: string | null = null;
  let selectedPathContextId: string | null = null;
  let visibleContextId: string | null = null;
  let visibleWorkspaceIsGitRepo = true;
  let lastAllFilesTreeRequestId = 0;
  let lastDirectoryChildrenRequestId = 0;
  let lastFileContentRequestId = 0;
  let rememberedSelectedPaths: Readonly<Record<string, string>> = {};

  function setState(nextState: FilesControllerState): void {
    state = nextState;
    notifyStateChange(state);
  }

  function updateState(
    updater: (currentState: FilesControllerState) => FilesControllerState,
  ): void {
    setState(updater(state));
  }

  function rememberSelectedPath(
    activeContextId: string | null,
    selectedPath: string,
  ): void {
    if (activeContextId === null) {
      return;
    }

    rememberedSelectedPaths = {
      ...rememberedSelectedPaths,
      [activeContextId]: selectedPath,
    };
  }

  function resolveSelectedPath(
    activeContextId: string | null,
    diffOverview: DiffOverviewState,
    currentSelectedPath: string | null,
  ): string | null {
    if (
      currentSelectedPath !== null &&
      selectedPathContextId === activeContextId &&
      (state.fileTreeMode === "all" ||
        diffOverview.files.some(
          (diffFile) => diffFile.path === currentSelectedPath,
        ))
    ) {
      return currentSelectedPath;
    }

    const rememberedPath =
      activeContextId !== null
        ? rememberedSelectedPaths[activeContextId]
        : undefined;
    if (
      rememberedPath !== undefined &&
      (state.fileTreeMode === "all" ||
        diffOverview.files.some((diffFile) => diffFile.path === rememberedPath))
    ) {
      return rememberedPath;
    }

    return diffOverview.selectedPath;
  }

  async function ensureAllFilesTree(
    activeContextId: string,
    forceReload = false,
  ): Promise<void> {
    const isBackgroundRefresh =
      state.allFilesTree !== null &&
      loadedAllFilesContextId === activeContextId;
    if (!forceReload) {
      const canReuseLoadedTree =
        state.allFilesTree !== null &&
        loadedAllFilesContextId === activeContextId &&
        state.isAllFilesTreeStale === false;
      if (canReuseLoadedTree) {
        return;
      }
    }

    const requestId = lastAllFilesTreeRequestId + 1;
    lastAllFilesTreeRequestId = requestId;
    const requestedShowIgnored = state.showIgnored;
    const requestedShowAllFiles = state.showAllFiles;

    if (!isBackgroundRefresh || state.allFilesError !== null) {
      updateState((currentState) => ({
        ...currentState,
        isAllFilesLoading: !isBackgroundRefresh,
        allFilesError: null,
      }));
    }

    try {
      const allFilesResponse = await filesApiClient.fetchAllFilesTree(
        activeContextId,
        true,
        {
          showIgnored: requestedShowIgnored,
          showAllFiles: requestedShowAllFiles,
        },
      );
      if (
        requestId !== lastAllFilesTreeRequestId ||
        visibleContextId !== activeContextId ||
        requestedShowIgnored !== state.showIgnored ||
        requestedShowAllFiles !== state.showAllFiles
      ) {
        return;
      }

      loadedAllFilesContextId = activeContextId;
      if (
        serializeFileTree(state.allFilesTree) !==
          serializeFileTree(allFilesResponse.tree) ||
        state.isAllFilesLoading ||
        state.isAllFilesTreeStale ||
        state.allFilesError !== null
      ) {
        updateState((currentState) => ({
          ...currentState,
          allFilesTree: allFilesResponse.tree,
          isAllFilesLoading: false,
          isAllFilesTreeStale: false,
          allFilesError: null,
        }));
      }
    } catch (error) {
      if (
        requestId !== lastAllFilesTreeRequestId ||
        visibleContextId !== activeContextId
      ) {
        return;
      }

      updateState((currentState) => ({
        ...currentState,
        isAllFilesLoading: false,
        allFilesError: toErrorMessage(error, "Failed to load file tree"),
      }));
    }
  }

  async function ensureFileContent(): Promise<void> {
    const synchronizationOptions = lastSynchronizationOptions;
    const selectedPath = state.selectedPath;
    if (
      synchronizationOptions === null ||
      synchronizationOptions.activeContextId === null ||
      !shouldLoadFileContent(
        selectedPath,
        synchronizationOptions.diffOverview,
        synchronizationOptions.preferredViewMode,
      ) ||
      selectedPath === null
    ) {
      updateState((currentState) => ({
        ...currentState,
        fileContent: null,
        fileContentError: null,
        isFileContentLoading: false,
      }));
      return;
    }

    const requestId = lastFileContentRequestId + 1;
    lastFileContentRequestId = requestId;
    const requestedContextId = synchronizationOptions.activeContextId;
    const requestedPath = selectedPath;
    const isBackgroundRefresh =
      state.fileContent !== null && state.fileContent.path === requestedPath;

    if (!isBackgroundRefresh || state.fileContentError !== null) {
      updateState((currentState) => ({
        ...currentState,
        isFileContentLoading: !isBackgroundRefresh,
        fileContentError: null,
      }));
    }

    try {
      const fileContent = await filesApiClient.fetchFileContent(
        requestedContextId,
        requestedPath,
      );
      if (
        requestId !== lastFileContentRequestId ||
        lastSynchronizationOptions?.activeContextId !== requestedContextId ||
        state.selectedPath !== requestedPath
      ) {
        return;
      }

      if (
        serializeFileContent(state.fileContent) !==
          serializeFileContent(fileContent) ||
        state.isFileContentLoading ||
        state.fileContentError !== null
      ) {
        updateState((currentState) => ({
          ...currentState,
          fileContent,
          isFileContentLoading: false,
          fileContentError: null,
        }));
      }
    } catch (error) {
      if (
        requestId !== lastFileContentRequestId ||
        lastSynchronizationOptions?.activeContextId !== requestedContextId ||
        state.selectedPath !== requestedPath
      ) {
        return;
      }

      updateState((currentState) => ({
        ...currentState,
        fileContent: null,
        fileContentError: toErrorMessage(error, "Failed to load file content"),
        isFileContentLoading: false,
      }));
    }
  }

  return {
    getState(): FilesControllerState {
      return state;
    },
    async synchronize(synchronizationOptions): Promise<void> {
      lastSynchronizationOptions = synchronizationOptions;

      if (
        !ownsDiffAndFilesContext(synchronizationOptions.screen) ||
        synchronizationOptions.activeContextId === null
      ) {
        visibleContextId = null;
        loadedAllFilesContextId = null;
        selectedPathContextId = null;
        lastAllFilesTreeRequestId += 1;
        lastDirectoryChildrenRequestId += 1;
        lastFileContentRequestId += 1;
        setState(createInitialFilesControllerState());
        return;
      }

      const activeContextId = synchronizationOptions.activeContextId;
      const contextChanged = visibleContextId !== activeContextId;
      visibleContextId = activeContextId;
      visibleWorkspaceIsGitRepo =
        synchronizationOptions.activeWorkspaceIsGitRepo;

      if (contextChanged) {
        loadedAllFilesContextId = null;
        selectedPathContextId = null;
        lastAllFilesTreeRequestId += 1;
        lastDirectoryChildrenRequestId += 1;
        lastFileContentRequestId += 1;
        updateState((currentState) => ({
          ...currentState,
          allFilesTree: null,
          allFilesError: null,
          fileContent: null,
          fileContentError: null,
          isAllFilesLoading: currentState.fileTreeMode === "all",
          isFileContentLoading: false,
        }));
      }

      if (!synchronizationOptions.activeWorkspaceIsGitRepo) {
        updateState((currentState) => ({
          ...currentState,
          fileTreeMode: "all",
          showAllFiles: true,
        }));
      }

      const nextSelectedPath = resolveSelectedPath(
        activeContextId,
        synchronizationOptions.diffOverview,
        state.selectedPath,
      );
      const nextExpandedPaths =
        state.fileTreeMode === "diff"
          ? expandDirectoriesForSelection(state.expandedPaths, nextSelectedPath)
          : state.expandedPaths;
      if (
        state.selectedPath !== nextSelectedPath ||
        serializeFileTree({
          name: "",
          path: "",
          isDirectory: true,
          children: Array.from(nextExpandedPaths).map((path) => ({
            name: path,
            path,
            isDirectory: true,
          })),
        } as FileTreeNode) !==
          serializeFileTree({
            name: "",
            path: "",
            isDirectory: true,
            children: Array.from(state.expandedPaths).map((path) => ({
              name: path,
              path,
              isDirectory: true,
            })),
          } as FileTreeNode)
      ) {
        updateState((currentState) => ({
          ...currentState,
          selectedPath: nextSelectedPath,
          expandedPaths: nextExpandedPaths,
        }));
      }
      selectedPathContextId =
        nextSelectedPath !== null ? activeContextId : null;

      if (state.fileTreeMode === "all") {
        await ensureAllFilesTree(activeContextId);
      }

      await ensureFileContent();
    },
    async selectPath(activeContextId, path): Promise<void> {
      rememberSelectedPath(activeContextId, path);
      selectedPathContextId = activeContextId;
      updateState((currentState) => ({
        ...currentState,
        selectedPath: path,
        expandedPaths:
          currentState.fileTreeMode === "diff"
            ? expandDirectoriesForSelection(currentState.expandedPaths, path)
            : currentState.expandedPaths,
      }));
      await ensureFileContent();
    },
    async setFileTreeMode(activeContextId, mode): Promise<void> {
      const nextMode = !visibleWorkspaceIsGitRepo ? "all" : mode;
      const fallbackSelectedPath =
        nextMode === "diff"
          ? (lastSynchronizationOptions?.diffOverview.selectedPath ?? null)
          : state.selectedPath;
      updateState((currentState) => ({
        ...currentState,
        fileTreeMode: nextMode,
        selectedPath: fallbackSelectedPath,
        expandedPaths:
          nextMode === "diff"
            ? expandDirectoriesForSelection(
                currentState.expandedPaths,
                fallbackSelectedPath,
              )
            : currentState.expandedPaths,
      }));
      selectedPathContextId =
        fallbackSelectedPath !== null ? activeContextId : null;
      if (nextMode === "all" && activeContextId !== null) {
        await ensureAllFilesTree(activeContextId);
      }
      await ensureFileContent();
    },
    async toggleDirectory(activeContextId, directoryPath): Promise<void> {
      const alreadyExpanded = state.expandedPaths.has(directoryPath);
      if (alreadyExpanded) {
        const nextExpandedPaths = new Set(state.expandedPaths);
        nextExpandedPaths.delete(directoryPath);
        updateState((currentState) => ({
          ...currentState,
          expandedPaths: nextExpandedPaths,
        }));
        return;
      }

      const nextExpandedPaths = new Set(state.expandedPaths);
      nextExpandedPaths.add(directoryPath);
      updateState((currentState) => ({
        ...currentState,
        expandedPaths: nextExpandedPaths,
      }));

      if (
        activeContextId === null ||
        state.fileTreeMode !== "all" ||
        state.allFilesTree === null
      ) {
        return;
      }

      const requestId = lastDirectoryChildrenRequestId + 1;
      lastDirectoryChildrenRequestId = requestId;
      const requestedShowIgnored = state.showIgnored;
      const requestedShowAllFiles = state.showAllFiles;

      try {
        const childNodes = await filesApiClient.fetchDirectoryChildren(
          activeContextId,
          directoryPath,
          {
            showIgnored: requestedShowIgnored,
            showAllFiles: requestedShowAllFiles,
          },
        );
        if (
          requestId !== lastDirectoryChildrenRequestId ||
          visibleContextId !== activeContextId ||
          requestedShowIgnored !== state.showIgnored ||
          requestedShowAllFiles !== state.showAllFiles
        ) {
          return;
        }

        updateState((currentState) => ({
          ...currentState,
          allFilesTree:
            currentState.allFilesTree === null
              ? currentState.allFilesTree
              : insertChildrenIntoFileTree(
                  currentState.allFilesTree,
                  directoryPath,
                  childNodes,
                ),
        }));
      } catch (error) {
        if (
          requestId !== lastDirectoryChildrenRequestId ||
          visibleContextId !== activeContextId
        ) {
          return;
        }

        updateState((currentState) => ({
          ...currentState,
          allFilesError: toErrorMessage(error, "Failed to load directory"),
        }));
      }
    },
    async setShowIgnored(activeContextId, value): Promise<void> {
      updateState((currentState) => ({
        ...currentState,
        showIgnored: value,
        allFilesTree: null,
        isAllFilesTreeStale: true,
      }));
      if (state.fileTreeMode === "all" && activeContextId !== null) {
        await ensureAllFilesTree(activeContextId, true);
      }
    },
    async setShowAllFiles(activeContextId, value): Promise<void> {
      updateState((currentState) => ({
        ...currentState,
        showAllFiles: value,
        allFilesTree: null,
        isAllFilesTreeStale: true,
      }));
      if (state.fileTreeMode === "all" && activeContextId !== null) {
        await ensureAllFilesTree(activeContextId, true);
      }
    },
    markAllFilesTreeStale(): void {
      updateState((currentState) => ({
        ...currentState,
        isAllFilesTreeStale: true,
      }));
    },
    async refreshAllFilesTree(activeContextId): Promise<void> {
      if (activeContextId === null || state.fileTreeMode !== "all") {
        return;
      }

      await ensureAllFilesTree(activeContextId, true);
    },
    async refreshSelectedFileContent(activeContextId): Promise<void> {
      if (
        activeContextId !== null &&
        lastSynchronizationOptions?.activeContextId !== activeContextId
      ) {
        return;
      }

      await ensureFileContent();
    },
  };
}

export function createDiffTree(
  diffOverview: DiffOverviewState,
): FileTreeNode | null {
  if (diffOverview.files.length === 0) {
    return null;
  }

  return buildDiffFileTree(diffOverview.files);
}
