/**
 * Tests for tree navigation utilities
 *
 * Comprehensive tests covering all tree navigation functions with edge cases.
 */

import { describe, test, expect } from "bun:test";
import type { FileNode } from "../stores/files";
import {
  flattenTree,
  getNextChangedFile,
  getPrevChangedFile,
  filterTreeByMode,
  countFilesByStatus,
  hasChangedChildren,
  type FlatTreeNode,
  type FileStatusCount,
} from "./tree-navigation";

/**
 * Test fixture: Simple file tree
 */
const simpleTree: FileNode = {
  name: "root",
  path: "root",
  isDirectory: true,
  children: [
    {
      name: "file1.txt",
      path: "root/file1.txt",
      isDirectory: false,
      status: "modified",
    },
    {
      name: "file2.txt",
      path: "root/file2.txt",
      isDirectory: false,
      status: "added",
    },
  ],
};

/**
 * Test fixture: Nested tree with mixed statuses
 */
const nestedTree: FileNode = {
  name: "root",
  path: "root",
  isDirectory: true,
  children: [
    {
      name: "dir1",
      path: "root/dir1",
      isDirectory: true,
      children: [
        {
          name: "file1.txt",
          path: "root/dir1/file1.txt",
          isDirectory: false,
          status: "modified",
        },
        {
          name: "file2.txt",
          path: "root/dir1/file2.txt",
          isDirectory: false,
          status: undefined,
        },
      ],
    },
    {
      name: "dir2",
      path: "root/dir2",
      isDirectory: true,
      children: [
        {
          name: "file3.txt",
          path: "root/dir2/file3.txt",
          isDirectory: false,
          status: "added",
        },
        {
          name: "file4.txt",
          path: "root/dir2/file4.txt",
          isDirectory: false,
          status: "deleted",
        },
      ],
    },
    {
      name: "file5.txt",
      path: "root/file5.txt",
      isDirectory: false,
      status: undefined,
    },
  ],
};

/**
 * Test fixture: Deep nesting (4 levels)
 */
