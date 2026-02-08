<script lang="ts">
  /**
   * PushProgress Component
   *
   * Progress indicator displayed during push operation.
   *
   * Features:
   * - Animated spinner
   * - Progress message
   * - Clean loading state
   *
   * Props:
   * - message: Progress message to display (optional)
   */

  interface Props {
    message?: string | undefined;
  }

  const { message = "Pushing commits..." }: Props = $props();
</script>

<div class="push-progress">
  <div class="flex flex-col items-center justify-center p-8 gap-4">
    <!-- Spinner -->
    <div
      class="spinner w-12 h-12 border-4 border-border-default border-t-success-emphasis rounded-full animate-spin"
      role="status"
      aria-label="Loading"
    ></div>

    <!-- Progress Message -->
    <p class="text-base text-text-primary font-medium">{message}</p>

    <!-- Loading Dots Animation -->
    <div class="loading-dots flex gap-1">
      <span class="dot w-2 h-2 bg-success-emphasis rounded-full"></span>
      <span class="dot w-2 h-2 bg-success-emphasis rounded-full"></span>
      <span class="dot w-2 h-2 bg-success-emphasis rounded-full"></span>
    </div>
  </div>
</div>

<style>
  /**
   * PushProgress Styling
   *
   * - Centered spinner and message
   * - Animated spinner rotation
   * - Loading dots animation
   */
  .push-progress {
    width: 100%;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .loading-dots .dot {
    animation: dot-pulse 1.4s infinite ease-in-out;
  }

  .loading-dots .dot:nth-child(1) {
    animation-delay: -0.32s;
  }

  .loading-dots .dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes dot-pulse {
    0%,
    80%,
    100% {
      transform: scale(0.8);
      opacity: 0.5;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
