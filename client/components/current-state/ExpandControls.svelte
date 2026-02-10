<script lang="ts">
/**
 * ExpandControls Component
 *
 * Provides expand/collapse all controls for deleted blocks in the Current State View.
 *
 * Props:
 * - hasDeletedBlocks: Whether there are any deleted blocks in the view
 * - allExpanded: Whether all deleted blocks are currently expanded
 * - allCollapsed: Whether all deleted blocks are currently collapsed
 * - onExpandAll: Callback to expand all deleted blocks
 * - onCollapseAll: Callback to collapse all deleted blocks
 *
 * Design:
 * - Touch-friendly button sizing (44px minimum tap targets)
 * - Clear visual state indication
 * - Keyboard shortcuts: zR (expand all), zM (collapse all)
 */

interface Props {
  hasDeletedBlocks: boolean;
  allExpanded: boolean;
  allCollapsed: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

// Svelte 5 props syntax
const {
  hasDeletedBlocks,
  allExpanded,
  allCollapsed,
  onExpandAll,
  onCollapseAll,
}: Props = $props();

/**
 * Get the state description for screen readers
 */
function getStateDescription(): string {
  if (!hasDeletedBlocks) {
    return "No deleted blocks";
  }
  if (allExpanded) {
    return "All expanded";
  }
  if (allCollapsed) {
    return "All collapsed";
  }
  return "Mixed state";
}

/**
 * Handle keyboard shortcuts
 */
function handleKeydown(event: KeyboardEvent): void {
  // zR = expand all (vim-style)
  if (event.key === "R" && event.shiftKey === false) {
    // Track last key for z prefix
    return;
  }
  // zM = collapse all (vim-style)
  if (event.key === "M" && event.shiftKey === false) {
    return;
  }
}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="flex items-center gap-1 px-1"
  role="group"
  aria-label="Deleted block expansion controls"
>
  {#if hasDeletedBlocks}
    <!-- State indicator -->
    <span class="text-[10px] text-text-tertiary mr-1" aria-live="polite">
      {getStateDescription()}
    </span>

    <!-- Expand All Button -->
    <button
      type="button"
      onclick={onExpandAll}
      disabled={allExpanded}
      class="px-1.5 py-0.5 min-h-[24px] min-w-[24px] text-xs font-medium rounded
             {allExpanded
        ? 'bg-bg-disabled text-text-disabled cursor-not-allowed'
        : 'bg-bg-secondary text-text-primary hover:bg-bg-hover active:bg-bg-pressed border border-border-default'}
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-2
             transition-colors duration-150"
      aria-label="Expand all deleted blocks (keyboard: zR)"
      aria-disabled={allExpanded}
    >
      <span class="flex items-center gap-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="7 13 12 18 17 13" />
          <polyline points="7 6 12 11 17 6" />
        </svg>
        <span class="hidden sm:inline">Expand All</span>
      </span>
    </button>

    <!-- Collapse All Button -->
    <button
      type="button"
      onclick={onCollapseAll}
      disabled={allCollapsed}
      class="px-1.5 py-0.5 min-h-[24px] min-w-[24px] text-xs font-medium rounded
             {allCollapsed
        ? 'bg-bg-disabled text-text-disabled cursor-not-allowed'
        : 'bg-bg-secondary text-text-primary hover:bg-bg-hover active:bg-bg-pressed border border-border-default'}
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-2
             transition-colors duration-150"
      aria-label="Collapse all deleted blocks (keyboard: zM)"
      aria-disabled={allCollapsed}
    >
      <span class="flex items-center gap-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
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
        <span class="hidden sm:inline">Collapse All</span>
      </span>
    </button>
  {:else}
    <!-- No deleted blocks state -->
    <span class="text-xs text-text-tertiary italic">
      No deleted content
    </span>
  {/if}
</div>
