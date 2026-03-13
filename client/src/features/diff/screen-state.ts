import type {
  DiffOverviewState,
  DiffViewMode,
} from "../../../../client-shared/src/contracts/diff";
import type {
  FileContent,
  FileTreeMode,
  FileTreeNode,
} from "../../../../client-shared/src/contracts/files";
import { buildDiffFileTree } from "../../../../client-shared/src/contracts/files";

export interface VisibleFileTreeEntry {
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly isDirectory: boolean;
  readonly status: FileTreeNode["status"];
  readonly isExpanded: boolean;
  readonly isExpandable: boolean;
}

export interface DiffPathNavigation {
  readonly previousPath: string | null;
  readonly nextPath: string | null;
}

function normalizeFileTreeFilter(filterText: string): string {
  return filterText.trim().toLocaleLowerCase();
}

function matchesFileTreeFilter(
  fileTreeNode: FileTreeNode,
  normalizedFilterText: string,
): boolean {
  if (normalizedFilterText.length === 0) {
    return true;
  }

  return fileTreeNode.name.toLocaleLowerCase().includes(normalizedFilterText);
}

export function resolveViewModeForFileTreeModeChange(options: {
  readonly previousFileTreeMode: FileTreeMode;
  readonly nextFileTreeMode: FileTreeMode;
  readonly preferredViewMode: DiffViewMode;
}): DiffViewMode {
  if (
    options.previousFileTreeMode === "all" &&
    options.nextFileTreeMode === "diff" &&
    options.preferredViewMode === "full-file"
  ) {
    return "side-by-side";
  }

  return options.preferredViewMode;
}

export function resolveViewModeForPathSelection(options: {
  readonly selectedPath: string;
  readonly diffOverview: DiffOverviewState;
  readonly preferredViewMode: DiffViewMode;
}): DiffViewMode {
  const selectedDiffFile = options.diffOverview.files.find(
    (diffFile) => diffFile.path === options.selectedPath,
  );

  if (selectedDiffFile === undefined) {
    return "full-file";
  }

  return options.preferredViewMode;
}

export function collectVisibleFileTreeEntries(
  fileTree: FileTreeNode | null,
  expandedPaths: ReadonlySet<string>,
): readonly VisibleFileTreeEntry[] {
  if (fileTree === null) {
    return [];
  }

  const visibleEntries: VisibleFileTreeEntry[] = [];

  function visitTreeNode(fileTreeNode: FileTreeNode, depth: number): void {
    const isExpanded = expandedPaths.has(fileTreeNode.path);
    const hasLoadedChildren = (fileTreeNode.children?.length ?? 0) > 0;
    const isExpandable =
      fileTreeNode.isDirectory &&
      (fileTreeNode.children === undefined || hasLoadedChildren);

    if (fileTreeNode.path.length > 0) {
      visibleEntries.push({
        path: fileTreeNode.path,
        name: fileTreeNode.name,
        depth,
        isDirectory: fileTreeNode.isDirectory,
        status: fileTreeNode.status,
        isExpanded,
        isExpandable,
      });
    }

    if (!fileTreeNode.isDirectory || !isExpanded || !hasLoadedChildren) {
      return;
    }

    for (const childNode of fileTreeNode.children ?? []) {
      visitTreeNode(childNode, depth + 1);
    }
  }

  for (const childNode of fileTree.children ?? []) {
    visitTreeNode(childNode, 0);
  }

  return visibleEntries;
}

export function filterFileTreeByName(
  fileTree: FileTreeNode | null,
  filterText: string,
): FileTreeNode | null {
  if (fileTree === null) {
    return null;
  }

  const normalizedFilterText = normalizeFileTreeFilter(filterText);
  if (normalizedFilterText.length === 0) {
    return fileTree;
  }

  function visitTreeNode(
    fileTreeNode: FileTreeNode,
    ancestorMatched: boolean,
  ): FileTreeNode | null {
    if (fileTreeNode.isDirectory) {
      if (
        fileTreeNode.children === undefined ||
        fileTreeNode.children.length === 0
      ) {
        return null;
      }

      const directoryNameMatches = matchesFileTreeFilter(
        fileTreeNode,
        normalizedFilterText,
      );
      const filteredChildren = fileTreeNode.children
        .map((childNode) =>
          visitTreeNode(childNode, ancestorMatched || directoryNameMatches),
        )
        .filter((childNode): childNode is FileTreeNode => childNode !== null);

      if (filteredChildren.length === 0) {
        return null;
      }

      return {
        ...fileTreeNode,
        children: filteredChildren,
      };
    }

    if (
      !ancestorMatched &&
      !matchesFileTreeFilter(fileTreeNode, normalizedFilterText)
    ) {
      return null;
    }

    return fileTreeNode;
  }

  return visitTreeNode(fileTree, false);
}

