import type { FileNode } from "../stores/files";
import type { ViewMode } from "../types/diff";
import {
  annotateTreeWithStatus,
  convertServerTree,
  insertChildrenIntoTree,
} from "./file-tree-utils";
import {
  fetchAllFilesTreeApi,
  fetchDirectoryChildrenApi,
  fetchFileContentApi,
} from "./app-api";

type DiffStatusMap = Map<string, "added" | "modified" | "deleted">;

type SetState<T> = (value: T) => void;
type GetState<T> = () => T;

export type FileContent = {
  path: string;
  content: string;
  language: string;
  isBinary?: boolean;
  isImage?: boolean;
  mimeType?: string;
};

interface FileViewDeps {
  getContextId: GetState<string | null>;
  getAllFilesTree: GetState<FileNode | null>;
  setAllFilesTree: SetState<FileNode | null>;
  getAllFilesTreeStale: GetState<boolean>;
  setAllFilesTreeStale: SetState<boolean>;
  setAllFilesLoading: SetState<boolean>;
  getDiffStatusMap: GetState<DiffStatusMap>;
  setFileContent: SetState<FileContent | null>;
  setFileContentLoading: SetState<boolean>;
}

export function loadSidebarWidth(params: {
  storageKey: string;
  min: number;
  max: number;
  fallback: number;
}): number {
  try {
    const stored = localStorage.getItem(params.storageKey);
    if (stored !== null) {
      const width = Number(stored);
      if (!Number.isNaN(width) && width >= params.min && width <= params.max) {
        return width;
      }
    }
  } catch {
    // localStorage unavailable
  }
  return params.fallback;
}

export function saveSidebarWidth(storageKey: string, width: number): void {
  try {
    localStorage.setItem(storageKey, String(width));
  } catch {
    // localStorage unavailable
  }
}

export function createFileViewController(deps: FileViewDeps): {
  fetchAllFiles: (ctxId: string) => Promise<void>;
  refreshAllFiles: (ctxId: string) => Promise<void>;
  handleDirectoryExpand: (dirPath: string) => Promise<void>;
  handleLoadFullTree: () => Promise<FileNode | undefined>;
  fetchFileContent: (ctxId: string, filePath: string) => Promise<void>;
  getEffectiveViewMode: (
    selectedHasDiff: boolean,
    viewMode: ViewMode,
  ) => ViewMode;
} {
  async function fetchAllFiles(ctxId: string): Promise<void> {
    if (deps.getAllFilesTree() !== null && !deps.getAllFilesTreeStale()) {
      return;
    }

    deps.setAllFilesLoading(deps.getAllFilesTree() === null);
    deps.setAllFilesTreeStale(false);

    try {
      const tree = await fetchAllFilesTreeApi(ctxId, true);
      deps.setAllFilesTree(convertServerTree(tree));
    } catch (error) {
      console.error("Failed to fetch all files:", error);
    } finally {
      deps.setAllFilesLoading(false);
    }
  }

  async function refreshAllFiles(ctxId: string): Promise<void> {
    try {
      const tree = await fetchAllFilesTreeApi(ctxId, false);
      deps.setAllFilesTree(convertServerTree(tree));
      deps.setAllFilesTreeStale(false);
    } catch (error) {
      console.error("Failed to refresh all files:", error);
    }
  }

  async function handleDirectoryExpand(dirPath: string): Promise<void> {
    const contextId = deps.getContextId();
    if (contextId === null) return;

    try {
      const children = await fetchDirectoryChildrenApi(contextId, dirPath);
      const currentTree = deps.getAllFilesTree();
      if (currentTree !== null) {
        const convertedChildren = children.map(convertServerTree);
        deps.setAllFilesTree(
          insertChildrenIntoTree(currentTree, dirPath, convertedChildren),
        );
      }
    } catch (error) {
      console.error(`Failed to load directory children for ${dirPath}:`, error);
    }
  }

  async function handleLoadFullTree(): Promise<FileNode | undefined> {
    const contextId = deps.getContextId();
    if (contextId === null) return undefined;

    try {
      const tree = await fetchAllFilesTreeApi(contextId, false);
      const fullTree = convertServerTree(tree);
      deps.setAllFilesTree(fullTree);
      return annotateTreeWithStatus(fullTree, deps.getDiffStatusMap());
    } catch (error) {
      console.error("Failed to load full tree:", error);
      return undefined;
    }
  }

  async function fetchFileContent(ctxId: string, filePath: string): Promise<void> {
    deps.setFileContentLoading(true);
    try {
      const data = await fetchFileContentApi(ctxId, filePath);
      deps.setFileContent({
        path: data.path,
        content: data.content,
        language: data.language,
        isBinary: data.isBinary === true ? true : undefined,
        isImage: data.isImage === true ? true : undefined,
        mimeType: data.mimeType,
      });
    } catch (error) {
      console.error("Failed to fetch file content:", error);
      deps.setFileContent(null);
    } finally {
      deps.setFileContentLoading(false);
    }
  }

  function getEffectiveViewMode(selectedHasDiff: boolean, viewMode: ViewMode): ViewMode {
    return selectedHasDiff ? viewMode : "full-file";
  }

  return {
    fetchAllFiles,
    refreshAllFiles,
    handleDirectoryExpand,
    handleLoadFullTree,
    fetchFileContent,
    getEffectiveViewMode,
  };
}
