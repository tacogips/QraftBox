/**
 * Git File Tree Operations
 *
 * Provides functions for building file trees, listing files, and merging
 * git status information into tree structures.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
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
      const untrackedFiles = await getUntrackedFiles(projectPath);
      tree = buildTreeFromPaths([...allFiles, ...untrackedFiles]);
      tree = markUntrackedFiles(tree, new Set(untrackedFiles));
    } else {
      const changedFiles = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Also include untracked files in diff view
      const untrackedFiles = await getUntrackedFiles(projectPath);
      tree = buildTreeFromPaths([...changedFiles, ...untrackedFiles]);
      tree = markUntrackedFiles(tree, new Set(untrackedFiles));
    }
  } else {
    // Get all tracked files + untracked files
    const [allFiles, untrackedFiles] = await Promise.all([
      getAllFiles(projectPath),
      getUntrackedFiles(projectPath),
    ]);
    tree = buildTreeFromPaths([...allFiles, ...untrackedFiles]);
    tree = markUntrackedFiles(tree, new Set(untrackedFiles));
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
 * Get flat list of untracked (not ignored) files in repository
 *
 * @param projectPath - Path to git repository
 * @param dirPath - Optional directory path to scope the listing
 * @returns Promise resolving to array of untracked file paths
 */
export async function getUntrackedFiles(
  projectPath: string,
  dirPath?: string | undefined,
): Promise<readonly string[]> {
  const args = ["ls-files", "--others", "--exclude-standard"];
  if (dirPath !== undefined && dirPath !== "") {
    args.push("--", dirPath + "/");
  }

  const result = await execGit(args, { cwd: projectPath });

  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Get flat list of ignored files in a directory (for lazy loading)
 *
 * Uses `git ls-files --others --ignored --exclude-standard` scoped to a directory
 * to avoid listing the entire ignored tree (e.g., node_modules).
 *
 * @param projectPath - Path to git repository
 * @param dirPath - Directory path relative to repo root ("" for root)
 * @returns Promise resolving to array of ignored file paths
 */
export async function getIgnoredFiles(
  projectPath: string,
  dirPath: string,
): Promise<readonly string[]> {
  const args = [
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--directory",
  ];
  if (dirPath !== "") {
    args.push("--", dirPath + "/");
  } else {
    args.push("--", ".");
  }

  const result = await execGit(args, { cwd: projectPath });

  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Get immediate children of a directory (for lazy loading)
 *
 * Uses `git ls-files` to list tracked files under a directory,
 * then extracts unique immediate children (files and subdirectories).
 * Directory children have `children: undefined` to indicate not-yet-loaded.
 *
 * @param projectPath - Path to git repository
 * @param dirPath - Directory path relative to repo root ("" for root)
 * @returns Promise resolving to array of immediate child FileNodes
 * @throws Error if git command fails
 *
 * @example
 * ```typescript
 * const rootChildren = await getDirectoryChildren('/path/to/repo', '');
 * // [{ name: 'src', path: 'src', type: 'directory', children: undefined }, ...]
 *
 * const srcChildren = await getDirectoryChildren('/path/to/repo', 'src');
 * // [{ name: 'main.ts', path: 'src/main.ts', type: 'file', children: undefined }, ...]
 * ```
 */
export async function getDirectoryChildren(
  projectPath: string,
  dirPath: string,
  options?: { showIgnored?: boolean } | undefined,
): Promise<readonly FileNode[]> {
  const args =
    dirPath === "" ? ["ls-files"] : ["ls-files", "--", dirPath + "/"];

  // Run tracked, untracked, and optionally ignored file listings in parallel
  const promises: [
    Promise<{ exitCode: number; stdout: string; stderr: string }>,
    Promise<readonly string[]>,
    Promise<readonly string[]>,
  ] = [
    execGit(args, { cwd: projectPath }),
    getUntrackedFiles(projectPath, dirPath),
    options?.showIgnored === true
      ? getIgnoredFiles(projectPath, dirPath)
      : Promise.resolve([]),
  ];

  const [result, untrackedFiles, ignoredFiles] = await Promise.all(promises);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to list files: ${result.stderr}`);
  }

  const trackedFiles = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const prefix = dirPath === "" ? "" : dirPath + "/";
  const prefixLen = prefix.length;

  // Track unique immediate children: name -> { type, status }
  const childrenMap = new Map<
    string,
    { type: "file" | "directory"; status: FileStatusCode | undefined }
  >();

  // Add tracked files (no special status)
  for (const filePath of trackedFiles) {
    const relativePath = filePath.substring(prefixLen);
    const slashIndex = relativePath.indexOf("/");

    if (slashIndex === -1) {
      childrenMap.set(relativePath, { type: "file", status: undefined });
    } else {
      const dirName = relativePath.substring(0, slashIndex);
      if (!childrenMap.has(dirName)) {
        childrenMap.set(dirName, { type: "directory", status: undefined });
      }
    }
  }

  // Add untracked files with "untracked" status
  for (const filePath of untrackedFiles) {
    const relativePath = filePath.substring(prefixLen);
    const slashIndex = relativePath.indexOf("/");

    if (slashIndex === -1) {
      if (!childrenMap.has(relativePath)) {
        childrenMap.set(relativePath, { type: "file", status: "untracked" });
      }
    } else {
      const dirName = relativePath.substring(0, slashIndex);
      if (!childrenMap.has(dirName)) {
        childrenMap.set(dirName, { type: "directory", status: undefined });
      }
    }
  }

  // Add ignored files/dirs with "ignored" status
  for (const filePath of ignoredFiles) {
    // --directory flag causes ignored dirs to end with "/"
    const cleanPath = filePath.endsWith("/")
      ? filePath.substring(0, filePath.length - 1)
      : filePath;
    const relativePath = cleanPath.substring(prefixLen);
    if (relativePath === "") {
      continue; // skip the directory itself (git reports it with --directory)
    }
    const slashIndex = relativePath.indexOf("/");

    if (slashIndex === -1) {
      if (!childrenMap.has(relativePath)) {
        // Could be a directory (if ended with /) or file
        const isDir = filePath.endsWith("/");
        childrenMap.set(relativePath, {
          type: isDir ? "directory" : "file",
          status: "ignored",
        });
      }
    } else {
      const dirName = relativePath.substring(0, slashIndex);
      if (!childrenMap.has(dirName)) {
        childrenMap.set(dirName, { type: "directory", status: "ignored" });
      }
    }
  }

  // Fallback: if showIgnored is true and childrenMap is empty, the directory
  // itself may be ignored (git --directory won't recurse into it).
  // Use filesystem readdir to list contents, marking all as ignored.
  if (
    options?.showIgnored === true &&
    childrenMap.size === 0 &&
    dirPath !== ""
  ) {
    try {
      const fullDirPath = join(projectPath, dirPath);
      const entries = await readdir(fullDirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) {
          continue; // skip hidden files like .git
        }
        childrenMap.set(entry.name, {
          type: entry.isDirectory() ? "directory" : "file",
          status: "ignored",
        });
      }
    } catch {
      // Directory doesn't exist or can't be read - return empty
    }
  }

  // Build sorted FileNode array
  const children: FileNode[] = [];
  for (const [name, info] of childrenMap) {
    const path = prefix + name;
    children.push({
      name,
      path,
      type: info.type,
      children: undefined,
      status: info.status,
      isBinary:
        info.type === "file"
          ? isBinaryExtension(path)
            ? true
            : undefined
          : undefined,
    });
  }

  // Sort: directories first, then files, alphabetically within each group
  children.sort((a, b) => {
    if (a.type === "directory" && b.type === "file") return -1;
    if (a.type === "file" && b.type === "directory") return 1;
    return a.name.localeCompare(b.name);
  });

  return children;
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
 * Mark untracked files in file tree
 *
 * Recursively walks the tree and sets status: "untracked" on file nodes
 * whose paths are in the untrackedPaths set.
 *
 * @param root - Root FileNode to process
 * @param untrackedPaths - Set of untracked file paths
 * @returns New FileNode tree with untracked annotations
 */
export function markUntrackedFiles(
  root: FileNode,
  untrackedPaths: ReadonlySet<string>,
): FileNode {
  if (untrackedPaths.size === 0) {
    return root;
  }

  function processNode(node: FileNode): FileNode {
    if (node.type === "file") {
      if (untrackedPaths.has(node.path)) {
        return { ...node, status: "untracked" };
      }
      return node;
    }

    const children = node.children ?? [];
    if (children.length === 0) {
      return node;
    }

    const newChildren = children.map((child) => processNode(child));
    const changed = newChildren.some((c, i) => c !== children[i]);

    return changed ? { ...node, children: newChildren } : node;
  }

  return processNode(root);
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
