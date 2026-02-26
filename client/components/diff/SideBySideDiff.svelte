<script lang="ts">
  import type { DiffChunk } from "../../src/types/diff";
  import DiffLine from "./DiffLine.svelte";
  import SplitButton from "../common/SplitButton.svelte";

  /**
   * SideBySideDiff Component
   *
   * Displays a side-by-side (split) diff view with synchronized scrolling.
   * Shows old content on the left pane and new content on the right pane.
   *
   * Props:
   * - chunks: Array of diff chunks containing changes
   * - onLineSelect: Optional callback when a line is selected (side: 'old' | 'new', line: number)
   *
   * Design: Two-pane layout with synchronized scrolling, line number columns,
   * and color-coded additions (green) and deletions (red).
   */

  interface Props {
    chunks: readonly DiffChunk[];
    onLineSelect?: (side: "old" | "new", line: number) => void;
    onCommentOpen?: (
      side: "old" | "new",
      line: number,
      shiftKey: boolean,
    ) => void;
    onCommentSubmit?: (prompt: string, immediate: boolean) => void;
    onCommentCancel?: () => void;
    commentLine?:
      | { side: "old" | "new"; startLine: number; endLine: number }
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

  // Svelte 5 props syntax
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
   * Scroll position state for synchronization
   */
  let leftScrollTop = $state(0);
  let rightScrollTop = $state(0);
  let isSyncing = $state(false);

  /**
   * Handle scroll on left pane - sync to right pane
   */
  function handleLeftScroll(event: Event): void {
    if (isSyncing) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target === null) {
      return;
    }

    isSyncing = true;
    leftScrollTop = target.scrollTop;
    rightScrollTop = target.scrollTop;

    // Use requestAnimationFrame to ensure smooth synchronization
    requestAnimationFrame(() => {
      isSyncing = false;
    });
  }

  /**
   * Handle scroll on right pane - sync to left pane
   */
  function handleRightScroll(event: Event): void {
    if (isSyncing) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target === null) {
      return;
    }

    isSyncing = true;
    rightScrollTop = target.scrollTop;
    leftScrollTop = target.scrollTop;

    // Use requestAnimationFrame to ensure smooth synchronization
    requestAnimationFrame(() => {
      isSyncing = false;
    });
  }

  /**
   * Extract old (deleted or context) lines from chunks
   */
  const oldLines = $derived.by(() => {
    const lines: Array<{
      change: (typeof chunks)[number]["changes"][number];
      lineNumber: number;
    }> = [];

    for (const chunk of chunks) {
      for (const change of chunk.changes) {
        if (change.type === "delete" || change.type === "context") {
          // Use oldLine if available, otherwise undefined
          const lineNumber = change.oldLine ?? 0;
          lines.push({ change, lineNumber });
        }
      }
    }

    return lines;
  });

  /**
   * Extract new (added or context) lines from chunks
   */
  const newLines = $derived.by(() => {
    const lines: Array<{
      change: (typeof chunks)[number]["changes"][number];
      lineNumber: number;
    }> = [];

    for (const chunk of chunks) {
      for (const change of chunk.changes) {
        if (change.type === "add" || change.type === "context") {
          // Use newLine if available, otherwise undefined
          const lineNumber = change.newLine ?? 0;
          lines.push({ change, lineNumber });
        }
      }
    }

    return lines;
  });

  /**
   * Handle line selection on old (left) pane
   */
  function handleOldLineSelect(lineNumber: number): void {
    if (onLineSelect !== undefined) {
      onLineSelect("old", lineNumber);
    }
  }

  /**
   * Handle line selection on new (right) pane
   */
  function handleNewLineSelect(lineNumber: number): void {
    if (onLineSelect !== undefined) {
      onLineSelect("new", lineNumber);
    }
  }

  /**
   * Handle comment button click on old pane
   */
  function handleOldCommentOpen(lineNumber: number, shiftKey: boolean): void {
    if (onCommentOpen !== undefined) {
      onCommentOpen("old", lineNumber, shiftKey);
    }
  }

  /**
   * Handle comment button click on new pane
   */
  function handleNewCommentOpen(lineNumber: number, shiftKey: boolean): void {
    if (onCommentOpen !== undefined) {
      onCommentOpen("new", lineNumber, shiftKey);
    }
  }

  /**
   * Check if a line number is in the highlighted range for a given side
   */
  function isInRange(side: "old" | "new", lineNumber: number): boolean {
    if (commentLine === undefined || commentLine.side !== side) return false;
    return rangeLines.includes(lineNumber);
  }
