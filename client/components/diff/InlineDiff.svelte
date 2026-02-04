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
  }

  let { chunks, onLineSelect = undefined }: Props = $props();

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
      <div class="flex">
        <!-- Old line number column -->
        <div
          class="w-16 flex-shrink-0 px-2 flex items-start justify-end text-text-secondary bg-bg-secondary border-r border-border-default"
        >
          {#if change.oldLine !== undefined}
            <span class="pt-2 min-h-[44px] flex items-start"
              >{change.oldLine}</span
            >
          {:else}
            <!-- Empty placeholder for added lines -->
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
            <!-- Empty placeholder for deleted lines -->
            <span class="pt-2 min-h-[44px] flex items-start opacity-30">-</span>
          {/if}
        </div>

        <!-- Change content using DiffLine component -->
        <div class="flex-1">
          <DiffLine
            {change}
            lineNumber={change.newLine ?? change.oldLine ?? index + 1}
            onSelect={() => handleLineSelect(change.oldLine, change.newLine)}
          />
        </div>
      </div>
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
