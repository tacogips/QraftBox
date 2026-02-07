<script lang="ts">
/**
 * FileAutocomplete Component
 *
 * Provides autocomplete dropdown for file references in AI prompts.
 * Supports @ file mentions with optional line ranges.
 *
 * Props:
 * - query: Current search query (text after @)
 * - changedFiles: Array of changed file paths (prioritized)
 * - allFiles: Array of all file paths in the project
 * - visible: Whether dropdown is visible
 * - onSelect: Callback when a file is selected
 * - onClose: Callback when autocomplete should close
 *
 * Design:
 * - Fuzzy search on file paths
 * - Prioritize changed files
 * - Support @file.ts:L10-L20 syntax
 * - Touch-friendly with 48px items
 */

interface LineRange {
  readonly start: number;
  readonly end: number;
}

interface Props {
  query: string;
  changedFiles: readonly string[];
  allFiles: readonly string[];
  visible: boolean;
  onSelect: (path: string, lineRange?: LineRange | undefined) => void;
  onClose: () => void;
}

// Svelte 5 props syntax
const {
  query,
  changedFiles,
  allFiles,
  visible,
  onSelect,
  onClose,
}: Props = $props();

/**
 * Selected index in results
 */
let selectedIndex = $state(0);

/**
 * Parse line range from query
 * Matches: :L10, :L10-L20, :L10-20
 */
function parseLineRange(q: string): {
  path: string;
  lineRange?: LineRange | undefined;
} {
  const lineMatch = q.match(/:L(\d+)(?:-L?(\d+))?$/);
  if (lineMatch !== null) {
    const start = parseInt(lineMatch[1] ?? "1", 10);
    const end = lineMatch[2] !== undefined ? parseInt(lineMatch[2], 10) : start;
    return {
      path: q.slice(0, lineMatch.index),
      lineRange: { start, end },
    };
  }
  return { path: q };
}

/**
 * Fuzzy match score (higher is better)
 */
function fuzzyScore(path: string, searchTerm: string): number {
  if (searchTerm.length === 0) return 1;

  const lowerPath = path.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();

  // Exact match
  if (lowerPath === lowerSearch) return 100;

  // Contains exact match
  if (lowerPath.includes(lowerSearch)) {
    // Prefer matches at end (filename)
    const index = lowerPath.lastIndexOf(lowerSearch);
    return 50 + (index / lowerPath.length) * 40;
  }

  // Fuzzy character match
  let score = 0;
  let searchIndex = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < lowerPath.length && searchIndex < lowerSearch.length; i++) {
    if (lowerPath[i] === lowerSearch[searchIndex]) {
      score += 1;
      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) {
        score += 2;
      }
      // Bonus for matches after / or .
      if (i === 0 || lowerPath[i - 1] === "/" || lowerPath[i - 1] === ".") {
        score += 3;
      }
      lastMatchIndex = i;
      searchIndex++;
    }
  }

  // Only count if all search chars matched
  if (searchIndex < lowerSearch.length) {
    return 0;
  }

  return score;
}

/**
 * Get file name from path
 */
function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/**
 * Get directory from path
 */
function getDirectory(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

/**
 * Filter and sort files based on query
 */
const filteredFiles = $derived.by(() => {
  const { path: searchPath } = parseLineRange(query);

  // Score all files
  const changedSet = new Set(changedFiles);
  const scored: { path: string; score: number; isChanged: boolean }[] = [];

  // Add changed files first
  for (const path of changedFiles) {
    const score = fuzzyScore(path, searchPath);
    if (score > 0 || searchPath.length === 0) {
      scored.push({ path, score, isChanged: true });
    }
  }

  // Add other files
  for (const path of allFiles) {
    if (!changedSet.has(path)) {
      const score = fuzzyScore(path, searchPath);
      if (score > 0 || searchPath.length === 0) {
        scored.push({ path, score, isChanged: false });
      }
    }
  }

  // Sort by changed status, then score
  scored.sort((a, b) => {
    // Changed files first when no query
    if (searchPath.length === 0) {
      if (a.isChanged !== b.isChanged) {
        return a.isChanged ? -1 : 1;
      }
    }
    // Then by score
    return b.score - a.score;
  });

  // Limit to top 10
  return scored.slice(0, 10);
});

/**
 * Reset selection when results change
 */
$effect(() => {
  // Access filteredFiles to trigger on change
  if (filteredFiles.length > 0) {
    selectedIndex = 0;
  }
});

/**
 * Handle keyboard navigation
 */
function handleKeydown(event: KeyboardEvent): void {
  if (!visible || filteredFiles.length === 0) return;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredFiles.length;
      break;
    case "ArrowUp":
      event.preventDefault();
      selectedIndex =
        selectedIndex === 0 ? filteredFiles.length - 1 : selectedIndex - 1;
      break;
    case "Enter":
      event.preventDefault();
      handleSelect(selectedIndex);
      break;
    case "Escape":
      event.preventDefault();
      onClose();
      break;
    case "Tab":
      event.preventDefault();
      handleSelect(selectedIndex);
      break;
  }
}

/**
 * Handle file selection
 */
function handleSelect(index: number): void {
  const file = filteredFiles[index];
  if (file === undefined) return;

  const { lineRange } = parseLineRange(query);
  onSelect(file.path, lineRange);
}

/**
 * Handle item click
 */
function handleItemClick(index: number): void {
  handleSelect(index);
}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if visible && filteredFiles.length > 0}
  <div
    class="file-autocomplete absolute z-50 w-full max-w-md
           bg-bg-primary border border-border-default rounded-lg shadow-lg
           max-h-80 overflow-y-auto"
    role="listbox"
    aria-label="File suggestions"
  >
    {#each filteredFiles as file, index (file.path)}
      <button
        type="button"
        onclick={() => handleItemClick(index)}
        class="w-full px-3 py-3 min-h-[48px] text-left flex items-center gap-3
               {index === selectedIndex
          ? 'bg-accent-muted border-l-2 border-l-blue-500'
          : 'hover:bg-bg-hover'}
               border-b border-border-default last:border-b-0
               focus:outline-none"
        role="option"
        aria-selected={index === selectedIndex}
      >
        <!-- File icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="flex-shrink-0 {file.isChanged
            ? 'text-attention-fg'
            : 'text-text-tertiary'}"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>

        <!-- File info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-text-primary truncate">
              {getFileName(file.path)}
            </span>
            {#if file.isChanged}
              <span
                class="px-1.5 py-0.5 text-[10px] font-medium
                       bg-attention-emphasis/20 text-attention-fg rounded"
              >
                Changed
              </span>
            {/if}
          </div>
          {#if getDirectory(file.path) !== ""}
            <span class="text-xs text-text-tertiary truncate block">
              {getDirectory(file.path)}
            </span>
          {/if}
        </div>
      </button>
    {/each}

    <!-- Help text -->
    <div
      class="px-3 py-2 text-xs text-text-tertiary bg-bg-tertiary border-t border-border-default"
    >
      <span class="opacity-70">Tip: Use </span>
      <code class="px-1 py-0.5 bg-bg-secondary rounded">@file.ts:L10-L20</code>
      <span class="opacity-70"> for line ranges</span>
    </div>
  </div>
{/if}
