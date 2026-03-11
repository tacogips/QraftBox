import { createSignal } from "solid-js";
import type { DiffOverviewState } from "../../../../client-shared/src/contracts/diff";
import type {
  FileTreeMode,
  FileTreeNode,
} from "../../../../client-shared/src/contracts/files";
import {
  createDiffTree,
  createFilesController,
  createInitialFilesControllerState,
  type CreateFilesControllerOptions,
  type FilesControllerState,
  type FilesSynchronizationOptions,
} from "./files-controller";

export interface FilesViewModel {
  readonly fileTreeMode: () => FileTreeMode;
  readonly selectedPath: () => string | null;
  readonly diffTree: (diffOverview: DiffOverviewState) => FileTreeNode | null;
  readonly allFilesTree: () => FileTreeNode | null;
  readonly expandedPaths: () => ReadonlySet<string>;
  readonly isAllFilesLoading: () => boolean;
  readonly isFileContentLoading: () => boolean;
  readonly showIgnored: () => boolean;
  readonly showAllFiles: () => boolean;
  readonly fileContent: () => FilesControllerState["fileContent"];
  readonly fileContentError: () => string | null;
  readonly allFilesError: () => string | null;
  readonly isAllFilesTreeStale: () => boolean;
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
  refreshSelectedFileContent(activeContextId: string | null): Promise<void>;
}

export { createInitialFilesControllerState } from "./files-controller";

export function createFilesViewModel(
  options: CreateFilesControllerOptions = {},
): FilesViewModel {
  const [filesState, setFilesState] = createSignal<FilesControllerState>(
    createInitialFilesControllerState(),
  );
  const filesController = createFilesController({
    ...options,
    onStateChange(nextState) {
      setFilesState(nextState);
      options.onStateChange?.(nextState);
    },
  });
  setFilesState(filesController.getState());

  return {
    fileTreeMode: (): FileTreeMode => filesState().fileTreeMode,
    selectedPath: (): string | null => filesState().selectedPath,
    diffTree: (diffOverview): FileTreeNode | null =>
      createDiffTree(diffOverview),
    allFilesTree: (): FileTreeNode | null => filesState().allFilesTree,
    expandedPaths: (): ReadonlySet<string> => filesState().expandedPaths,
    isAllFilesLoading: (): boolean => filesState().isAllFilesLoading,
    isFileContentLoading: (): boolean => filesState().isFileContentLoading,
    showIgnored: (): boolean => filesState().showIgnored,
    showAllFiles: (): boolean => filesState().showAllFiles,
    fileContent: () => filesState().fileContent,
    fileContentError: (): string | null => filesState().fileContentError,
    allFilesError: (): string | null => filesState().allFilesError,
    isAllFilesTreeStale: (): boolean => filesState().isAllFilesTreeStale,
    synchronize: (synchronizationOptions) =>
      filesController.synchronize(synchronizationOptions),
    selectPath: (activeContextId, path) =>
      filesController.selectPath(activeContextId, path),
    setFileTreeMode: (activeContextId, mode) =>
      filesController.setFileTreeMode(activeContextId, mode),
    toggleDirectory: (activeContextId, directoryPath) =>
      filesController.toggleDirectory(activeContextId, directoryPath),
    expandAllDirectories: () => filesController.expandAllDirectories(),
    collapseAllDirectories: () => filesController.collapseAllDirectories(),
    setShowIgnored: (activeContextId, value) =>
      filesController.setShowIgnored(activeContextId, value),
    setShowAllFiles: (activeContextId, value) =>
      filesController.setShowAllFiles(activeContextId, value),
    markAllFilesTreeStale: () => filesController.markAllFilesTreeStale(),
    refreshAllFilesTree: (activeContextId) =>
      filesController.refreshAllFilesTree(activeContextId),
    refreshSelectedFileContent: (activeContextId) =>
      filesController.refreshSelectedFileContent(activeContextId),
  };
}
