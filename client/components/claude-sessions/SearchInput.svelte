<script lang="ts">
  /**
   * SearchInput Component
   *
   * Debounced search input for filtering Claude sessions.
   * Provides real-time search with performance optimization.
   *
   * Props:
   * - value: Current search query
   * - onSearch: Callback when search query changes (debounced)
   * - placeholder: Placeholder text (default: "Search sessions...")
   * - debounceMs: Debounce delay in milliseconds (default: 300)
   *
   * Design:
   * - Debounced input to avoid excessive API calls
   * - Clear button when text is present
   * - Search icon indicator
   * - Accessible with proper ARIA labels
   */

  interface Props {
    value: string;
    onSearch: (query: string) => void;
    placeholder?: string;
    debounceMs?: number;
  }

  const {
    value,
    onSearch,
    placeholder = "Search sessions...",
    debounceMs = 300,
  }: Props = $props();

  /**
   * Local state for immediate input updates
   */
  let localValue = $state(value);
  let debounceTimer: number | null = $state(null);

  /**
   * Sync local value when prop changes
   */
  $effect(() => {
    localValue = value;
  });

  /**
   * Handle input change with debouncing
   */
  function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    localValue = target.value;

    // Clear existing timer
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    // Set new timer
    debounceTimer = window.setTimeout(() => {
      onSearch(localValue);
      debounceTimer = null;
    }, debounceMs);
  }

  /**
   * Clear search input
   */
  function handleClear(): void {
    localValue = "";
    onSearch("");

    // Clear any pending timer
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  function handleKeyDown(event: KeyboardEvent): void {
    // Escape to clear
    if (event.key === "Escape") {
      event.preventDefault();
      handleClear();
    }
  }
</script>

<!-- Search Input Container -->
<div class="search-input relative w-full">
  <!-- Search Icon -->
  <div
    class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none
           text-text-tertiary"
    aria-hidden="true"
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
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  </div>

  <!-- Input Field -->
  <input
    type="text"
    value={localValue}
    oninput={handleInput}
    onkeydown={handleKeyDown}
    {placeholder}
    class="w-full pl-10 pr-10 py-2.5 rounded-lg
           bg-bg-secondary border border-bg-border
           text-text-primary placeholder-text-tertiary
           focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-transparent
           transition-all duration-150"
    aria-label="Search sessions by prompt or summary"
    autocomplete="off"
    spellcheck="false"
  />

  <!-- Clear Button -->
  {#if localValue.length > 0}
    <button
      type="button"
      onclick={handleClear}
      class="absolute right-2 top-1/2 -translate-y-1/2
             p-1.5 rounded-md
             text-text-tertiary hover:text-text-primary hover:bg-bg-hover
             transition-colors duration-150
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
      aria-label="Clear search"
      title="Clear search (Esc)"
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
  {/if}
</div>
