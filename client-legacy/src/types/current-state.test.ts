/**
 * Tests for Current State View types
 *
 * Comprehensive tests covering transformToCurrentState function
 * with various diff scenarios and edge cases.
 */

import { describe, test, expect } from "bun:test";
import type { DiffFile, DiffChunk, DiffChange } from "./diff";
import {
  transformToCurrentState,
  type CurrentStateLine,
  type DeletedBlock,
} from "./current-state";

/**
 * Helper: Create a DiffChange
 */
function createChange(
  type: "add" | "delete" | "context",
  content: string,
  oldLine: number | undefined,
  newLine: number | undefined,
): DiffChange {
  return { type, content, oldLine, newLine };
}

/**
 * Helper: Create a DiffChunk
 */
function createChunk(
  changes: readonly DiffChange[],
  oldStart = 1,
  newStart = 1,
): DiffChunk {
  const oldLines = changes.filter(
    (c) => c.type === "delete" || c.type === "context",
  ).length;
  const newLines = changes.filter(
    (c) => c.type === "add" || c.type === "context",
  ).length;

  return {
    header: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`,
    oldStart,
    oldLines,
    newStart,
    newLines,
    changes,
  };
}

/**
 * Helper: Create a DiffFile
 */
function createDiffFile(chunks: readonly DiffChunk[]): DiffFile {
  const additions = chunks.reduce(
    (sum, chunk) => sum + chunk.changes.filter((c) => c.type === "add").length,
    0,
  );
  const deletions = chunks.reduce(
    (sum, chunk) =>
      sum + chunk.changes.filter((c) => c.type === "delete").length,
    0,
  );

  return {
    path: "test.txt",
    status: "modified",
    additions,
    deletions,
    chunks,
  };
}

describe("transformToCurrentState", () => {
  test("transforms empty file to empty array", () => {
    const file = createDiffFile([]);
    const result = transformToCurrentState(file);

    expect(result).toEqual([]);
  });

  test("transforms file with only context lines", () => {
    const chunk = createChunk([
      createChange("context", "line 1", 1, 1),
      createChange("context", "line 2", 2, 2),
      createChange("context", "line 3", 3, 3),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      lineNumber: 1,
      content: "line 1",
      changeType: "unchanged",
      deletedBefore: undefined,
    });
    expect(result[1]).toEqual({
      lineNumber: 2,
      content: "line 2",
      changeType: "unchanged",
      deletedBefore: undefined,
    });
    expect(result[2]).toEqual({
      lineNumber: 3,
      content: "line 3",
      changeType: "unchanged",
      deletedBefore: undefined,
    });
  });

  test("transforms file with only additions", () => {
    const chunk = createChunk([
      createChange("add", "new line 1", undefined, 1),
      createChange("add", "new line 2", undefined, 2),
      createChange("add", "new line 3", undefined, 3),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(3);
    expect(result[0]?.changeType).toBe("added");
    expect(result[0]?.content).toBe("new line 1");
    expect(result[1]?.changeType).toBe("added");
    expect(result[2]?.changeType).toBe("added");
  });

  test("transforms file with only deletions", () => {
    const chunk = createChunk([
      createChange("delete", "deleted line 1", 1, undefined),
      createChange("delete", "deleted line 2", 2, undefined),
      createChange("delete", "deleted line 3", 3, undefined),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    // All deletions result in a synthetic end-of-file marker
    expect(result).toHaveLength(1);
    expect(result[0]?.lineNumber).toBe(1);
    expect(result[0]?.content).toBe("");
    expect(result[0]?.changeType).toBe("unchanged");
    expect(result[0]?.deletedBefore).not.toBe(undefined);

    const deletedBlock = result[0]?.deletedBefore;
    expect(deletedBlock?.lines).toEqual([
      "deleted line 1",
      "deleted line 2",
      "deleted line 3",
    ]);
    expect(deletedBlock?.originalStart).toBe(1);
    expect(deletedBlock?.originalEnd).toBe(3);
    expect(deletedBlock?.id).toBe("deleted-1-3");
  });

  test("transforms file with deletion followed by addition", () => {
    const chunk = createChunk([
      createChange("context", "unchanged line 1", 1, 1),
      createChange("delete", "old line 2", 2, undefined),
      createChange("add", "new line 2", undefined, 2),
      createChange("context", "unchanged line 3", 3, 3),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(3);

    // Line 1: unchanged, no deleted block
    expect(result[0]).toEqual({
      lineNumber: 1,
      content: "unchanged line 1",
      changeType: "unchanged",
      deletedBefore: undefined,
    });

    // Line 2: added, with deleted block before it
    expect(result[1]?.lineNumber).toBe(2);
    expect(result[1]?.content).toBe("new line 2");
    expect(result[1]?.changeType).toBe("added");
    expect(result[1]?.deletedBefore).not.toBe(undefined);
    expect(result[1]?.deletedBefore?.lines).toEqual(["old line 2"]);
    expect(result[1]?.deletedBefore?.id).toBe("deleted-2-2");

    // Line 3: unchanged, no deleted block
    expect(result[2]).toEqual({
      lineNumber: 3,
      content: "unchanged line 3",
      changeType: "unchanged",
      deletedBefore: undefined,
    });
  });

  test("transforms file with multiple deleted blocks", () => {
    const chunk = createChunk([
      createChange("context", "line 1", 1, 1),
      createChange("delete", "deleted A1", 2, undefined),
      createChange("delete", "deleted A2", 3, undefined),
      createChange("context", "line 2", 4, 2),
      createChange("delete", "deleted B1", 5, undefined),
      createChange("add", "added line", undefined, 3),
      createChange("context", "line 3", 6, 4),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(4);

    // Line 1: unchanged, no deletion
    expect(result[0]?.deletedBefore).toBe(undefined);

    // Line 2: unchanged, with deleted block A before it
    expect(result[1]?.lineNumber).toBe(2);
    expect(result[1]?.content).toBe("line 2");
    expect(result[1]?.deletedBefore?.lines).toEqual([
      "deleted A1",
      "deleted A2",
    ]);
    expect(result[1]?.deletedBefore?.id).toBe("deleted-2-3");

    // Line 3: added, with deleted block B before it
    expect(result[2]?.lineNumber).toBe(3);
    expect(result[2]?.content).toBe("added line");
    expect(result[2]?.changeType).toBe("added");
    expect(result[2]?.deletedBefore?.lines).toEqual(["deleted B1"]);
    expect(result[2]?.deletedBefore?.id).toBe("deleted-5-5");

    // Line 4: unchanged, no deletion
    expect(result[3]?.lineNumber).toBe(4);
    expect(result[3]?.deletedBefore).toBe(undefined);
  });

  test("transforms file with deletion at end", () => {
    const chunk = createChunk([
      createChange("context", "line 1", 1, 1),
      createChange("context", "line 2", 2, 2),
      createChange("delete", "deleted end 1", 3, undefined),
      createChange("delete", "deleted end 2", 4, undefined),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(3);

    // Lines 1 and 2: unchanged
    expect(result[0]?.lineNumber).toBe(1);
    expect(result[1]?.lineNumber).toBe(2);

    // Synthetic end-of-file line with deleted block
    expect(result[2]?.lineNumber).toBe(3);
    expect(result[2]?.content).toBe("");
    expect(result[2]?.changeType).toBe("unchanged");
    expect(result[2]?.deletedBefore).not.toBe(undefined);
    expect(result[2]?.deletedBefore?.lines).toEqual([
      "deleted end 1",
      "deleted end 2",
    ]);
    expect(result[2]?.deletedBefore?.id).toBe("deleted-3-4");
  });

  test("transforms file with complex mixed changes", () => {
    const chunk = createChunk([
      createChange("context", "header", 1, 1),
      createChange("add", "import A", undefined, 2),
      createChange("add", "import B", undefined, 3),
      createChange("context", "function foo() {", 2, 4),
      createChange("delete", "  old implementation", 3, undefined),
      createChange("add", "  new implementation", undefined, 5),
      createChange("context", "}", 4, 6),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(6);

    // Line 1: unchanged
    expect(result[0]).toEqual({
      lineNumber: 1,
      content: "header",
      changeType: "unchanged",
      deletedBefore: undefined,
    });

    // Lines 2-3: added imports
    expect(result[1]?.lineNumber).toBe(2);
    expect(result[1]?.changeType).toBe("added");
    expect(result[2]?.lineNumber).toBe(3);
    expect(result[2]?.changeType).toBe("added");

    // Line 4: unchanged
    expect(result[3]?.lineNumber).toBe(4);
    expect(result[3]?.changeType).toBe("unchanged");

    // Line 5: added, with deletion before it
    expect(result[4]?.lineNumber).toBe(5);
    expect(result[4]?.content).toBe("  new implementation");
    expect(result[4]?.changeType).toBe("added");
    expect(result[4]?.deletedBefore?.lines).toEqual(["  old implementation"]);

    // Line 6: unchanged
    expect(result[5]?.lineNumber).toBe(6);
    expect(result[5]?.changeType).toBe("unchanged");
  });

  test("handles multiple chunks", () => {
    const chunk1 = createChunk(
      [
        createChange("context", "line 1", 1, 1),
        createChange("add", "added in chunk 1", undefined, 2),
      ],
      1,
      1,
    );

    const chunk2 = createChunk(
      [
        createChange("context", "line 10", 10, 10),
        createChange("delete", "deleted in chunk 2", 11, undefined),
        createChange("context", "line 12", 12, 11),
      ],
      10,
      10,
    );

    const file = createDiffFile([chunk1, chunk2]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(4);

    // Chunk 1 results
    expect(result[0]?.lineNumber).toBe(1);
    expect(result[1]?.lineNumber).toBe(2);
    expect(result[1]?.changeType).toBe("added");

    // Chunk 2 results
    expect(result[2]?.lineNumber).toBe(10);
    expect(result[3]?.lineNumber).toBe(11);
    expect(result[3]?.deletedBefore?.lines).toEqual(["deleted in chunk 2"]);
  });

  test("generates unique IDs for deleted blocks", () => {
    const chunk = createChunk([
      createChange("delete", "deleted 1-2", 1, undefined),
      createChange("delete", "deleted 1-2", 2, undefined),
      createChange("context", "separator", 3, 1),
      createChange("delete", "deleted 4-5", 4, undefined),
      createChange("delete", "deleted 4-5", 5, undefined),
      createChange("context", "end", 6, 2),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    const block1 = result[0]?.deletedBefore;
    const block2 = result[1]?.deletedBefore;

    expect(block1?.id).toBe("deleted-1-2");
    expect(block2?.id).toBe("deleted-4-5");
    expect(block1?.id).not.toBe(block2?.id);
  });

  test("handles empty chunks", () => {
    const file = createDiffFile([createChunk([])]);
    const result = transformToCurrentState(file);

    expect(result).toEqual([]);
  });

  test("handles file with single addition", () => {
    const chunk = createChunk([
      createChange("add", "single line", undefined, 1),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      lineNumber: 1,
      content: "single line",
      changeType: "added",
      deletedBefore: undefined,
    });
  });

  test("handles file with single deletion", () => {
    const chunk = createChunk([
      createChange("delete", "single deleted", 1, undefined),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe("");
    expect(result[0]?.deletedBefore?.lines).toEqual(["single deleted"]);
  });

  test("preserves line content exactly", () => {
    const specialContent = "  \ttab\tand  spaces  \n";
    const chunk = createChunk([
      createChange("add", specialContent, undefined, 1),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result[0]?.content).toBe(specialContent);
  });

  test("handles very long deleted block", () => {
    const deletedLines = Array.from({ length: 100 }, (_, i) =>
      createChange("delete", `deleted line ${i + 1}`, i + 1, undefined),
    );
    const chunk = createChunk([
      ...deletedLines,
      createChange("context", "after deletion", 101, 1),
    ]);
    const file = createDiffFile([chunk]);
    const result = transformToCurrentState(file);

    expect(result).toHaveLength(1);
    expect(result[0]?.deletedBefore?.lines).toHaveLength(100);
    expect(result[0]?.deletedBefore?.originalStart).toBe(1);
    expect(result[0]?.deletedBefore?.originalEnd).toBe(100);
  });
});

describe("DeletedBlock", () => {
  test("has correct structure", () => {
    const block: DeletedBlock = {
      id: "deleted-1-3",
      lines: ["line 1", "line 2", "line 3"],
      originalStart: 1,
      originalEnd: 3,
    };

    expect(block.id).toBe("deleted-1-3");
    expect(block.lines).toHaveLength(3);
    expect(block.originalStart).toBe(1);
    expect(block.originalEnd).toBe(3);
  });

  test("lines are readonly", () => {
    const block: DeletedBlock = {
      id: "test",
      lines: ["line 1"],
      originalStart: 1,
      originalEnd: 1,
    };

    // This should compile - readonly arrays are covariant
    const _readonly: readonly string[] = block.lines;
    expect(_readonly).toBe(block.lines);
  });
});

describe("CurrentStateLine", () => {
  test("has correct structure", () => {
    const line: CurrentStateLine = {
      lineNumber: 42,
      content: "test content",
      changeType: "modified",
      deletedBefore: undefined,
    };

    expect(line.lineNumber).toBe(42);
    expect(line.content).toBe("test content");
    expect(line.changeType).toBe("modified");
    expect(line.deletedBefore).toBe(undefined);
  });

  test("supports all change types", () => {
    const added: CurrentStateLine = {
      lineNumber: 1,
      content: "added",
      changeType: "added",
    };

    const modified: CurrentStateLine = {
      lineNumber: 2,
      content: "modified",
      changeType: "modified",
    };

    const unchanged: CurrentStateLine = {
      lineNumber: 3,
      content: "unchanged",
      changeType: "unchanged",
    };

    expect(added.changeType).toBe("added");
    expect(modified.changeType).toBe("modified");
    expect(unchanged.changeType).toBe("unchanged");
  });

  test("deletedBefore is optional", () => {
    const withoutDeleted: CurrentStateLine = {
      lineNumber: 1,
      content: "line",
      changeType: "unchanged",
    };

    const withDeleted: CurrentStateLine = {
      lineNumber: 2,
      content: "line",
      changeType: "unchanged",
      deletedBefore: {
        id: "deleted-1-1",
        lines: ["deleted"],
        originalStart: 1,
        originalEnd: 1,
      },
    };

    expect(withoutDeleted.deletedBefore).toBe(undefined);
    expect(withDeleted.deletedBefore).not.toBe(undefined);
  });
});

describe("Type safety", () => {
  test("transformToCurrentState returns readonly array", () => {
    const file = createDiffFile([]);
    const result = transformToCurrentState(file);

    // This should compile - readonly arrays are covariant
    const _readonly: readonly CurrentStateLine[] = result;
    expect(_readonly).toBe(result);
  });

  test("all properties are readonly at compile time", () => {
    const line: CurrentStateLine = {
      lineNumber: 1,
      content: "test",
      changeType: "added",
      deletedBefore: {
        id: "test",
        lines: ["deleted"],
        originalStart: 1,
        originalEnd: 1,
      },
    };

    // TypeScript's readonly keyword is a compile-time only constraint.
    // The @ts-expect-error comments below verify that TypeScript correctly
    // reports errors when attempting to assign to readonly properties.
    // NOTE: At runtime, JavaScript does allow these assignments because
    // TypeScript's readonly does not add Object.freeze() or similar.

    // @ts-expect-error - readonly property (compile-time check)
    line.lineNumber = 2;
    // @ts-expect-error - readonly property (compile-time check)
    line.content = "modified";
    // @ts-expect-error - readonly property (compile-time check)
    line.changeType = "modified";

    // The test verifies that @ts-expect-error comments are correctly placed
    // (if readonly wasn't working, these would cause TypeScript errors)
    // Runtime values will be modified because readonly is compile-time only
    expect(line).toBeDefined();
  });
});
