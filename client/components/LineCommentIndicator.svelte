<script lang="ts">
  /**
   * LineCommentIndicator Component
   *
   * Small indicator badge shown next to line numbers when a line has comments.
   * Clicking opens the comments panel for that line.
   *
   * Props:
   * - commentCount: Number of comments on this line
   * - onClick: Callback when indicator is clicked
   *
   * Design:
   * - Small comment icon with count badge
   * - Touch-friendly 44px minimum tap target
   * - High contrast for visibility in diff views
   */

  interface Props {
    commentCount: number;
    onClick: () => void;
  }

  // Svelte 5 props syntax
  const { commentCount, onClick }: Props = $props();

  /**
   * Get display text for comment count
   * Shows "9+" for counts above 9 to keep badge compact
   */
  const displayCount = $derived(commentCount > 9 ? "9+" : String(commentCount));

  /**
   * Handle click on indicator
   */
  function handleClick(event: MouseEvent): void {
    event.stopPropagation();
    onClick();
  }

  /**
   * Handle keyboard activation
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    }
  }
</script>

<button
  type="button"
  class="line-comment-indicator relative inline-flex items-center justify-center
         min-w-[44px] min-h-[44px] p-1
         text-accent-fg hover:text-accent-fg active:text-accent-fg
         hover:bg-accent-muted active:bg-accent-muted
         rounded transition-colors duration-150
         focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-1 focus:ring-offset-bg-primary"
  onclick={handleClick}
  onkeydown={handleKeydown}
  aria-label="{commentCount} comment{commentCount === 1
    ? ''
    : 's'} on this line"
  title="{commentCount} comment{commentCount === 1 ? '' : 's'}"
>
  <!-- Comment Icon -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>

  <!-- Count Badge -->
  <span
    class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1
           flex items-center justify-center
           text-[10px] font-bold text-white
           bg-accent-emphasis rounded-full"
  >
    {displayCount}
  </span>
</button>

<style>
  .line-comment-indicator {
    /* Ensure proper sizing in flex containers */
    flex-shrink: 0;
  }
</style>
