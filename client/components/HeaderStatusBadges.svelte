<script lang="ts">
  /**
   * HeaderStatusBadges Component
   *
   * Displays git status badges in the project header bar, showing branch selector
   * and PR number.
   *
   * Props:
   * - contextId: Context ID for API requests
   *
   * Design:
   * - Fetches status from GET /api/ctx/:contextId/status
   * - Fetches PR status from GET /api/ctx/:contextId/pr/:contextId/status
   * - Auto-refreshes every 30 seconds
   * - Uses GitHub Primer color tokens
   * - Compact inline display with separators
   * - Branch name is clickable via BranchSelector component
   */

  import BranchSelector from "./BranchSelector.svelte";

  interface Props {
    contextId: string;
  }

  const { contextId }: Props = $props();

  /**
   * Status API response type
   */
  interface StatusResponse {
    clean: boolean;
    staged: readonly string[];
    modified: readonly string[];
    untracked: readonly string[];
    conflicts: readonly string[];
    branch: string;
  }

  /**
   * PR status API response type
   */
  interface PRStatusResponse {
    status: {
      hasPR: boolean;
      pr: {
        number: number;
        url: string;
        state: "open" | "closed" | "merged";
      } | null;
    };
  }

  /**
   * Git status data
   */
  let status = $state<StatusResponse | null>(null);

  /**
   * PR status data
   */
  let prStatus = $state<PRStatusResponse | null>(null);

  /**
   * Branch name from status
   */
  const branchName = $derived(status?.branch ?? "");

  /**
   * Whether working tree has uncommitted changes
   */


  /**
   * PR number and URL (only if PR exists and is open)
   */
  const openPR = $derived(
    prStatus?.status.hasPR &&
      prStatus.status.pr !== null &&
      prStatus.status.pr.state === "open"
      ? prStatus.status.pr
      : null,
  );

  /**
   * Fetch status from API
   */
  async function fetchStatus(): Promise<void> {
    try {
      const resp = await fetch(`/api/ctx/${contextId}/status`);
      if (resp.ok) {
        status = (await resp.json()) as StatusResponse;
      }
    } catch {
      // Silently handle errors - status badges are non-critical
    }
  }

  /**
   * Fetch PR status from API
   */
  async function fetchPRStatus(): Promise<void> {
    try {
      const resp = await fetch(`/api/ctx/${contextId}/pr/${contextId}/status`);
      if (resp.ok) {
        prStatus = (await resp.json()) as PRStatusResponse;
      }
    } catch {
      // Silently handle errors - PR status may not be available
    }
  }

  /**
   * Fetch all data
   */
  async function fetchData(): Promise<void> {
    await Promise.all([fetchStatus(), fetchPRStatus()]);
  }

  /**
   * Setup periodic refresh and initial fetch
   */
  $effect(() => {
    void fetchData();

    const intervalId = setInterval(() => {
      void fetchData();
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  });
</script>

<div class="flex items-center gap-3 text-sm">
  <!-- Branch selector (clickable) -->
  {#if branchName.length > 0}
    <BranchSelector
      {contextId}
      currentBranch={branchName}
    />
  {/if}

  <!-- Separator -->
  {#if branchName.length > 0 && openPR !== null}
    <span class="text-border-default">|</span>
  {/if}

  <!-- PR link -->
  {#if openPR !== null}
    <a
      href={openPR.url}
      target="_blank"
      rel="noopener noreferrer"
      class="text-xs text-accent-fg hover:underline"
    >
      PR #{openPR.number}
    </a>
  {/if}
</div>
