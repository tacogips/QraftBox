<script lang="ts">
import type { DeletedBlock } from "../../src/types/current-state";

/**
 * DeletedMarker Component
 *
 * Renders a thin red line indicator for collapsed deleted content.
 * Tapping expands the deleted content. Long-press shows a preview popup.
 *
 * Props:
 * - block: The DeletedBlock data
 * - onExpand: Callback to expand this block
 * - onPreview: Optional callback for long-press preview
 *
 * Design:
 * - Thin red line (2px height) when collapsed
 * - Touch-friendly tap area (44px minimum)
 * - Hover hint shows line count
 * - Long-press triggers preview popup
 */

interface Props {
  block: DeletedBlock;
  onExpand: () => void;
  onPreview?: () => void;
}

// Svelte 5 props syntax
const { block, onExpand, onPreview = undefined }: Props = $props();

// State for long press detection
let longPressTimer: ReturnType<typeof setTimeout> | undefined =
  $state(undefined);
let isHovered = $state(false);
let isPressed = $state(false);

/**
 * Get line count description
 */
const lineCountText = $derived(
  block.lines.length === 1
    ? "1 deleted line"
    : `${block.lines.length} deleted lines`
);

/**
 * Get the original line range description
 */
const lineRangeText = $derived(
  block.originalStart === block.originalEnd
    ? `line ${block.originalStart}`
    : `lines ${block.originalStart}-${block.originalEnd}`
);

/**
 * Handle tap/click to expand
 */
function handleClick(): void {
  onExpand();
}

/**
 * Start long press detection on pointer down
 */
function handlePointerDown(): void {
  isPressed = true;
  if (onPreview !== undefined) {
    longPressTimer = setTimeout(() => {
      if (onPreview !== undefined) {
        onPreview();
      }
    }, 500); // 500ms for long press
  }
}

/**
 * Cancel long press if pointer is released
 */
function handlePointerUp(): void {
  isPressed = false;
  if (longPressTimer !== undefined) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
}

/**
 * Cancel long press if pointer leaves the element
 */
function handlePointerLeave(): void {
  isPressed = false;
  isHovered = false;
  if (longPressTimer !== undefined) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
}

/**
 * Track hover state
 */
function handlePointerEnter(): void {
  isHovered = true;
}

/**
 * Handle keyboard activation
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onExpand();
  }
}
</script>

<div
  class="deleted-marker relative min-h-[44px] flex items-center cursor-pointer
         group transition-all duration-150"
  onclick={handleClick}
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerLeave}
  onpointerenter={handlePointerEnter}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
  aria-label="Expand {lineCountText} (original {lineRangeText})"
  aria-expanded="false"
  data-block-id={block.id}
>
  <!-- Left padding to align with line numbers -->
  <div
    class="w-16 flex-shrink-0 px-2 flex items-center justify-end text-text-tertiary border-r border-border-default"
  >
    <span class="text-xs opacity-60">
      {block.originalStart}
    </span>
  </div>

  <!-- Indicator column -->
  <div
    class="w-8 flex-shrink-0 flex items-center justify-center text-danger-fg border-r border-border-default"
  >
    <span class="font-bold text-xs">-</span>
  </div>

  <!-- Red line indicator and hint -->
  <div class="flex-1 relative py-[21px]">
    <!-- The thin red line -->
    <div
      class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-danger-emphasis
             {isHovered || isPressed ? 'h-[4px]' : ''}"
    ></div>

    <!-- Hover/focus hint -->
    <div
      class="absolute left-3 top-1/2 -translate-y-1/2 px-2 py-1
             bg-danger-subtle text-danger-fg text-xs rounded
             opacity-0 group-hover:opacity-100 group-focus:opacity-100
             transition-opacity duration-150 pointer-events-none
             whitespace-nowrap"
    >
      {lineCountText} - tap to expand
    </div>
  </div>
</div>

<style>
.deleted-marker:focus {
  outline: none;
}

.deleted-marker:focus-visible {
  outline: 2px solid var(--color-accent-fg);
  outline-offset: -2px;
}
</style>