const deepTree: FileNode = {
  name: "root",
  path: "root",
  isDirectory: true,
  children: [
    {
      name: "level1",
      path: "root/level1",
      isDirectory: true,
      children: [
        {
          name: "level2",
          path: "root/level1/level2",
          isDirectory: true,
          children: [
            {
              name: "level3",
              path: "root/level1/level2/level3",
              isDirectory: true,
              children: [
                {
                  name: "deep.txt",
                  path: "root/level1/level2/level3/deep.txt",
                  isDirectory: false,
                  status: "modified",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Test fixture: Tree with no changes
 */
const unchangedTree: FileNode = {
  name: "root",
  path: "root",
  isDirectory: true,
  children: [
    {
      name: "file1.txt",
      path: "root/file1.txt",
      isDirectory: false,
      status: undefined,
    },
    {
      name: "file2.txt",
      path: "root/file2.txt",
      isDirectory: false,
      status: undefined,
    },
  ],
};

/**
 * Test fixture: Single file (edge case)
 */
const singleFileTree: FileNode = {
  name: "file.txt",
  path: "file.txt",
  isDirectory: false,
  status: "modified",
};

/**
 * Test fixture: Empty directory
 */
const emptyDirTree: FileNode = {
  name: "root",
  path: "root",
  isDirectory: true,
  children: [],
};

describe("flattenTree", () => {
  test("flattens simple tree with all collapsed", () => {
    const expanded = new Set<string>();
    const result = flattenTree(simpleTree, expanded);

    expect(result).toHaveLength(1);
    expect(result[0]?.node.path).toBe("root");
    expect(result[0]?.depth).toBe(0);
    expect(result[0]?.isExpanded).toBe(false);
  });

  test("flattens simple tree with root expanded", () => {
    const expanded = new Set<string>(["root"]);
    const result = flattenTree(simpleTree, expanded);

    expect(result).toHaveLength(3);
    expect(result[0]?.node.path).toBe("root");
    expect(result[0]?.depth).toBe(0);
    expect(result[0]?.isExpanded).toBe(true);
    expect(result[1]?.node.path).toBe("root/file1.txt");
    expect(result[1]?.depth).toBe(1);
    expect(result[2]?.node.path).toBe("root/file2.txt");
    expect(result[2]?.depth).toBe(1);
  });

  test("flattens nested tree with selective expansion", () => {
    const expanded = new Set<string>(["root", "root/dir1"]);
    const result = flattenTree(nestedTree, expanded);

    expect(result).toHaveLength(6);
    expect(result[0]?.node.path).toBe("root");
    expect(result[1]?.node.path).toBe("root/dir1");
    expect(result[1]?.depth).toBe(1);
    expect(result[2]?.node.path).toBe("root/dir1/file1.txt");
    expect(result[2]?.depth).toBe(2);
    expect(result[3]?.node.path).toBe("root/dir1/file2.txt");
    expect(result[4]?.node.path).toBe("root/dir2");
    expect(result[4]?.isExpanded).toBe(false);
    expect(result[5]?.node.path).toBe("root/file5.txt");
  });

  test("flattens deep tree with full expansion", () => {
    const expanded = new Set<string>([
      "root",
      "root/level1",
      "root/level1/level2",
      "root/level1/level2/level3",
    ]);
    const result = flattenTree(deepTree, expanded);

    expect(result).toHaveLength(5);
    expect(result[4]?.node.path).toBe("root/level1/level2/level3/deep.txt");
    expect(result[4]?.depth).toBe(4);
  });

  test("flattens single file tree", () => {
    const expanded = new Set<string>();
    const result = flattenTree(singleFileTree, expanded);

    expect(result).toHaveLength(1);
    expect(result[0]?.node.path).toBe("file.txt");
    expect(result[0]?.depth).toBe(0);
    expect(result[0]?.isExpanded).toBe(false);
  });

  test("flattens empty directory tree", () => {
    const expanded = new Set<string>(["root"]);
    const result = flattenTree(emptyDirTree, expanded);

    expect(result).toHaveLength(1);
    expect(result[0]?.node.path).toBe("root");
    expect(result[0]?.isExpanded).toBe(true);
  });

  test("preserves expansion state in result", () => {
    const expanded = new Set<string>(["root", "root/dir1"]);
    const result = flattenTree(nestedTree, expanded);

    const rootNode = result[0];
    const dir1Node = result[1];
    const dir2Node = result[4];

    expect(rootNode?.isExpanded).toBe(true);
    expect(dir1Node?.isExpanded).toBe(true);
    expect(dir2Node?.isExpanded).toBe(false);
  });
});

describe("getNextChangedFile", () => {
  test("returns first changed file when currentPath is null", () => {
    const result = getNextChangedFile(nestedTree, null);
    expect(result).toBe("root/dir1/file1.txt");
  });

  test("returns next changed file in depth-first order", () => {
    const result = getNextChangedFile(nestedTree, "root/dir1/file1.txt");
    expect(result).toBe("root/dir2/file3.txt");
  });

  test("returns null when at last changed file", () => {
    const result = getNextChangedFile(nestedTree, "root/dir2/file4.txt");
    expect(result).toBe(null);
  });

  test("returns null when tree has no changes", () => {
    const result = getNextChangedFile(unchangedTree, null);
    expect(result).toBe(null);
  });

  test("returns first changed file when currentPath not found", () => {
    const result = getNextChangedFile(nestedTree, "nonexistent.txt");
    expect(result).toBe("root/dir1/file1.txt");
  });

  test("handles single changed file tree", () => {
    const result = getNextChangedFile(singleFileTree, null);
    expect(result).toBe("file.txt");

    const next = getNextChangedFile(singleFileTree, "file.txt");
    expect(next).toBe(null);
  });

  test("navigates through all changes in order", () => {
    let current: string | null = null;
    const visited: string[] = [];

    // First file
    current = getNextChangedFile(nestedTree, current);
    if (current !== null) visited.push(current);

    // Second file
    current = getNextChangedFile(nestedTree, current);
    if (current !== null) visited.push(current);

    // Third file
    current = getNextChangedFile(nestedTree, current);
    if (current !== null) visited.push(current);

    expect(visited).toEqual([
      "root/dir1/file1.txt",
      "root/dir2/file3.txt",
      "root/dir2/file4.txt",
    ]);
  });
});

describe("getPrevChangedFile", () => {
  test("returns last changed file when currentPath is null", () => {
    const result = getPrevChangedFile(nestedTree, null);
    expect(result).toBe("root/dir2/file4.txt");
  });

  test("returns previous changed file in depth-first order", () => {
    const result = getPrevChangedFile(nestedTree, "root/dir2/file3.txt");
    expect(result).toBe("root/dir1/file1.txt");
  });

  test("returns null when at first changed file", () => {
    const result = getPrevChangedFile(nestedTree, "root/dir1/file1.txt");
    expect(result).toBe(null);
  });

  test("returns null when tree has no changes", () => {
    const result = getPrevChangedFile(unchangedTree, null);
    expect(result).toBe(null);
  });

  test("returns last changed file when currentPath not found", () => {
    const result = getPrevChangedFile(nestedTree, "nonexistent.txt");
    expect(result).toBe("root/dir2/file4.txt");
  });

  test("handles single changed file tree", () => {
    const result = getPrevChangedFile(singleFileTree, null);
    expect(result).toBe("file.txt");

    const prev = getPrevChangedFile(singleFileTree, "file.txt");
    expect(prev).toBe(null);
  });

  test("navigates backwards through all changes", () => {
    let current: string | null = null;
    const visited: string[] = [];

    // Last file
    current = getPrevChangedFile(nestedTree, current);
    if (current !== null) visited.push(current);

    // Second to last
    current = getPrevChangedFile(nestedTree, current);
    if (current !== null) visited.push(current);

    // Third to last (first)
    current = getPrevChangedFile(nestedTree, current);
    if (current !== null) visited.push(current);

    expect(visited).toEqual([
      "root/dir2/file4.txt",
      "root/dir2/file3.txt",
      "root/dir1/file1.txt",
    ]);
  });
});

describe("filterTreeByMode", () => {
  test("returns original tree in 'all' mode", () => {
    const result = filterTreeByMode(nestedTree, "all");
    expect(result).toBe(nestedTree);
  });

  test("filters to only changed files in 'diff' mode", () => {
    const result = filterTreeByMode(nestedTree, "diff");
    expect(result).not.toBe(null);

    // Root should exist
    expect(result?.name).toBe("root");
    expect(result?.children).toHaveLength(2);

    // dir1 should have only file1.txt (modified)
    const dir1 = result?.children?.[0];
    expect(dir1?.name).toBe("dir1");
    expect(dir1?.children).toHaveLength(1);
    expect(dir1?.children?.[0]?.name).toBe("file1.txt");

    // dir2 should have file3.txt and file4.txt
    const dir2 = result?.children?.[1];
    expect(dir2?.name).toBe("dir2");
    expect(dir2?.children).toHaveLength(2);
  });

  test("returns null when no changes exist in 'diff' mode", () => {
    const result = filterTreeByMode(unchangedTree, "diff");
    expect(result).toBe(null);
  });

  test("preserves directory structure in 'diff' mode", () => {
    const result = filterTreeByMode(deepTree, "diff");
    expect(result).not.toBe(null);

    // All intermediate directories should exist
    expect(result?.name).toBe("root");
    expect(result?.children?.[0]?.name).toBe("level1");
    expect(result?.children?.[0]?.children?.[0]?.name).toBe("level2");
    expect(result?.children?.[0]?.children?.[0]?.children?.[0]?.name).toBe(
      "level3",
    );
    expect(
      result?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]?.name,
    ).toBe("deep.txt");
  });

  test("handles single file tree in 'diff' mode", () => {
    const resultChanged = filterTreeByMode(singleFileTree, "diff");
    expect(resultChanged).toEqual(singleFileTree);

    const unchangedFile: FileNode = {
      name: "file.txt",
      path: "file.txt",
      isDirectory: false,
      status: undefined,
    };
    const resultUnchanged = filterTreeByMode(unchangedFile, "diff");
    expect(resultUnchanged).toBe(null);
  });

  test("handles empty directory in 'diff' mode", () => {
    const result = filterTreeByMode(emptyDirTree, "diff");
    expect(result).toBe(null);
  });
});

describe("countFilesByStatus", () => {
  test("counts files in simple tree", () => {
    const result = countFilesByStatus(simpleTree);
    expect(result).toEqual({
      total: 2,
      added: 1,
      modified: 1,
      deleted: 0,
      unchanged: 0,
    });
  });

  test("counts files in nested tree", () => {
    const result = countFilesByStatus(nestedTree);
    expect(result).toEqual({
      total: 5,
      added: 1,
      modified: 1,
      deleted: 1,
      unchanged: 2,
    });
  });

  test("counts files in tree with no changes", () => {
    const result = countFilesByStatus(unchangedTree);
    expect(result).toEqual({
      total: 2,
      added: 0,
      modified: 0,
      deleted: 0,
      unchanged: 2,
    });
  });

  test("counts single file", () => {
    const result = countFilesByStatus(singleFileTree);
    expect(result).toEqual({
      total: 1,
      added: 0,
      modified: 1,
      deleted: 0,
      unchanged: 0,
    });
  });

  test("counts empty directory as zero files", () => {
    const result = countFilesByStatus(emptyDirTree);
    expect(result).toEqual({
      total: 0,
      added: 0,
      modified: 0,
      deleted: 0,
      unchanged: 0,
    });
  });

  test("counts deep nested files", () => {
    const result = countFilesByStatus(deepTree);
    expect(result).toEqual({
      total: 1,
      added: 0,
      modified: 1,
      deleted: 0,
      unchanged: 0,
    });
  });

  test("correctly categorizes all status types", () => {
    const allStatusTree: FileNode = {
      name: "root",
      path: "root",
      isDirectory: true,
      children: [
        {
          name: "added.txt",
          path: "root/added.txt",
          isDirectory: false,
          status: "added",
        },
        {
          name: "modified.txt",
          path: "root/modified.txt",
          isDirectory: false,
          status: "modified",
        },
        {
          name: "deleted.txt",
          path: "root/deleted.txt",
          isDirectory: false,
          status: "deleted",
        },
        {
          name: "unchanged.txt",
          path: "root/unchanged.txt",
          isDirectory: false,
          status: undefined,
        },
      ],
    };

    const result = countFilesByStatus(allStatusTree);
    expect(result).toEqual({
      total: 4,
      added: 1,
      modified: 1,
      deleted: 1,
      unchanged: 1,
    });
  });
});

describe("hasChangedChildren", () => {
  test("returns true for directory with changed child", () => {
    const result = hasChangedChildren(simpleTree);
    expect(result).toBe(true);
  });

  test("returns false for directory with no changed children", () => {
    const result = hasChangedChildren(unchangedTree);
    expect(result).toBe(false);
  });

  test("returns true for nested directory with deep changed child", () => {
    const result = hasChangedChildren(deepTree);
    expect(result).toBe(true);
  });

  test("returns true for file with status", () => {
    const file: FileNode = {
      name: "file.txt",
      path: "file.txt",
      isDirectory: false,
      status: "modified",
    };
    const result = hasChangedChildren(file);
    expect(result).toBe(true);
  });

  test("returns false for file without status", () => {
    const file: FileNode = {
      name: "file.txt",
      path: "file.txt",
      isDirectory: false,
      status: undefined,
    };
    const result = hasChangedChildren(file);
    expect(result).toBe(false);
  });

  test("returns false for empty directory", () => {
    const result = hasChangedChildren(emptyDirTree);
    expect(result).toBe(false);
  });

  test("returns true when any descendant has changes", () => {
    // Only dir1/file1.txt has changes
    const rootResult = hasChangedChildren(nestedTree);
    expect(rootResult).toBe(true);

    const dir1 = nestedTree.children?.[0];
    if (dir1) {
      const dir1Result = hasChangedChildren(dir1);
      expect(dir1Result).toBe(true);
    }

    const dir2 = nestedTree.children?.[1];
    if (dir2) {
      const dir2Result = hasChangedChildren(dir2);
      expect(dir2Result).toBe(true);
    }
  });

  test("returns false for directory with only unchanged files", () => {
    const unchangedDir: FileNode = {
      name: "dir",
      path: "dir",
      isDirectory: true,
      children: [
        {
          name: "file1.txt",
          path: "dir/file1.txt",
          isDirectory: false,
          status: undefined,
        },
        {
          name: "file2.txt",
          path: "dir/file2.txt",
          isDirectory: false,
          status: undefined,
        },
      ],
    };

    const result = hasChangedChildren(unchangedDir);
    expect(result).toBe(false);
  });
});

describe("Type safety", () => {
  test("FlatTreeNode type requires correct properties", () => {
    const flatNode: FlatTreeNode = {
      node: simpleTree,
      depth: 0,
      isExpanded: true,
    };

    expect(flatNode.node).toBe(simpleTree);
    expect(flatNode.depth).toBe(0);
    expect(flatNode.isExpanded).toBe(true);
  });

  test("FileStatusCount type requires all status fields", () => {
    const count: FileStatusCount = {
      total: 10,
      added: 2,
      modified: 3,
      deleted: 1,
      unchanged: 4,
    };

    expect(count.total).toBe(10);
    expect(count.added).toBe(2);
    expect(count.modified).toBe(3);
    expect(count.deleted).toBe(1);
    expect(count.unchanged).toBe(4);
  });

  test("functions return readonly arrays", () => {
    const expanded = new Set<string>(["root"]);
    const result = flattenTree(simpleTree, expanded);

    // This should compile - readonly arrays are covariant
    const _readonly: readonly FlatTreeNode[] = result;
    expect(_readonly).toBe(result);
  });

  test("functions accept ReadonlySet parameter", () => {
    const expanded: ReadonlySet<string> = new Set(["root"]);
    const result = flattenTree(simpleTree, expanded);

    expect(result).toHaveLength(3);
  });
});
