import { describe, test, expect } from "bun:test";
import {
  type FileStatus,
  type DiffChunk,
  type DiffChange,
  type WorkingTreeStatus,
  type FileBadge,
  isFileStatusCode,
  createEmptyDiffFile,
  createFileNode,
  createCleanWorkingTreeStatus,
  isWorkingTreeClean,
  getFileBadge,
} from "./git";

describe("Git Types", () => {
  describe("isFileStatusCode", () => {
    test("returns true for valid status codes", () => {
      expect(isFileStatusCode("added")).toBe(true);
      expect(isFileStatusCode("modified")).toBe(true);
      expect(isFileStatusCode("deleted")).toBe(true);
      expect(isFileStatusCode("renamed")).toBe(true);
      expect(isFileStatusCode("copied")).toBe(true);
      expect(isFileStatusCode("untracked")).toBe(true);
      expect(isFileStatusCode("ignored")).toBe(true);
    });

    test("returns false for invalid status codes", () => {
      expect(isFileStatusCode("invalid")).toBe(false);
      expect(isFileStatusCode("")).toBe(false);
      expect(isFileStatusCode("ADDED")).toBe(false);
    });
  });

  describe("createEmptyDiffFile", () => {
    test("creates empty diff file with given path and status", () => {
      const diffFile = createEmptyDiffFile("src/test.ts", "modified");

      expect(diffFile.path).toBe("src/test.ts");
      expect(diffFile.status).toBe("modified");
      expect(diffFile.oldPath).toBeUndefined();
      expect(diffFile.additions).toBe(0);
      expect(diffFile.deletions).toBe(0);
      expect(diffFile.chunks).toEqual([]);
      expect(diffFile.isBinary).toBe(false);
      expect(diffFile.fileSize).toBeUndefined();
    });

    test("works with different status codes", () => {
      const added = createEmptyDiffFile("new.ts", "added");
      expect(added.status).toBe("added");

      const deleted = createEmptyDiffFile("old.ts", "deleted");
      expect(deleted.status).toBe("deleted");
    });
  });

  describe("createFileNode", () => {
    test("creates file node", () => {
      const node = createFileNode("test.ts", "src/test.ts", "file");

      expect(node.name).toBe("test.ts");
      expect(node.path).toBe("src/test.ts");
      expect(node.type).toBe("file");
      expect(node.children).toBeUndefined();
      expect(node.status).toBeUndefined();
      expect(node.isBinary).toBeUndefined();
    });

    test("creates directory node with empty children array", () => {
      const node = createFileNode("src", "src", "directory");

      expect(node.name).toBe("src");
      expect(node.path).toBe("src");
      expect(node.type).toBe("directory");
      expect(node.children).toEqual([]);
    });
  });

  describe("createCleanWorkingTreeStatus", () => {
    test("creates clean working tree status", () => {
      const status = createCleanWorkingTreeStatus();

      expect(status.clean).toBe(true);
      expect(status.staged).toEqual([]);
      expect(status.modified).toEqual([]);
      expect(status.untracked).toEqual([]);
      expect(status.conflicts).toEqual([]);
    });
  });

  describe("isWorkingTreeClean", () => {
    test("returns true for clean working tree", () => {
      const clean: WorkingTreeStatus = {
        clean: true,
        staged: [],
        modified: [],
        untracked: [],
        conflicts: [],
      };

      expect(isWorkingTreeClean(clean)).toBe(true);
    });

    test("returns false when staged files exist", () => {
      const dirty: WorkingTreeStatus = {
        clean: false,
        staged: ["src/test.ts"],
        modified: [],
        untracked: [],
        conflicts: [],
      };

      expect(isWorkingTreeClean(dirty)).toBe(false);
    });

    test("returns false when modified files exist", () => {
      const dirty: WorkingTreeStatus = {
        clean: false,
        staged: [],
        modified: ["src/test.ts"],
        untracked: [],
        conflicts: [],
      };

      expect(isWorkingTreeClean(dirty)).toBe(false);
    });

    test("returns false when untracked files exist", () => {
      const dirty: WorkingTreeStatus = {
        clean: false,
        staged: [],
        modified: [],
        untracked: ["src/new.ts"],
        conflicts: [],
      };

      expect(isWorkingTreeClean(dirty)).toBe(false);
    });

    test("returns false when conflicts exist", () => {
      const dirty: WorkingTreeStatus = {
        clean: false,
        staged: [],
        modified: [],
        untracked: [],
        conflicts: ["src/conflict.ts"],
      };

      expect(isWorkingTreeClean(dirty)).toBe(false);
    });
  });

  describe("Type completeness", () => {
    test("FileStatus has all required fields", () => {
      const status: FileStatus = {
        path: "src/test.ts",
        status: "modified",
        oldPath: undefined,
        staged: true,
      };

      expect(status).toBeDefined();
    });

    test("DiffChunk has all required fields", () => {
      const chunk: DiffChunk = {
        oldStart: 1,
        oldLines: 5,
        newStart: 1,
        newLines: 6,
        header: "@@ -1,5 +1,6 @@",
        changes: [],
      };

      expect(chunk).toBeDefined();
    });

    test("DiffChange has all required fields", () => {
      const change: DiffChange = {
        type: "add",
        oldLine: undefined,
        newLine: 10,
        content: "+new line",
      };

      expect(change).toBeDefined();
    });

    test("DiffChange supports all types", () => {
      const add: DiffChange = {
        type: "add",
        oldLine: undefined,
        newLine: 10,
        content: "+added",
      };

      const del: DiffChange = {
        type: "delete",
        oldLine: 10,
        newLine: undefined,
        content: "-deleted",
      };

      const normal: DiffChange = {
        type: "context",
        oldLine: 10,
        newLine: 10,
        content: " unchanged",
      };

      expect(add.type).toBe("add");
      expect(del.type).toBe("delete");
      expect(normal.type).toBe("context");
    });
  });

  describe("FileBadge", () => {
    test("type allows all badge values", () => {
      const badges: FileBadge[] = ["M", "+", "-", "R", "IMG", "BIN"];
      expect(badges).toHaveLength(6);
    });
  });

  describe("getFileBadge", () => {
    test("returns IMG for image binary files", () => {
      const pngNode = createFileNode("photo.png", "assets/photo.png", "file");
      const pngBinary = { ...pngNode, isBinary: true };
      expect(getFileBadge(pngBinary)).toBe("IMG");

      const jpgNode = createFileNode("photo.jpg", "assets/photo.jpg", "file");
      const jpgBinary = { ...jpgNode, isBinary: true };
      expect(getFileBadge(jpgBinary)).toBe("IMG");

      const jpegNode = createFileNode(
        "photo.jpeg",
        "assets/photo.jpeg",
        "file",
      );
      const jpegBinary = { ...jpegNode, isBinary: true };
      expect(getFileBadge(jpegBinary)).toBe("IMG");

      const gifNode = createFileNode("anim.gif", "assets/anim.gif", "file");
      const gifBinary = { ...gifNode, isBinary: true };
      expect(getFileBadge(gifBinary)).toBe("IMG");

      const svgNode = createFileNode("icon.svg", "assets/icon.svg", "file");
      const svgBinary = { ...svgNode, isBinary: true };
      expect(getFileBadge(svgBinary)).toBe("IMG");

      const webpNode = createFileNode(
        "photo.webp",
        "assets/photo.webp",
        "file",
      );
      const webpBinary = { ...webpNode, isBinary: true };
      expect(getFileBadge(webpBinary)).toBe("IMG");

      const icoNode = createFileNode("fav.ico", "assets/fav.ico", "file");
      const icoBinary = { ...icoNode, isBinary: true };
      expect(getFileBadge(icoBinary)).toBe("IMG");

      const bmpNode = createFileNode("old.bmp", "assets/old.bmp", "file");
      const bmpBinary = { ...bmpNode, isBinary: true };
      expect(getFileBadge(bmpBinary)).toBe("IMG");
    });

    test("returns BIN for non-image binary files", () => {
      const pdfNode = createFileNode("doc.pdf", "docs/doc.pdf", "file");
      const pdfBinary = { ...pdfNode, isBinary: true };
      expect(getFileBadge(pdfBinary)).toBe("BIN");

      const zipNode = createFileNode("archive.zip", "dist/archive.zip", "file");
      const zipBinary = { ...zipNode, isBinary: true };
      expect(getFileBadge(zipBinary)).toBe("BIN");

      const exeNode = createFileNode("app.exe", "bin/app.exe", "file");
      const exeBinary = { ...exeNode, isBinary: true };
      expect(getFileBadge(exeBinary)).toBe("BIN");
    });

    test("returns + for added files", () => {
      const node = createFileNode("new.ts", "src/new.ts", "file");
      const added = { ...node, status: "added" as const };
      expect(getFileBadge(added)).toBe("+");
    });

    test("returns - for deleted files", () => {
      const node = createFileNode("old.ts", "src/old.ts", "file");
      const deleted = { ...node, status: "deleted" as const };
      expect(getFileBadge(deleted)).toBe("-");
    });

    test("returns R for renamed files", () => {
      const node = createFileNode("moved.ts", "src/moved.ts", "file");
      const renamed = { ...node, status: "renamed" as const };
      expect(getFileBadge(renamed)).toBe("R");
    });

    test("returns M for modified files", () => {
      const node = createFileNode("changed.ts", "src/changed.ts", "file");
      const modified = { ...node, status: "modified" as const };
      expect(getFileBadge(modified)).toBe("M");
    });

    test("returns undefined for files with no status", () => {
      const node = createFileNode("file.ts", "src/file.ts", "file");
      expect(getFileBadge(node)).toBeUndefined();
    });

    test("returns ? for untracked status", () => {
      const node = createFileNode("new.ts", "src/new.ts", "file");
      const untracked = { ...node, status: "untracked" as const };
      expect(getFileBadge(untracked)).toBe("?");
    });

    test("returns I for ignored status", () => {
      const node = createFileNode("dist.js", "dist/dist.js", "file");
      const ignored = { ...node, status: "ignored" as const };
      expect(getFileBadge(ignored)).toBe("I");
    });

    test("returns undefined for copied status", () => {
      const node = createFileNode("copy.ts", "src/copy.ts", "file");
      const copied = { ...node, status: "copied" as const };
      expect(getFileBadge(copied)).toBeUndefined();
    });

    test("prioritizes binary badge over status badge", () => {
      const node = createFileNode("image.png", "assets/image.png", "file");
      const modifiedImage = {
        ...node,
        isBinary: true,
        status: "modified" as const,
      };
      expect(getFileBadge(modifiedImage)).toBe("IMG");
    });

    test("handles uppercase extensions case-insensitively", () => {
      const nodeUpper = createFileNode("PHOTO.PNG", "assets/PHOTO.PNG", "file");
      const upperBinary = { ...nodeUpper, isBinary: true };
      expect(getFileBadge(upperBinary)).toBe("IMG");
    });

    test("handles files with no extension", () => {
      const node = createFileNode("Makefile", "Makefile", "file");
      const binary = { ...node, isBinary: true };
      expect(getFileBadge(binary)).toBe("BIN");
    });
  });
});
