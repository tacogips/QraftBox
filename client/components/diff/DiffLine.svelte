<script lang="ts">
import type { DiffChange, DiffChangeType } from "../../src/types/diff";

/**
 * DiffLine Component
 *
 * Renders a single line in the diff view with syntax highlighting,
 * touch-friendly interaction, and selection state.
 *
 * Props:
 * - change: The diff change object containing type, line numbers, and content
 * - lineNumber: Display line number (for UI purposes)
 * - highlighted: Optional HTML string from Shiki for syntax highlighting
 * - selected: Whether this line is currently selected
 * - onSelect: Callback when line is clicked/tapped
 * - onLongPress: Callback when line is long-pressed for context menu
 *
 * Design: Tablet-first with touch-friendly 44px minimum tap targets
 */

interface Props {
  change: DiffChange;
  lineNumber: number;
  highlighted?: string;
  selected?: boolean;
  onSelect?: () => void;
  onLongPress?: () => void;
  onCommentClick?: (shiftKey: boolean) => void;
}

// Svelte 5 props syntax
let {
  change,
  lineNumber,
  highlighted = undefined,
  selected = false,
  onSelect = undefined,
  onLongPress = undefined,
  onCommentClick = undefined,
}: Props = $props();

// State for long press detection
let longPressTimer: ReturnType<typeof setTimeout> | undefined =
  $state(undefined);

/**
 * Get background color class based on change type
 */
function getBackgroundClass(type: DiffChangeType): string {
  switch (type) {
    case "add":
      return "bg-diff-add-bg";
    case "delete":
      return "bg-diff-del-bg";
    case "context":
      return "bg-transparent";
    default:
      // Exhaustive check
      const _exhaustive: never = type;
      throw new Error(`Unhandled change type: ${_exhaustive}`);
  }
}

/**
 * Get indicator symbol based on change type
 */
function getIndicator(type: DiffChangeType): string {
  switch (type) {
    case "add":
      return "+";
    case "delete":
      return "-";
    case "context":
      return " ";
    default:
      // Exhaustive check
      const _exhaustive: never = type;
      throw new Error(`Unhandled change type: ${_exhaustive}`);
  }
}

/**
 * Get indicator color class based on change type
 */
function getIndicatorClass(type: DiffChangeType): string {
  switch (type) {
    case "add":
      return "text-success-fg";
    case "delete":
      return "text-danger-fg";
    case "context":
      return "text-text-secondary";
    default:
      // Exhaustive check
      const _exhaustive: never = type;
      throw new Error(`Unhandled change type: ${_exhaustive}`);
  }
}

/**
 * Handle tap/click on line
 */
function handleClick(): void {
  if (onSelect !== undefined) {
    onSelect();
  }
}

/**
 * Start long press detection on pointer down
 */
function handlePointerDown(): void {
  if (onLongPress !== undefined) {
    longPressTimer = setTimeout(() => {
      if (onLongPress !== undefined) {
        onLongPress();
      }
    }, 500); // 500ms for long press
  }
}

/**
 * Cancel long press if pointer is released or leaves
 */
function handlePointerUp(): void {
  if (longPressTimer !== undefined) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
}

/**
 * Cancel long press if pointer leaves the element
 */
function handlePointerLeave(): void {
  if (longPressTimer !== undefined) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
}
</script>

<div
  class="diff-line-row flex min-h-[44px] font-mono text-sm select-none {getBackgroundClass(
    change.type,
  )} {selected ? 'ring-2 ring-accent-emphasis ring-inset' : ''}"
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerLeave}
  role="button"
  tabindex="0"
  aria-label="Diff line {lineNumber}: {change.content}"
  aria-selected={selected}
>
  <!-- Line Number Column with comment "+" button -->
  <div
    class="w-16 flex-shrink-0 px-2 flex items-start justify-end text-text-secondary border-r border-border-default relative group/gutter"
  >
    {#if onCommentClick !== undefined}
      <button
        type="button"
        class="comment-trigger absolute left-0 top-1 w-6 h-6 flex items-center justify-center
               rounded bg-accent-emphasis text-white text-xs font-bold
               opacity-0 group-hover/gutter:opacity-100
               hover:bg-accent-emphasis transition-opacity z-10 cursor-pointer"
        onclick={(e) => { e.stopPropagation(); onCommentClick?.(e.shiftKey); }}
        aria-label="Add comment on line {lineNumber}"
      >+</button>
    {/if}
    <span class="pt-2 cursor-pointer" onclick={handleClick}>{lineNumber}</span>
  </div>

  <!-- Indicator Column -->
  <div
    class="w-8 flex-shrink-0 flex items-start justify-center {getIndicatorClass(
      change.type,
    )} border-r border-border-default"
  >
    <span class="pt-2 font-bold">{getIndicator(change.type)}</span>
  </div>

  <!-- Content Column -->
  <div class="flex-1 px-3 py-2 overflow-x-auto cursor-pointer" onclick={handleClick}>
    {#if highlighted !== undefined}
      <!-- Render syntax-highlighted HTML from Shiki -->
      <span class="highlighted-line">{@html highlighted}</span>
    {:else}
      <!-- Plain text fallback -->
      <pre class="m-0 p-0">{change.content}</pre>
    {/if}
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

/* Show "+" button when hovering anywhere on the row */
.diff-line-row:hover .comment-trigger {
  opacity: 1;
}
</style>
