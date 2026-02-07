<script lang="ts">
  import type { DiffFile, ViewMode } from "../src/types/diff";
  import SideBySideDiff from "./diff/SideBySideDiff.svelte";
  import InlineDiff from "./diff/InlineDiff.svelte";

  /**
   * DiffView Container Component
   *
   * Main container component for displaying file diffs in different view modes.
   * Supports side-by-side (split) and inline (unified) diff views.
   * Supports GitHub-style inline comment boxes via gutter "+" button.
   */

  interface CommentState {
    side: "old" | "new";
    line: number;
  }

  interface Props {
    file: DiffFile;
    mode: "side-by-side" | "inline";
    onLineSelect?: (line: number) => void;
    onCommentSubmit?: (line: number, side: "old" | "new", prompt: string, immediate: boolean) => void;
    highlightedLines?: readonly number[];
  }

  // Svelte 5 props syntax
  let {
    file,
    mode,
    onLineSelect = undefined,
    onCommentSubmit = undefined,
    highlightedLines = undefined,
  }: Props = $props();

  /**
   * Active inline comment state
   */
  let activeComment = $state<CommentState | null>(null);

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
   */
  function handleSideBySideLineSelect(side: "old" | "new", line: number): void {
    if (onLineSelect !== undefined) {
      onLineSelect(line);
    }
  }

  /**
   * Handle line selection from inline view
   */
  function handleInlineLineSelect(line: number, type: "old" | "new"): void {
    if (onLineSelect !== undefined) {
      onLineSelect(line);
    }
  }

  /**
   * Handle comment open from side-by-side gutter "+"
   */
  function handleSideBySideCommentOpen(side: "old" | "new", line: number): void {
    activeComment = { side, line };
  }

  /**
   * Handle comment open from inline gutter "+"
   */
  function handleInlineCommentOpen(line: number, type: "old" | "new"): void {
    activeComment = { side: type, line };
  }

  /**
   * Handle comment submission
   */
  function handleCommentSubmit(prompt: string, immediate: boolean): void {
    if (activeComment !== null && onCommentSubmit !== undefined) {
      onCommentSubmit(activeComment.line, activeComment.side, prompt, immediate);
    }
    activeComment = null;
  }

  /**
   * Handle comment cancel
   */
  function handleCommentCancel(): void {
    activeComment = null;
  }

  /**
   * Derive side-by-side comment line prop
   */
  const sbsCommentLine = $derived(
    activeComment !== null
      ? { side: activeComment.side, line: activeComment.line }
      : undefined,
  );

  /**
   * Derive inline comment line prop
   */
  const inlineCommentLine = $derived(
    activeComment !== null
      ? { line: activeComment.line, type: activeComment.side }
      : undefined,
  );
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
      onCommentOpen={handleSideBySideCommentOpen}
      onCommentSubmit={handleCommentSubmit}
      onCommentCancel={handleCommentCancel}
      commentLine={sbsCommentLine}
    />
  {:else if mode === "inline"}
    <!-- Inline (unified) view -->
    <InlineDiff
      chunks={file.chunks}
      onLineSelect={handleInlineLineSelect}
      onCommentOpen={handleInlineCommentOpen}
      onCommentSubmit={handleCommentSubmit}
      onCommentCancel={handleCommentCancel}
      commentLine={inlineCommentLine}
    />
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
