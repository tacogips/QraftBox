<script lang="ts">
import type { DiffFile } from "../src/types/diff";
import {
  transformToCurrentState,
  type CurrentStateLine,
  type DeletedBlock,
} from "../src/types/current-state";
import {
  createCurrentStateStore,
  type CurrentStateStore,
} from "../src/stores/current-state";
import CurrentStateLineComponent from "./current-state/CurrentStateLine.svelte";
import DeletedMarker from "./current-state/DeletedMarker.svelte";
import ExpandedDeletedBlock from "./current-state/ExpandedDeletedBlock.svelte";
import ExpandControls from "./current-state/ExpandControls.svelte";
import SplitButton from "./common/SplitButton.svelte";
import { highlightLines } from "../src/lib/highlighter";

/**
 * CurrentStateView Component
 *
 * Main container for the novel "Current State View" that shows only
 * the latest file state with visual diff annotations.
 *
 * Props:
 * - file: The DiffFile to display
 * - onLineSelect: Optional callback when a line is selected
 *
 * Features:
 * - Transforms diff data to current state format
 * - Manages expand/collapse state for deleted blocks
 * - Renders lines with appropriate styling
 * - Shows deleted content as collapsible red markers
 *
 * Design:
 * - Virtual scrolling for large files (TODO: integrate VirtualList)
 * - Touch-friendly interactions
 * - Keyboard navigation
 */

interface Props {
  file: DiffFile;
  onLineSelect?: (lineNumber: number) => void;
  onCommentSubmit?: (
    startLine: number,
    endLine: number,
    side: "old" | "new",
    filePath: string,
    prompt: string,
    immediate: boolean,
  ) => void;
}

// Svelte 5 props syntax
const { file, onLineSelect = undefined, onCommentSubmit = undefined }: Props = $props();

// Create store for managing expanded blocks
const store: CurrentStateStore = createCurrentStateStore();

// Transform diff to current state format
const currentStateLines = $derived(transformToCurrentState(file));

// Extract all deleted block IDs for bulk operations
const allBlockIds = $derived(
  currentStateLines
    .filter((line) => line.deletedBefore !== undefined)
    .map((line) => line.deletedBefore!.id)
);

// Check expansion states
const hasDeletedBlocks = $derived(allBlockIds.length > 0);
const allExpanded = $derived(
  hasDeletedBlocks && allBlockIds.every((id) => store.isExpanded(id))
);
const allCollapsed = $derived(
  hasDeletedBlocks && allBlockIds.every((id) => !store.isExpanded(id))
);

// Syntax highlighting maps
let lineHighlightMap = $state<Map<number, string>>(new Map());
let deletedBlockHighlightMap = $state<Map<string, string[]>>(new Map());

$effect(() => {
  const lines = currentStateLines;
  const filePath = file.path;

  // Highlight current state lines
  const contentLines = lines.map((l) => l.content);
  const code = contentLines.join("\n");

  void highlightLines(code, filePath).then((htmlLines) => {
    const map = new Map<number, string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const html = htmlLines[i];
      if (line !== undefined && html !== undefined) {
        map.set(line.lineNumber, html);
      }
    }
    lineHighlightMap = map;
  });

  // Highlight deleted blocks
  const blocks: DeletedBlock[] = [];
  for (const line of lines) {
    if (line.deletedBefore !== undefined) {
      blocks.push(line.deletedBefore);
    }
  }

  if (blocks.length > 0) {
    void Promise.all(
      blocks.map((block) =>
        highlightLines(block.lines.join("\n"), filePath).then(
          (htmlLines) => [block.id, htmlLines] as const,
        ),
      ),
    ).then((results) => {
      const map = new Map<string, string[]>();
      for (const [id, htmlLines] of results) {
        map.set(id, htmlLines);
      }
      deletedBlockHighlightMap = map;
    });
  }
});

// Selected line state
let selectedLine = $state<number | undefined>(undefined);

// Comment state
let activeComment = $state<{ startLine: number; endLine: number } | null>(null);
let commentText = $state("");

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

/**
 * Line context display string
 */
const lineContext = $derived.by(() => {
  if (activeComment === null) return "";
  const lineInfo =
    activeComment.startLine === activeComment.endLine
      ? `L${activeComment.startLine}`
      : `L${activeComment.startLine}-L${activeComment.endLine}`;
  return `${file.path}:${lineInfo}`;
});

/**
 * Handle comment open from gutter "+" button.
 * Shift+click extends existing range.
 */
function handleCommentOpen(lineNumber: number, shiftKey: boolean): void {
  if (shiftKey && activeComment !== null) {
    const start = Math.min(activeComment.startLine, lineNumber);
    const end = Math.max(activeComment.endLine, lineNumber);
    activeComment = { startLine: start, endLine: end };
  } else {
    activeComment = { startLine: lineNumber, endLine: lineNumber };
  }
}

/**
 * Handle comment submit
 */
function handleCommentSubmitLocal(prompt: string, immediate: boolean): void {
  if (activeComment !== null && onCommentSubmit !== undefined) {
    onCommentSubmit(
      activeComment.startLine,
      activeComment.endLine,
      "new",
      file.path,
      prompt,
      immediate,
    );
  }
  activeComment = null;
  commentText = "";
}

/**
 * Handle comment cancel
 */
function handleCommentCancel(): void {
  activeComment = null;
  commentText = "";
}

/**
 * Handle line selection
 */
