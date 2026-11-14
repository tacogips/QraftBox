<script lang="ts">
  /**
   * SessionStats Component
   *
   * Displays session statistics: duration, cost, token counts.
   *
   * Props:
   * - session: The AI session to display stats for
   *
   * Design:
   * - Compact footer-style layout
   * - Duration, cost (if available), token counts
   * - Responsive grid layout
   */

  import type { AISession } from "../../../src/types/ai";

  interface Props {
    session: AISession;
  }

  // Svelte 5 props syntax
  const { session }: Props = $props();

  /**
   * Format duration from milliseconds
   */
  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Format cost in USD
   */
  function formatCost(usd: number): string {
    if (usd < 0.01) {
      return `$${usd.toFixed(4)}`;
    }
    return `$${usd.toFixed(2)}`;
  }

  /**
   * Format token count with thousands separator
   */
  function formatTokens(count: number): string {
    return count.toLocaleString();
  }

  /**
   * Calculate duration if not provided in stats
   */
  const calculatedDuration = $derived.by(() => {
    if (session.stats?.durationMs !== undefined) {
      return session.stats.durationMs;
    }
    if (session.startedAt !== undefined && session.completedAt !== undefined) {
      const start = new Date(session.startedAt).getTime();
      const end = new Date(session.completedAt).getTime();
      return end - start;
    }
    return null;
  });

  /**
   * Check if we have any stats to show
   */
  const hasStats = $derived(
    calculatedDuration !== null ||
      session.stats?.costUsd !== undefined ||
      session.stats?.totalTokens !== undefined,
  );
</script>

{#if hasStats}
  <div
    class="session-stats flex items-center gap-4 px-4 py-2
           bg-bg-tertiary/30 border-t border-border-default
           text-xs text-text-tertiary"
    role="region"
    aria-label="Session statistics"
  >
    <!-- Duration -->
    {#if calculatedDuration !== null}
      <div class="flex items-center gap-1.5">
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
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span class="tabular-nums">{formatDuration(calculatedDuration)}</span>
      </div>
    {/if}

    <!-- Cost -->
    {#if session.stats?.costUsd !== undefined}
      <div class="flex items-center gap-1.5">
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
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <span class="tabular-nums">{formatCost(session.stats.costUsd)}</span>
      </div>
    {/if}

    <!-- Token counts -->
    {#if session.stats?.totalTokens !== undefined}
      <div class="flex items-center gap-1.5">
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
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" y1="20" x2="15" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
        <span class="tabular-nums">
          {formatTokens(session.stats.totalTokens)} tokens
        </span>
        {#if session.stats.inputTokens !== undefined && session.stats.outputTokens !== undefined}
          <span class="text-text-quaternary">
            ({formatTokens(session.stats.inputTokens)} in / {formatTokens(
              session.stats.outputTokens,
            )} out)
          </span>
        {/if}
      </div>
    {/if}
  </div>
{/if}
