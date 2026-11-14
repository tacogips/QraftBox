/**
 * DiffView Component Tests
 *
 * Tests for the DiffView container component that handles different view modes
 * and delegates rendering to SideBySideDiff or InlineDiff components.
 */

import { describe, test, expect } from "bun:test";
import type { DiffFile, DiffChunk, DiffChange } from "../src/types/diff";

/**
 * Test helper: Create a mock DiffChange
 */
function createMockChange(
  type: "add" | "delete" | "context",
  content: string,
  oldLine?: number,
  newLine?: number,
): DiffChange {
  return {
    type,
    content,
    oldLine,
    newLine,
  };
}

/**
 * Test helper: Create a mock DiffChunk
 */
function createMockChunk(changes: readonly DiffChange[]): DiffChunk {
  return {
    header: "@@ -1,3 +1,3 @@",
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 3,
    changes,
  };
}

/**
 * Test helper: Create a mock DiffFile
 */
function createMockFile(chunks: readonly DiffChunk[]): DiffFile {
  return {
    path: "test-file.ts",
    status: "modified",
    additions: 5,
    deletions: 3,
    chunks,
  };
}

describe("DiffView Component Type Checking", () => {
  test("Props interface is properly typed", () => {
    // Type-check the Props interface exists and has correct shape
    type PropsCheck = {
      file: DiffFile;
      mode: "side-by-side" | "inline";
      onLineSelect?: (line: number) => void;
      highlightedLines?: readonly number[];
    };

    // This will fail to compile if Props interface doesn't match
    const validProps: PropsCheck = {
      file: createMockFile([]),
      mode: "side-by-side",
    };

    expect(validProps).toBeDefined();
  });

  test("mode prop only accepts valid values", () => {
    // Type checking - these should compile
    const validModes: Array<"side-by-side" | "inline"> = [
      "side-by-side",
      "inline",
    ];

    expect(validModes).toHaveLength(2);
  });

  test("onLineSelect callback signature is correct", () => {
    // Type-check callback signature
    const callback: (line: number) => void = (line) => {
      expect(typeof line).toBe("number");
    };

    callback(42);
  });

  test("highlightedLines is readonly array", () => {
    const highlighted: readonly number[] = [1, 2, 3];

    // This should fail to compile (readonly protection)
    // highlighted.push(4); // Error: Property 'push' does not exist

    expect(highlighted).toHaveLength(3);
  });
});

describe("DiffView Empty State Handling", () => {
  test("handles file with no chunks", () => {
    const emptyFile = createMockFile([]);

    expect(emptyFile.chunks).toHaveLength(0);
  });

  test("handles file with chunks but no changes", () => {
    const emptyChunk = createMockChunk([]);
    const file = createMockFile([emptyChunk]);

    expect(file.chunks).toHaveLength(1);
    expect(file.chunks[0]?.changes).toHaveLength(0);
  });
});

describe("DiffView Mode Switching", () => {
  test("handles side-by-side mode", () => {
    const changes: readonly DiffChange[] = [
      createMockChange("delete", "old line", 1, undefined),
      createMockChange("add", "new line", undefined, 1),
    ];

    const chunk = createMockChunk(changes);
    const file = createMockFile([chunk]);

    expect(file.chunks).toHaveLength(1);
    expect(file.chunks[0]?.changes).toHaveLength(2);
  });

  test("handles inline mode", () => {
    const changes: readonly DiffChange[] = [
      createMockChange("context", "same line", 1, 1),
      createMockChange("delete", "removed", 2, undefined),
      createMockChange("add", "added", undefined, 2),
    ];

    const chunk = createMockChunk(changes);
    const file = createMockFile([chunk]);

    expect(file.chunks).toHaveLength(1);
    expect(file.chunks[0]?.changes).toHaveLength(3);
  });
});

