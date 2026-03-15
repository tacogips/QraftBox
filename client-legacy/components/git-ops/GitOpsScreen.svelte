<script lang="ts">
  /**
   * GitOpsScreen Component
   *
   * Main screen for git operations: status, commit, and push.
   * Fetches data directly from the server APIs without stores.
   *
   * Props:
   * - contextId: Workspace context ID for API calls
   * - onBack: Callback to navigate back to previous screen
   *
   * Sections:
   * 1. Git Status - branch name, file counts by category, expandable lists
   * 2. Commit - visible when staged files exist, commit message textarea
   * 3. Push - ahead/behind counts, push button
   */

  interface Props {
    contextId: string;
    onBack: () => void;
  }

  const { contextId, onBack }: Props = $props();

  /**
   * Status response from GET /api/ctx/:contextId/status
   */
  interface StatusData {
    clean: boolean;
    staged: string[];
    modified: string[];
    untracked: string[];
    conflicts: string[];
    branch: string;
  }

  /**
   * Push status response from GET /api/ctx/:contextId/push/status
   */
  interface PushStatusData {
    canPush: boolean;
    branchName: string;
    remote: { name: string; url: string; branch: string } | null;
    hasUpstream: boolean;
    aheadCount: number;
    behindCount: number;
    unpushedCommits: Array<{
      hash: string;
      shortHash: string;
      message: string;
      author: string;
      date: number;
    }>;
    error?: string;
  }

  /**
   * Commit result from POST /api/ctx/:contextId/commit
   */
  interface CommitResultData {
    result: {
      success: boolean;
      hash?: string;
      error?: string;
    };
  }

  /**
   * Push result from POST /api/ctx/:contextId/push
   */
  interface PushResultData {
    result: {
      success: boolean;
      remote: string;
      branch: string;
      pushedCommits: number;
      error?: string;
      sessionId: string;
    };
  }

  // --- State ---
  let statusData = $state<StatusData | null>(null);
  let pushStatusData = $state<PushStatusData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Expandable sections
  let expandedSections = $state<Record<string, boolean>>({});

  // Commit state
  let showCommitForm = $state(false);
  let commitMessage = $state("");
  let committing = $state(false);
  let commitResult = $state<{ success: boolean; message: string } | null>(null);

  // Push state
  let pushing = $state(false);
  let pushResult = $state<{ success: boolean; message: string } | null>(null);

  // --- Derived ---
  const hasStagedFiles = $derived(
    statusData !== null && statusData.staged.length > 0,
  );

  const canPush = $derived(
    pushStatusData !== null &&
      pushStatusData.canPush &&
      pushStatusData.aheadCount > 0,
  );

  // --- API calls ---

  async function fetchStatus(): Promise<void> {
    const resp = await fetch(`/api/ctx/${contextId}/status`);
    if (!resp.ok) {
      throw new Error(`Status API error: ${resp.status}`);
    }
    statusData = (await resp.json()) as StatusData;
  }

  async function fetchPushStatus(): Promise<void> {
    const resp = await fetch(`/api/ctx/${contextId}/push/${contextId}/status`);
    if (!resp.ok) {
      throw new Error(`Push status API error: ${resp.status}`);
    }
    const data = (await resp.json()) as { status: PushStatusData };
    pushStatusData = data.status;
  }

  async function loadAll(): Promise<void> {
    loading = true;
    error = null;
    try {
      await Promise.all([fetchStatus(), fetchPushStatus()]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load git status";
    } finally {
      loading = false;
    }
  }

  async function handleCommit(): Promise<void> {
    if (commitMessage.trim().length === 0) return;
    committing = true;
    commitResult = null;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/commit/${contextId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: "default",
          variables: {},
          dryRun: false,
        }),
      });
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData !== null && errData.error !== undefined
            ? errData.error
            : `Commit failed: ${resp.status}`,
        );
      }
      const data = (await resp.json()) as CommitResultData;
      if (data.result.success) {
        commitResult = {
          success: true,
          message: `Commit created${data.result.hash !== undefined ? ` (${data.result.hash.substring(0, 7)})` : ""}`,
        };
        showCommitForm = false;
        commitMessage = "";
        await loadAll();
      } else {
        commitResult = {
          success: false,
          message: data.result.error ?? "Commit failed",
        };
      }
    } catch (e) {
      commitResult = {
        success: false,
        message: e instanceof Error ? e.message : "Commit failed",
      };
    } finally {
      committing = false;
    }
  }

  async function handlePush(): Promise<void> {
    pushing = true;
    pushResult = null;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/push/${contextId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: "default",
        }),
      });
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData !== null && errData.error !== undefined
            ? errData.error
            : `Push failed: ${resp.status}`,
        );
      }
      const data = (await resp.json()) as PushResultData;
      if (data.result.success) {
        pushResult = {
          success: true,
          message: `Pushed ${data.result.pushedCommits} commit(s) to ${data.result.remote}/${data.result.branch}`,
        };
        await loadAll();
      } else {
        pushResult = {
          success: false,
          message: data.result.error ?? "Push failed",
        };
      }
    } catch (e) {
      pushResult = {
        success: false,
        message: e instanceof Error ? e.message : "Push failed",
      };
    } finally {
      pushing = false;
    }
  }

  function toggleSection(key: string): void {
    expandedSections = { ...expandedSections, [key]: !expandedSections[key] };
  }

  // Load data on mount
  $effect(() => {
    void loadAll();
  });
