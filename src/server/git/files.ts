/**
 * Git File Tree Operations
 *
 * Provides functions for building file trees, listing files, and merging
 * git status information into tree structures.
 */

import type { FileNode, FileStatus, FileStatusCode } from "../../types/git";
import { createFileNode } from "../../types/git";
import { execGit } from "./executor";
import { isBinaryExtension } from "./binary.js";

/**
 * Get hierarchical file tree from git ls-files
 *
 * @param projectPath - Path to git repository
 * @param diffOnly - If true, only include files with changes
 * @returns Promise resolving to root FileNode (type: directory, name: "", path: "")
 * @throws GitExecutorError if git command fails
 *
 * @example
 * ```typescript
 * const tree = await getFileTree('/path/to/repo');
 * // tree.children contains all tracked files as a tree structure
 *
 * const changedTree = await getFileTree('/path/to/repo', true);
 * // Only files with uncommitted changes
 * ```
 */
export async function getFileTree(
  projectPath: string,
  diffOnly?: boolean | undefined,
): Promise<FileNode> {
  let tree: FileNode;

  if (diffOnly === true) {
    // Get list of changed files
    const result = await execGit(["diff", "--name-only", "HEAD"], {
      cwd: projectPath,
    });

    if (result.exitCode !== 0) {
      // No HEAD (new repo) or other error - fall back to all files
      const allFiles = await getAllFiles(projectPath);
      tree = buildTreeFromPaths(allFiles);
    } else {
      const changedFiles = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      tree = buildTreeFromPaths(changedFiles);
    }
  } else {
    // Get all tracked files
    const allFiles = await getAllFiles(projectPath);
    tree = buildTreeFromPaths(allFiles);
  }

  // Mark binary files before returning
  return markBinaryFiles(tree);
}

/**
 * Get flat list of all tracked files in repository
 *
 * @param projectPath - Path to git repository
 * @returns Promise resolving to array of file paths (relative to repo root)
 * @throws GitExecutorError if git command fails
 *
 * @example
 * ```typescript
 * const files = await getAllFiles('/path/to/repo');
 * // ['src/main.ts', 'src/lib.ts', 'package.json', ...]
 * ```
 */
