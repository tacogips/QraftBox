<script lang="ts">
  /**
   * PushBehindWarning Component
   *
   * Warning message displayed when local branch is behind remote.
   *
   * Features:
   * - Warning icon and message
   * - Suggests pull first or force push
   * - Clear visual warning styling
   *
   * Props:
   * - behindCount: Number of commits behind remote
   * - aheadCount: Number of commits ahead of remote
   */

  interface Props {
    behindCount: number;
    aheadCount: number;
  }

  const { behindCount, aheadCount }: Props = $props();

  /**
   * Get warning message based on state
   */
  const message = $derived(() => {
    if (behindCount > 0 && aheadCount > 0) {
      return `Your branch is ${aheadCount} commit${aheadCount === 1 ? "" : "s"} ahead and ${behindCount} commit${behindCount === 1 ? "" : "s"} behind the remote. Consider pulling first or using force push.`;
    } else if (behindCount > 0) {
      return `Your branch is ${behindCount} commit${behindCount === 1 ? "" : "s"} behind the remote. Consider pulling first.`;
    }
    return "";
  });
</script>

{#if behindCount > 0}
  <div
    class="push-behind-warning p-4 bg-yellow-50 border border-yellow-300 rounded-lg"
    role="alert"
  >
    <div class="flex items-start gap-3">
      <!-- Warning Icon -->
      <svg
        class="warning-icon w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clip-rule="evenodd"
        />
      </svg>

      <!-- Warning Message -->
      <div class="flex-1">
        <h3 class="text-sm font-medium text-yellow-800 mb-1">
          Branch Behind Remote
        </h3>
        <p class="text-sm text-yellow-700">
          {message()}
        </p>

        <!-- Suggestions -->
        <div class="mt-3 text-sm text-yellow-700">
          <p class="font-medium">Suggestions:</p>
          <ul class="list-disc list-inside mt-1 space-y-1">
            <li>Pull changes from remote first</li>
            {#if aheadCount > 0}
              <li>
                Use force push if you want to overwrite remote (use with
                caution)
              </li>
            {/if}
          </ul>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /**
   * PushBehindWarning Styling
   *
   * - Yellow warning color scheme
   * - Icon and text layout
   * - Clear suggestions list
   */
  .push-behind-warning {
    width: 100%;
  }

  .warning-icon {
    animation: pulse-warning 2s ease-in-out infinite;
  }

  @keyframes pulse-warning {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
</style>
