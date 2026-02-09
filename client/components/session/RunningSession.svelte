<script lang="ts">
/**
 * RunningSession Component
 *
 * Displays a running session with live progress.
 *
 * Props:
 * - session: The running AI session
 * - onCancel: Callback to cancel session
 * - onSelect: Callback when session is selected
 *
 * Design:
 * - Live progress indicator
 * - Current tool call display
 * - Elapsed time counter
 * - Cancel button
 */

import type { AISession } from "../../../src/types/ai";

interface Props {
  session: AISession;
  onCancel: () => void;
  onSelect: () => void;
}

// Svelte 5 props syntax
const { session, onCancel, onSelect }: Props = $props();

/**
 * Elapsed time in seconds
 */
let elapsedSeconds = $state(0);

/**
 * Update elapsed time every second
 */
$effect(() => {
  if (session.startedAt === undefined) {
    elapsedSeconds = 0;
    return;
  }

  const startTime = new Date(session.startedAt).getTime();
  const updateElapsed = () => {
    elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
  };

  updateElapsed();
  const interval = setInterval(updateElapsed, 1000);

  return () => clearInterval(interval);
});

/**
 * Format elapsed time
 */
const elapsedFormatted = $derived.by(() => {
  const min = Math.floor(elapsedSeconds / 60);
  const sec = elapsedSeconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
});

/**
 * Truncate prompt for display
 */
function truncatePrompt(prompt: string, maxLength = 80): string {
  if (prompt.length <= maxLength) return prompt;
  return prompt.slice(0, maxLength) + "...";
}
</script>

<div
  class="running-session animate-session-glow border border-accent-emphasis/50
         rounded-lg overflow-hidden"
  role="article"
  aria-label="Running session"
>
  <!-- Header with status -->
  <div class="px-4 py-3 bg-accent-muted border-b border-accent-emphasis/30">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <!-- Spinning arrow icon (rolling refresh arrow) -->
        <svg
          class="animate-spin-smooth h-5 w-5 text-accent-fg shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        <span class="text-sm font-medium text-accent-fg">Running</span>

        <!-- Current activity -->
        {#if session.currentActivity}
          <span class="text-sm text-text-secondary animate-pulse">
            {session.currentActivity}
          </span>
        {/if}
      </div>

      <div class="flex items-center gap-3">
        <!-- Elapsed time -->
        <span
          class="text-sm font-mono text-text-tertiary tabular-nums"
          aria-label="Elapsed time"
        >
          {elapsedFormatted}
        </span>

        <!-- Cancel button -->
        <button
          type="button"
          onclick={onCancel}
          class="p-2 min-w-[36px] min-h-[36px]
                 bg-danger-emphasis/20 text-danger-fg hover:bg-danger-emphasis/30
                 rounded transition-colors
                 focus:outline-none focus:ring-2 focus:ring-danger-emphasis"
          aria-label="Cancel session"
          title="Cancel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Content (clickable) -->
  <button
    type="button"
    onclick={onSelect}
    class="w-full p-4 text-left
           hover:bg-accent-emphasis/5 transition-colors
           focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
  >
    <!-- Prompt -->
    <p class="text-sm text-text-primary mb-3">
      {truncatePrompt(session.prompt)}
    </p>

    <!-- Context info -->
    {#if session.context.primaryFile !== undefined}
      <div class="flex items-center gap-2 text-xs text-text-tertiary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span class="truncate">
          {session.context.primaryFile.path}
          {#if session.context.primaryFile.startLine !== session.context.primaryFile.endLine}
            :L{session.context.primaryFile.startLine}-{session.context.primaryFile.endLine}
          {:else}
            :L{session.context.primaryFile.startLine}
          {/if}
        </span>
      </div>
    {/if}

    <!-- Progress bar (pulsing) -->
    <div class="mt-3 h-1 bg-bg-tertiary rounded-full overflow-hidden">
      <div
        class="h-full bg-accent-emphasis rounded-full animate-pulse"
        style="width: 60%;"
      />
    </div>
  </button>
</div>
