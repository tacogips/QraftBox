/**
 * Tree navigation utility functions for the file tree component
 *
 * Provides pure functions for tree traversal, flattening, filtering,
 * and navigation. All functions are side-effect free and type-safe.
 */

import type { FileNode } from "../stores/files";

/**
 * Flat tree node for virtual list rendering
 */
export interface FlatTreeNode {
  readonly node: FileNode;
  readonly depth: number;
  readonly isExpanded: boolean;
}

/**
 * File status count result
 */
export interface FileStatusCount {
  readonly total: number;
  readonly added: number;
  readonly modified: number;
  readonly deleted: number;
  readonly unchanged: number;
}

/**
 * Flatten tree for virtual list rendering
 *
 * Recursively flattens the tree structure into a flat array suitable for
 * virtual list rendering. Only includes expanded directories' children.
 *
 * @param tree - Root node of the file tree
 * @param expandedPaths - Set of expanded directory paths
 * @returns Flat array of tree nodes with depth information
 */
export function flattenTree(
  tree: FileNode,
  expandedPaths: ReadonlySet<string>,
): readonly FlatTreeNode[] {
  const result: FlatTreeNode[] = [];

  function traverse(node: FileNode, depth: number): void {
    const isExpanded = expandedPaths.has(node.path);
    result.push({ node, depth, isExpanded });

    // Only traverse children if this is a directory and it's expanded
    if (node.isDirectory && isExpanded && node.children) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(tree, 0);
  return result;
}

/**
 * Get all changed file paths in tree order (depth-first)
 *
 * @param node - Current node to traverse
 * @returns Array of changed file paths
 */
function getChangedFilePaths(node: FileNode): readonly string[] {
  const paths: string[] = [];

  function traverse(current: FileNode): void {
    if (!current.isDirectory && current.status !== undefined) {
      paths.push(current.path);
    }

    if (current.children) {
      for (const child of current.children) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return paths;
}

/**
 * Get next file with changes (for navigation)
 *
 * Finds the next file with changes after the current path in depth-first order.
 * If currentPath is null, returns the first changed file.
 * If currentPath is the last changed file, returns null.
 *
 * @param tree - Root node of the file tree
 * @param currentPath - Current file path (null to get first)
 * @returns Next changed file path, or null if none
 */
export function getNextChangedFile(
  tree: FileNode,
  currentPath: string | null,
): string | null {
  const changedPaths = getChangedFilePaths(tree);

  if (changedPaths.length === 0) {
    return null;
  }

  if (currentPath === null) {
    return changedPaths[0] ?? null;
  }

  const currentIndex = changedPaths.indexOf(currentPath);
  if (currentIndex === -1) {
    // Current path not found, return first
    return changedPaths[0] ?? null;
  }

  // Get next path
  const nextPath = changedPaths[currentIndex + 1];
  return nextPath ?? null;
}

/**
 * Get previous file with changes (for navigation)
 *
 * Finds the previous file with changes before the current path in depth-first order.
 * If currentPath is null, returns the last changed file.
 * If currentPath is the first changed file, returns null.
 *
 * @param tree - Root node of the file tree
 * @param currentPath - Current file path (null to get last)
 * @returns Previous changed file path, or null if none
 */
export function getPrevChangedFile(
  tree: FileNode,
  currentPath: string | null,
): string | null {
  const changedPaths = getChangedFilePaths(tree);

  if (changedPaths.length === 0) {
    return null;
  }

  if (currentPath === null) {
    return changedPaths[changedPaths.length - 1] ?? null;
  }

  const currentIndex = changedPaths.indexOf(currentPath);
  if (currentIndex === -1) {
    // Current path not found, return last
    return changedPaths[changedPaths.length - 1] ?? null;
  }

  if (currentIndex === 0) {
    // Already at first, can't go previous
    return null;
  }

  // Get previous path
  const prevPath = changedPaths[currentIndex - 1];
  return prevPath ?? null;
}

/**
 * Filter tree by mode (diff only or all files)
 *
 * When mode is 'diff', only includes files with changes and their parent directories.
 * When mode is 'all', includes all files and directories.
 * Returns null if the filtered tree would be empty.
 *
 * @param tree - Root node of the file tree
 * @param mode - Filter mode ('diff' or 'all')
 * @returns Filtered tree, or null if empty
 */
export function filterTreeByMode(
  tree: FileNode,
  mode: "diff" | "all",
): FileNode | null {
  if (mode === "all") {
    return tree;
  }

  // For 'diff' mode, filter to only changed files
  function filterNode(node: FileNode): FileNode | null {
    if (!node.isDirectory) {
      // Keep files with status
      return node.status !== undefined ? node : null;
    }

    // For directories, recursively filter children
    if (!node.children || node.children.length === 0) {
      return null;
    }

    const filteredChildren: FileNode[] = [];
    for (const child of node.children) {
      const filtered = filterNode(child);
      if (filtered !== null) {
        filteredChildren.push(filtered);
      }
    }

    if (filteredChildren.length === 0) {
      return null;
    }

    // Return directory with filtered children
    return {
      ...node,
      children: filteredChildren,
    };
  }

  return filterNode(tree);
}

/**
 * Count files by status
 *
 * Recursively counts all files in the tree, categorized by their status.
 *
 * @param tree - Root node of the file tree
 * @returns Count object with totals for each status
 */
export function countFilesByStatus(tree: FileNode): FileStatusCount {
  let total = 0;
  let added = 0;
  let modified = 0;
  let deleted = 0;
  let unchanged = 0;

  function traverse(node: FileNode): void {
    if (!node.isDirectory) {
      total++;

      switch (node.status) {
        case "added":
          added++;
          break;
        case "modified":
          modified++;
          break;
        case "deleted":
          deleted++;
          break;
        case undefined:
          unchanged++;
          break;
        default: {
          // Exhaustive check
          const _exhaustive: never = node.status;
          throw new Error(`Unhandled status: ${_exhaustive}`);
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(tree);

  return {
    total,
    added,
    modified,
    deleted,
    unchanged,
  };
}

/**
 * Check if directory has any changed children (recursive)
 *
 * Recursively checks if a directory node contains any files with status
 * (added, modified, or deleted) in its subtree.
 *
 * @param node - Node to check (should be a directory)
 * @returns True if any descendant file has a status
 */
export function hasChangedChildren(node: FileNode): boolean {
  if (!node.isDirectory) {
    return node.status !== undefined;
  }

  if (!node.children || node.children.length === 0) {
    return false;
  }

  for (const child of node.children) {
    if (hasChangedChildren(child)) {
      return true;
    }
  }

  return false;
}
