<script lang="ts">
  /**
   * PushButton Component
   *
   * Button UI for initiating AI-powered push with unpushed count badge.
   *
   * Features:
   * - 44px minimum height for touch-friendly interaction
   * - Unpushed count badge (displayed when unpushedCount > 0)
   * - Disabled state (when no unpushed commits or during operation)
   * - Clear visual feedback on hover/active states
   * - Accessibility support
   *
   * Props:
   * - unpushedCount: Number of unpushed commits
   * - disabled: Whether the button is disabled
   * - onclick: Click handler for push action
   */

  interface Props {
    unpushedCount: number;
    disabled: boolean;
    onclick: () => void;
  }

  const { unpushedCount, disabled, onclick }: Props = $props();

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
  class="push-button px-6 py-2 min-h-[44px]
         flex items-center justify-center gap-3
         text-white bg-green-600
         rounded-lg
         hover:bg-green-700
         focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
         active:bg-green-800
         disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed
         transition-colors
         font-medium text-base"
  aria-label={unpushedCount > 0
    ? `Push ${unpushedCount} unpushed commit${unpushedCount === 1 ? "" : "s"}`
    : "Push"}
  aria-disabled={disabled}
>
  <!-- Push Text -->
  <span class="text-base font-medium">Push</span>

  <!-- Unpushed Count Badge -->
  {#if unpushedCount > 0}
    <span
      class="unpushed-count-badge px-2 py-0.5 min-w-[24px]
             flex items-center justify-center
             text-xs font-bold
             bg-green-800 text-white rounded-full"
      aria-label={`${unpushedCount} unpushed commit${unpushedCount === 1 ? "" : "s"}`}
    >
      {unpushedCount}
    </span>
  {/if}
</button>

<style>
  /**
   * PushButton Styling
   *
   * - 44px minimum height for touch-friendly interaction
   * - Badge with count displayed when unpushedCount > 0
   * - Disabled state with reduced opacity
   * - Smooth transitions for hover/active states
   */
  .push-button {
    -webkit-tap-highlight-color: transparent;
  }

  .push-button:disabled {
    opacity: 0.6;
  }

  .push-button:not(:disabled):active {
    transform: scale(0.98);
  }

  .unpushed-count-badge {
    animation: badge-appear 0.2s ease-out;
  }

  @keyframes badge-appear {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