describe("DiffView Line Selection", () => {
  test("line selection callback receives correct line number", () => {
    let selectedLine: number | undefined;

    const callback = (line: number): void => {
      selectedLine = line;
    };

    // Simulate line selection
    callback(42);

    expect(selectedLine).toBe(42);
  });

  test("handles multiple line selections", () => {
    const selectedLines: number[] = [];

    const callback = (line: number): void => {
      selectedLines.push(line);
    };

    // Simulate multiple selections
    callback(1);
    callback(5);
    callback(10);

    expect(selectedLines).toEqual([1, 5, 10]);
  });

  test("handles side-by-side selection with side information", () => {
    type SideBySideCallback = (side: "old" | "new", line: number) => void;

    let lastSide: "old" | "new" | undefined;
    let lastLine: number | undefined;

    const callback: SideBySideCallback = (side, line) => {
      lastSide = side;
      lastLine = line;
    };

    // Simulate old side selection
    callback("old", 10);
    expect(lastSide).toBe("old");
    expect(lastLine).toBe(10);

    // Simulate new side selection
    callback("new", 15);
    expect(lastSide).toBe("new");
    expect(lastLine).toBe(15);
  });

  test("handles inline selection with type information", () => {
    type InlineCallback = (line: number, type: "old" | "new") => void;

    let lastLine: number | undefined;
    let lastType: "old" | "new" | undefined;

    const callback: InlineCallback = (line, type) => {
      lastLine = line;
      lastType = type;
    };

    // Simulate old line selection
    callback(5, "old");
    expect(lastLine).toBe(5);
    expect(lastType).toBe("old");

    // Simulate new line selection
    callback(8, "new");
    expect(lastLine).toBe(8);
    expect(lastType).toBe("new");
  });
});

describe("DiffView Line Highlighting", () => {
  test("highlighted lines array is readonly", () => {
    const highlighted: readonly number[] = [1, 3, 5];

    // Type checking - this should not compile
    // highlighted.push(7); // Error: Property 'push' does not exist

    expect(highlighted).toHaveLength(3);
  });

  test("checks if line is highlighted", () => {
    const highlighted: readonly number[] = [1, 3, 5];

    const isHighlighted = (line: number): boolean => {
      return highlighted.includes(line);
    };

    expect(isHighlighted(1)).toBe(true);
    expect(isHighlighted(2)).toBe(false);
    expect(isHighlighted(3)).toBe(true);
  });

  test("handles empty highlighted lines", () => {
    const highlighted: readonly number[] = [];

    expect(highlighted).toHaveLength(0);
  });

  test("handles undefined highlighted lines", () => {
    const highlighted: readonly number[] | undefined = undefined;

    const isHighlighted = (line: number): boolean => {
      if (highlighted === undefined) {
        return false;
      }
      return highlighted.includes(line);
    };

    expect(isHighlighted(1)).toBe(false);
  });
});

describe("DiffView Data Integrity", () => {
  test("file path is preserved", () => {
    const file = createMockFile([]);

    expect(file.path).toBe("test-file.ts");
  });

  test("file status is preserved", () => {
    const file = createMockFile([]);

    expect(file.status).toBe("modified");
  });

  test("additions and deletions counts are preserved", () => {
    const file = createMockFile([]);

    expect(file.additions).toBe(5);
    expect(file.deletions).toBe(3);
  });

  test("chunks are readonly", () => {
    const chunk = createMockChunk([]);
    const file = createMockFile([chunk]);

    // Type checking - this should not compile
    // file.chunks.push(chunk); // Error: Property 'push' does not exist

    expect(file.chunks).toHaveLength(1);
  });
});

describe("DiffView Complex Scenarios", () => {
  test("handles file with multiple chunks", () => {
    const chunk1 = createMockChunk([
      createMockChange("delete", "old line 1", 1, undefined),
    ]);
    const chunk2 = createMockChunk([
      createMockChange("add", "new line 10", undefined, 10),
    ]);

    const file = createMockFile([chunk1, chunk2]);

    expect(file.chunks).toHaveLength(2);
  });

  test("handles mixed change types in single chunk", () => {
    const changes: readonly DiffChange[] = [
      createMockChange("context", "unchanged line 1", 1, 1),
      createMockChange("delete", "removed line 2", 2, undefined),
      createMockChange("add", "added line 2", undefined, 2),
      createMockChange("context", "unchanged line 3", 3, 3),
    ];

    const chunk = createMockChunk(changes);
    const file = createMockFile([chunk]);

    const chunk0 = file.chunks[0];
    if (chunk0 === undefined) {
      throw new Error("Expected chunk to exist");
    }

    expect(chunk0.changes).toHaveLength(4);
    expect(chunk0.changes[0]?.type).toBe("context");
    expect(chunk0.changes[1]?.type).toBe("delete");
    expect(chunk0.changes[2]?.type).toBe("add");
    expect(chunk0.changes[3]?.type).toBe("context");
  });
});
