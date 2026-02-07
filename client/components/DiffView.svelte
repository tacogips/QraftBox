<script lang="ts">
  import type { DiffFile, ViewMode } from "../src/types/diff";
  import SideBySideDiff from "./diff/SideBySideDiff.svelte";
  import InlineDiff from "./diff/InlineDiff.svelte";

  /**
   * DiffView Container Component
   *
   * Supports GitHub-style inline comment boxes via gutter "+" button.
   * Shift+click "+" to select a line range.
   */

  interface CommentRange {
    side: "old" | "new";
    startLine: number;
    endLine: number;
  }

  interface Props {
    file: DiffFile;
    mode: "side-by-side" | "inline";
    onLineSelect?: (line: number) => void;
    onCommentSubmit?: (
      startLine: number,
      endLine: number,
      side: "old" | "new",
      filePath: string,
      prompt: string,
      immediate: boolean,
    ) => void;
    highlightedLines?: readonly number[];
  }

  let {
    file,
    mode,
    onLineSelect = undefined,
    onCommentSubmit = undefined,
    highlightedLines = undefined,
  }: Props = $props();

  let activeComment = $state<CommentRange | null>(null);

  function handleSideBySideLineSelect(side: "old" | "new", line: number): void {
    if (onLineSelect !== undefined) {
      onLineSelect(line);
    }
  }

  function handleInlineLineSelect(line: number, type: "old" | "new"): void {
    if (onLineSelect !== undefined) {
      onLineSelect(line);
    }
  }

  /**
   * Handle comment open from side-by-side gutter "+".
   * Shift+click extends existing range on the same side.
   */
  function handleSideBySideCommentOpen(side: "old" | "new", line: number, shiftKey: boolean): void {
    if (shiftKey && activeComment !== null && activeComment.side === side) {
      const start = Math.min(activeComment.startLine, line);
      const end = Math.max(activeComment.endLine, line);
      activeComment = { side, startLine: start, endLine: end };
    } else {
      activeComment = { side, startLine: line, endLine: line };
    }
  }

  /**
   * Handle comment open from inline gutter "+".
   * Shift+click extends existing range on the same side.
   */
  function handleInlineCommentOpen(line: number, type: "old" | "new", shiftKey: boolean): void {
    if (shiftKey && activeComment !== null && activeComment.side === type) {
      const start = Math.min(activeComment.startLine, line);
      const end = Math.max(activeComment.endLine, line);
      activeComment = { side: type, startLine: start, endLine: end };
    } else {
      activeComment = { side: type, startLine: line, endLine: line };
    }
  }

  function handleCommentSubmit(prompt: string, immediate: boolean): void {
    if (activeComment !== null && onCommentSubmit !== undefined) {
      onCommentSubmit(
        activeComment.startLine,
        activeComment.endLine,
        activeComment.side,
        file.path,
        prompt,
        immediate,
      );
    }
    activeComment = null;
  }

  function handleCommentCancel(): void {
    activeComment = null;
  }

  /**
   * File name for display (last segment of path)
   */
  const fileName = $derived(file.path.split("/").pop() ?? file.path);

  /**
   * Placeholder text showing file + line context
   */
  const commentPlaceholder = $derived.by(() => {
    if (activeComment === null) return "";
    const lineInfo =
      activeComment.startLine === activeComment.endLine
        ? `L${activeComment.startLine}`
        : `L${activeComment.startLine}-L${activeComment.endLine}`;
    return `Ask AI about ${file.path}:${lineInfo} ...`;
  });

  /**
   * Lines in range for highlighting
   */
  const commentRangeLines = $derived.by(() => {
    if (activeComment === null) return [] as number[];
    const lines: number[] = [];
    for (let i = activeComment.startLine; i <= activeComment.endLine; i++) {
      lines.push(i);
    }
    return lines;
  });

  const sbsCommentLine = $derived(
    activeComment !== null
      ? { side: activeComment.side, startLine: activeComment.startLine, endLine: activeComment.endLine }
      : undefined,
  );

  const inlineCommentLine = $derived(
    activeComment !== null
      ? { type: activeComment.side, startLine: activeComment.startLine, endLine: activeComment.endLine }
      : undefined,
  );
</script>

<div class="diff-view-container w-full h-full flex flex-col">
  {#if file.chunks.length === 0}
    <div
      class="flex items-center justify-center flex-1 text-text-secondary text-sm p-8"
    >
      <p>No changes to display for {file.path}</p>
    </div>
  {:else if mode === "side-by-side"}
    <SideBySideDiff
      chunks={file.chunks}
      onLineSelect={handleSideBySideLineSelect}
      onCommentOpen={handleSideBySideCommentOpen}
      onCommentSubmit={handleCommentSubmit}
      onCommentCancel={handleCommentCancel}
      commentLine={sbsCommentLine}
      placeholder={commentPlaceholder}
      rangeLines={commentRangeLines}
    />
  {:else if mode === "inline"}
    <InlineDiff
      chunks={file.chunks}
      onLineSelect={handleInlineLineSelect}
      onCommentOpen={handleInlineCommentOpen}
      onCommentSubmit={handleCommentSubmit}
      onCommentCancel={handleCommentCancel}
      commentLine={inlineCommentLine}
      placeholder={commentPlaceholder}
      rangeLines={commentRangeLines}
    />
  {:else}
    <div
      class="flex items-center justify-center flex-1 text-red-500 text-sm p-8"
    >
      <p>Unknown view mode: {mode}</p>
    </div>
  {/if}
</div>

<style>
  .diff-view-container {
    min-height: 0;
    overflow: hidden;
  }
</style>
