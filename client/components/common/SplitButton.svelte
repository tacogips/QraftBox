<script lang="ts">
  /**
   * SplitButton Component
   *
   * A split button with a primary action and a dropdown menu for additional options.
   * Used for submit actions with expandable options.
   *
   * Props:
   * - disabled: Whether the button is disabled
   * - onPrimaryClick: Callback for primary button click
   * - onSecondaryClick: Callback for dropdown menu item click
   * - primaryLabel: Label for primary button (default: "Submit")
   * - secondaryLabel: Label for dropdown menu item (default: "Submit & Run Now")
   */

  interface Props {
    disabled?: boolean;
    onPrimaryClick: () => void;
    onSecondaryClick: () => void;
    primaryLabel?: string;
    secondaryLabel?: string;
  }

  const {
    disabled = false,
    onPrimaryClick,
    onSecondaryClick,
    primaryLabel = "Submit",
    secondaryLabel = "Submit & Run Now",
  }: Props = $props();

  let showDropdown = $state(false);

  function toggleDropdown(): void {
    showDropdown = !showDropdown;
  }

  function handleWindowClick(event: MouseEvent): void {
    if (showDropdown) {
      const target = event.target as HTMLElement;
      if (!target.closest(".split-button-container")) {
        showDropdown = false;
      }
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && showDropdown) {
      event.preventDefault();
      showDropdown = false;
    }
  }
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleKeydown} />

<div class="split-button-container relative flex">
  <!-- Main Submit button -->
  <button
    type="button"
    onclick={onPrimaryClick}
    {disabled}
    class="h-9 px-3
           bg-success-emphasis hover:brightness-110
           text-white text-sm font-medium rounded-l
           disabled:opacity-50 disabled:cursor-not-allowed
           transition-all duration-150
           focus:outline-none focus:ring-2 focus:ring-success-emphasis"
  >
    {primaryLabel}
  </button>
  <!-- Dropdown trigger -->
  <button
    type="button"
    onclick={toggleDropdown}
    {disabled}
    class="h-9 px-2
           bg-success-emphasis hover:brightness-110
           text-white rounded-r
           border-l border-white/20
           disabled:opacity-50 disabled:cursor-not-allowed
           transition-all duration-150
           focus:outline-none focus:ring-2 focus:ring-success-emphasis"
    aria-label="More submit options"
    aria-haspopup="true"
    aria-expanded={showDropdown}
  >
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
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  <!-- Dropdown menu -->
  {#if showDropdown}
    <div
      class="absolute bottom-full right-0 mb-1 w-48
             bg-bg-secondary border border-border-default rounded-lg shadow-lg z-50"
    >
      <button
        type="button"
        onclick={onSecondaryClick}
        class="w-full px-3 py-2 text-left text-sm text-text-primary
               hover:bg-bg-tertiary rounded-lg
               transition-colors duration-150
               focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
      >
        {secondaryLabel}
      </button>
    </div>
  {/if}
</div>
