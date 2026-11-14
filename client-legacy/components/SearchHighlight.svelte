<script lang="ts">
  /**
   * SearchHighlight Component
   *
   * Highlights a portion of text by splitting it into three parts:
   * before the match, the match itself, and after the match.
   *
   * Props:
   * - text: The full text content
   * - matchStart: Start index of the match (0-based)
   * - matchEnd: End index of the match (0-based, exclusive)
   * - highlightClass: Optional custom CSS class for the highlight
   *
   * Design: Simple, reusable component for highlighting search matches
   */

  interface Props {
    text: string;
    matchStart: number;
    matchEnd: number;
    highlightClass?: string | undefined;
  }

  // Svelte 5 props syntax
  const {
    text,
    matchStart,
    matchEnd,
    highlightClass = undefined,
  }: Props = $props();

  /**
   * Split text into three parts: before, match, and after
   */
  const textParts = $derived.by(() => {
    // Validate indices
    const start = Math.max(0, matchStart);
    const end = Math.min(text.length, matchEnd);

    // Handle edge cases
    if (start >= end || start >= text.length) {
      // Invalid range - return entire text as "before"
      return {
        before: text,
        match: "",
        after: "",
      };
    }

    return {
      before: text.slice(0, start),
      match: text.slice(start, end),
      after: text.slice(end),
    };
  });

  /**
   * Get highlight class (default or custom)
   */
  function getHighlightClass(): string {
    if (highlightClass !== undefined) {
      return highlightClass;
    }
    return "bg-attention-emphasis text-text-primary";
  }

  /**
   * Escape HTML entities in text
   */
  function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
</script>

<span class="search-highlight-root">
  {#if textParts.before !== ""}
    <span class="search-highlight-before">{escapeHtml(textParts.before)}</span>
  {/if}
  {#if textParts.match !== ""}
    <mark class="search-highlight-match {getHighlightClass()}"
      >{escapeHtml(textParts.match)}</mark
    >
  {/if}
  {#if textParts.after !== ""}
    <span class="search-highlight-after">{escapeHtml(textParts.after)}</span>
  {/if}
</span>

<style>
  /* Reset mark element default styles */
  .search-highlight-match {
    font-weight: inherit;
    font-style: inherit;
  }
</style>
