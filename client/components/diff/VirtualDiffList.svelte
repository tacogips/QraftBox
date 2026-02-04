<script lang="ts">
  import type { DiffChange } from "../../src/types/diff";
  import type { Snippet } from "svelte";

  /**
   * VirtualDiffList Component
   *
   * A virtual scrolling list component optimized for rendering large diff files.
   * Only renders visible items plus a buffer (overscan) for smooth scrolling.
   *
   * Props:
   * - items: Array of diff changes to render
   * - itemHeight: Height of each item in pixels
   * - containerHeight: Height of the visible container in pixels
   * - renderItem: Snippet that renders a single item
   * - onScroll: Optional callback when scroll position changes
   *
   * Performance: Optimized for 500+ lines by only rendering visible items.
   * Uses native implementation without external libraries for simplicity.
   */

  interface Props {
    items: readonly DiffChange[];
    itemHeight: number;
    containerHeight: number;
    renderItem: Snippet<[DiffChange, number]>;
    onScroll?: (scrollTop: number) => void;
  }

  // Svelte 5 props syntax
  let {
    items,
    itemHeight,
    containerHeight,
    renderItem,
    onScroll = undefined,
  }: Props = $props();

  /**
   * Overscan: Number of items to render above and below the visible area
   * This prevents white space during fast scrolling
   */
  const OVERSCAN = 10;

  /**
   * Current scroll position in pixels
   */
  let scrollTop = $state(0);

  /**
   * Calculate the total height of all items
   */
  const totalHeight = $derived.by(() => items.length * itemHeight);

  /**
   * Calculate the index of the first visible item
   */
  const startIndex = $derived.by(() => {
    const index = Math.floor(scrollTop / itemHeight);
    // Apply overscan (but never go below 0)
    return Math.max(0, index - OVERSCAN);
  });

  /**
   * Calculate the index of the last visible item
   */
  const endIndex = $derived.by(() => {
    const visibleItems = Math.ceil(containerHeight / itemHeight);
    const index = Math.floor(scrollTop / itemHeight) + visibleItems;
    // Apply overscan (but never exceed items.length)
    return Math.min(items.length, index + OVERSCAN);
  });

  /**
   * Get the slice of items that should be rendered
   */
  const visibleItems = $derived.by(() => {
    return items.slice(startIndex, endIndex);
  });

  /**
   * Calculate the offset for the visible items container
   * This positions the visible items correctly within the virtual scrollable area
   */
  const offsetY = $derived.by(() => startIndex * itemHeight);

  /**
   * Handle scroll event
   */
  function handleScroll(event: Event): void {
    const target = event.target as HTMLElement;
    if (target === null) {
      return;
    }

    scrollTop = target.scrollTop;

    if (onScroll !== undefined) {
      onScroll(scrollTop);
    }
  }

  /**
   * Set scroll position programmatically (for restoration)
   */
  export function setScrollTop(value: number): void {
    scrollTop = value;
  }
</script>

<div
  class="virtual-list-container overflow-y-auto overflow-x-hidden"
  onscroll={handleScroll}
  style="height: {containerHeight}px;"
>
  <!-- Spacer to create total scrollable height -->
  <div style="height: {totalHeight}px; position: relative;">
    <!-- Visible items container positioned at correct offset -->
    <div style="transform: translateY({offsetY}px);">
      {#each visibleItems as item, localIndex (startIndex + localIndex)}
        {@const globalIndex = startIndex + localIndex}
        {@render renderItem(item, globalIndex)}
      {/each}
    </div>
  </div>
</div>

<style>
  /* Ensure smooth scrolling */
  .virtual-list-container {
    scroll-behavior: auto;
    will-change: scroll-position;
  }

  /* Optimize rendering performance */
  .virtual-list-container > div {
    will-change: transform;
  }
</style>
