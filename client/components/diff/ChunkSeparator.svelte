<script lang="ts">
  import type { DiffChunk } from "../../src/types/diff";

  /**
   * ChunkSeparator Component
   *
   * Displays a chunk header between diff hunks, showing the line range
   * and optional controls for expanding context.
   *
   * Props:
   * - chunk: The diff chunk object containing header and line range info
   * - onExpandContext: Optional callback to expand hidden context lines
   *
   * Design:
   * - GitHub-style chunk header format: @@ -a,b +c,d @@
   * - Subtle background color to distinguish from diff lines
   * - Touch-friendly 44px minimum height
   * - Expand context button when callback is provided
   */

  interface Props {
    chunk: DiffChunk;
    onExpandContext?: () => void;
  }

  // Svelte 5 props syntax
  let { chunk, onExpandContext = undefined }: Props = $props();

  /**
   * Format the chunk header in GitHub format
   * Example: @@ -10,5 +10,6 @@
   */
  function formatChunkHeader(): string {
    return `@@ -${chunk.oldStart},${chunk.oldLines} +${chunk.newStart},${chunk.newLines} @@`;
  }

  /**
   * Calculate the line range for display
   * Example: "lines 10-15"
   */
  function formatLineRange(): string {
    const oldEnd = chunk.oldStart + chunk.oldLines - 1;
    const newEnd = chunk.newStart + chunk.newLines - 1;

    // If old and new ranges are the same, show single range
    if (chunk.oldStart === chunk.newStart && oldEnd === newEnd) {
      return `lines ${chunk.newStart}-${newEnd}`;
    }

    // Otherwise show both ranges
    return `old: ${chunk.oldStart}-${oldEnd}, new: ${chunk.newStart}-${newEnd}`;
  }

  /**
   * Handle expand context button click
   */
  function handleExpandContext(): void {
    if (onExpandContext !== undefined) {
      onExpandContext();
    }
  }
</script>

<div
  class="flex items-center min-h-[44px] px-4 py-2 bg-bg-tertiary border-y border-border-default"
  role="separator"
  aria-label="Diff chunk: {formatChunkHeader()}"
>
  <!-- Chunk Header -->
  <div class="flex-1 flex items-center gap-3">
    <span class="font-mono text-sm text-text-secondary font-medium">
      {formatChunkHeader()}
    </span>
    <span class="text-xs text-text-tertiary">
      {formatLineRange()}
    </span>
  </div>

  <!-- Expand Context Button (optional) -->
  {#if onExpandContext !== undefined}
    <button
      onclick={handleExpandContext}
      class="px-3 py-1.5 min-h-[32px] text-xs font-medium text-text-primary bg-bg-secondary border border-border-default rounded hover:bg-bg-hover active:bg-bg-pressed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      type="button"
      aria-label="Expand hidden context lines"
    >
      Expand context
    </button>
  {/if}
</div>
