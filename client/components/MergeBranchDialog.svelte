<script lang="ts">
  /**
   * MergeBranchDialog Component
   *
   * Modal dialog for merging a branch into the current branch.
   * Uses BranchListPanel for branch selection with filter and infinite scroll.
   * Fetches git status internally to check for uncommitted changes.
   * Blocks merge when uncommitted changes exist.
   */

  import BranchListPanel from "./BranchListPanel.svelte";

  interface Props {
    contextId: string;
    onClose: () => void;
  }

  const { contextId, onClose }: Props = $props();

  interface StatusResponse {
    clean: boolean;
    branch: string;
  }

  interface MergeResponse {
    readonly success: boolean;
    readonly mergedBranch: string;
    readonly currentBranch: string;
    readonly error?: string | undefined;
  }

  let currentBranch = $state("");
  let hasUncommittedChanges = $state(false);
  let statusLoading = $state(true);
  let selectedBranch = $state<string | null>(null);
  let merging = $state(false);
  let errorMessage = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let branchListPanel: ReturnType<typeof BranchListPanel> | undefined =
    $state(undefined);

  const canMerge = $derived(
    selectedBranch !== null &&
      selectedBranch !== currentBranch &&
      !hasUncommittedChanges &&
      !merging,
  );

  /**
   * Fetch git status to get current branch and uncommitted changes state
   */
  async function fetchStatus(): Promise<void> {
    statusLoading = true;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/status`);
      if (resp.ok) {
        const data = (await resp.json()) as StatusResponse;
        currentBranch = data.branch;
        hasUncommittedChanges = !data.clean;
      }
    } catch {
      // Status is non-critical; defaults will be used
    } finally {
      statusLoading = false;
    }
  }

  /**
   * Handle branch selection from the list panel
   */
  function handleBranchSelect(branch: {
    name: string;
    isCurrent: boolean;
  }): void {
    if (branch.name === currentBranch) return;
    selectedBranch = branch.name;
    errorMessage = null;
  }

  /**
   * Execute merge
   */
  async function executeMerge(): Promise<void> {
    if (!canMerge || selectedBranch === null) return;

    merging = true;
    errorMessage = null;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/branches/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: selectedBranch }),
      });
      const data = (await resp.json()) as MergeResponse;
      if (data.success) {
        successMessage = `Merged ${data.mergedBranch} into ${data.currentBranch}`;
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 1200);
      } else {
        errorMessage = data.error ?? "Merge failed";
      }
    } catch {
      errorMessage = "Merge failed";
    } finally {
      merging = false;
    }
  }

  /**
   * Handle keydown on dialog (Escape to close)
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onClose();
    }
  }

  /**
   * Initialize: fetch status then branch list
   */
  $effect(() => {
    void fetchStatus().then(() => {
      requestAnimationFrame(() => {
        branchListPanel?.initialize();
      });
    });
  });
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
  onkeydown={handleKeydown}
  role="presentation"
>
  <!-- Dialog -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="w-96 max-h-[80vh] bg-bg-primary border border-border-default rounded-lg shadow-xl flex flex-col"
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
    role="dialog"
    aria-label="Merge branch"
  >
    <!-- Dialog header -->
    <div
      class="flex items-center justify-between px-4 py-3 border-b border-border-default"
    >
      <h2 class="text-sm font-semibold text-text-primary">
        {#if currentBranch.length > 0}
          Merge into
          <span class="font-mono text-accent-fg">{currentBranch}</span>
        {:else}
          Merge Branch
        {/if}
      </h2>
      <button
        type="button"
        class="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        onclick={onClose}
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"
          />
        </svg>
      </button>
    </div>

    <!-- Success message -->
    {#if successMessage !== null}
      <div
        class="px-4 py-3 text-sm bg-success-subtle text-success-fg border-b border-border-default flex items-center gap-2"
      >
        <svg
          class="w-4 h-4 shrink-0"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
          />
        </svg>
        {successMessage}
      </div>
    {/if}

    <!-- Error message -->
    {#if errorMessage !== null}
      <div
        class="px-4 py-2 text-xs bg-danger-subtle text-danger-fg border-b border-border-default"
      >
        {errorMessage}
      </div>
    {/if}

    <!-- Loading state -->
    {#if statusLoading}
      <div class="px-4 py-8 text-sm text-text-secondary text-center">
        Loading status...
      </div>
    {:else}
      <!-- Branch list panel (reusable component) -->
      <div class="flex-1 overflow-hidden">
        <BranchListPanel
          bind:this={branchListPanel}
          {contextId}
          {currentBranch}
          headerText="Select branch to merge"
          filterPlaceholder="Filter branches..."
          warningMessage={hasUncommittedChanges
            ? "Uncommitted changes -- merge disabled"
            : undefined}
          onSelect={handleBranchSelect}
          disableCurrentBranch={true}
          selectedBranch={selectedBranch ?? undefined}
        />
      </div>

      <!-- Dialog footer with merge button -->
      <div
        class="flex items-center justify-between px-4 py-3 border-t border-border-default"
      >
        <div class="text-xs text-text-tertiary">
          {#if selectedBranch !== null}
            Merge <span class="font-mono text-text-secondary"
              >{selectedBranch}</span
            >
            into
            <span class="font-mono text-text-secondary">{currentBranch}</span>
          {:else}
            Select a branch to merge
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-3 py-1.5 text-sm rounded border border-border-default text-text-secondary hover:bg-bg-tertiary transition-colors"
            onclick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-sm rounded font-semibold transition-colors
                   {canMerge
              ? 'bg-success-emphasis text-text-on-emphasis hover:bg-success-emphasis/90'
              : 'bg-bg-tertiary text-text-placeholder cursor-not-allowed'}"
            disabled={!canMerge}
            onclick={() => void executeMerge()}
          >
            {#if merging}
              Merging...
            {:else}
              Merge
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
