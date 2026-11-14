<script lang="ts">
  /**
   * LabelSelector Component
   *
   * Multi-select component for choosing PR labels with chip-style display.
   *
   * Features:
   * - Chip-style label display
   * - Add/remove labels
   * - Touch-friendly 44px minimum height for chips
   * - Disabled state support
   *
   * Props:
   * - availableLabels: Array of available label names
   * - selected: Array of selected label names
   * - onchange: Callback when selection changes
   * - disabled: Whether selector is disabled
   */

  interface Props {
    availableLabels: readonly string[];
    selected: readonly string[];
    onchange: (labels: readonly string[]) => void;
    disabled?: boolean | undefined;
  }

  const {
    availableLabels,
    selected,
    onchange,
    disabled = false,
  }: Props = $props();

  let isDropdownOpen = $state(false);

  /**
   * Toggle label selection
   */
  function toggleLabel(label: string): void {
    if (disabled) {
      return;
    }

    const newSelected = selected.includes(label)
      ? selected.filter((l) => l !== label)
      : [...selected, label];

    onchange(newSelected);
  }

  /**
   * Remove label from selection
   */
  function removeLabel(label: string): void {
    if (disabled) {
      return;
    }

    onchange(selected.filter((l) => l !== label));
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

<div class="label-selector">
  <label class="block text-sm font-medium text-text-primary mb-2">
    Labels (optional)
  </label>

  <!-- Selected Labels Display -->
  <div
    class="selected-labels flex flex-wrap gap-2 mb-2 min-h-[44px] items-center"
  >
    {#if selected.length === 0}
      <span class="text-sm text-text-tertiary">No labels selected</span>
    {:else}
      {#each selected as label}
        <button
          type="button"
          onclick={() => removeLabel(label)}
          {disabled}
          class="label-chip flex items-center gap-2 px-3 py-1.5 min-h-[36px]
                 bg-accent-subtle text-accent-fg border border-accent-emphasis
                 rounded-full
                 hover:bg-accent-subtle
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 disabled:opacity-50 disabled:cursor-not-allowed
                 text-sm font-medium"
          aria-label="Remove label {label}"
        >
          <span>{label}</span>
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

  <!-- Add Label Button -->
  <div class="relative">
    <button
      type="button"
      onclick={toggleDropdown}
      {disabled}
      class="add-label-button w-full min-h-[44px] px-4 py-2
             text-text-primary bg-bg-primary border border-border-default
             rounded-lg
             flex items-center justify-between
             hover:bg-bg-secondary
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis
             disabled:bg-bg-secondary disabled:cursor-not-allowed
             text-base font-medium"
      aria-label="Add labels"
      aria-expanded={isDropdownOpen}
    >
      <span>Add Labels</span>
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
        class="label-dropdown absolute z-10 mt-2 w-full bg-bg-primary border border-border-default rounded-lg shadow-lg max-h-48 overflow-y-auto"
      >
        {#if availableLabels.length === 0}
          <div class="p-4 text-sm text-text-secondary text-center">
            No labels available
          </div>
        {:else}
          {#each availableLabels as label}
            <button
              type="button"
              onclick={() => {
                toggleLabel(label);
                closeDropdown();
              }}
              class="label-option w-full px-4 py-2 min-h-[44px]
                     text-left text-sm
                     hover:bg-bg-secondary
                     focus:outline-none focus:bg-bg-secondary
                     flex items-center justify-between"
              aria-label="Toggle label {label}"
            >
              <span>{label}</span>
              {#if selected.includes(label)}
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
    Select labels to categorize this pull request
  </p>
</div>

<style>
  /**
   * LabelSelector Styling
   *
   * - Chip-style selected labels
   * - Dropdown for adding labels
   * - Touch-friendly buttons
   */
  .label-chip {
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

  .label-chip:active:not(:disabled) {
    transform: scale(0.95);
  }

  .label-dropdown {
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

  .add-label-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .label-dropdown {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
  }

  .label-dropdown::-webkit-scrollbar {
    width: 6px;
  }

  .label-dropdown::-webkit-scrollbar-track {
    background: transparent;
  }

  .label-dropdown::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
  }
</style>