export async function getAllFiles(
  projectPath: string,
): Promise<readonly string[]> {
  const result = await execGit(["ls-files"], { cwd: projectPath });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to list files: ${result.stderr}`);
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Merge file status information into a file tree
 *
 * Walks the tree and annotates nodes with status from FileStatus array.
 * For directories, bubbles up status if any child has status.
 * Returns a new tree (immutable - creates new objects).
 *
 * @param tree - Root FileNode to annotate
 * @param statuses - Array of FileStatus to merge into tree
 * @returns New FileNode tree with status annotations
 *
 * @example
 * ```typescript
 * const tree = await getFileTree('/path/to/repo');
 * const statuses = [
 *   { path: 'src/main.ts', status: 'modified', staged: false },
 *   { path: 'src/lib.ts', status: 'added', staged: true }
 * ];
 * const annotatedTree = mergeStatusIntoTree(tree, statuses);
 * // Tree nodes for src/main.ts and src/lib.ts now have status property
 * // Directory nodes also get status if any child has status
 * ```
 */
export function mergeStatusIntoTree(
  tree: FileNode,
  statuses: readonly FileStatus[],
): FileNode {
  // Build a map of path -> status for fast lookup
  const statusMap = new Map<string, FileStatusCode>();
  for (const status of statuses) {
    statusMap.set(status.path, status.status);
  }

  /**
   * Recursively merge status into node and its children
   * Returns the new node and whether any descendant has status
   */
  function mergeNode(node: FileNode): {
    node: FileNode;
    hasStatus: boolean;
  } {
    const nodeStatus = statusMap.get(node.path);

    if (node.type === "file") {
      // File node - check if it has status
      if (nodeStatus !== undefined) {
        return {
          node: {
            ...node,
            status: nodeStatus,
          },
          hasStatus: true,
        };
      }
      return { node, hasStatus: false };
    }

    // Directory node - recursively process children
    const children = node.children ?? [];
    const newChildren: FileNode[] = [];
    let anyChildHasStatus = false;

    for (const child of children) {
      const { node: newChild, hasStatus } = mergeNode(child);
      newChildren.push(newChild);
      if (hasStatus) {
        anyChildHasStatus = true;
      }
    }

    // Directory gets status if it or any descendant has status
    const dirStatus =
      nodeStatus ?? (anyChildHasStatus ? "modified" : undefined);
    const hasStatus = nodeStatus !== undefined || anyChildHasStatus;

    return {
      node: {
        ...node,
        children: newChildren,
        status: dirStatus,
      },
      hasStatus,
    };
  }

  const { node: newTree } = mergeNode(tree);
  return newTree;
}

/**
 * Build hierarchical file tree from flat array of paths
 *
 * Splits each path by "/" to create directory and file nodes.
 * Root node has empty name and path.
 * Children are sorted: directories first, then files, both alphabetically.
 *
 * @param paths - Array of file paths (relative paths with "/" separator)
 * @returns Root FileNode with children arranged in tree structure
 *
 * @example
 * ```typescript
 * const tree = buildTreeFromPaths([
 *   'src/main.ts',
 *   'src/lib.ts',
 *   'package.json',
 *   'src/utils/helper.ts'
 * ]);
 * // Returns tree:
 * // {
 * //   name: "",
 * //   path: "",
 * //   type: "directory",
 * //   children: [
 * //     { name: "src", path: "src", type: "directory", children: [...] },
 * //     { name: "package.json", path: "package.json", type: "file" }
 * //   ]
 * // }
 * ```
 */
export function buildTreeFromPaths(paths: readonly string[]): FileNode {
  // Root node with empty name and path
  const root = createFileNode("", "", "directory");

  // Build tree by inserting each path
  for (const path of paths) {
    if (path.length === 0) {
      continue;
    }

    const segments = path.split("/");
    let currentNode = root;

    // Walk/create path segments
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === undefined || segment.length === 0) {
        continue;
      }

      const isLastSegment = i === segments.length - 1;
      const segmentPath = segments.slice(0, i + 1).join("/");

      // Ensure children array exists (it should from createFileNode)
      const children = currentNode.children ?? [];

      // Find existing child with this name
      const existingChild = children.find((child) => child.name === segment);

      if (existingChild !== undefined) {
        // Use existing node
        currentNode = existingChild;
      } else {
        // Create new node
        const newNode = createFileNode(
          segment,
          segmentPath,
          isLastSegment ? "file" : "directory",
        );

        // Add to parent's children (need to mutate during build)
        const mutableChildren = [...children, newNode];
        // Type assertion needed because we're mutating during tree construction
        // This is safe because we create the parent node as a directory with an array
        (
          currentNode as unknown as {
            -readonly [K in keyof FileNode]: FileNode[K];
          }
        ).children = mutableChildren;

        currentNode = newNode;
      }
    }
  }

  // Sort children recursively (directories first, then alphabetically)
  function sortChildren(node: FileNode): FileNode {
    const children = node.children;
    if (children === undefined || children.length === 0) {
      return node;
    }

    // Sort: directories first, then files, both alphabetically
    const sorted = [...children].sort((a, b) => {
      // Directories before files
      if (a.type === "directory" && b.type === "file") {
        return -1;
      }
      if (a.type === "file" && b.type === "directory") {
        return 1;
      }
      // Same type - alphabetical
      return a.name.localeCompare(b.name);
    });

    // Recursively sort children of directories
    const sortedWithChildren = sorted.map((child) =>
      child.type === "directory" ? sortChildren(child) : child,
    );

    return {
      ...node,
      children: sortedWithChildren,
    };
  }

  return sortChildren(root);
}

/**
 * Mark binary files in file tree based on file extension
 *
 * Recursively walks the file tree and sets isBinary flag on file nodes
 * based on known binary file extensions. Directories are not marked as binary.
 * Returns a new tree (immutable - creates new objects).
 *
 * @param root - Root FileNode to process
 * @returns New FileNode tree with isBinary annotations
 *
 * @example
 * ```typescript
 * const tree = buildTreeFromPaths(['image.png', 'script.js']);
 * const marked = markBinaryFiles(tree);
 * // image.png node will have isBinary: true
 * // script.js node will have isBinary: undefined
 * ```
 */
export function markBinaryFiles(root: FileNode): FileNode {
  /**
   * Recursively process node and its children
   */
  function processNode(node: FileNode): FileNode {
    if (node.type === "file") {
      // Check if this file has a binary extension
      const isBinary = isBinaryExtension(node.path);
      if (isBinary) {
        return {
          ...node,
          isBinary: true,
        };
      }
      // Return unchanged if not binary
      return node;
    }

    // Directory node - recursively process children
    const children = node.children ?? [];
    if (children.length === 0) {
      return node;
    }

    const newChildren = children.map((child) => processNode(child));

    return {
      ...node,
      children: newChildren,
    };
  }

  return processNode(root);
}
