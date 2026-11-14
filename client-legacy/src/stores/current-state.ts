/**
 * Current state store types and functions
 *
 * Manages the expanded/collapsed state of deleted blocks in the Current State View.
 * Deleted content is shown as thin red lines that can be expanded on tap.
 */

/**
 * Current state store state
 */
export interface CurrentStateStoreState {
  /**
   * Set of expanded block IDs
   */
  readonly expandedBlocks: ReadonlySet<string>;
}

/**
 * Current state store actions
 */
export interface CurrentStateStoreActions {
  /**
   * Toggle expansion state of a block
   */
  toggleBlock(blockId: string): void;

  /**
   * Expand a specific block
   */
  expandBlock(blockId: string): void;

  /**
   * Collapse a specific block
   */
  collapseBlock(blockId: string): void;

  /**
   * Expand all blocks from the given list
   */
  expandAll(blockIds: readonly string[]): void;

  /**
   * Collapse all blocks
   */
  collapseAll(): void;

  /**
   * Check if a block is expanded
   */
  isExpanded(blockId: string): boolean;

  /**
   * Reset the store to initial state
   */
  reset(): void;
}

/**
 * Combined store type
 */
export type CurrentStateStore = CurrentStateStoreState &
  CurrentStateStoreActions;

/**
 * Create initial state for the current state store
 * Returns a fresh state object with a new Set each time
 */
function createInitialState(): CurrentStateStoreState {
  return {
    expandedBlocks: new Set(),
  };
}

/**
 * Initial state for the current state store
 * Note: This is for reference purposes. Use createInitialState() for actual initialization.
 */
export const initialCurrentStateState: CurrentStateStoreState =
  createInitialState();

/**
 * Create a current state store
 *
 * This store manages which deleted blocks are currently expanded in the
 * Current State View. It provides operations to toggle, expand, and collapse
 * individual blocks, as well as bulk operations for expand all/collapse all.
 */
export function createCurrentStateStore(): CurrentStateStore {
  let state: CurrentStateStoreState = createInitialState();

  return {
    get expandedBlocks(): ReadonlySet<string> {
      // Return a frozen Set to prevent runtime mutations
      return Object.freeze(new Set(state.expandedBlocks));
    },

    toggleBlock(blockId: string): void {
      const newSet = new Set(state.expandedBlocks);
      if (newSet.has(blockId)) {
        newSet.delete(blockId);
      } else {
        newSet.add(blockId);
      }
      state = { expandedBlocks: newSet };
    },

    expandBlock(blockId: string): void {
      if (!state.expandedBlocks.has(blockId)) {
        const newSet = new Set(state.expandedBlocks);
        newSet.add(blockId);
        state = { expandedBlocks: newSet };
      }
    },

    collapseBlock(blockId: string): void {
      if (state.expandedBlocks.has(blockId)) {
        const newSet = new Set(state.expandedBlocks);
        newSet.delete(blockId);
        state = { expandedBlocks: newSet };
      }
    },

    expandAll(blockIds: readonly string[]): void {
      const newSet = new Set(state.expandedBlocks);
      for (const id of blockIds) {
        newSet.add(id);
      }
      state = { expandedBlocks: newSet };
    },

    collapseAll(): void {
      state = { expandedBlocks: new Set() };
    },

    isExpanded(blockId: string): boolean {
      return state.expandedBlocks.has(blockId);
    },

    reset(): void {
      state = createInitialState();
    },
  };
}
