<script lang="ts">
import type { CurrentStateLine } from "../../src/types/current-state";

/**
 * CurrentStateLine Component
 *
 * Renders a single line in the Current State View with appropriate
 * styling based on change type.
 *
 * Props:
 * - line: The CurrentStateLine data
 * - highlighted: Optional HTML string from Shiki for syntax highlighting
 * - selected: Whether this line is currently selected
 * - onSelect: Callback when line is clicked/tapped
 * - onLongPress: Callback for long press (context menu)
 *
 * Design:
 * - Green background for added lines
 * - Normal background for unchanged lines
 * - Touch-friendly 44px minimum tap targets
 */

interface Props {
  line: CurrentStateLine;
  highlighted?: string | undefined;
  selected?: boolean;
  onSelect?: () => void;
  onLongPress?: () => void;
  onCommentClick?: (shiftKey: boolean) => void;
}

// Svelte 5 props syntax
const {
  line,
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
function getBackgroundClass(): string {
  switch (line.changeType) {
    case "added":
      return "bg-diff-add-bg";
    case "modified":
      return "bg-attention-muted";
    case "unchanged":
      return "bg-transparent";
    default:
      // Exhaustive check
      const _exhaustive: never = line.changeType;
      throw new Error(`Unhandled change type: ${_exhaustive}`);
  }
}

/**
 * Get indicator symbol based on change type
 */
function getIndicator(): string {
  switch (line.changeType) {
    case "added":
      return "+";
    case "modified":
      return "~";
    case "unchanged":
      return " ";
    default:
      // Exhaustive check
      const _exhaustive: never = line.changeType;
      throw new Error(`Unhandled change type: ${_exhaustive}`);
  }
}

/**
 * Get indicator color class based on change type
 */
function getIndicatorClass(): string {
  switch (line.changeType) {
    case "added":
      return "text-success-fg";
    case "modified":
      return "text-attention-fg";
    case "unchanged":
      return "text-text-secondary";
    default:
      // Exhaustive check
      const _exhaustive: never = line.changeType;
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
 * Cancel long press if pointer is released
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
  class="current-state-line-row flex font-mono text-xs leading-5 cursor-pointer select-none {getBackgroundClass()} {selected
    ? 'ring-2 ring-accent-emphasis ring-inset'
    : ''}"
  onclick={handleClick}
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerLeave}
  role="button"
  tabindex="0"
  aria-label="Line {line.lineNumber}: {line.content}"
  aria-selected={selected}
>
  <!-- Line Number Column -->
  <div
    class="w-16 flex-shrink-0 px-2 flex items-start justify-end text-text-secondary border-r border-border-default relative group/gutter"
  >
    {#if onCommentClick !== undefined}
      <button
        type="button"
        class="comment-trigger absolute left-0 top-1 w-6 h-6 flex items-center justify-center
               rounded bg-accent-emphasis text-white text-xs font-bold
               opacity-0 group-hover/gutter:opacity-100
               hover:bg-accent-fg transition-opacity z-10 cursor-pointer"
        onclick={(e) => { e.stopPropagation(); onCommentClick?.(e.shiftKey); }}
        aria-label="Add comment on line {line.lineNumber}"
      >+</button>
    {/if}
    <span>{line.lineNumber}</span>
  </div>

  <!-- Indicator Column -->
  <div
    class="w-8 flex-shrink-0 flex items-start justify-center {getIndicatorClass()} border-r border-border-default"
  >
    <span class="font-bold">{getIndicator()}</span>
  </div>

  <!-- Content Column -->
  <div class="flex-1 px-2 overflow-x-auto">
    {#if highlighted !== undefined}
      <!-- Render syntax-highlighted HTML from Shiki -->
      <span class="highlighted-line">{@html highlighted}</span>
    {:else}
      <!-- Plain text fallback -->
      <pre class="m-0 p-0">{line.content}</pre>
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
.current-state-line-row:hover .comment-trigger {
  opacity: 1;
}
</style>