export function collectFileTreeFilterMatchPaths(
  fileTree: FileTreeNode | null,
  filterText: string,
): ReadonlySet<string> {
  if (fileTree === null) {
    return new Set<string>();
  }

  const normalizedFilterText = normalizeFileTreeFilter(filterText);
  if (normalizedFilterText.length === 0) {
    return new Set<string>();
  }

  function collectPaths(
    fileTreeNode: FileTreeNode,
    ancestorPaths: readonly string[],
  ): ReadonlySet<string> {
    const matchPaths = new Set<string>();

    if (fileTreeNode.isDirectory && fileTreeNode.children !== undefined) {
      if (matchesFileTreeFilter(fileTreeNode, normalizedFilterText)) {
        for (const ancestorPath of ancestorPaths) {
          matchPaths.add(ancestorPath);
        }
        matchPaths.add(fileTreeNode.path);
      }

      for (const childNode of fileTreeNode.children) {
        const childMatchPaths = collectPaths(childNode, [
          ...ancestorPaths,
          fileTreeNode.path,
        ]);
        for (const childMatchPath of childMatchPaths) {
          matchPaths.add(childMatchPath);
        }
      }

      return matchPaths;
    }

    if (matchesFileTreeFilter(fileTreeNode, normalizedFilterText)) {
      for (const ancestorPath of ancestorPaths) {
        matchPaths.add(ancestorPath);
      }
      matchPaths.add(fileTreeNode.path);
    }

    return matchPaths;
  }

  return collectPaths(fileTree, []);
}

export function countFileTreeFilterMatches(
  fileTree: FileTreeNode | null,
  filterText: string,
): number {
  if (fileTree === null) {
    return 0;
  }

  const normalizedFilterText = normalizeFileTreeFilter(filterText);
  if (normalizedFilterText.length === 0) {
    return 0;
  }

  let matchCount = 0;

  function visitTreeNode(fileTreeNode: FileTreeNode): void {
    if (matchesFileTreeFilter(fileTreeNode, normalizedFilterText)) {
      matchCount += 1;
    }

    for (const childNode of fileTreeNode.children ?? []) {
      visitTreeNode(childNode);
    }
  }

  visitTreeNode(fileTree);
  return matchCount;
}

export function hasUnloadedDirectories(fileTree: FileTreeNode | null): boolean {
  if (fileTree === null) {
    return false;
  }

  function visitTreeNode(fileTreeNode: FileTreeNode): boolean {
    if (!fileTreeNode.isDirectory) {
      return false;
    }

    if (fileTreeNode.children === undefined) {
      return true;
    }

    return fileTreeNode.children.some((childNode) => visitTreeNode(childNode));
  }

  return visitTreeNode(fileTree);
}

export function resolveDiffPathNavigation(
  diffOverview: DiffOverviewState,
  selectedPath: string | null,
): DiffPathNavigation {
  const navigablePaths = collectDiffFilePathsInTreeOrder(diffOverview);

  if (navigablePaths.length === 0) {
    return {
      previousPath: null,
      nextPath: null,
    };
  }

  if (selectedPath === null) {
    return {
      previousPath: null,
      nextPath: navigablePaths[0] ?? null,
    };
  }

  const selectedIndex = navigablePaths.findIndex(
    (navigablePath) => navigablePath === selectedPath,
  );
  if (selectedIndex === -1) {
    return {
      previousPath: null,
      nextPath: navigablePaths[0] ?? null,
    };
  }

  return {
    previousPath: navigablePaths[selectedIndex - 1] ?? null,
    nextPath: navigablePaths[selectedIndex + 1] ?? null,
  };
}

function collectDiffFilePathsInTreeOrder(
  diffOverview: DiffOverviewState,
): readonly string[] {
  const diffFileTree = buildDiffFileTree(diffOverview.files);
  const navigablePaths: string[] = [];

  function visitTreeNode(fileTreeNode: FileTreeNode): void {
    if (fileTreeNode.isDirectory) {
      for (const childNode of fileTreeNode.children ?? []) {
        visitTreeNode(childNode);
      }
      return;
    }

    navigablePaths.push(fileTreeNode.path);
  }

  for (const childNode of diffFileTree.children ?? []) {
    visitTreeNode(childNode);
  }

  return navigablePaths;
}

export function collectFileContentMetadata(
  fileContent: FileContent | null,
): readonly string[] {
  if (fileContent === null) {
    return [];
  }

  const metadata: string[] = [fileContent.language];

  if (fileContent.lineCount !== undefined) {
    metadata.push(`${fileContent.lineCount} lines`);
  }

  if (fileContent.size !== undefined) {
    metadata.push(`${fileContent.size} bytes`);
  }

  if (fileContent.badge !== undefined) {
    metadata.push(fileContent.badge);
  }

  if (fileContent.isPartial === true && fileContent.fullSize !== undefined) {
    metadata.push(`partial preview of ${fileContent.fullSize} bytes`);
  } else if (fileContent.isPartial === true) {
    metadata.push("partial preview");
  }

  if (fileContent.isBinary === true) {
    metadata.push("binary");
  }

  if (fileContent.isImage === true) {
    metadata.push("image");
  }

  if (fileContent.isVideo === true) {
    metadata.push("video");
  }

  if (fileContent.isPdf === true) {
    metadata.push("pdf");
  }

  if (fileContent.mimeType !== undefined) {
    metadata.push(fileContent.mimeType);
  }

  return metadata;
}

export function formatDiffStatusLabel(
  status: FileTreeNode["status"],
): string | null {
  if (status === undefined) {
    return null;
  }

  return status.replace("-", " ");
}
