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
         rounded-lg overflow-hidden bg-accent-muted/30"
  role="article"
  aria-label="Running session"
>
  <!-- Header row: status + activity + elapsed + cancel -->
  <div class="flex items-center gap-2 px-3 py-1.5">
    <svg
      class="animate-spin-smooth h-3.5 w-3.5 text-accent-fg shrink-0"
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
    <span class="text-xs font-medium text-accent-fg shrink-0">Running</span>

    {#if session.currentActivity}
      <span class="text-[10px] text-text-tertiary animate-pulse truncate">
        {session.currentActivity}
      </span>
    {/if}

    <span class="flex-1"></span>

    <span
      class="text-xs font-mono text-text-tertiary tabular-nums shrink-0"
      aria-label="Elapsed time"
    >
      {elapsedFormatted}
    </span>

    <button
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
      class="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded
             bg-danger-emphasis/10 text-danger-fg hover:bg-danger-emphasis/20
             border border-danger-emphasis/30 transition-colors"
      aria-label="Cancel session"
      title="Cancel"
    >
      Cancel
    </button>
  </div>

  <!-- Content row: prompt + context (clickable) -->
  <button
    type="button"
    onclick={onSelect}
    class="w-full px-3 py-1.5 text-left border-t border-accent-emphasis/20
           hover:bg-accent-emphasis/5 transition-colors
           focus:outline-none focus:ring-1 focus:ring-inset focus:ring-accent-emphasis"
  >
    <p class="text-xs text-text-primary truncate">
      {truncatePrompt(session.prompt)}
    </p>

    {#if session.context.primaryFile !== undefined}
      <div
        class="flex items-center gap-1.5 mt-0.5 text-[10px] text-text-tertiary"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span class="truncate">
          {session.context.primaryFile.path}
          {#if session.context.primaryFile.startLine !== session.context.primaryFile.endLine}
            :L{session.context.primaryFile.startLine}-{session.context
              .primaryFile.endLine}
          {:else}
            :L{session.context.primaryFile.startLine}
          {/if}
        </span>
      </div>
    {/if}
  </button>
</div>
