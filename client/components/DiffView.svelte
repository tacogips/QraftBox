<script lang="ts">
  import type { DiffFile, ViewMode } from "../src/types/diff";
  import SideBySideDiff from "./diff/SideBySideDiff.svelte";
  import InlineDiff from "./diff/InlineDiff.svelte";
  import { highlightLines } from "../src/lib/highlighter";

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
    onNavigatePrev?: (() => void) | undefined;
    onNavigateNext?: (() => void) | undefined;
  }

  let {
    file,
    mode,
    onLineSelect = undefined,
    onCommentSubmit = undefined,
    highlightedLines = undefined,
    onNavigatePrev = undefined,
    onNavigateNext = undefined,
  }: Props = $props();

  let activeComment = $state<CommentRange | null>(null);

  /**
   * Syntax highlighting maps: line number -> highlighted HTML string
   */
  let oldHighlightMap = $state<Map<number, string>>(new Map());
  let newHighlightMap = $state<Map<number, string>>(new Map());

  $effect(() => {
    const oldEntries: { lineNumber: number; content: string }[] = [];
    const newEntries: { lineNumber: number; content: string }[] = [];

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type === "delete" || change.type === "context") {
          if (change.oldLine !== undefined) {
            oldEntries.push({ lineNumber: change.oldLine, content: change.content });
          }
        }
        if (change.type === "add" || change.type === "context") {
          if (change.newLine !== undefined) {
            newEntries.push({ lineNumber: change.newLine, content: change.content });
          }
        }
      }
    }

    const oldCode = oldEntries.map((e) => e.content).join("\n");
    const newCode = newEntries.map((e) => e.content).join("\n");
    const filePath = file.path;

    void Promise.all([
      highlightLines(oldCode, filePath),
      highlightLines(newCode, filePath),
    ]).then(([oldHtml, newHtml]) => {
      const oMap = new Map<number, string>();
      for (let i = 0; i < oldEntries.length; i++) {
        const entry = oldEntries[i];
        const html = oldHtml[i];
        if (entry !== undefined && html !== undefined) {
          oMap.set(entry.lineNumber, html);
        }
      }
      oldHighlightMap = oMap;

      const nMap = new Map<number, string>();
      for (let i = 0; i < newEntries.length; i++) {
        const entry = newEntries[i];
        const html = newHtml[i];
        if (entry !== undefined && html !== undefined) {
          nMap.set(entry.lineNumber, html);
        }
      }
      newHighlightMap = nMap;
    });
  });

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
  <!-- Header with file info -->
  <div
    class="flex items-center justify-between px-2 min-h-[32px] bg-bg-secondary border-b border-border-default sticky top-0 z-10"
  >
    <div class="flex items-center gap-2">
      <span class="text-xs font-medium text-text-primary truncate max-w-[300px]">
        {file.path}
      </span>
      <span class="text-[10px] text-text-secondary">
        +{file.additions} -{file.deletions}
      </span>
    </div>
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        class="p-1 rounded transition-colors {onNavigatePrev !== undefined
          ? 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer'
          : 'text-text-disabled cursor-default'}"
        onclick={() => onNavigatePrev?.()}
        disabled={onNavigatePrev === undefined}
        title="Previous file"
        aria-label="Previous file"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
        </svg>
      </button>
      <button
        type="button"
        class="p-1 rounded transition-colors {onNavigateNext !== undefined
          ? 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer'
          : 'text-text-disabled cursor-default'}"
        onclick={() => onNavigateNext?.()}
        disabled={onNavigateNext === undefined}
        title="Next file"
        aria-label="Next file"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.22 3.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.19 9H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.53a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>
    </div>
  </div>

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
      {oldHighlightMap}
      {newHighlightMap}
      filePath={file.path}
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
      {oldHighlightMap}
      {newHighlightMap}
      filePath={file.path}
    />
  {:else}
    <div
      class="flex items-center justify-center flex-1 text-danger-fg text-sm p-8"
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
