<script lang="ts">
  import type { DiffChunk } from "../../src/types/diff";
  import DiffLine from "./DiffLine.svelte";

  /**
   * InlineDiff Component
   *
   * Single-column inline diff view that displays all changes in a unified format.
   * Shows additions, deletions, and context lines with +/- indicators and color-coding.
   *
   * Props:
   * - chunks: Array of diff chunks containing changes to display
   * - onLineSelect: Optional callback when a line is selected, receives line number and type
   *
   * Design: Full-width single column layout with two line number columns (old, new)
   * Uses Tailwind CSS v4 design tokens and DiffLine component for rendering individual lines
   */

  interface Props {
    chunks: readonly DiffChunk[];
    onLineSelect?: (line: number, type: "old" | "new") => void;
    onCommentOpen?: (line: number, type: "old" | "new", shiftKey: boolean) => void;
    onCommentSubmit?: (prompt: string, immediate: boolean) => void;
    onCommentCancel?: () => void;
    commentLine?: { type: "old" | "new"; startLine: number; endLine: number } | undefined;
    placeholder?: string;
    rangeLines?: readonly number[];
    oldHighlightMap?: Map<number, string>;
    newHighlightMap?: Map<number, string>;
  }

  let {
    chunks,
    onLineSelect = undefined,
    onCommentOpen = undefined,
    onCommentSubmit = undefined,
    onCommentCancel = undefined,
    commentLine = undefined,
    placeholder = "Ask AI about this line...",
    rangeLines = [],
    oldHighlightMap = undefined,
    newHighlightMap = undefined,
  }: Props = $props();

  let commentText = $state("");

  /**
   * Flatten all changes from all chunks into a single list
   * This creates the inline view by merging all chunks sequentially
   */
  const flattenedChanges = $derived.by(() => {
    const changes: Array<{
      change: (typeof chunks)[number]["changes"][number];
      chunkHeader: string;
      index: number;
    }> = [];

    let globalIndex = 0;

    for (const chunk of chunks) {
      // Add a marker for the chunk header (not a change, just for tracking)
      // We'll handle chunk separators separately if needed

      for (const change of chunk.changes) {
        changes.push({
          change,
          chunkHeader: chunk.header,
          index: globalIndex++,
        });
      }
    }

    return changes;
  });

  /**
   * Handle line selection callback
   */
  function handleLineSelect(
    oldLine: number | undefined,
    newLine: number | undefined,
  ): void {
    if (onLineSelect === undefined) {
      return;
    }

    // Call with the appropriate line number and type
    if (newLine !== undefined) {
      onLineSelect(newLine, "new");
    } else if (oldLine !== undefined) {
      onLineSelect(oldLine, "old");
    }
  }

  /**
   * Handle comment button click
   */
  function handleCommentOpen(
    oldLine: number | undefined,
    newLine: number | undefined,
    shiftKey: boolean,
  ): void {
    if (onCommentOpen === undefined) return;
    if (newLine !== undefined) {
      onCommentOpen(newLine, "new", shiftKey);
    } else if (oldLine !== undefined) {
      onCommentOpen(oldLine, "old", shiftKey);
    }
  }

  /**
   * Check if comment box should show after this line (renders after endLine)
   */
  function isCommentLine(
    oldLine: number | undefined,
    newLine: number | undefined,
  ): boolean {
    if (commentLine === undefined) return false;
    if (commentLine.type === "new" && newLine === commentLine.endLine) return true;
    if (commentLine.type === "old" && oldLine === commentLine.endLine) return true;
    return false;
  }

  /**
   * Check if a line is in the highlighted range
   */
  function isInRange(
    oldLine: number | undefined,
    newLine: number | undefined,
  ): boolean {
    if (commentLine === undefined) return false;
    if (commentLine.type === "new" && newLine !== undefined) {
      return rangeLines.includes(newLine);
    }
    if (commentLine.type === "old" && oldLine !== undefined) {
      return rangeLines.includes(oldLine);
    }
    return false;
  }
