<script lang="ts">
/**
 * SessionButton Component
 *
 * Minimal indicator showing AI session queue status.
 * Displays running/queued counts with spinner when active.
 *
 * Props:
 * - status: Queue status object with counts
 * - onClick: Callback when button is clicked (navigate to queue)
 *
 * Design:
 * - Compact indicator in header/footer
 * - Shows spinner when sessions are running
 * - Hides when no sessions
 * - Touch-friendly (44px tap target)
 */

import type { QueueStatus } from "../../src/types/ai";

interface Props {
  status: QueueStatus;
  onClick: () => void;
}

// Svelte 5 props syntax
const { status, onClick }: Props = $props();

/**
 * Whether button should be visible
 */
const isVisible = $derived(status.totalCount > 0);

/**
 * Whether sessions are running
 */
const isRunning = $derived(status.runningCount > 0);

/**
 * Status text to display
 */
const statusText = $derived.by(() => {
  if (status.runningCount > 0 && status.queuedCount > 0) {
    return `${status.runningCount} running, ${status.queuedCount} queued`;
  }
  if (status.runningCount > 0) {
    return `${status.runningCount} running`;
  }
  if (status.queuedCount > 0) {
    return `${status.queuedCount} queued`;
  }
  return "";
});

/**
 * Compact status for narrow displays
 */
const compactStatus = $derived.by(() => {
  if (status.runningCount > 0 && status.queuedCount > 0) {
    return `${status.runningCount}/${status.queuedCount}`;
  }
  if (status.runningCount > 0) {
    return `${status.runningCount}`;
  }
  if (status.queuedCount > 0) {
    return `${status.queuedCount}`;
  }
  return "";
});
</script>

{#if isVisible}
  <button
    type="button"
    onclick={onClick}
    class="session-button flex items-center gap-2 px-3 py-2 min-h-[44px]
           text-sm font-medium rounded-lg
           {isRunning
      ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
      : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'}
           transition-colors duration-150
           focus:outline-none focus:ring-2 focus:ring-blue-500"
    aria-label={`AI Sessions: ${statusText}`}
    title={statusText}
  >
    <!-- AI Icon / Spinner -->
    {#if isRunning}
      <!-- Spinning indicator -->
      <svg
        class="animate-spin h-4 w-4"
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
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    {:else}
      <!-- AI/Brain icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="opacity-70"
        aria-hidden="true"
      >
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54" />
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54" />
      </svg>
    {/if}

    <!-- Status text (hidden on very narrow displays) -->
    <span class="hidden sm:inline">{statusText}</span>

    <!-- Compact status (shown on narrow displays) -->
    <span class="inline sm:hidden">{compactStatus}</span>

    <!-- Badge for queued count when running -->
    {#if isRunning && status.queuedCount > 0}
      <span
        class="inline-flex items-center justify-center px-1.5 py-0.5
               min-w-[18px] h-[18px] text-[10px] font-bold
               bg-yellow-500 text-yellow-900 rounded-full"
        aria-hidden="true"
      >
        +{status.queuedCount}
      </span>
    {/if}
  </button>
{/if}
