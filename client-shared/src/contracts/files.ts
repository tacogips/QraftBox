import type { DiffFile, DiffStatus } from "./diff";

export type FileTreeMode = "diff" | "all";

export type FileTreeNodeStatus = DiffStatus | "ignored";

export interface ServerFileNode {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "directory";
  readonly children?: readonly ServerFileNode[] | undefined;
  readonly status?: string | undefined;
  readonly isBinary?: boolean | undefined;
}

export interface FileTreeNode {
  readonly name: string;
  readonly path: string;
  readonly isDirectory: boolean;
  readonly children?: readonly FileTreeNode[] | undefined;
  readonly status?: FileTreeNodeStatus | undefined;
  readonly isBinary?: boolean | undefined;
}

export interface FileTreeResponse {
  readonly tree: FileTreeNode;
  readonly totalFiles: number;
  readonly changedFiles: number;
}

export interface FileContent {
  readonly path: string;
  readonly content: string;
  readonly language: string;
  readonly lineCount?: number | undefined;
  readonly size?: number | undefined;
  readonly isBinary?: boolean | undefined;
  readonly isImage?: boolean | undefined;
  readonly isVideo?: boolean | undefined;
  readonly isPdf?: boolean | undefined;
  readonly mimeType?: string | undefined;
  readonly badge?: string | undefined;
  readonly isPartial?: boolean | undefined;
  readonly fullSize?: number | undefined;
}

function normalizeFileTreeStatus(
  status: string | undefined,
): FileTreeNodeStatus | undefined {
  if (
    status === "added" ||
    status === "modified" ||
    status === "deleted" ||
    status === "renamed" ||
    status === "copied" ||
    status === "untracked" ||
    status === "ignored"
  ) {
    return status;
  }

  return undefined;
}

export function convertServerFileTree(node: ServerFileNode): FileTreeNode {
  return {
    name: node.name,
    path: node.path,
    isDirectory: node.type === "directory",
    children: node.children?.map(convertServerFileTree),
    status: normalizeFileTreeStatus(node.status),
    isBinary: node.isBinary === true ? true : undefined,
  };
}

export function buildDiffFileTree(files: readonly DiffFile[]): FileTreeNode {
  const rootNode: FileTreeNode = {
    name: "",
    path: "",
    isDirectory: true,
    children: [],
  };

  for (const diffFile of files) {
    const pathSegments = diffFile.path.split("/");
    let currentNode = rootNode;

    for (
      let segmentIndex = 0;
      segmentIndex < pathSegments.length;
      segmentIndex += 1
    ) {
      const pathSegment = pathSegments[segmentIndex];
      if (pathSegment === undefined || pathSegment.length === 0) {
        continue;
      }

      const segmentPath = pathSegments.slice(0, segmentIndex + 1).join("/");
      const isLeaf = segmentIndex === pathSegments.length - 1;
      const currentChildren = [...(currentNode.children ?? [])];
      const existingChild = currentChildren.find(
        (childNode) => childNode.name === pathSegment,
      );

      if (existingChild !== undefined) {
        currentNode = existingChild;
        continue;
      }

      const nextNode: FileTreeNode = isLeaf
        ? {
            name: pathSegment,
            path: segmentPath,
            isDirectory: false,
            status: diffFile.status,
            isBinary: diffFile.isBinary === true ? true : undefined,
          }
        : {
            name: pathSegment,
            path: segmentPath,
            isDirectory: true,
            children: [],
          };

      currentChildren.push(nextNode);
      (currentNode as { children: readonly FileTreeNode[] }).children =
        currentChildren;
      currentNode = nextNode;
    }
  }

  return sortFileTree(rootNode);
}

function sortFileTree(node: FileTreeNode): FileTreeNode {
  if (!node.isDirectory || node.children === undefined) {
    return node;
  }

  const sortedChildren = node.children
    .map(sortFileTree)
    .sort((leftNode, rightNode) => {
      if (leftNode.isDirectory && !rightNode.isDirectory) {
        return -1;
      }
      if (!leftNode.isDirectory && rightNode.isDirectory) {
        return 1;
      }
      return leftNode.name.localeCompare(rightNode.name);
    });

  return {
    ...node,
    children: sortedChildren,
  };
}

export function insertChildrenIntoFileTree(
  node: FileTreeNode,
  directoryPath: string,
  childNodes: readonly FileTreeNode[],
): FileTreeNode {
  if (node.path === directoryPath && node.isDirectory) {
    return {
      ...node,
      children: [...childNodes].sort((leftNode, rightNode) => {
        if (leftNode.isDirectory && !rightNode.isDirectory) {
          return -1;
        }
        if (!leftNode.isDirectory && rightNode.isDirectory) {
          return 1;
        }
        return leftNode.name.localeCompare(rightNode.name);
      }),
    };
  }

  if (!node.isDirectory || node.children === undefined) {
    return node;
  }

  const nextChildren = node.children.map((childNode) => {
    if (
      childNode.isDirectory &&
      (childNode.path === directoryPath ||
        directoryPath.startsWith(`${childNode.path}/`))
    ) {
      return insertChildrenIntoFileTree(childNode, directoryPath, childNodes);
    }

    return childNode;
  });

  if (
    nextChildren.every(
      (nextChildNode, childIndex) =>
        nextChildNode === node.children?.[childIndex],
    )
  ) {
    return node;
  }

  return {
    ...node,
    children: nextChildren,
  };
}

export function collectAncestorDirectoryPaths(
  filePath: string,
): readonly string[] {
  const pathSegments = filePath
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const directoryPaths: string[] = [];

  for (
    let segmentIndex = 0;
    segmentIndex < pathSegments.length - 1;
    segmentIndex += 1
  ) {
    directoryPaths.push(pathSegments.slice(0, segmentIndex + 1).join("/"));
  }

  return directoryPaths;
}
