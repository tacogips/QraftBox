<script lang="ts">
  /**
   * CommitButton Component
   *
   * Button UI for initiating AI-powered commit with staged count badge.
   *
   * Features:
   * - 44px minimum height for touch-friendly interaction
   * - Staged count badge (displayed when stagedCount > 0)
   * - Disabled state (when no staged files or during operation)
   * - Clear visual feedback on hover/active states
   * - Accessibility support
   *
   * Props:
   * - stagedCount: Number of staged files
   * - disabled: Whether the button is disabled
   * - onclick: Click handler for commit action
   */

  interface Props {
    stagedCount: number;
    disabled: boolean;
    onclick: () => void;
  }

  const { stagedCount, disabled, onclick }: Props = $props();

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
  class="commit-button px-6 py-2 min-h-[44px]
         flex items-center justify-center gap-3
         text-white bg-success-emphasis
         rounded-lg
         hover:brightness-110
         focus:outline-none focus:ring-2 focus:ring-success-emphasis focus:ring-offset-2
         active:brightness-90
         disabled:bg-bg-tertiary disabled:text-text-secondary disabled:cursor-not-allowed
         transition-all
         font-medium text-base"
  aria-label={stagedCount > 0
    ? `Commit ${stagedCount} staged file${stagedCount === 1 ? "" : "s"}`
    : "Commit"}
  aria-disabled={disabled}
>
  <!-- Commit Text -->
  <span class="text-base font-medium">Commit</span>

  <!-- Staged Count Badge -->
  {#if stagedCount > 0}
    <span
      class="staged-count-badge px-2 py-0.5 min-w-[24px]
             flex items-center justify-center
             text-xs font-bold
             bg-success-fg/30 text-white rounded-full"
      aria-label={`${stagedCount} staged file${stagedCount === 1 ? "" : "s"}`}
    >
      {stagedCount}
    </span>
  {/if}
</button>

<style>
  /**
 * CommitButton Styling
 *
 * - 44px minimum height for touch-friendly interaction
 * - Badge with count displayed when stagedCount > 0
 * - Disabled state with reduced opacity
 * - Smooth transitions for hover/active states
 */
  .commit-button {
    -webkit-tap-highlight-color: transparent;
  }

  .commit-button:disabled {
    opacity: 0.6;
  }

  .commit-button:not(:disabled):active {
    transform: scale(0.98);
  }

  .staged-count-badge {
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
