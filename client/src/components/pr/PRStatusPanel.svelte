<script lang="ts">
  /**
   * PRStatusPanel Component
   *
   * Displays status of an existing Pull Request.
   *
   * Features:
   * - Shows PR number and status badge
   * - Clickable link to GitHub PR
   * - Status-based color coding (open/closed/merged)
   * - Touch-friendly layout
   *
   * Props:
   * - prUrl: GitHub PR URL
   * - prNumber: PR number
   * - status: PR status (open/closed/merged)
   */

  interface Props {
    prUrl: string;
    prNumber: number;
    status: "open" | "closed" | "merged";
  }

  const { prUrl, prNumber, status }: Props = $props();

  /**
   * Get status badge color based on PR status
   */
  function getStatusColor(): string {
    switch (status) {
      case "open":
        return "bg-success-subtle text-success-fg border-success-emphasis";
      case "closed":
        return "bg-danger-subtle text-danger-fg border-danger-emphasis";
      case "merged":
        return "bg-done-muted text-done-fg border-done-emphasis";
    }
  }

  /**
   * Get status label
   */
  function getStatusLabel(): string {
    switch (status) {
      case "open":
        return "Open";
      case "closed":
        return "Closed";
      case "merged":
        return "Merged";
    }
  }
</script>

<div class="pr-status-panel p-4 bg-bg-secondary border border-border-default rounded-lg">
  <div class="flex items-center justify-between gap-4">
    <!-- PR Info -->
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-2">
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
        <span class="text-base font-medium text-text-primary"
          >Pull Request #{prNumber}</span
        >
      </div>

      <!-- Status Badge -->
      <span
        class="status-badge inline-flex items-center px-3 py-1 rounded-full border text-sm font-medium {getStatusColor()}"
      >
        {getStatusLabel()}
      </span>
    </div>

    <!-- View on GitHub Button -->
    <a
      href={prUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="view-pr-button min-h-[44px] px-4 py-2
             flex items-center gap-2
             text-done-fg bg-bg-primary border border-done-emphasis
             rounded-lg
             hover:bg-done-muted
             focus:outline-none focus:ring-2 focus:ring-done-fg focus:ring-offset-2
             active:bg-done-muted
             transition-colors
             font-medium text-base"
      aria-label="View Pull Request on GitHub"
    >
      <span>View on GitHub</span>
      <svg
        class="w-4 h-4"
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
   * PRStatusPanel Styling
   *
   * - Clean status display
   * - Status-based badge colors
   * - Touch-friendly link button
   */
  .pr-status-panel {
    animation: fade-in 0.3s ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .view-pr-button:active {
    transform: scale(0.98);
  }

  .status-badge {
    animation: badge-appear 0.2s ease-out;
  }

  @keyframes badge-appear {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
