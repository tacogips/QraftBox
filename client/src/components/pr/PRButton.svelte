<script lang="ts">
  /**
   * PRButton Component
   *
   * Button to trigger PR creation flow with GitHub icon.
   *
   * Features:
   * - 44px minimum height for touch-friendly interaction
   * - GitHub icon with "Create PR" text
   * - Disabled state (when no changes or during operation)
   * - Clear visual feedback on hover/active states
   * - Accessibility support
   *
   * Props:
   * - disabled: Whether the button is disabled
   * - onclick: Click handler for PR creation action
   */

  interface Props {
    disabled: boolean;
    onclick: () => void;
  }

  const { disabled, onclick }: Props = $props();

  /**
   * Handle button click
   */
  function handleClick(): void {
    if (!disabled) {
      onclick();
    }
  }

  /**
   * Handle Enter/Space key press
   */
  function handleKeydown(event: KeyboardEvent): void {
    if ((event.key === "Enter" || event.key === " ") && !disabled) {
      event.preventDefault();
      onclick();
    }
  }
</script>

<button
  type="button"
  onclick={handleClick}
  onkeydown={handleKeydown}
  {disabled}
  class="pr-button px-6 py-2 min-h-[44px]
         flex items-center justify-center gap-3
         text-white bg-purple-600
         rounded-lg
         hover:bg-purple-700
         focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
         active:bg-purple-800
         disabled:bg-bg-tertiary disabled:text-text-secondary disabled:cursor-not-allowed
         transition-colors
         font-medium text-base"
  aria-label="Create Pull Request"
  aria-disabled={disabled}
>
  <!-- GitHub Icon -->
  <svg
    class="w-5 h-5"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
    />
  </svg>

  <!-- PR Text -->
  <span class="text-base font-medium">Create PR</span>
</button>

<style>
  /**
   * PRButton Styling
   *
   * - 44px minimum height for touch-friendly interaction
   * - Disabled state with reduced opacity
   * - Smooth transitions for hover/active states
   */
  .pr-button {
    -webkit-tap-highlight-color: transparent;
  }

  .pr-button:disabled {
    opacity: 0.6;
  }

  .pr-button:not(:disabled):active {
    transform: scale(0.98);
  }
</style>
