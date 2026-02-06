/**
 * Unit tests for git diff parser
 */

import { describe, test, expect } from "vitest";
import {
  parseDiff,
  parseFileDiff,
  parseChunkHeader,
  detectBinary,
} from "./parser";

describe("parseChunkHeader", () => {
  test("should parse standard chunk header with line counts", () => {
    const result = parseChunkHeader("@@ -10,5 +12,7 @@ function foo()");
    expect(result).toEqual({
      oldStart: 10,
      oldLines: 5,
      newStart: 12,
      newLines: 7,
    });
  });

  test("should parse chunk header without context text", () => {
    const result = parseChunkHeader("@@ -1,3 +1,4 @@");
    expect(result).toEqual({
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 4,
    });
  });

  test("should parse single-line chunk header (no line count)", () => {
    const result = parseChunkHeader("@@ -1 +1 @@");
    expect(result).toEqual({
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
    });
  });

  test("should parse chunk with only old line count", () => {
    const result = parseChunkHeader("@@ -5,3 +5 @@");
    expect(result).toEqual({
      oldStart: 5,
      oldLines: 3,
      newStart: 5,
      newLines: 1,
    });
  });

  test("should parse chunk with only new line count", () => {
    const result = parseChunkHeader("@@ -5 +5,3 @@");
    expect(result).toEqual({
      oldStart: 5,
      oldLines: 1,
      newStart: 5,
      newLines: 3,
    });
  });

  test("should return zeros for malformed header", () => {
    const result = parseChunkHeader("not a valid header");
    expect(result).toEqual({
      oldStart: 0,
      oldLines: 0,
      newStart: 0,
      newLines: 0,
    });
  });
});

describe("detectBinary", () => {
  test("should detect binary files from diff marker", () => {
    const diff = "Binary files a/image.png and b/image.png differ";
    expect(detectBinary(diff, "image.png")).toBe(true);
  });

  test("should detect binary files by extension", () => {
    const diff = "some diff output";
    expect(detectBinary(diff, "photo.jpg")).toBe(true);
    expect(detectBinary(diff, "archive.zip")).toBe(true);
    expect(detectBinary(diff, "lib.so")).toBe(true);
  });

  test("should not detect text files as binary", () => {
    const diff = "diff --git a/file.ts b/file.ts";
    expect(detectBinary(diff, "file.ts")).toBe(false);
    expect(detectBinary(diff, "README.md")).toBe(false);
    expect(detectBinary(diff, "config.json")).toBe(false);
  });

  test("should be case insensitive for extensions", () => {
    const diff = "some diff";
    expect(detectBinary(diff, "IMAGE.PNG")).toBe(true);
    expect(detectBinary(diff, "Archive.ZIP")).toBe(true);
  });
});