</script>

<div class="w-full font-mono">
  {#if flattenedChanges.length === 0}
    <!-- Empty state when no changes exist -->
    <div
      class="flex items-center justify-center py-12 text-text-secondary text-sm"
    >
      No changes to display
    </div>
  {:else}
    <!-- Render each change as an inline diff line -->
    {#each flattenedChanges as { change, index } (index)}
      <div class="flex diff-line-row group/inlinerow {isInRange(change.oldLine, change.newLine) ? 'bg-accent-muted' : ''}">
        <!-- Old line number column -->
        <div
          class="w-16 flex-shrink-0 px-2 flex items-start justify-end text-text-secondary bg-bg-secondary border-r border-border-default relative"
        >
          {#if onCommentOpen !== undefined}
            <button
              type="button"
              class="absolute left-0 top-1 w-6 h-6 flex items-center justify-center
                     rounded bg-accent-emphasis text-white text-xs font-bold
                     opacity-0 group-hover/inlinerow:opacity-100
                     hover:bg-accent-fg transition-opacity z-10 cursor-pointer"
              onclick={(e) => { e.stopPropagation(); handleCommentOpen(change.oldLine, change.newLine, e.shiftKey); }}
              aria-label="Add comment"
            >+</button>
          {/if}
          {#if change.oldLine !== undefined}
            <span class="pt-2 min-h-[44px] flex items-start"
              >{change.oldLine}</span
            >
          {:else}
            <span class="pt-2 min-h-[44px] flex items-start opacity-30">-</span>
          {/if}
        </div>

        <!-- New line number column -->
        <div
          class="w-16 flex-shrink-0 px-2 flex items-start justify-end text-text-secondary bg-bg-secondary border-r border-border-default"
        >
          {#if change.newLine !== undefined}
            <span class="pt-2 min-h-[44px] flex items-start"
              >{change.newLine}</span
            >
          {:else}
            <span class="pt-2 min-h-[44px] flex items-start opacity-30">-</span>
          {/if}
        </div>

        <!-- Change content using DiffLine component -->
        <div class="flex-1">
          <DiffLine
            {change}
            lineNumber={change.newLine ?? change.oldLine ?? index + 1}
            highlighted={change.type === "delete"
              ? oldHighlightMap?.get(change.oldLine ?? 0)
              : newHighlightMap?.get(change.newLine ?? 0)}
            onSelect={() => handleLineSelect(change.oldLine, change.newLine)}
          />
        </div>
      </div>
      {#if isCommentLine(change.oldLine, change.newLine)}
        <div class="border-t-2 border-b-2 border-accent-emphasis bg-bg-secondary p-3">
          <textarea
            class="w-full min-h-[80px] p-2 text-sm font-sans bg-bg-primary border border-border-default rounded resize-y
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
            placeholder={placeholder}
            bind:value={commentText}
            onkeydown={(e) => {
              if (e.key === "Enter" && e.ctrlKey && onCommentSubmit !== undefined) {
                e.preventDefault();
                onCommentSubmit(commentText, true);
                commentText = "";
              }
              if (e.key === "Escape" && onCommentCancel !== undefined) {
                onCommentCancel();
                commentText = "";
              }
            }}
          ></textarea>
          <div class="flex items-center gap-2 mt-2">
            <button
              type="button"
              class="px-3 py-1 text-sm bg-success-emphasis text-white rounded hover:brightness-110"
              onclick={() => { if (onCommentSubmit !== undefined) { onCommentSubmit(commentText, true); commentText = ""; } }}
            >Submit</button>
            <button
              type="button"
              class="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
              onclick={() => { if (onCommentCancel !== undefined) { onCommentCancel(); commentText = ""; } }}
            >Cancel</button>
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  /* Ensure consistent line heights and spacing */
  .w-full {
    display: flex;
    flex-direction: column;
  }
</style>
