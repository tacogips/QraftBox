<script lang="ts">
  import type { SyncStatus } from "../src/stores/comments";

  /**
   * SyncStatusBar Component
   *
   * Displays git-xnotes sync status and provides push/pull controls.
   *
   * Props:
   * - status: Current SyncStatus from the comments store
   * - loading: Whether a sync operation is in progress
   * - onPush: Callback to push local notes to remote
   * - onPull: Callback to pull remote notes to local
   *
   * Design:
   * - Compact status bar that can be placed in header or footer
   * - Clear visual indication of sync state
   * - Touch-friendly push/pull buttons
   */

  interface Props {
    status: SyncStatus;
    loading?: boolean;
    onPush: () => void;
    onPull: () => void;
  }

  // Svelte 5 props syntax
  const { status, loading = false, onPush, onPull }: Props = $props();

  /**
   * Get status description text
   */
  const statusText = $derived.by(() => {
    switch (status.mode) {
      case "local":
        return "Local only";
      case "remote":
        return "Remote only";
      case "synced":
        return "Synced";
      default:
        return "Unknown";
    }
  });

  /**
   * Get status icon color
   */
  const statusColorClass = $derived.by(() => {
    switch (status.mode) {
      case "local":
        return "text-attention-fg";
      case "remote":
        return "text-accent-fg";
      case "synced":
        return "text-success-fg";
      default:
        return "text-text-secondary";
    }
  });

  /**
   * Check if there are unpushed local changes
   */
  const hasUnpushed = $derived(
    status.mode === "local" ||
      (status.mode === "synced" && status.localCount > status.remoteCount),
  );

  /**
   * Check if there are unpulled remote changes
   */
  const hasUnpulled = $derived(
    status.mode === "remote" ||
      (status.mode === "synced" && status.remoteCount > status.localCount),
  );

  /**
   * Format last sync time
   */
  const lastSyncText = $derived.by(() => {
    if (status.lastSync === undefined) {
      return "Never synced";
    }
    const date = new Date(status.lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return "Just now";
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  });

  /**
   * Handle push button click
   */
  function handlePush(): void {
    if (!loading) {
      onPush();
    }
  }

  /**
   * Handle pull button click
   */
  function handlePull(): void {
    if (!loading) {
      onPull();
    }
  }
</script>

<div
  class="sync-status-bar flex items-center gap-3 px-3 py-2 min-h-[44px]
         bg-bg-secondary border-t border-border-default"
  role="status"
  aria-label="Git notes sync status"
>
  <!-- Status Indicator -->
  <div class="flex items-center gap-2">
    <!-- Sync icon with status color -->
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
      class="{statusColorClass} {loading ? 'animate-spin' : ''}"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path
        d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
      />
    </svg>

    <span class="text-sm {statusColorClass} font-medium">
      {statusText}
    </span>
  </div>

  <!-- Counts -->
  <div class="flex items-center gap-2 text-xs text-text-secondary">
    <span title="Local notes">
      L: {status.localCount}
    </span>
    <span class="text-text-tertiary">|</span>
    <span title="Remote notes">
      R: {status.remoteCount}
    </span>
  </div>

  <!-- Last Sync Time -->
  <span class="text-xs text-text-tertiary hidden sm:inline">
    {lastSyncText}
  </span>

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Push Button -->
  <button
    type="button"
    onclick={handlePush}
    disabled={loading || !hasUnpushed}
    class="px-3 py-1.5 min-h-[36px] text-xs font-medium rounded
           {loading || !hasUnpushed
      ? 'bg-bg-disabled text-text-disabled cursor-not-allowed'
      : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover active:bg-bg-pressed border border-border-default'}
           focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-1
           transition-colors duration-150"
    aria-label="Push local notes to remote"
    title="Push to remote"
  >
    <span class="flex items-center gap-1.5">
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
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </svg>
      Push
    </span>
  </button>

  <!-- Pull Button -->
  <button
    type="button"
    onclick={handlePull}
    disabled={loading || !hasUnpulled}
    class="px-3 py-1.5 min-h-[36px] text-xs font-medium rounded
           {loading || !hasUnpulled
      ? 'bg-bg-disabled text-text-disabled cursor-not-allowed'
      : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover active:bg-bg-pressed border border-border-default'}
           focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-1
           transition-colors duration-150"
    aria-label="Pull remote notes to local"
    title="Pull from remote"
  >
    <span class="flex items-center gap-1.5">
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
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
      </svg>
      Pull
    </span>
  </button>
</div>

<style>
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
