<script lang="ts">
  /**
   * PushSuccess Component
   *
   * Success message displayed after successful push operation.
   *
   * Features:
   * - Success icon with animation
   * - Push details (remote, branch, commit count)
   * - Session ID for reference
   * - Close button
   *
   * Props:
   * - remote: Remote name
   * - branch: Branch name
   * - pushedCommits: Number of commits pushed
   * - sessionId: AI session ID
   * - onclose: Callback when close button clicked
   */

  interface Props {
    remote: string;
    branch: string;
    pushedCommits: number;
    sessionId: string;
    onclose: () => void;
  }

  const { remote, branch, pushedCommits, sessionId, onclose }: Props = $props();

  /**
   * Handle close button click
   */
  function handleClose(): void {
    onclose();
  }

  /**
   * Handle Enter/Space key press on close button
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onclose();
    }
  }
</script>

<div class="push-success">
  <div class="flex flex-col items-center p-6 gap-4">
    <!-- Success Icon -->
    <div class="success-icon-container">
      <svg
        class="success-icon w-16 h-16 text-success-fg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clip-rule="evenodd"
        />
      </svg>
    </div>

    <!-- Success Message -->
    <h2 class="text-xl font-bold text-text-primary">Push Successful!</h2>

    <!-- Push Details -->
    <div class="push-details w-full space-y-2 text-sm">
      <div class="detail-row flex justify-between">
        <span class="text-text-secondary">Remote:</span>
        <span class="font-medium text-text-primary">{remote}</span>
      </div>

      <div class="detail-row flex justify-between">
        <span class="text-text-secondary">Branch:</span>
        <span class="font-medium text-text-primary">{branch}</span>
      </div>

      <div class="detail-row flex justify-between">
        <span class="text-text-secondary">Commits Pushed:</span>
        <span class="font-medium text-text-primary">{pushedCommits}</span>
      </div>

      <div class="detail-row flex justify-between">
        <span class="text-text-secondary">Session ID:</span>
        <span class="font-mono text-xs text-text-primary truncate max-w-[200px]"
          >{sessionId}</span
        >
      </div>
    </div>

    <!-- Close Button -->
    <button
      type="button"
      onclick={handleClose}
      onkeydown={handleKeydown}
      class="close-button w-full min-h-[44px] px-6 py-2
             text-white bg-success-emphasis
             rounded-lg
             hover:bg-success-emphasis
             focus:outline-none focus:ring-2 focus:ring-success-emphasis focus:ring-offset-2
             active:bg-success-emphasis
             transition-colors
             font-medium text-base"
      aria-label="Close success message"
    >
      Close
    </button>
  </div>
</div>

<style>
  /**
   * PushSuccess Styling
   *
   * - Centered success icon with animation
   * - Details grid layout
   * - Touch-friendly close button
   */
  .push-success {
    width: 100%;
  }

  .success-icon-container {
    animation: scale-in 0.3s ease-out;
  }

  .success-icon {
    animation: check-bounce 0.6s ease-out;
  }

  @keyframes scale-in {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes check-bounce {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  .close-button:active {
    transform: scale(0.98);
  }

  .push-details {
    background-color: var(--color-bg-secondary);
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--color-border-default);
  }

  .detail-row {
    padding: 0.25rem 0;
  }
</style>
