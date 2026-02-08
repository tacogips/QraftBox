<script lang="ts">
import type { DeletedBlock } from "../../src/types/current-state";

/**
 * ExpandedDeletedBlock Component
 *
 * Renders expanded deleted content with red background and collapse controls.
 *
 * Props:
 * - block: The DeletedBlock data
 * - onCollapse: Callback to collapse this block
 * - highlightedLines: Optional array of HTML strings from Shiki for syntax highlighting
 *
 * Design:
 * - Red background to clearly indicate deleted content
 * - Shows original line numbers
 * - Collapse button in header
 * - Smooth expand/collapse animation
 */

interface Props {
  block: DeletedBlock;
  onCollapse: () => void;
  highlightedLines?: readonly string[] | undefined;
}

// Svelte 5 props syntax
const { block, onCollapse, highlightedLines = undefined }: Props = $props();

/**
 * Get the line count text
 */
const lineCountText = $derived(
  block.lines.length === 1
    ? "1 deleted line"
    : `${block.lines.length} deleted lines`
);

/**
 * Get line number for a specific line in the block
 */
function getLineNumber(index: number): number {
  return block.originalStart + index;
}

/**
 * Handle collapse button click
 */
function handleCollapse(): void {
  onCollapse();
}

/**
 * Handle keyboard activation for collapse
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    onCollapse();
  }
}
</script>

<div
  class="expanded-deleted-block border-l-4 border-danger-emphasis bg-danger-subtle overflow-hidden"
  role="region"
  aria-label="Expanded deleted content: {lineCountText}"
  data-block-id={block.id}
  onkeydown={handleKeydown}
>
  <!-- Header with collapse button -->
  <div
    class="flex items-center justify-between px-3 py-2 min-h-[44px] bg-danger-subtle border-b border-danger-emphasis"
  >
    <div class="flex items-center gap-2 text-sm">
      <span class="text-danger-fg font-medium">
        {lineCountText}
      </span>
      <span class="text-danger-fg/60 text-xs">
        (original lines {block.originalStart}-{block.originalEnd})
      </span>
    </div>

    <button
      type="button"
      onclick={handleCollapse}
      class="px-3 py-1.5 min-h-[32px] text-xs font-medium rounded
             bg-danger-subtle text-danger-fg border border-danger-emphasis
             hover:bg-danger-emphasis active:bg-danger-emphasis
             focus:outline-none focus:ring-2 focus:ring-danger-emphasis focus:ring-offset-2 focus:ring-offset-danger-subtle
             transition-colors duration-150"
      aria-label="Collapse deleted content"
    >
      <span class="flex items-center gap-1.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="17 11 12 6 7 11" />
          <polyline points="17 18 12 13 7 18" />
        </svg>
        Collapse
      </span>
    </button>
  </div>

  <!-- Deleted lines content -->
  <div class="deleted-lines">
    {#each block.lines as lineContent, index}
      <div
        class="flex min-h-[36px] font-mono text-sm bg-danger-subtle border-b border-danger-emphasis last:border-b-0"
      >
        <!-- Original line number -->
        <div
          class="w-16 flex-shrink-0 px-2 flex items-start justify-end text-danger-fg/60 border-r border-danger-emphasis"
        >
          <span class="pt-2">{getLineNumber(index)}</span>
        </div>

        <!-- Delete indicator -->
        <div
          class="w-8 flex-shrink-0 flex items-start justify-center text-danger-fg border-r border-danger-emphasis"
        >
          <span class="pt-2 font-bold">-</span>
        </div>

        <!-- Content -->
        <div class="flex-1 px-3 py-2 text-danger-fg overflow-x-auto">
          {#if highlightedLines !== undefined && highlightedLines[index] !== undefined}
            <!-- Render syntax-highlighted HTML from Shiki -->
            <span class="highlighted-line">{@html highlightedLines[index]}</span>
          {:else}
            <!-- Plain text fallback -->
            <pre class="m-0 p-0">{lineContent}</pre>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
/* Ensure pre tags don't add extra spacing */
pre {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.highlighted-line {
  white-space: pre-wrap;
  word-break: break-word;
}

/* Animation for expand/collapse */
.expanded-deleted-block {
  animation: expand-block 200ms ease-out;
}

@keyframes expand-block {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 2000px;
  }
}
</style>
