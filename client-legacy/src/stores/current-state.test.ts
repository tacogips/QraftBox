/**
 * Tests for current state store
 *
 * These tests verify that the current state store correctly manages
 * the expanded/collapsed state of deleted blocks in the Current State View.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  createCurrentStateStore,
  initialCurrentStateState,
  type CurrentStateStore,
} from "./current-state";

describe("createCurrentStateStore", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("creates store with initial state", () => {
    expect(store.expandedBlocks.size).toBe(0);
    expect(store.expandedBlocks).toBeInstanceOf(Set);
  });

  test("initial state matches exported constant", () => {
    expect(store.expandedBlocks.size).toBe(
      initialCurrentStateState.expandedBlocks.size,
    );
  });
});

describe("CurrentStateStore.toggleBlock", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("expands a collapsed block", () => {
    store.toggleBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.expandedBlocks.size).toBe(1);
  });

  test("collapses an expanded block", () => {
    store.toggleBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(true);

    store.toggleBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(false);
    expect(store.expandedBlocks.size).toBe(0);
  });

  test("toggles multiple different blocks independently", () => {
    store.toggleBlock("block-1");
    store.toggleBlock("block-2");
    store.toggleBlock("block-3");

    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(true);
    expect(store.isExpanded("block-3")).toBe(true);
    expect(store.expandedBlocks.size).toBe(3);
  });

  test("does not affect other blocks when toggling one", () => {
    store.toggleBlock("block-1");
    store.toggleBlock("block-2");

    store.toggleBlock("block-1");

    expect(store.isExpanded("block-1")).toBe(false);
    expect(store.isExpanded("block-2")).toBe(true);
    expect(store.expandedBlocks.size).toBe(1);
  });
});

describe("CurrentStateStore.expandBlock", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("expands a collapsed block", () => {
    store.expandBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.expandedBlocks.size).toBe(1);
  });

  test("is idempotent when block already expanded", () => {
    store.expandBlock("block-1");
    store.expandBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.expandedBlocks.size).toBe(1);
  });

  test("expands multiple blocks", () => {
    store.expandBlock("block-1");
    store.expandBlock("block-2");
    store.expandBlock("block-3");

    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(true);
    expect(store.isExpanded("block-3")).toBe(true);
    expect(store.expandedBlocks.size).toBe(3);
  });

  test("does not collapse already expanded blocks", () => {
    store.expandBlock("block-1");
    store.expandBlock("block-2");

    store.expandBlock("block-1");

    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(true);
    expect(store.expandedBlocks.size).toBe(2);
  });
});

describe("CurrentStateStore.collapseBlock", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("collapses an expanded block", () => {
    store.expandBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(true);

    store.collapseBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(false);
    expect(store.expandedBlocks.size).toBe(0);
  });

  test("is idempotent when block already collapsed", () => {
    store.collapseBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(false);
    expect(store.expandedBlocks.size).toBe(0);
  });

  test("collapses specific block without affecting others", () => {
    store.expandBlock("block-1");
    store.expandBlock("block-2");
    store.expandBlock("block-3");

    store.collapseBlock("block-2");

    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(false);
    expect(store.isExpanded("block-3")).toBe(true);
    expect(store.expandedBlocks.size).toBe(2);
  });

  test("handles collapsing non-existent block", () => {
    store.expandBlock("block-1");

    store.collapseBlock("block-2");

    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(false);
    expect(store.expandedBlocks.size).toBe(1);
  });
});

describe("CurrentStateStore.expandAll", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("expands all blocks from given list", () => {
    const blockIds = ["block-1", "block-2", "block-3"];
    store.expandAll(blockIds);

    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(true);
    expect(store.isExpanded("block-3")).toBe(true);
    expect(store.expandedBlocks.size).toBe(3);
  });

  test("handles empty list", () => {
    store.expandAll([]);
    expect(store.expandedBlocks.size).toBe(0);
  });

  test("merges with already expanded blocks", () => {
    store.expandBlock("block-1");
    store.expandBlock("block-2");

    store.expandAll(["block-3", "block-4"]);

    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(true);
    expect(store.isExpanded("block-3")).toBe(true);
    expect(store.isExpanded("block-4")).toBe(true);
    expect(store.expandedBlocks.size).toBe(4);
  });

  test("handles duplicate block IDs in list", () => {
    const blockIds = ["block-1", "block-2", "block-1", "block-3"];
    store.expandAll(blockIds);

    expect(store.expandedBlocks.size).toBe(3);
    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(true);
    expect(store.isExpanded("block-3")).toBe(true);
  });

  test("is idempotent when blocks already expanded", () => {
    const blockIds = ["block-1", "block-2"];
    store.expandAll(blockIds);
    store.expandAll(blockIds);

    expect(store.expandedBlocks.size).toBe(2);
  });

  test("handles large list of blocks", () => {
    const blockIds = Array.from({ length: 100 }, (_, i) => `block-${i}`);
    store.expandAll(blockIds);

    expect(store.expandedBlocks.size).toBe(100);
    expect(store.isExpanded("block-0")).toBe(true);
    expect(store.isExpanded("block-99")).toBe(true);
  });
});

describe("CurrentStateStore.collapseAll", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("collapses all expanded blocks", () => {
    store.expandBlock("block-1");
    store.expandBlock("block-2");
    store.expandBlock("block-3");

    store.collapseAll();

    expect(store.isExpanded("block-1")).toBe(false);
    expect(store.isExpanded("block-2")).toBe(false);
    expect(store.isExpanded("block-3")).toBe(false);
    expect(store.expandedBlocks.size).toBe(0);
  });

  test("is idempotent when no blocks are expanded", () => {
    store.collapseAll();
    expect(store.expandedBlocks.size).toBe(0);

    store.collapseAll();
    expect(store.expandedBlocks.size).toBe(0);
  });

  test("handles large number of expanded blocks", () => {
    const blockIds = Array.from({ length: 100 }, (_, i) => `block-${i}`);
    store.expandAll(blockIds);
    expect(store.expandedBlocks.size).toBe(100);

    store.collapseAll();
    expect(store.expandedBlocks.size).toBe(0);
  });
});

describe("CurrentStateStore.isExpanded", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("returns false for non-existent block", () => {
    expect(store.isExpanded("block-1")).toBe(false);
  });

  test("returns true for expanded block", () => {
    store.expandBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(true);
  });

  test("returns false for collapsed block", () => {
    store.expandBlock("block-1");
    store.collapseBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(false);
  });

  test("returns correct status for multiple blocks", () => {
    store.expandBlock("block-1");
    store.expandBlock("block-3");

    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(false);
    expect(store.isExpanded("block-3")).toBe(true);
  });
});

describe("CurrentStateStore.reset", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("resets to initial state", () => {
    store.expandBlock("block-1");
    store.expandBlock("block-2");
    store.expandBlock("block-3");

    store.reset();

    expect(store.expandedBlocks.size).toBe(0);
    expect(store.isExpanded("block-1")).toBe(false);
    expect(store.isExpanded("block-2")).toBe(false);
    expect(store.isExpanded("block-3")).toBe(false);
  });

  test("is idempotent when already at initial state", () => {
    store.reset();
    expect(store.expandedBlocks.size).toBe(0);

    store.reset();
    expect(store.expandedBlocks.size).toBe(0);
  });

  test("clears all state after expand all", () => {
    const blockIds = Array.from({ length: 50 }, (_, i) => `block-${i}`);
    store.expandAll(blockIds);
    expect(store.expandedBlocks.size).toBe(50);

    store.reset();
    expect(store.expandedBlocks.size).toBe(0);
  });
});

describe("CurrentStateStore immutability", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("expandedBlocks getter returns defensive copy", () => {
    // Attempt to mutate the returned Set should not affect internal state
    const blocks = store.expandedBlocks;
    (blocks as Set<string>).add("block-1");

    // The internal state should be unaffected because we return a defensive copy
    // Note: Object.freeze doesn't prevent Set.add() from "working" on the copy,
    // but the important thing is the store's internal state remains pristine
    expect(store.isExpanded("block-1")).toBe(false);
    expect(store.expandedBlocks.size).toBe(0);
  });

  test("returns new Set instance after modification", () => {
    const initialBlocks = store.expandedBlocks;
    store.expandBlock("block-1");
    const updatedBlocks = store.expandedBlocks;

    expect(initialBlocks).not.toBe(updatedBlocks);
  });
});

describe("CurrentStateStore integration scenarios", () => {
  let store: CurrentStateStore;

  beforeEach(() => {
    store = createCurrentStateStore();
  });

  test("user expands and collapses blocks in sequence", () => {
    // User expands a few blocks
    store.expandBlock("block-1");
    store.expandBlock("block-2");
    expect(store.expandedBlocks.size).toBe(2);

    // User toggles one off
    store.toggleBlock("block-1");
    expect(store.isExpanded("block-1")).toBe(false);
    expect(store.expandedBlocks.size).toBe(1);

    // User expands all
    store.expandAll(["block-1", "block-2", "block-3", "block-4"]);
    expect(store.expandedBlocks.size).toBe(4);

    // User collapses all
    store.collapseAll();
    expect(store.expandedBlocks.size).toBe(0);
  });

  test("handles file switching workflow", () => {
    // User views first file and expands blocks
    store.expandBlock("file1-block-1");
    store.expandBlock("file1-block-2");
    expect(store.expandedBlocks.size).toBe(2);

    // User switches to another file - reset state
    store.reset();
    expect(store.expandedBlocks.size).toBe(0);

    // User expands blocks in new file
    store.expandBlock("file2-block-1");
    expect(store.expandedBlocks.size).toBe(1);
    expect(store.isExpanded("file1-block-1")).toBe(false);
  });

  test("handles expand all followed by individual collapse", () => {
    const blockIds = ["block-1", "block-2", "block-3", "block-4"];
    store.expandAll(blockIds);
    expect(store.expandedBlocks.size).toBe(4);

    // User collapses some blocks individually
    store.collapseBlock("block-2");
    store.collapseBlock("block-4");

    expect(store.isExpanded("block-1")).toBe(true);
    expect(store.isExpanded("block-2")).toBe(false);
    expect(store.isExpanded("block-3")).toBe(true);
    expect(store.isExpanded("block-4")).toBe(false);
    expect(store.expandedBlocks.size).toBe(2);
  });
});

/**
 * Type safety tests
 *
 * These compile-time tests verify that the store's type definitions
 * are correct and enforce proper TypeScript strictness.
 */
