<script lang="ts">
  /**
   * PRProgress Component
   *
   * Progress indicator displayed during PR creation operation.
   *
   * Features:
   * - Animated spinner
   * - Stage-based progress messages
   * - Loading dots animation
   *
   * Props:
   * - stage: Current operation stage (preparing/creating/done)
   * - message: Progress message to display (optional)
   */

  interface Props {
    stage: "preparing" | "creating" | "done";
    message?: string | undefined;
  }

  const { stage, message }: Props = $props();

  /**
   * Get default message based on stage
   */
  function getDefaultMessage(): string {
    switch (stage) {
      case "preparing":
        return "Preparing pull request...";
      case "creating":
        return "Creating pull request...";
      case "done":
        return "Pull request created!";
    }
  }

  const displayMessage = message ?? getDefaultMessage();
</script>

<div class="pr-progress">
  <div class="flex flex-col items-center justify-center p-8 gap-4">
    <!-- Spinner -->
    <div
      class="spinner w-12 h-12 border-4 border-gray-200 border-t-purple-600 rounded-full animate-spin"
      role="status"
      aria-label="Loading"
    ></div>

    <!-- Progress Message -->
    <p class="text-base text-gray-700 font-medium">{displayMessage}</p>

    <!-- Stage Indicator -->
    <div class="stage-indicator flex gap-2">
      <div
        class="stage-dot w-2 h-2 rounded-full {stage === 'preparing' ||
        stage === 'creating' ||
        stage === 'done'
          ? 'bg-purple-600'
          : 'bg-gray-300'}"
      ></div>
      <div
        class="stage-dot w-2 h-2 rounded-full {stage === 'creating' ||
        stage === 'done'
          ? 'bg-purple-600'
          : 'bg-gray-300'}"
      ></div>
      <div
        class="stage-dot w-2 h-2 rounded-full {stage === 'done'
          ? 'bg-purple-600'
          : 'bg-gray-300'}"
      ></div>
    </div>

    <!-- Loading Dots Animation -->
    <div class="loading-dots flex gap-1">
      <span class="dot w-2 h-2 bg-purple-600 rounded-full"></span>
      <span class="dot w-2 h-2 bg-purple-600 rounded-full"></span>
      <span class="dot w-2 h-2 bg-purple-600 rounded-full"></span>
    </div>
  </div>
</div>

<style>
  /**
   * PRProgress Styling
   *
   * - Centered spinner and message
   * - Animated spinner rotation
   * - Stage indicator dots
   * - Loading dots animation
   */
  .pr-progress {
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

  .stage-dot {
    transition: background-color 0.3s ease;
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