describe("parseFileDiff", () => {
  test("should parse simple modification (one chunk)", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
 const a = 5;`;

    const result = parseFileDiff(diff);

    expect(result.path).toBe("file.ts");
    expect(result.status).toBe("modified");
    expect(result.oldPath).toBeUndefined();
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(1);
    expect(result.isBinary).toBe(false);
    expect(result.chunks.length).toBe(1);

    const chunk = result.chunks[0];
    expect(chunk).toBeDefined();
    if (chunk === undefined) return;

    expect(chunk.oldStart).toBe(1);
    expect(chunk.oldLines).toBe(3);
    expect(chunk.newStart).toBe(1);
    expect(chunk.newLines).toBe(4);
    expect(chunk.changes.length).toBe(5);

    // Verify change types
    expect(chunk.changes[0]?.type).toBe("normal");
    expect(chunk.changes[1]?.type).toBe("del");
    expect(chunk.changes[2]?.type).toBe("add");
    expect(chunk.changes[3]?.type).toBe("add");
    expect(chunk.changes[4]?.type).toBe("normal");
  });

  test("should parse new file (added)", () => {
    const diff = `diff --git a/new-file.ts b/new-file.ts
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,2 @@
+export const greeting = "Hello";
+export const name = "World";`;

    const result = parseFileDiff(diff);

    expect(result.path).toBe("new-file.ts");
    expect(result.status).toBe("added");
    expect(result.oldPath).toBeUndefined();
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(0);
    expect(result.chunks.length).toBe(1);
  });

  test("should parse deleted file", () => {
    const diff = `diff --git a/old-file.ts b/old-file.ts
--- a/old-file.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const foo = 1;
-export const bar = 2;`;

    const result = parseFileDiff(diff);

    expect(result.path).toBe("old-file.ts");
    expect(result.status).toBe("deleted");
    expect(result.oldPath).toBeUndefined();
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(2);
    expect(result.chunks.length).toBe(1);
  });

  test("should parse renamed file", () => {
    const diff = `diff --git a/old-name.ts b/new-name.ts
rename from old-name.ts
rename to new-name.ts`;

    const result = parseFileDiff(diff);

    expect(result.path).toBe("new-name.ts");
    expect(result.status).toBe("renamed");
    expect(result.oldPath).toBe("old-name.ts");
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.chunks.length).toBe(0);
  });

  test("should parse copied file", () => {
    const diff = `diff --git a/original.ts b/copy.ts
copy from original.ts
copy to copy.ts`;

    const result = parseFileDiff(diff);

    expect(result.path).toBe("copy.ts");
    expect(result.status).toBe("copied");
    expect(result.oldPath).toBe("original.ts");
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.chunks.length).toBe(0);
  });

  test("should parse binary file", () => {
    const diff = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ`;

    const result = parseFileDiff(diff);

    expect(result.path).toBe("image.png");
    expect(result.isBinary).toBe(true);
    expect(result.chunks.length).toBe(0);
  });

  test("should parse multiple chunks in one file", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line 1
-line 2
+line 2 modified
+line 2.5
 line 3
@@ -10,2 +11,3 @@
 line 10
+line 10.5
 line 11`;

    const result = parseFileDiff(diff);

    expect(result.chunks.length).toBe(2);
    expect(result.additions).toBe(3);
    expect(result.deletions).toBe(1);

    const chunk1 = result.chunks[0];
    expect(chunk1).toBeDefined();
    if (chunk1 === undefined) return;
    expect(chunk1.oldStart).toBe(1);

    const chunk2 = result.chunks[1];
    expect(chunk2).toBeDefined();
    if (chunk2 === undefined) return;
    expect(chunk2.oldStart).toBe(10);
  });

  test("should handle no newline at end of file marker", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
 line 1
-line 2
\\ No newline at end of file
+line 2
\\ No newline at end of file`;

    const result = parseFileDiff(diff);

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);

    const chunk = result.chunks[0];
    expect(chunk).toBeDefined();
    if (chunk === undefined) return;

    // Should not include the "\ No newline" marker as a change
    const changeTypes = chunk.changes.map((c) => c.type);
    expect(changeTypes).toEqual(["normal", "del", "add"]);
  });

  test("should track line numbers correctly", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -5,4 +5,5 @@
 context line 1
-deleted line
 context line 2
+added line 1
+added line 2
 context line 3`;

    const result = parseFileDiff(diff);

    const chunk = result.chunks[0];
    expect(chunk).toBeDefined();
    if (chunk === undefined) return;

    const changes = chunk.changes;

    // First context line: old=5, new=5
    expect(changes[0]?.oldLine).toBe(5);
    expect(changes[0]?.newLine).toBe(5);

    // Deleted line: old=6, new=undefined
    expect(changes[1]?.oldLine).toBe(6);
    expect(changes[1]?.newLine).toBeUndefined();

    // Second context line: old=7, new=6
    expect(changes[2]?.oldLine).toBe(7);
    expect(changes[2]?.newLine).toBe(6);

    // Added line 1: old=undefined, new=7
    expect(changes[3]?.oldLine).toBeUndefined();
    expect(changes[3]?.newLine).toBe(7);

    // Added line 2: old=undefined, new=8
    expect(changes[4]?.oldLine).toBeUndefined();
    expect(changes[4]?.newLine).toBe(8);

    // Third context line: old=8, new=9
    expect(changes[5]?.oldLine).toBe(8);
    expect(changes[5]?.newLine).toBe(9);
  });
});

describe("parseDiff", () => {
  test("should return empty array for empty diff", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("   ")).toEqual([]);
    expect(parseDiff("\n\n")).toEqual([]);
  });

  test("should parse single file diff", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,3 @@
 line 1
+line 1.5
 line 2`;

    const result = parseDiff(diff);

    expect(result.length).toBe(1);
    const file = result[0];
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(file.path).toBe("file.ts");
    expect(file.additions).toBe(1);
  });

  test("should parse multiple files in one diff", () => {
    const diff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,3 @@
 line 1
+added line
 line 2
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1,2 +1,2 @@
-old line
+new line
 line 2`;

    const result = parseDiff(diff);

    expect(result.length).toBe(2);

    const file1 = result[0];
    expect(file1).toBeDefined();
    if (file1 === undefined) return;
    expect(file1.path).toBe("file1.ts");
    expect(file1.additions).toBe(1);

    const file2 = result[1];
    expect(file2).toBeDefined();
    if (file2 === undefined) return;
    expect(file2.path).toBe("file2.ts");
    expect(file2.additions).toBe(1);
    expect(file2.deletions).toBe(1);
  });

  test("should parse complex multi-file diff with various operations", () => {
    const diff = `diff --git a/new-file.ts b/new-file.ts
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,1 @@
+export const x = 1;
diff --git a/modified.ts b/modified.ts
--- a/modified.ts
+++ b/modified.ts
@@ -1,1 +1,1 @@
-old
+new
diff --git a/deleted.ts b/deleted.ts
--- a/deleted.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-deleted content
diff --git a/old-name.ts b/new-name.ts
rename from old-name.ts
rename to new-name.ts
diff --git a/binary.png b/binary.png
Binary files a/binary.png and b/binary.png differ`;

    const result = parseDiff(diff);

    expect(result.length).toBe(5);

    // Check statuses
    expect(result[0]?.status).toBe("added");
    expect(result[1]?.status).toBe("modified");
    expect(result[2]?.status).toBe("deleted");
    expect(result[3]?.status).toBe("renamed");
    expect(result[4]?.isBinary).toBe(true);
  });

  test("should handle renamed file with content changes", () => {
    const diff = `diff --git a/old.ts b/new.ts
rename from old.ts
rename to new.ts
--- a/old.ts
+++ b/new.ts
@@ -1,2 +1,3 @@
 line 1
+added line
 line 2`;

    const result = parseDiff(diff);

    expect(result.length).toBe(1);
    const file = result[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    expect(file.path).toBe("new.ts");
    expect(file.status).toBe("renamed");
    expect(file.oldPath).toBe("old.ts");
    expect(file.additions).toBe(1);
    expect(file.chunks.length).toBe(1);
  });

  test("should parse files with special characters in path", () => {
    const diff = `diff --git a/src/components/file-tree.tsx b/src/components/file-tree.tsx
--- a/src/components/file-tree.tsx
+++ b/src/components/file-tree.tsx
@@ -1,1 +1,2 @@
 export const FileTree = () => {};
+export const DirectoryNode = () => {};`;

    const result = parseDiff(diff);

    expect(result.length).toBe(1);
    const file = result[0];
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(file.path).toBe("src/components/file-tree.tsx");
  });

  test("should handle empty chunks gracefully", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts`;

    const result = parseDiff(diff);

    expect(result.length).toBe(1);
    const file = result[0];
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(file.path).toBe("file.ts");
    expect(file.chunks.length).toBe(0);
    expect(file.additions).toBe(0);
    expect(file.deletions).toBe(0);
  });

  test("should preserve content correctly", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 const greeting = "Hello, World!";
-const count = 42;
+const count = 100;
 export { greeting, count };`;

    const result = parseDiff(diff);

    const file = result[0];
    expect(file).toBeDefined();
    if (file === undefined) return;

    const chunk = file.chunks[0];
    expect(chunk).toBeDefined();
    if (chunk === undefined) return;

    const changes = chunk.changes;

    // Check content preservation (content is without the +/- prefix)
    expect(changes[0]?.content).toBe('const greeting = "Hello, World!";');
    expect(changes[1]?.content).toBe("const count = 42;");
    expect(changes[2]?.content).toBe("const count = 100;");
    expect(changes[3]?.content).toBe("export { greeting, count };");
  });
});