function handleLineSelect(lineNumber: number): void {
  selectedLine = lineNumber;
  if (onLineSelect !== undefined) {
    onLineSelect(lineNumber);
  }
}

/**
 * Handle expand/collapse for a specific block
 */
function handleToggleBlock(blockId: string): void {
  store.toggleBlock(blockId);
}

/**
 * Handle expand all blocks
 */
function handleExpandAll(): void {
  store.expandAll(allBlockIds);
}

/**
 * Handle collapse all blocks
 */
function handleCollapseAll(): void {
  store.collapseAll();
}

/**
 * Check if a specific block is expanded
 */
function isBlockExpanded(blockId: string): boolean {
  return store.isExpanded(blockId);
}

/**
 * Handle keyboard navigation
 */
function handleKeydown(event: KeyboardEvent): void {
  const isInTextBox =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement;

  // Skip shortcuts while typing in text boxes
  if (isInTextBox) {
    return;
  }

  // j/k for line navigation (vim-style)
  if (event.key === "j" && selectedLine !== undefined) {
    const nextLine = currentStateLines.find((l) => l.lineNumber > selectedLine!);
    if (nextLine !== undefined) {
      handleLineSelect(nextLine.lineNumber);
    }
  } else if (event.key === "k" && selectedLine !== undefined) {
    const prevLines = currentStateLines.filter(
      (l) => l.lineNumber < selectedLine!
    );
    if (prevLines.length > 0) {
      const prevLine = prevLines[prevLines.length - 1];
      if (prevLine !== undefined) {
        handleLineSelect(prevLine.lineNumber);
      }
    }
  }
  // zR = expand all, zM = collapse all (handled in ExpandControls)
}

/**
 * Reset store when file changes
 */
$effect(() => {
  // Reference file.path to track file changes
  file.path;
  store.reset();
});
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="current-state-view flex flex-col h-full bg-bg-primary"
  role="region"
  aria-label="Current state view for {file.path}"
>
  <!-- Header with file info and controls -->
  <div
    class="flex items-center justify-between px-4 py-2 min-h-[48px] bg-bg-secondary border-b border-border-default"
  >
    <div class="flex items-center gap-3">
      <span class="font-medium text-text-primary truncate max-w-[300px]">
        {file.path}
      </span>
      <span class="text-xs text-text-secondary">
        +{file.additions} -{file.deletions}
      </span>
    </div>

    <ExpandControls
      {hasDeletedBlocks}
      {allExpanded}
      {allCollapsed}
      onExpandAll={handleExpandAll}
      onCollapseAll={handleCollapseAll}
    />
  </div>

  <!-- Content area -->
  <div class="flex-1 overflow-auto">
    {#if currentStateLines.length === 0}
      <!-- Empty state -->
      <div class="flex items-center justify-center h-full text-text-secondary">
        <span>No content to display</span>
      </div>
    {:else}
      <!-- Lines list -->
      <div class="lines-container">
        {#each currentStateLines as line (line.lineNumber)}
          <!-- Render deleted block marker if present -->
          {#if line.deletedBefore !== undefined}
            {#if isBlockExpanded(line.deletedBefore.id)}
              <ExpandedDeletedBlock
                block={line.deletedBefore}
                highlightedLines={deletedBlockHighlightMap.get(line.deletedBefore.id)}
                onCollapse={() => handleToggleBlock(line.deletedBefore!.id)}
              />
            {:else}
              <DeletedMarker
                block={line.deletedBefore}
                onExpand={() => handleToggleBlock(line.deletedBefore!.id)}
              />
            {/if}
          {/if}

          <!-- Render the current state line (skip synthetic EOF lines with empty content) -->
          {#if line.content !== "" || line.changeType !== "unchanged"}
            <div class="{commentRangeLines.includes(line.lineNumber) ? 'bg-accent-muted' : ''}">
              <CurrentStateLineComponent
                {line}
                highlighted={lineHighlightMap.get(line.lineNumber)}
                selected={selectedLine === line.lineNumber}
                onSelect={() => handleLineSelect(line.lineNumber)}
                onCommentClick={onCommentSubmit !== undefined ? (shiftKey) => handleCommentOpen(line.lineNumber, shiftKey) : undefined}
              />
            </div>
            {#if activeComment !== null && line.lineNumber === activeComment.endLine}
              <div class="border-t-2 border-b-2 border-accent-emphasis bg-bg-secondary p-3">
                <textarea
                  class="w-full min-h-[80px] p-2 text-sm font-sans bg-bg-primary border border-border-default rounded resize-y
                         focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
                  placeholder="Ask AI about this code..."
                  bind:value={commentText}
                  onkeydown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) {
                      e.preventDefault();
                      handleCommentSubmitLocal(commentText, true);
                    }
                    if (e.key === "Escape") {
                      handleCommentCancel();
                    }
                  }}
                ></textarea>
                <div class="flex items-center justify-between mt-2">
                  <div class="text-xs text-text-tertiary font-mono">
                    {lineContext}
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
                      onclick={() => handleCommentCancel()}
                    >Cancel</button>
                    <SplitButton
                      disabled={commentText.trim().length === 0}
                      onPrimaryClick={() => handleCommentSubmitLocal(commentText, false)}
                      onSecondaryClick={() => handleCommentSubmitLocal(commentText, true)}
                    />
                  </div>
                </div>
              </div>
            {/if}
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
.current-state-view {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", monospace;
}

.lines-container {
  min-width: max-content;
}
</style>
