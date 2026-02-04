<script lang="ts">
/**
 * SearchResults Component
 *
 * Displays a list of search results with navigation support.
 *
 * Props:
 * - results: Array of search results to display
 * - currentIndex: Index of currently selected result
 * - loading: Whether search is in progress
 * - truncated: Whether results were truncated
 * - totalMatches: Total number of matches (may differ from results.length)
 * - onSelect: Callback when a result is selected
 * - onClose: Callback when panel is closed
 *
 * Design:
 * - Virtual scrolling for performance with many results
 * - Highlight current selection
 * - Click to navigate to result
 * - Touch-friendly with 44px minimum tap targets
 */

import type { SearchResult } from "../../src/types/search";
import SearchHighlight from "./SearchHighlight.svelte";

interface Props {
  results: readonly SearchResult[];
  currentIndex: number;
  loading?: boolean;
  truncated?: boolean;
  totalMatches?: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

// Svelte 5 props syntax
const {
  results,
  currentIndex,
  loading = false,
  truncated = false,
  totalMatches = 0,
  onSelect,
  onClose,
}: Props = $props();

/**
 * Get file name from path
 */
function getFileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] ?? filePath;
}

/**
 * Get directory path from file path
 */
function getDirectoryPath(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) {
    return "";
  }
  return parts.slice(0, -1).join("/");
}

/**
 * Handle result click
 */
function handleResultClick(index: number): void {
  onSelect(index);
}

/**
 * Handle keyboard navigation in results
 */
function handleKeydown(event: KeyboardEvent, index: number): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(index);
  }
}

/**
 * Scroll current result into view
 */
function scrollCurrentIntoView(element: HTMLElement): void {
  if (currentIndex >= 0 && results.length > 0) {
    // Find the selected item and scroll it into view
    const selectedItem = element.querySelector('[data-selected="true"]');
    if (selectedItem !== null) {
      selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}

/**
 * Group results by file for better organization
 */
const groupedResults = $derived.by(() => {
  const groups: Map<string, { results: SearchResult[]; indices: number[] }> =
    new Map();

  results.forEach((result, index) => {
    const existing = groups.get(result.filePath);
    if (existing !== undefined) {
      existing.results.push(result);
      existing.indices.push(index);
    } else {
      groups.set(result.filePath, {
        results: [result],
        indices: [index],
      });
    }
  });

  return groups;
});
</script>

<div
  class="search-results flex flex-col h-full bg-bg-secondary border-l border-border-default"
  role="region"
  aria-label="Search results"
  use:scrollCurrentIntoView
>
  <!-- Header -->
  <div
    class="flex items-center justify-between px-3 py-2 min-h-[48px]
           border-b border-border-default bg-bg-tertiary"
  >
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-semibold text-text-primary">Results</h2>
      {#if loading}
        <span class="text-xs text-text-tertiary">Searching...</span>
      {:else if results.length > 0}
        <span class="text-xs text-text-secondary">
          {results.length}{truncated ? "+" : ""} matches
          {#if truncated && totalMatches > results.length}
            <span class="text-yellow-400"
              >(showing {results.length} of {totalMatches})</span
            >
          {/if}
        </span>
      {/if}
    </div>
    <button
      type="button"
      onclick={onClose}
      class="p-2 min-w-[44px] min-h-[44px]
             text-text-secondary hover:text-text-primary
             hover:bg-bg-hover rounded
             focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label="Close results"
      title="Close"
    >
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
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>

  <!-- Results List -->
  <div class="flex-1 overflow-y-auto" role="listbox" aria-label="Search results">
    {#if loading}
      <div class="flex items-center justify-center p-8 text-text-tertiary">
        <svg
          class="animate-spin mr-2 h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        Searching...
      </div>
    {:else if results.length === 0}
      <div class="flex flex-col items-center justify-center p-8 text-text-tertiary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="mb-3 opacity-50"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p class="text-sm">No results found</p>
      </div>
    {:else}
      {#each [...groupedResults.entries()] as [filePath, group] (filePath)}
        <!-- File Header -->
        <div
          class="sticky top-0 px-3 py-2 bg-bg-tertiary border-b border-border-default"
        >
          <div class="flex items-center gap-2">
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
              class="text-text-tertiary flex-shrink-0"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-medium text-text-primary truncate">
                {getFileName(filePath)}
              </span>
              {#if getDirectoryPath(filePath) !== ""}
                <span class="text-xs text-text-tertiary truncate">
                  {getDirectoryPath(filePath)}
                </span>
              {/if}
            </div>
            <span
              class="ml-auto text-xs text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded"
            >
              {group.results.length}
            </span>
          </div>
        </div>

        <!-- Results for this file -->
        {#each group.results as result, i (group.indices[i])}
          {@const globalIndex = group.indices[i] ?? 0}
          <button
            type="button"
            onclick={() => handleResultClick(globalIndex)}
            onkeydown={(e) => handleKeydown(e, globalIndex)}
            class="w-full px-3 py-2 min-h-[44px] text-left
                   border-b border-border-default last:border-b-0
                   {currentIndex === globalIndex
              ? 'bg-blue-600/20 border-l-2 border-l-blue-500'
              : 'hover:bg-bg-hover'}
                   focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            role="option"
            aria-selected={currentIndex === globalIndex}
            data-selected={currentIndex === globalIndex}
            tabindex={currentIndex === globalIndex ? 0 : -1}
          >
            <div class="flex items-start gap-3">
              <!-- Line number -->
              <span
                class="flex-shrink-0 text-xs text-text-tertiary tabular-nums w-8 text-right pt-0.5"
              >
                {result.lineNumber}
              </span>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="text-sm text-text-primary font-mono truncate">
                  <SearchHighlight
                    text={result.content}
                    matchStart={result.matchStart}
                    matchEnd={result.matchEnd}
                  />
                </div>

                {#if result.context !== undefined}
                  <!-- Context before -->
                  {#if result.context.before.length > 0}
                    <div class="mt-1 text-xs text-text-tertiary font-mono">
                      {#each result.context.before as line}
                        <div class="truncate opacity-60">{line}</div>
                      {/each}
                    </div>
                  {/if}

                  <!-- Context after -->
                  {#if result.context.after.length > 0}
                    <div class="mt-1 text-xs text-text-tertiary font-mono">
                      {#each result.context.after as line}
                        <div class="truncate opacity-60">{line}</div>
                      {/each}
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          </button>
        {/each}
      {/each}

      <!-- Truncation warning -->
      {#if truncated}
        <div
          class="px-3 py-4 text-center text-sm text-yellow-400 bg-yellow-500/10 border-t border-border-default"
        >
          Results truncated. Refine your search for more specific results.
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
/* Custom scrollbar for results */
.search-results :global(::-webkit-scrollbar) {
  width: 8px;
}

.search-results :global(::-webkit-scrollbar-track) {
  background: transparent;
}

.search-results :global(::-webkit-scrollbar-thumb) {
  background-color: var(--color-border-default, #374151);
  border-radius: 4px;
}

/* Smooth animation for current selection */
[data-selected="true"] {
  transition: background-color 0.15s ease;
}
</style>
