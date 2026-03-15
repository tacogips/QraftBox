import { describe, expect, test } from "bun:test";
import {
  buildDiffFileTree,
  collectAncestorDirectoryPaths,
  convertServerFileTree,
  insertChildrenIntoFileTree,
} from "./files";

describe("shared file contracts", () => {
  test("builds a directory-first tree from diff files", () => {
    const tree = buildDiffFileTree([
      {
        path: "src/app/main.ts",
        status: "modified",
        additions: 3,
        deletions: 1,
        chunks: [],
        isBinary: false,
      },
      {
        path: "README.md",
        status: "added",
        additions: 1,
        deletions: 0,
        chunks: [],
        isBinary: false,
      },
    ]);

    expect(tree.children?.map((childNode) => childNode.path)).toEqual([
      "src",
      "README.md",
    ]);
    expect(tree.children?.[0]?.children?.[0]?.path).toBe("src/app");
  });

  test("converts server file tree nodes to the shared client shape", () => {
    expect(
      convertServerFileTree({
        name: "src",
        path: "src",
        type: "directory",
        children: [
          {
            name: "main.ts",
            path: "src/main.ts",
            type: "file",
            status: "modified",
          },
        ],
      }),
    ).toEqual({
      name: "src",
      path: "src",
      isDirectory: true,
      children: [
        {
          name: "main.ts",
          path: "src/main.ts",
          isDirectory: false,
          status: "modified",
          isBinary: undefined,
        },
      ],
      status: undefined,
      isBinary: undefined,
    });
  });

  test("inserts lazy-loaded children into the matching directory", () => {
    const tree = convertServerFileTree({
      name: "",
      path: "",
      type: "directory",
      children: [
        {
          name: "src",
          path: "src",
          type: "directory",
        },
      ],
    });

    expect(
      insertChildrenIntoFileTree(tree, "src", [
        {
          name: "main.ts",
          path: "src/main.ts",
          isDirectory: false,
        },
      ]),
    ).toEqual({
      name: "",
      path: "",
      isDirectory: true,
      children: [
        {
          name: "src",
          path: "src",
          isDirectory: true,
          children: [
            {
              name: "main.ts",
              path: "src/main.ts",
              isDirectory: false,
            },
          ],
        },
      ],
      status: undefined,
      isBinary: undefined,
    });
  });

  test("collects ancestor directory paths for a file selection", () => {
    expect(collectAncestorDirectoryPaths("src/app/main.ts")).toEqual([
      "src",
      "src/app",
    ]);
    expect(collectAncestorDirectoryPaths("README.md")).toEqual([]);
  });
});
