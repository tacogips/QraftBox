<script lang="ts">
  /**
   * ReviewerSelector Component
   *
   * Multi-select component for choosing PR reviewers with user avatar + name display.
   *
   * Features:
   * - User avatar + name display
   * - Add/remove reviewers
   * - Touch-friendly 44px minimum height
   * - Disabled state support
   *
   * Props:
   * - availableReviewers: Array of available reviewer usernames
   * - selected: Array of selected reviewer usernames
   * - onchange: Callback when selection changes
   * - disabled: Whether selector is disabled
   */

  interface Props {
    availableReviewers: readonly string[];
    selected: readonly string[];
    onchange: (reviewers: readonly string[]) => void;
    disabled?: boolean | undefined;
  }

  const {
    availableReviewers,
    selected,
    onchange,
    disabled = false,
  }: Props = $props();

  let isDropdownOpen = $state(false);

  /**
   * Get avatar URL for username (using GitHub avatars)
   */
  function getAvatarUrl(username: string): string {
    return `https://github.com/${username}.png?size=40`;
  }

  /**
   * Toggle reviewer selection
   */
  function toggleReviewer(reviewer: string): void {
    if (disabled) {
      return;
    }

    const newSelected = selected.includes(reviewer)
      ? selected.filter((r) => r !== reviewer)
      : [...selected, reviewer];

    onchange(newSelected);
  }

  /**
   * Remove reviewer from selection
   */
  function removeReviewer(reviewer: string): void {
    if (disabled) {
      return;
    }

    onchange(selected.filter((r) => r !== reviewer));
  }

  /**
   * Toggle dropdown open/close
   */
  function toggleDropdown(): void {
    if (!disabled) {
      isDropdownOpen = !isDropdownOpen;
    }
  }

  /**
   * Close dropdown
   */
  function closeDropdown(): void {
    isDropdownOpen = false;
  }
</script>

<div class="reviewer-selector">
  <label class="block text-sm font-medium text-text-primary mb-2">
    Reviewers (optional)
  </label>

  <!-- Selected Reviewers Display -->
  <div
    class="selected-reviewers flex flex-wrap gap-2 mb-2 min-h-[44px] items-center"
  >
    {#if selected.length === 0}
      <span class="text-sm text-text-tertiary">No reviewers selected</span>
    {:else}
      {#each selected as reviewer}
        <button
          type="button"
          onclick={() => removeReviewer(reviewer)}
          {disabled}
          class="reviewer-chip flex items-center gap-2 px-3 py-1.5 min-h-[36px]
                 bg-success-subtle text-success-fg border border-success-emphasis
                 rounded-full
                 hover:bg-success-subtle
                 focus:outline-none focus:ring-2 focus:ring-success-emphasis
                 disabled:opacity-50 disabled:cursor-not-allowed
                 text-sm font-medium"
          aria-label="Remove reviewer {reviewer}"
        >
          <img
            src={getAvatarUrl(reviewer)}
            alt="{reviewer} avatar"
            class="w-5 h-5 rounded-full"
          />
          <span>{reviewer}</span>
          <svg
            class="w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      {/each}
    {/if}
  </div>

  <!-- Add Reviewer Button -->
  <div class="relative">
    <button
      type="button"
      onclick={toggleDropdown}
      {disabled}
      class="add-reviewer-button w-full min-h-[44px] px-4 py-2
             text-text-primary bg-bg-primary border border-border-default
             rounded-lg
             flex items-center justify-between
             hover:bg-bg-secondary
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis
             disabled:bg-bg-secondary disabled:cursor-not-allowed
             text-base font-medium"
      aria-label="Add reviewers"
      aria-expanded={isDropdownOpen}
    >
      <span>Add Reviewers</span>
      <svg
        class="w-5 h-5 text-text-tertiary transition-transform {isDropdownOpen
          ? 'rotate-180'
          : ''}"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fill-rule="evenodd"
          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
          clip-rule="evenodd"
        />
      </svg>
    </button>

    <!-- Dropdown List -->
    {#if isDropdownOpen}
      <div
        class="reviewer-dropdown absolute z-10 mt-2 w-full bg-bg-primary border border-border-default rounded-lg shadow-lg max-h-48 overflow-y-auto"
      >
        {#if availableReviewers.length === 0}
          <div class="p-4 text-sm text-text-secondary text-center">
            No reviewers available
          </div>
        {:else}
          {#each availableReviewers as reviewer}
            <button
              type="button"
              onclick={() => {
                toggleReviewer(reviewer);
                closeDropdown();
              }}
              class="reviewer-option w-full px-4 py-2 min-h-[44px]
                     text-left text-sm
                     hover:bg-bg-secondary
                     focus:outline-none focus:bg-bg-secondary
                     flex items-center justify-between gap-3"
              aria-label="Toggle reviewer {reviewer}"
            >
              <div class="flex items-center gap-3">
                <img
                  src={getAvatarUrl(reviewer)}
                  alt="{reviewer} avatar"
                  class="w-6 h-6 rounded-full"
                />
                <span>{reviewer}</span>
              </div>
              {#if selected.includes(reviewer)}
                <svg
                  class="w-5 h-5 text-accent-fg"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <p class="mt-1 text-xs text-text-secondary">
    Select reviewers for this pull request
  </p>
</div>

<style>
  /**
   * ReviewerSelector Styling
   *
   * - Chip-style selected reviewers with avatars
   * - Dropdown for adding reviewers
   * - Touch-friendly buttons
   */
  .reviewer-chip {
    animation: chip-appear 0.2s ease-out;
  }

  @keyframes chip-appear {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .reviewer-chip:active:not(:disabled) {
    transform: scale(0.95);
  }

  .reviewer-dropdown {
    animation: dropdown-appear 0.2s ease-out;
  }

  @keyframes dropdown-appear {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .add-reviewer-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .reviewer-dropdown {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
  }

  .reviewer-dropdown::-webkit-scrollbar {
    width: 6px;
  }

  .reviewer-dropdown::-webkit-scrollbar-track {
    background: transparent;
  }

  .reviewer-dropdown::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
  }
</style>
