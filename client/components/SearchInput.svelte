<script lang="ts">
import type { SearchScope } from "../../src/types/search";

/**
 * SearchInput Component
 *
 * Search input field with scope selector for the diff viewer.
 *
 * Props:
 * - query: Current search query
 * - scope: Current search scope
 * - resultCount: Total number of results (for display)
 * - currentIndex: Current result index (for display)
 * - loading: Whether search is in progress
 * - error: Error message to display
 * - onQueryChange: Callback when query changes
 * - onScopeChange: Callback when scope changes
 * - onSubmit: Callback when search is submitted (Enter)
 * - onClose: Callback when search is closed (Escape)
 * - onNext: Callback to go to next result
 * - onPrev: Callback to go to previous result
 *
 * Design:
 * - Compact search bar with integrated controls
 * - Scope toggle buttons
 * - Keyboard navigation (Enter to search, Escape to close)
 * - Visual indication of regex validity
 */

interface Props {
  query: string;
  scope: SearchScope;
  resultCount?: number;
  currentIndex?: number;
  loading?: boolean;
  error?: string | null;
  onQueryChange: (query: string) => void;
  onScopeChange: (scope: SearchScope) => void;
  onSubmit: () => void;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

// Svelte 5 props syntax
const {
  query,
  scope,
  resultCount = 0,
  currentIndex = -1,
  loading = false,
  error = null,
  onQueryChange,
  onScopeChange,
  onSubmit,
  onClose,
  onNext = undefined,
  onPrev = undefined,
}: Props = $props();

// Regex validity state
let isValidRegex = $state(true);
let regexError = $state<string | null>(null);

// Check regex validity when query changes
$effect(() => {
  if (query.length === 0) {
    isValidRegex = true;
    regexError = null;
  } else {
    try {
      new RegExp(query);
      isValidRegex = true;
      regexError = null;
    } catch (e) {
      isValidRegex = false;
      regexError = e instanceof Error ? e.message : "Invalid regex";
    }
  }
});

/**
 * Get result count display text
 */
const resultText = $derived.by(() => {
  if (loading) {
    return "Searching...";
  }
  if (query.length === 0) {
    return "";
  }
  if (!isValidRegex) {
    return "Invalid regex";
  }
  if (resultCount === 0) {
    return "No results";
  }
  return `${currentIndex + 1} of ${resultCount}`;
});

/**
 * Scope options
 */
const scopeOptions: { value: SearchScope; label: string; title: string }[] = [
  { value: "file", label: "File", title: "Search in current file" },
  { value: "changed", label: "Changed", title: "Search in changed files" },
  { value: "all", label: "All", title: "Search entire repository" },
];

/**
 * Handle input change
 */
function handleInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  onQueryChange(target.value);
}

/**
 * Handle keyboard events
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    if (isValidRegex) {
      onSubmit();
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    onClose();
  } else if (event.key === "F3" || (event.ctrlKey && event.key === "g")) {
    event.preventDefault();
    if (event.shiftKey && onPrev !== undefined) {
      onPrev();
    } else if (onNext !== undefined) {
      onNext();
    }
  }
}

/**
 * Handle scope button click
 */
function handleScopeClick(newScope: SearchScope): void {
  onScopeChange(newScope);
}

/**
 * Focus input on mount
 */
function handleInputMount(element: HTMLInputElement): void {
  setTimeout(() => {
    element.focus();
    element.select();
  }, 100);
}
</script>

<div
  class="search-input flex items-center gap-2 px-3 py-2 min-h-[48px]
         bg-bg-secondary border-b border-border-default"
  role="search"
  aria-label="Search diff content"
>
  <!-- Search Icon -->
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
    class="text-text-tertiary flex-shrink-0"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>

  <!-- Input Field -->
  <div class="flex-1 relative">
    <input
      type="text"
      value={query}
      oninput={handleInput}
      onkeydown={handleKeydown}
      use:handleInputMount
      placeholder="Search (regex supported)..."
      class="w-full px-3 py-1.5 min-h-[36px] text-sm
             bg-bg-primary text-text-primary
             border rounded
             {isValidRegex
        ? 'border-border-default focus:border-blue-500'
        : 'border-red-500'}
             placeholder:text-text-tertiary
             focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      aria-label="Search pattern (regex)"
      aria-invalid={!isValidRegex}
      aria-describedby={regexError !== null ? "regex-error" : undefined}
    />
    {#if regexError !== null}
      <span id="regex-error" class="sr-only">{regexError}</span>
    {/if}
  </div>

  <!-- Scope Selector -->
  <div
    class="flex items-center rounded border border-border-default overflow-hidden"
    role="group"
    aria-label="Search scope"
  >
    {#each scopeOptions as option (option.value)}
      <button
        type="button"
        onclick={() => handleScopeClick(option.value)}
        class="px-2 py-1.5 min-h-[36px] text-xs font-medium
               {scope === option.value
          ? 'bg-blue-600 text-white'
          : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'}
               border-r border-border-default last:border-r-0
               transition-colors duration-150
               focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        aria-pressed={scope === option.value}
        title={option.title}
      >
        {option.label}
      </button>
    {/each}
  </div>

  <!-- Result Count / Status -->
  <span
    class="text-xs min-w-[80px] text-right
           {loading
      ? 'text-text-tertiary'
      : !isValidRegex || error !== null
        ? 'text-red-400'
        : resultCount === 0 && query.length > 0
          ? 'text-yellow-400'
          : 'text-text-secondary'}"
  >
    {error ?? resultText}
  </span>

  <!-- Navigation Buttons -->
  {#if resultCount > 0}
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={onPrev}
        disabled={onPrev === undefined}
        class="p-1.5 min-w-[32px] min-h-[32px]
               text-text-secondary hover:text-text-primary
               hover:bg-bg-hover rounded
               disabled:opacity-50 disabled:cursor-not-allowed
               focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Previous result (Shift+F3)"
        title="Previous result"
      >
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
          aria-hidden="true"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <button
        type="button"
        onclick={onNext}
        disabled={onNext === undefined}
        class="p-1.5 min-w-[32px] min-h-[32px]
               text-text-secondary hover:text-text-primary
               hover:bg-bg-hover rounded
               disabled:opacity-50 disabled:cursor-not-allowed
               focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Next result (F3)"
        title="Next result"
      >
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
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  {/if}

  <!-- Close Button -->
  <button
    type="button"
    onclick={onClose}
    class="p-1.5 min-w-[32px] min-h-[32px]
           text-text-secondary hover:text-text-primary
           hover:bg-bg-hover rounded
           focus:outline-none focus:ring-2 focus:ring-blue-500"
    aria-label="Close search (Escape)"
    title="Close"
  >
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
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  </button>
</div>

<style>
/* Screen reader only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
