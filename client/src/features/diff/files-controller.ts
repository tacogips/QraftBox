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
  readonly isAllFilesTreeComplete: boolean;
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
  expandAllDirectories(): void;
  collapseAllDirectories(): void;
  setShowIgnored(activeContextId: string | null, value: boolean): Promise<void>;
  setShowAllFiles(
    activeContextId: string | null,
    value: boolean,
  ): Promise<void>;
  markAllFilesTreeStale(): void;
  refreshAllFilesTree(activeContextId: string | null): Promise<void>;
  ensureCompleteAllFilesTree(activeContextId: string | null): Promise<void>;
  refreshSelectedFileContent(activeContextId: string | null): Promise<void>;
}

function toErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

export function createInitialFilesControllerState(): FilesControllerState {
  return {
    fileTreeMode: "diff",
    selectedPath: null,
    allFilesTree: null,
    isAllFilesTreeComplete: false,
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

function collectDiffDirectoryPaths(
  diffOverview: DiffOverviewState,
): ReadonlySet<string> {
  const expandedPaths = new Set<string>();

  for (const diffFile of diffOverview.files) {
    for (const directoryPath of collectAncestorDirectoryPaths(diffFile.path)) {
      expandedPaths.add(directoryPath);
    }
  }

  return expandedPaths;
}

function collectDirectoryPathsFromTree(
  fileTree: FileTreeNode | null,
): ReadonlySet<string> {
  if (fileTree === null) {
    return new Set<string>();
  }

  const directoryPaths = new Set<string>();

  function visitTreeNode(fileTreeNode: FileTreeNode): void {
    if (!fileTreeNode.isDirectory) {
      return;
    }

    if (fileTreeNode.path.length > 0) {
      directoryPaths.add(fileTreeNode.path);
    }

    for (const childNode of fileTreeNode.children ?? []) {
      visitTreeNode(childNode);
    }
  }

  visitTreeNode(fileTree);
  return directoryPaths;
}

function arePathSetsEqual(
  leftPaths: ReadonlySet<string>,
  rightPaths: ReadonlySet<string>,
): boolean {
  if (leftPaths.size !== rightPaths.size) {
    return false;
  }

  for (const leftPath of leftPaths) {
    if (!rightPaths.has(leftPath)) {
      return false;
    }
  }

  return true;
}

function shouldLoadFileContent(
  selectedPath: string | null,
  diffOverview: DiffOverviewState,
  preferredViewMode: DiffViewMode,
): boolean {
  if (selectedPath === null) {
    return false;
  }

  if (preferredViewMode === "full-file") {
    return true;
  }

  return !diffOverview.files.some((diffFile) => diffFile.path === selectedPath);
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

  function collectExpandedPathsForCurrentMode(): ReadonlySet<string> {
    if (state.fileTreeMode === "diff") {
      return lastSynchronizationOptions === null
        ? new Set<string>()
        : collectDiffDirectoryPaths(lastSynchronizationOptions.diffOverview);
    }

    return collectDirectoryPathsFromTree(state.allFilesTree);
  }

  async function ensureAllFilesTree(
    activeContextId: string,
    options: {
      readonly forceReload?: boolean | undefined;
      readonly shallow?: boolean | undefined;
    } = {},
  ): Promise<void> {
    const shouldForceReload = options.forceReload ?? false;
    const shouldLoadShallowTree = options.shallow ?? true;
    const isBackgroundRefresh =
      state.allFilesTree !== null &&
      loadedAllFilesContextId === activeContextId;
    if (!shouldForceReload) {
      const canReuseLoadedTree =
        state.allFilesTree !== null &&
        loadedAllFilesContextId === activeContextId &&
        state.isAllFilesTreeStale === false &&
        (shouldLoadShallowTree || state.isAllFilesTreeComplete);
      if (canReuseLoadedTree) {
        return;
      }
    }

    const requestId = lastAllFilesTreeRequestId + 1;
    lastAllFilesTreeRequestId = requestId;
    const requestedShowIgnored = state.showIgnored;
    const requestedShowAllFiles = state.showAllFiles;

    if (
      !isBackgroundRefresh ||
      state.allFilesError !== null ||
      !shouldLoadShallowTree
    ) {
      updateState((currentState) => ({
        ...currentState,
        isAllFilesLoading: true,
        allFilesError: null,
      }));
    }

    try {
      const allFilesResponse = await filesApiClient.fetchAllFilesTree(
        activeContextId,
        shouldLoadShallowTree,
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
      updateState((currentState) => ({
        ...currentState,
        allFilesTree: allFilesResponse.tree,
        isAllFilesTreeComplete: !shouldLoadShallowTree,
        isAllFilesLoading: false,
        isAllFilesTreeStale: false,
        allFilesError: null,
      }));
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

      updateState((currentState) => ({
        ...currentState,
        fileContent,
        isFileContentLoading: false,
        fileContentError: null,
      }));
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
      const previousSynchronizationOptions = lastSynchronizationOptions;
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
      const enteringFilesScreen =
        previousSynchronizationOptions?.screen !== "files" &&
        synchronizationOptions.screen === "files";
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
          isAllFilesTreeComplete: false,
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
          ? contextChanged
            ? collectDiffDirectoryPaths(synchronizationOptions.diffOverview)
            : enteringFilesScreen
              ? collectDiffDirectoryPaths(synchronizationOptions.diffOverview)
              : state.selectedPath !== nextSelectedPath
                ? expandDirectoriesForSelection(
                    state.expandedPaths,
                    nextSelectedPath,
                  )
                : state.expandedPaths
          : state.expandedPaths;
      if (
        state.selectedPath !== nextSelectedPath ||
        !arePathSetsEqual(nextExpandedPaths, state.expandedPaths)
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
      const nextExpandedPaths =
        nextMode === "diff"
          ? lastSynchronizationOptions !== null
            ? collectDiffDirectoryPaths(lastSynchronizationOptions.diffOverview)
            : state.expandedPaths
          : collectDirectoryPathsFromTree(state.allFilesTree);
      updateState((currentState) => ({
        ...currentState,
        fileTreeMode: nextMode,
        selectedPath: fallbackSelectedPath,
        expandedPaths:
          nextMode === "diff"
            ? expandDirectoriesForSelection(
                nextExpandedPaths,
                fallbackSelectedPath,
              )
            : nextExpandedPaths,
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
          isAllFilesTreeComplete: false,
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
    expandAllDirectories(): void {
      const nextExpandedPaths = collectExpandedPathsForCurrentMode();
      if (arePathSetsEqual(nextExpandedPaths, state.expandedPaths)) {
        return;
      }

      updateState((currentState) => ({
        ...currentState,
        expandedPaths: nextExpandedPaths,
      }));
    },
    collapseAllDirectories(): void {
      if (state.expandedPaths.size === 0) {
        return;
      }

      updateState((currentState) => ({
        ...currentState,
        expandedPaths: new Set<string>(),
      }));
    },
    async setShowIgnored(activeContextId, value): Promise<void> {
      updateState((currentState) => ({
        ...currentState,
        showIgnored: value,
        allFilesTree: null,
        isAllFilesTreeComplete: false,
        isAllFilesTreeStale: true,
      }));
      if (state.fileTreeMode === "all" && activeContextId !== null) {
        await ensureAllFilesTree(activeContextId, {
          forceReload: true,
        });
      }
    },
    async setShowAllFiles(activeContextId, value): Promise<void> {
      updateState((currentState) => ({
        ...currentState,
        showAllFiles: value,
        allFilesTree: null,
        isAllFilesTreeComplete: false,
        isAllFilesTreeStale: true,
      }));
      if (state.fileTreeMode === "all" && activeContextId !== null) {
        await ensureAllFilesTree(activeContextId, {
          forceReload: true,
        });
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

      await ensureAllFilesTree(activeContextId, {
        forceReload: true,
      });
    },
    async ensureCompleteAllFilesTree(activeContextId): Promise<void> {
      if (activeContextId === null || state.fileTreeMode !== "all") {
        return;
      }

      await ensureAllFilesTree(activeContextId, {
        shallow: false,
      });
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
