<script lang="ts">
  import type { DiffChunk } from "../../src/types/diff";
  import DiffLine from "./DiffLine.svelte";
  import SplitButton from "../common/SplitButton.svelte";

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
    onCommentOpen?: (
      line: number,
      type: "old" | "new",
      shiftKey: boolean,
    ) => void;
    onCommentSubmit?: (
      prompt: string,
      immediate: boolean,
      action: "submit" | "comment",
    ) => void;
    onCommentCancel?: () => void;
    commentLine?:
      | { type: "old" | "new"; startLine: number; endLine: number }
      | undefined;
    placeholder?: string;
    rangeLines?: readonly number[];
    oldHighlightMap?: Map<number, string>;
    newHighlightMap?: Map<number, string>;
    filePath?: string;
    submittedSessionId?: string | null;
    submittedSessionHistoryHref?: string | null;
    onDismissSubmittedSession?: () => void;
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
    filePath = undefined,
    submittedSessionId = null,
    submittedSessionHistoryHref = null,
    onDismissSubmittedSession = undefined,
  }: Props = $props();

  let commentText = $state("");
  let commentQueuedNotice = $state(false);

  /**
   * Get line context display
   */
  const lineContext = $derived.by(() => {
    if (commentLine === undefined) return "";
    if (filePath === undefined) return "";
    const lineInfo =
      commentLine.startLine === commentLine.endLine
        ? `L${commentLine.startLine}`
        : `L${commentLine.startLine}-L${commentLine.endLine}`;
    return `${filePath}:${lineInfo}`;
  });

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
    if (commentLine.type === "new" && newLine === commentLine.endLine)
      return true;
    if (commentLine.type === "old" && oldLine === commentLine.endLine)
      return true;
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

  $effect(() => {
    commentLine;
    commentQueuedNotice = false;
  });
</script>

<div class="w-full font-mono text-xs leading-5">
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
      <div
        data-file-path={filePath}
        data-line-number={change.newLine ?? change.oldLine ?? index + 1}
        class="flex diff-line-row group/inlinerow {isInRange(
          change.oldLine,
          change.newLine,
        )
          ? 'bg-accent-muted'
          : ''}"
      >
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
              onclick={(e) => {
                e.stopPropagation();
                handleCommentOpen(change.oldLine, change.newLine, e.shiftKey);
              }}
              aria-label="Add comment">+</button
            >
          {/if}
          {#if change.oldLine !== undefined}
            <span class="leading-5">{change.oldLine}</span>
          {:else}
            <span class="leading-5 opacity-30">-</span>
          {/if}
        </div>

        <!-- New line number column -->
        <div
          class="w-16 flex-shrink-0 px-2 flex items-start justify-end text-text-secondary bg-bg-secondary border-r border-border-default"
        >
          {#if change.newLine !== undefined}
            <span class="leading-5">{change.newLine}</span>
          {:else}
            <span class="leading-5 opacity-30">-</span>
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
        <div
          class="max-w-4xl border-t-2 border-b-2 border-accent-emphasis bg-bg-secondary p-3"
        >
          <textarea
            class="w-full min-h-28 resize-y rounded border border-border-default bg-bg-primary
                   px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
            placeholder="Ask AI about this code..."
            bind:value={commentText}
            onkeydown={(e) => {
              if (
                e.key === "Enter" &&
                e.ctrlKey &&
                onCommentSubmit !== undefined
              ) {
                e.preventDefault();
                onCommentSubmit(commentText, false, "comment");
                commentQueuedNotice = true;
                commentText = "";
              }
              if (e.key === "Escape" && onCommentCancel !== undefined) {
                onCommentCancel();
                commentQueuedNotice = false;
                commentText = "";
              }
            }}
          ></textarea>
          <div class="flex items-center justify-between mt-2">
            <!-- Left side: File and line info -->
            <div class="text-xs text-text-tertiary font-mono">
              {lineContext}
            </div>
            <!-- Right side: Buttons -->
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="px-3 py-1 text-sm rounded bg-success-emphasis text-white
                       hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                onclick={() => {
                  if (onCommentSubmit !== undefined) {
                    onCommentSubmit(commentText, false, "comment");
                    commentQueuedNotice = true;
                    commentText = "";
                  }
                }}
                disabled={commentText.trim().length === 0}>Comment</button
              >
              <SplitButton
                disabled={commentText.trim().length === 0}
                onPrimaryClick={() => {
                  if (onCommentSubmit !== undefined) {
                    onCommentSubmit(commentText, false, "submit");
                    commentText = "";
                  }
                }}
                onSecondaryClick={() => {
                  if (onCommentSubmit !== undefined) {
                    onCommentSubmit(commentText, true, "submit");
                    commentText = "";
                  }
                }}
              />
              <button
                type="button"
                class="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
                onclick={() => {
                  if (onCommentCancel !== undefined) {
                    onCommentCancel();
                    commentQueuedNotice = false;
                    commentText = "";
                  }
                }}>Cancel</button
              >
            </div>
          </div>
          {#if submittedSessionId !== null && submittedSessionHistoryHref !== null}
            <div
              class="mt-2 flex items-center justify-between gap-3 rounded border border-accent-emphasis/40 bg-accent-muted/10 px-2 py-1 text-xs text-text-secondary"
            >
              <span class="truncate">AI session submitted.</span>
              <div class="flex items-center gap-2">
                <a
                  class="text-accent-fg underline underline-offset-2 hover:opacity-80"
                  href={submittedSessionHistoryHref}
                >
                  View session history
                </a>
                <button
                  type="button"
                  class="text-text-secondary hover:text-text-primary"
                  onclick={() => {
                    onDismissSubmittedSession?.();
                    onCommentCancel?.();
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          {/if}
          {#if commentQueuedNotice}
            <div
              class="mt-2 flex items-center justify-between gap-3 rounded border border-success-emphasis/40 bg-success-subtle px-2 py-1 text-xs text-success-fg"
            >
              <span class="truncate">Comment added to queue.</span>
              <button
                type="button"
                class="text-text-secondary hover:text-text-primary"
                onclick={() => {
                  commentQueuedNotice = false;
                }}
              >
                Close
              </button>
            </div>
          {/if}
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
