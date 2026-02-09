<script lang="ts">
  /**
   * PRSuccess Component
   *
   * Success message displayed after successful PR creation.
   *
   * Features:
   * - Success icon with animation
   * - PR number and URL display
   * - Link to view PR on GitHub
   * - Celebratory UI
   *
   * Props:
   * - prUrl: GitHub PR URL
   * - prNumber: PR number
   */

  interface Props {
    prUrl: string;
    prNumber: number;
  }

  const { prUrl, prNumber }: Props = $props();
</script>

<div class="pr-success">
  <div class="flex flex-col items-center p-6 gap-4">
    <!-- Success Icon -->
    <div class="success-icon-container">
      <svg
        class="success-icon w-16 h-16 text-done-fg"
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
    <h2 class="text-xl font-bold text-text-primary">Pull Request Created!</h2>

    <!-- PR Details -->
    <div class="pr-details w-full space-y-2 text-sm">
      <div class="detail-row flex items-center justify-center gap-2">
        <svg
          class="w-5 h-5 text-done-fg"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
          />
        </svg>
        <span class="text-base font-medium text-text-primary">PR #{prNumber}</span>
      </div>
    </div>

    <!-- Celebratory Message -->
    <p class="text-base text-text-primary text-center">
      Your pull request has been created successfully!
    </p>

    <!-- View on GitHub Button -->
    <a
      href={prUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="view-pr-button w-full min-h-[44px] px-6 py-3
             flex items-center justify-center gap-3
             text-white bg-done-emphasis
             rounded-lg
             hover:opacity-90
             focus:outline-none focus:ring-2 focus:ring-done-fg focus:ring-offset-2
             active:opacity-80
             transition-colors
             font-medium text-base"
      aria-label="View Pull Request on GitHub"
    >
      <span>View on GitHub</span>
      <svg
        class="w-5 h-5"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"
        />
        <path
          d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"
        />
      </svg>
    </a>
  </div>
</div>

<style>
  /**
   * PRSuccess Styling
   *
   * - Centered success icon with animation
   * - Celebratory message
   * - Touch-friendly view button
   */
  .pr-success {
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

  .view-pr-button:active {
    transform: scale(0.98);
  }

  .pr-details {
    background-color: var(--color-bg-secondary);
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--color-border-default);
  }
</style>