</script>

<div class="flex flex-col h-full bg-bg-primary text-text-primary">
  <!-- Header -->
  <header
    class="h-14 border-b border-border-default flex items-center px-4 bg-bg-secondary gap-3 shrink-0"
  >
    <button
      type="button"
      class="px-3 py-1.5 text-sm border border-border-default rounded hover:bg-bg-tertiary transition-colors"
      onclick={onBack}
    >
      Back
    </button>
    <h2 class="text-lg font-semibold">Git Operations</h2>
  </header>

  <!-- Scrollable content -->
  <div class="flex-1 overflow-auto">
    {#if loading}
      <div class="p-8 text-center text-text-secondary">
        Loading git status...
      </div>
    {:else if error !== null}
      <div class="p-8 text-center">
        <p class="text-danger-fg mb-4">{error}</p>
        <button
          type="button"
          class="px-4 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded hover:bg-bg-hover transition-colors"
          onclick={() => void loadAll()}
        >
          Retry
        </button>
      </div>
    {:else if statusData !== null}
      <div class="max-w-3xl mx-auto p-6 space-y-8">
        <!-- Section 1: Git Status -->
        <section>
          <h3 class="text-base font-semibold mb-4 text-text-primary">Status</h3>

          <!-- Branch name -->
          <div
            class="mb-4 px-4 py-3 bg-bg-secondary border border-border-default rounded-lg"
          >
            <span class="text-sm text-text-secondary">Branch:</span>
            <span class="ml-2 font-mono font-semibold text-accent-fg">
              {statusData.branch}
            </span>
          </div>

          {#if statusData.clean}
            <div
              class="px-4 py-3 bg-bg-secondary border border-success-emphasis rounded-lg text-success-fg text-sm"
            >
              Working tree clean
            </div>
          {:else}
            <!-- Status cards grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <!-- Staged -->
              <button
                type="button"
                class="p-3 bg-bg-secondary border border-border-default rounded-lg text-left hover:border-success-emphasis transition-colors {statusData
                  .staged.length > 0
                  ? 'cursor-pointer'
                  : 'cursor-default opacity-60'}"
                onclick={() => {
                  if (statusData !== null && statusData.staged.length > 0)
                    toggleSection("staged");
                }}
                disabled={statusData.staged.length === 0}
              >
                <div class="text-2xl font-bold text-success-fg">
                  {statusData.staged.length}
                </div>
                <div class="text-xs text-text-secondary mt-1">Staged</div>
              </button>

              <!-- Modified -->
              <button
                type="button"
                class="p-3 bg-bg-secondary border border-border-default rounded-lg text-left hover:border-attention-fg transition-colors {statusData
                  .modified.length > 0
                  ? 'cursor-pointer'
                  : 'cursor-default opacity-60'}"
                onclick={() => {
                  if (statusData !== null && statusData.modified.length > 0)
                    toggleSection("modified");
                }}
                disabled={statusData.modified.length === 0}
              >
                <div class="text-2xl font-bold text-attention-fg">
                  {statusData.modified.length}
                </div>
                <div class="text-xs text-text-secondary mt-1">Modified</div>
              </button>

              <!-- Untracked -->
              <button
                type="button"
                class="p-3 bg-bg-secondary border border-border-default rounded-lg text-left hover:border-accent-emphasis transition-colors {statusData
                  .untracked.length > 0
                  ? 'cursor-pointer'
                  : 'cursor-default opacity-60'}"
                onclick={() => {
                  if (statusData !== null && statusData.untracked.length > 0)
                    toggleSection("untracked");
                }}
                disabled={statusData.untracked.length === 0}
              >
                <div class="text-2xl font-bold text-accent-fg">
                  {statusData.untracked.length}
                </div>
                <div class="text-xs text-text-secondary mt-1">Untracked</div>
              </button>

              <!-- Conflicts -->
              <button
                type="button"
                class="p-3 bg-bg-secondary border border-border-default rounded-lg text-left hover:border-danger-emphasis transition-colors {statusData
                  .conflicts.length > 0
                  ? 'cursor-pointer'
                  : 'cursor-default opacity-60'}"
                onclick={() => {
                  if (statusData !== null && statusData.conflicts.length > 0)
                    toggleSection("conflicts");
                }}
                disabled={statusData.conflicts.length === 0}
              >
                <div class="text-2xl font-bold text-danger-fg">
                  {statusData.conflicts.length}
                </div>
                <div class="text-xs text-text-secondary mt-1">Conflicts</div>
              </button>
            </div>

            <!-- Expandable file lists -->
            {#if expandedSections["staged"] && statusData.staged.length > 0}
              <div
                class="mb-3 p-3 bg-bg-secondary border border-success-emphasis rounded-lg"
              >
                <h4 class="text-xs font-semibold text-success-fg mb-2">
                  Staged Files
                </h4>
                <ul class="space-y-1">
                  {#each statusData.staged as file}
                    <li class="text-sm font-mono text-text-secondary truncate">
                      {file}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if expandedSections["modified"] && statusData.modified.length > 0}
              <div
                class="mb-3 p-3 bg-bg-secondary border border-attention-fg rounded-lg"
              >
                <h4 class="text-xs font-semibold text-attention-fg mb-2">
                  Modified Files
                </h4>
                <ul class="space-y-1">
                  {#each statusData.modified as file}
                    <li class="text-sm font-mono text-text-secondary truncate">
                      {file}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if expandedSections["untracked"] && statusData.untracked.length > 0}
              <div
                class="mb-3 p-3 bg-bg-secondary border border-accent-emphasis rounded-lg"
              >
                <h4 class="text-xs font-semibold text-accent-fg mb-2">
                  Untracked Files
                </h4>
                <ul class="space-y-1">
                  {#each statusData.untracked as file}
                    <li class="text-sm font-mono text-text-secondary truncate">
                      {file}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if expandedSections["conflicts"] && statusData.conflicts.length > 0}
              <div
                class="mb-3 p-3 bg-bg-secondary border border-danger-emphasis rounded-lg"
              >
                <h4 class="text-xs font-semibold text-danger-fg mb-2">
                  Conflict Files
                </h4>
                <ul class="space-y-1">
                  {#each statusData.conflicts as file}
                    <li class="text-sm font-mono text-text-secondary truncate">
                      {file}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          {/if}
        </section>

        <!-- Section 2: Commit -->
        {#if hasStagedFiles}
          <section>
            <h3 class="text-base font-semibold mb-4 text-text-primary">
              Commit
            </h3>

            {#if commitResult !== null}
              <div
                class="mb-4 px-4 py-3 rounded-lg text-sm {commitResult.success
                  ? 'bg-success-muted border border-success-emphasis text-success-fg'
                  : 'bg-danger-muted border border-danger-emphasis text-danger-fg'}"
              >
                {commitResult.message}
              </div>
            {/if}

            {#if !showCommitForm}
              <button
                type="button"
                class="px-4 py-2 text-sm bg-success-emphasis text-white rounded hover:bg-success-emphasis transition-colors"
                onclick={() => {
                  showCommitForm = true;
                  commitResult = null;
                }}
              >
                Create Commit
              </button>
            {:else}
              <div
                class="p-4 bg-bg-secondary border border-border-default rounded-lg space-y-3"
              >
                <textarea
                  class="w-full h-32 px-3 py-2 bg-bg-primary border border-border-default rounded text-sm text-text-primary font-mono resize-y focus:outline-none focus:border-accent-emphasis"
                  placeholder="Commit message..."
                  bind:value={commitMessage}
                  disabled={committing}
                ></textarea>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="px-4 py-2 text-sm bg-success-emphasis text-white rounded hover:bg-success-emphasis transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onclick={() => void handleCommit()}
                    disabled={committing || commitMessage.trim().length === 0}
                  >
                    {committing ? "Committing..." : "Commit"}
                  </button>
                  <button
                    type="button"
                    class="px-4 py-2 text-sm border border-border-default rounded hover:bg-bg-tertiary transition-colors"
                    onclick={() => {
                      showCommitForm = false;
                      commitMessage = "";
                      commitResult = null;
                    }}
                    disabled={committing}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {/if}
          </section>
        {/if}

        <!-- Section 3: Push -->
        {#if pushStatusData !== null}
          <section>
            <h3 class="text-base font-semibold mb-4 text-text-primary">Push</h3>

            <div
              class="p-4 bg-bg-secondary border border-border-default rounded-lg space-y-3"
            >
              <!-- Remote info -->
              {#if pushStatusData.remote !== null}
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-text-secondary">Remote:</span>
                  <span class="font-mono text-text-primary">
                    {pushStatusData.remote.name}
                  </span>
                </div>
              {:else}
                <div class="text-sm text-text-secondary">
                  No remote configured
                </div>
              {/if}

              <!-- Ahead / Behind -->
              <div class="flex items-center gap-4 text-sm">
                <div class="flex items-center gap-1">
                  <span class="text-text-secondary">Ahead:</span>
                  <span
                    class="font-mono font-semibold {pushStatusData.aheadCount >
                    0
                      ? 'text-success-fg'
                      : 'text-text-secondary'}"
                  >
                    {pushStatusData.aheadCount}
                  </span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-text-secondary">Behind:</span>
                  <span
                    class="font-mono font-semibold {pushStatusData.behindCount >
                    0
                      ? 'text-attention-fg'
                      : 'text-text-secondary'}"
                  >
                    {pushStatusData.behindCount}
                  </span>
                </div>
              </div>

              {#if pushStatusData.aheadCount === 0 && pushStatusData.behindCount === 0}
                <div class="text-sm text-text-secondary">
                  Up to date with remote
                </div>
              {/if}

              {#if pushResult !== null}
                <div
                  class="px-4 py-3 rounded-lg text-sm {pushResult.success
                    ? 'bg-success-muted border border-success-emphasis text-success-fg'
                    : 'bg-danger-muted border border-danger-emphasis text-danger-fg'}"
                >
                  {pushResult.message}
                </div>
              {/if}

              <!-- Push button -->
              <button
                type="button"
                class="px-4 py-2 text-sm bg-success-emphasis text-white rounded hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                onclick={() => void handlePush()}
                disabled={!canPush || pushing}
              >
                {pushing ? "Pushing..." : "Push"}
              </button>

              {#if pushStatusData.behindCount > 0}
                <p class="text-xs text-attention-fg">
                  Warning: Local branch is {pushStatusData.behindCount} commit(s)
                  behind remote. Consider pulling first.
                </p>
              {/if}
            </div>
          </section>
        {/if}

        <!-- Refresh button -->
        <div class="pt-2 pb-8">
          <button
            type="button"
            class="px-4 py-2 text-sm border border-border-default rounded hover:bg-bg-tertiary transition-colors"
            onclick={() => void loadAll()}
          >
            Refresh
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