describe("CurrentStateStore type safety", () => {
  test("store returns readonly Set", () => {
    const store = createCurrentStateStore();
    const blocks: ReadonlySet<string> = store.expandedBlocks;
    expect(blocks).toBeInstanceOf(Set);
  });

  test("blockId parameter is string", () => {
    const store = createCurrentStateStore();
    const blockId: string = "block-1";
    store.toggleBlock(blockId);
    store.expandBlock(blockId);
    store.collapseBlock(blockId);
    const result: boolean = store.isExpanded(blockId);
    expect(result).toBeBoolean();
  });

  test("expandAll accepts readonly string array", () => {
    const store = createCurrentStateStore();
    const blockIds: readonly string[] = ["block-1", "block-2"];
    store.expandAll(blockIds);
    expect(store.expandedBlocks.size).toBe(2);
  });

  test("store methods return void or boolean", () => {
    const store = createCurrentStateStore();

    const toggleResult: void = store.toggleBlock("block-1");
    const expandResult: void = store.expandBlock("block-1");
    const collapseResult: void = store.collapseBlock("block-1");
    const expandAllResult: void = store.expandAll(["block-1"]);
    const collapseAllResult: void = store.collapseAll();
    const isExpandedResult: boolean = store.isExpanded("block-1");
    const resetResult: void = store.reset();

    expect(toggleResult).toBeUndefined();
    expect(expandResult).toBeUndefined();
    expect(collapseResult).toBeUndefined();
    expect(expandAllResult).toBeUndefined();
    expect(collapseAllResult).toBeUndefined();
    expect(isExpandedResult).toBeBoolean();
    expect(resetResult).toBeUndefined();
  });
});
