<script lang="ts">
  /**
   * CommitSuccess Component
   *
   * Shows successful commit result with commit hash and message.
   *
   * Features:
   * - Success icon and message
   * - Commit hash display (short format)
   * - Commit message preview
   * - "Push" button to continue to push flow
   * - "Done" button to dismiss
   * - Touch-friendly buttons (min 44px)
   * - Tailwind CSS styling
   *
   * Props:
   * - commitHash: Full commit hash
   * - message: Commit message
   * - onDismiss: Callback when "Done" button is clicked
   * - onPush: Callback when "Push" button is clicked
   */

  interface Props {
    readonly commitHash: string;
    readonly message: string;
    readonly onDismiss: () => void;
    readonly onPush: () => void;
  }

  const { commitHash, message, onDismiss, onPush }: Props = $props();

  /**
   * Get short commit hash (first 7 characters)
   */
  const shortHash = $derived.by((): string => {
    return commitHash.slice(0, 7);
  });

  /**
   * Get first line of commit message for preview
   */
  const messagePreview = $derived.by((): string => {
    const lines = message.split("\n");
    const firstLine = lines[0];
    if (firstLine === undefined) {
      return "";
    }
    return firstLine.trim();
  });

  /**
   * Handle Done button click
   */
  function handleDismiss(): void {
    onDismiss();
  }

  /**
   * Handle Push button click
   */
  function handlePush(): void {
    onPush();
  }

  /**
   * Handle keyboard events
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      handleDismiss();
    }
  }
</script>

<div
  class="commit-success flex flex-col items-center justify-center
         p-8 min-h-[300px]
         bg-bg-primary rounded-lg"
  role="status"
  aria-live="polite"
  onkeydown={handleKeydown}
>
  <!-- Success Icon -->
  <div class="flex items-center justify-center mb-6">
    <div
      class="w-16 h-16 rounded-full bg-success-subtle
             flex items-center justify-center"
    >
      <svg
        class="w-10 h-10 text-success-fg"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 13l4 4L19 7"
        />
      </svg>
    </div>
  </div>

  <!-- Success Message -->
  <div class="text-center space-y-3 mb-6 max-w-lg">
    <h3 class="text-xl font-semibold text-text-primary">Commit Successful</h3>

    <!-- Commit Hash -->
    <div class="flex items-center justify-center gap-2">
      <span class="text-sm text-text-tertiary">Commit:</span>
      <code
        class="px-2 py-1 text-sm font-mono
               bg-bg-tertiary text-accent-fg
               rounded border border-border-default"
        title={commitHash}
      >
        {shortHash}
      </code>
    </div>

    <!-- Commit Message Preview -->
    {#if messagePreview}
      <div
        class="px-4 py-3 bg-bg-secondary rounded border border-border-default"
      >
        <p class="text-sm text-text-secondary font-mono text-left truncate">
          {messagePreview}
        </p>
      </div>
    {/if}
  </div>

  <!-- Action Buttons -->
  <div class="flex items-center gap-3 w-full max-w-sm">
    <button
      type="button"
      onclick={handleDismiss}
      class="flex-1 px-6 py-3 min-h-[44px]
             text-text-primary bg-bg-tertiary
             border border-border-default rounded-lg
             hover:bg-bg-hover
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis
             font-medium transition-colors"
      aria-label="Close commit success dialog"
    >
      Done
    </button>

    <button
      type="button"
      onclick={handlePush}
      class="flex-1 px-6 py-3 min-h-[44px]
             text-white bg-accent-emphasis
             rounded-lg
             hover:bg-accent-emphasis
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis
             font-medium transition-colors"
      aria-label="Continue to push"
    >
      Push
    </button>
  </div>
</div>

<style>
  /**
   * CommitSuccess Styling
   *
   * - Centered layout with success icon
   * - Touch-friendly buttons
   * - Smooth animations
   */
  .commit-success {
    animation: fade-in-scale 0.3s ease-out;
  }

  @keyframes fade-in-scale {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
