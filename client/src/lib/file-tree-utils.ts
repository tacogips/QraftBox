import type { DiffFile } from "../types/diff";
import type { FileNode } from "../stores/files";

export interface ServerFileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ServerFileNode[];
  status?: string;
  isBinary?: boolean;
}

export function buildFileTree(files: DiffFile[]): FileNode {
  const root: FileNode = {
    name: "",
    path: "",
    isDirectory: true,
    children: [],
  };

  for (const f of files) {
    const segments = f.path.split("/");
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg === undefined || seg.length === 0) continue;

      const segPath = segments.slice(0, i + 1).join("/");
      const isLast = i === segments.length - 1;
      const children = (current.children ?? []) as FileNode[];

      const existing = children.find((c) => c.name === seg);
      if (existing !== undefined) {
        current = existing;
      } else {
        const newNode: FileNode = isLast
          ? {
              name: seg,
              path: segPath,
              isDirectory: false,
              status: f.status === "renamed" ? "modified" : f.status,
            }
          : { name: seg, path: segPath, isDirectory: true, children: [] };
        children.push(newNode);
        (current as { children: FileNode[] }).children = children;
        current = newNode;
      }
    }
  }

  sortTree(root);
  return root;
}

function sortTree(node: FileNode): void {
  if (!node.isDirectory || node.children === undefined) return;
  const children = node.children as FileNode[];
  children.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of children) {
    sortTree(c);
  }
}

export function annotateTreeWithStatus(
  node: FileNode,
  statusMap: Map<string, "added" | "modified" | "deleted">,
): FileNode {
  if (node.isDirectory && node.children) {
    const annotatedChildren = node.children.map((child) =>
      annotateTreeWithStatus(child, statusMap),
    );
    const changed = annotatedChildren.some((c, i) => c !== node.children![i]);
    return changed ? { ...node, children: annotatedChildren } : node;
  }

  // For lazy-loaded directories (children not yet fetched), check if any
  // changed file path falls under this directory so the indicator dot appears
  // even before the directory is expanded.
  if (node.isDirectory && node.children === undefined) {
    const prefix = node.path === "" ? "" : node.path + "/";
    for (const key of statusMap.keys()) {
      if (key.startsWith(prefix)) {
        return { ...node, status: "modified" };
      }
    }
    return node;
  }

  const status = statusMap.get(node.path);
  if (status !== undefined && node.status === undefined) {
    return { ...node, status };
  }
  return node;
}

export function convertServerTree(node: ServerFileNode): FileNode {
  const status =
    node.status === "added" ||
    node.status === "modified" ||
    node.status === "deleted"
      ? node.status
      : undefined;
  return {
    name: node.name,
    path: node.path,
    isDirectory: node.type === "directory",
    children: node.children?.map(convertServerTree),
    status,
    isBinary: node.isBinary === true ? true : undefined,
  };
}

export function insertChildrenIntoTree(
  node: FileNode,
  dirPath: string,
  children: readonly FileNode[],
): FileNode {
  if (node.path === dirPath && node.isDirectory) {
    return { ...node, children };
  }
  if (!node.isDirectory || node.children === undefined) {
    return node;
  }
  const updatedChildren = node.children.map((child) => {
    if (
      child.isDirectory &&
      (child.path === dirPath || dirPath.startsWith(child.path + "/"))
    ) {
      return insertChildrenIntoTree(child, dirPath, children);
    }
    return child;
  });
  const changed = updatedChildren.some((c, i) => c !== node.children![i]);
  return changed ? { ...node, children: updatedChildren } : node;
}
