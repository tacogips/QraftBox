<script lang="ts">
  import type { DiffFile, ViewMode } from "../src/types/diff";
  import SideBySideDiff from "./diff/SideBySideDiff.svelte";
  import InlineDiff from "./diff/InlineDiff.svelte";

  /**
   * DiffView Container Component
   *
   * Main container component for displaying file diffs in different view modes.
   * Supports side-by-side (split) and inline (unified) diff views.
   *
   * Props:
   * - file: The diff file to display
   * - mode: Display mode ('side-by-side' or 'inline')
   * - onLineSelect: Optional callback when a line is selected (receives line number)
   * - highlightedLines: Optional array of line numbers to highlight
   *
   * Design: Container that delegates rendering to specialized diff components.
   * Handles mode switching and line selection events. Touch-friendly with 44px targets.
   */

  interface Props {
    file: DiffFile;
    mode: "side-by-side" | "inline";
    onLineSelect?: (line: number) => void;
    highlightedLines?: readonly number[];
  }

  // Svelte 5 props syntax
  let {
    file,
    mode,
    onLineSelect = undefined,
    highlightedLines = undefined,
  }: Props = $props();

  /**
   * Check if a line number is highlighted
   */
  function isLineHighlighted(lineNumber: number): boolean {
    if (highlightedLines === undefined) {
      return false;
    }
    return highlightedLines.includes(lineNumber);
  }

  /**
   * Handle line selection from side-by-side view
   * Side-by-side provides side ('old' | 'new') and line number
   */
  function handleSideBySideLineSelect(side: "old" | "new", line: number): void {
    if (onLineSelect !== undefined) {
      onLineSelect(line);
    }
  }

  /**
   * Handle line selection from inline view
   * Inline provides line number and type ('old' | 'new')
   */
  function handleInlineLineSelect(line: number, type: "old" | "new"): void {
    if (onLineSelect !== undefined) {
      onLineSelect(line);
    }
  }
</script>

<div class="diff-view-container w-full h-full flex flex-col">
  {#if file.chunks.length === 0}
    <!-- Empty state when no chunks exist -->
    <div
      class="flex items-center justify-center flex-1 text-text-secondary text-sm p-8"
    >
      <p>No changes to display for {file.path}</p>
    </div>
  {:else if mode === "side-by-side"}
    <!-- Side-by-side (split) view -->
    <SideBySideDiff
      chunks={file.chunks}
      onLineSelect={handleSideBySideLineSelect}
    />
  {:else if mode === "inline"}
    <!-- Inline (unified) view -->
    <InlineDiff chunks={file.chunks} onLineSelect={handleInlineLineSelect} />
  {:else}
    <!-- Exhaustive check for mode type -->
    <div
      class="flex items-center justify-center flex-1 text-red-500 text-sm p-8"
    >
      <p>Unknown view mode: {mode}</p>
    </div>
  {/if}
</div>

<style>
  /* Ensure container takes full height and allows scrolling in child components */
  .diff-view-container {
    min-height: 0; /* Allow flex children to shrink */
    overflow: hidden; /* Prevent scrolling at container level */
  }
</style>
