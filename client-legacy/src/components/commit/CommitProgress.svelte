<script lang="ts">
  /**
   * CommitProgress Component
   *
   * Shows commit operation progress with spinner and status message.
   *
   * Features:
   * - Animated spinner for visual feedback
   * - Status message display
   * - Different states: preparing, committing, pushing
   * - Touch-friendly with clear visual feedback
   * - Tailwind CSS styling
   *
   * Props:
   * - status: Current commit operation status
   * - message: Status message to display
   */

  type CommitStatus = "preparing" | "committing" | "pushing";

  interface Props {
    readonly status: CommitStatus;
    readonly message: string;
  }

  const { status, message }: Props = $props();

  /**
   * Get status label for display
   */
  const statusLabel = $derived.by((): string => {
    switch (status) {
      case "preparing":
        return "Preparing";
      case "committing":
        return "Committing";
      case "pushing":
        return "Pushing";
      default:
        const _exhaustive: never = status;
        throw new Error(`Unhandled status: ${_exhaustive}`);
    }
  });

  /**
   * Get status color class
   */
  const statusColorClass = $derived.by((): string => {
    switch (status) {
      case "preparing":
        return "text-accent-fg";
      case "committing":
        return "text-accent-fg";
      case "pushing":
        return "text-accent-fg";
      default:
        const _exhaustive: never = status;
        throw new Error(`Unhandled status: ${_exhaustive}`);
    }
  });
</script>

<div
  class="commit-progress flex flex-col items-center justify-center
         p-8 min-h-[200px]
         bg-bg-primary rounded-lg"
  role="status"
  aria-live="polite"
  aria-busy="true"
>
  <!-- Spinner -->
  <div class="flex items-center justify-center mb-6">
    <svg
      class="animate-spin h-12 w-12 {statusColorClass}"
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
      ></circle>
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  </div>

  <!-- Status Label -->
  <div class="text-center space-y-2">
    <h3 class="text-lg font-semibold {statusColorClass}">
      {statusLabel}
    </h3>

    <!-- Status Message -->
    {#if message}
      <p class="text-sm text-text-secondary max-w-md">
        {message}
      </p>
    {/if}
  </div>
</div>

<style>
  /**
   * CommitProgress Styling
   *
   * - Centered layout with spinner
   * - Smooth animations
   * - Touch-friendly spacing
   */
  .commit-progress {
    animation: fade-in 0.2s ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