</script>

<div class="flex w-full h-full">
  <!-- Left Pane: Old Content (Deletions and Context) -->
  <div
    class="w-1/2 overflow-y-auto overflow-x-hidden border-r border-border-default"
    onscroll={handleLeftScroll}
    style="scroll-behavior: smooth;"
  >
    <div class="min-h-full">
      {#if oldLines.length === 0}
        <!-- Empty state for completely new files -->
        <div
          class="flex items-center justify-center h-full text-text-secondary p-8"
        >
          <p class="text-sm">No old content (new file)</p>
        </div>
      {:else}
        {#each oldLines as { change, lineNumber }, index (index)}
          <div class={isInRange("old", lineNumber) ? "bg-accent-muted" : ""}>
            <DiffLine
              {change}
              {lineNumber}
              highlighted={oldHighlightMap?.get(lineNumber)}
              onSelect={() => handleOldLineSelect(lineNumber)}
              onCommentClick={(shiftKey) =>
                handleOldCommentOpen(lineNumber, shiftKey)}
            />
          </div>
          {#if commentLine !== undefined && commentLine.side === "old" && commentLine.endLine === lineNumber}
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
                    onCommentSubmit(commentText, true);
                    commentText = "";
                  }
                  if (e.key === "Escape" && onCommentCancel !== undefined) {
                    onCommentCancel();
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
                    class="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
                    onclick={() => {
                      if (onCommentCancel !== undefined) {
                        onCommentCancel();
                        commentText = "";
                      }
                    }}>Cancel</button
                  >
                  <SplitButton
                    disabled={commentText.trim().length === 0}
                    onPrimaryClick={() => {
                      if (onCommentSubmit !== undefined) {
                        onCommentSubmit(commentText, false);
                        commentText = "";
                      }
                    }}
                    onSecondaryClick={() => {
                      if (onCommentSubmit !== undefined) {
                        onCommentSubmit(commentText, true);
                        commentText = "";
                      }
                    }}
                  />
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
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <!-- Right Pane: New Content (Additions and Context) -->
  <div
    class="w-1/2 overflow-y-auto overflow-x-hidden"
    onscroll={handleRightScroll}
    style="scroll-behavior: smooth;"
  >
    <div class="min-h-full">
      {#if newLines.length === 0}
        <!-- Empty state for completely deleted files -->
        <div
          class="flex items-center justify-center h-full text-text-secondary p-8"
        >
          <p class="text-sm">No new content (deleted file)</p>
        </div>
      {:else}
        {#each newLines as { change, lineNumber }, index (index)}
          <div class={isInRange("new", lineNumber) ? "bg-accent-muted" : ""}>
            <DiffLine
              {change}
              {lineNumber}
              highlighted={newHighlightMap?.get(lineNumber)}
              onSelect={() => handleNewLineSelect(lineNumber)}
              onCommentClick={(shiftKey) =>
                handleNewCommentOpen(lineNumber, shiftKey)}
            />
          </div>
          {#if commentLine !== undefined && commentLine.side === "new" && commentLine.endLine === lineNumber}
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
                    onCommentSubmit(commentText, true);
                    commentText = "";
                  }
                  if (e.key === "Escape" && onCommentCancel !== undefined) {
                    onCommentCancel();
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
                    class="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
                    onclick={() => {
                      if (onCommentCancel !== undefined) {
                        onCommentCancel();
                        commentText = "";
                      }
                    }}>Cancel</button
                  >
                  <SplitButton
                    disabled={commentText.trim().length === 0}
                    onPrimaryClick={() => {
                      if (onCommentSubmit !== undefined) {
                        onCommentSubmit(commentText, false);
                        commentText = "";
                      }
                    }}
                    onSecondaryClick={() => {
                      if (onCommentSubmit !== undefined) {
                        onCommentSubmit(commentText, true);
                        commentText = "";
                      }
                    }}
                  />
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
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  /* Smooth scrolling for synchronized panes */
  div[onscroll] {
    scroll-behavior: smooth;
  }

  /* Ensure panes take full height */
  .min-h-full {
    min-height: 100%;
  }
</style>
