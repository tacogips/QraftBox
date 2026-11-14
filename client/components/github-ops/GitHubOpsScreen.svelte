<script lang="ts">
  /**
   * GitHubOpsScreen Component
   *
   * GitHub-focused operations screen:
   * 1. Local uncommitted changes indicator
   * 2. PR creation (base branch selector, create button)
   * 3. Current PR status and merge
   */

  interface Props {
    contextId: string;
    onBack: () => void;
  }

  const { contextId, onBack }: Props = $props();

  // --- Types ---

  interface StatusData {
    clean: boolean;
    staged: string[];
    modified: string[];
    untracked: string[];
    conflicts: string[];
    branch: string;
  }

  interface PushStatusData {
    canPush: boolean;
    branchName: string;
    remote: { name: string; url: string; branch: string } | null;
    hasUpstream: boolean;
    aheadCount: number;
    behindCount: number;
  }

  interface PRStatusData {
    hasPR: boolean;
    pr: {
      number: number;
      title: string;
      body: string;
      state: "open" | "closed" | "merged";
      url: string;
      baseBranch: string;
      headBranch: string;
      isDraft: boolean;
      labels: string[];
      reviewers: string[];
    } | null;
    baseBranch: string;
    canCreatePR: boolean;
    reason?: string;
    availableBaseBranches: string[];
    repoOwner: string;
    repoName: string;
  }

  // --- State ---

  let statusData = $state<StatusData | null>(null);
  let pushStatusData = $state<PushStatusData | null>(null);
  let prStatusData = $state<PRStatusData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // PR creation state
  let selectedBaseBranch = $state("");
  let creatingPR = $state(false);
  let prResult = $state<{ success: boolean; message: string } | null>(null);

  // PR merge state
  let mergingPR = $state(false);
  let mergeResult = $state<{ success: boolean; message: string } | null>(null);

  // Expandable sections
  let expandedSections = $state<Record<string, boolean>>({});

  // Derived
  const hasUncommitted = $derived(statusData !== null && !statusData.clean);

  const uncommittedCount = $derived(
    statusData !== null
      ? statusData.staged.length +
          statusData.modified.length +
          statusData.untracked.length +
          statusData.conflicts.length
      : 0,
  );

  // --- API calls ---

  async function fetchStatus(): Promise<void> {
    const resp = await fetch(`/api/ctx/${contextId}/status`);
    if (!resp.ok) throw new Error(`Status API error: ${resp.status}`);
    statusData = (await resp.json()) as StatusData;
  }

  async function fetchPushStatus(): Promise<void> {
    const resp = await fetch(`/api/ctx/${contextId}/push/${contextId}/status`);
    if (!resp.ok) throw new Error(`Push status API error: ${resp.status}`);
    const data = (await resp.json()) as { status: PushStatusData };
    pushStatusData = data.status;
  }

  async function fetchPRStatus(): Promise<void> {
    const resp = await fetch(`/api/ctx/${contextId}/pr/${contextId}/status`);
    if (resp.ok) {
      const data = (await resp.json()) as { status: PRStatusData };
      prStatusData = data.status;
      if (
        prStatusData.availableBaseBranches.length > 0 &&
        selectedBaseBranch === ""
      ) {
        selectedBaseBranch = prStatusData.baseBranch;
      }
    } else {
      // PR routes may not be wired up yet - show fallback UI
      prStatusData = null;
    }
  }

  async function loadAll(): Promise<void> {
    loading = true;
    error = null;
    try {
      await Promise.all([fetchStatus(), fetchPushStatus(), fetchPRStatus()]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  async function handleCreatePR(): Promise<void> {
    if (selectedBaseBranch === "") return;
    creatingPR = true;
    prResult = null;

    try {
      const resp = await fetch(`/api/ctx/${contextId}/pr/${contextId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptTemplateId: "default",
          baseBranch: selectedBaseBranch,
        }),
      });
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData !== null && errData.error !== undefined
            ? errData.error
            : `Create PR failed: ${resp.status}`,
        );
      }
      prResult = { success: true, message: "PR creation initiated via AI" };
      await fetchPRStatus();
    } catch (e) {
      prResult = {
        success: false,
        message: e instanceof Error ? e.message : "Create PR failed",
      };
    } finally {
      creatingPR = false;
    }
  }

  async function handleMergePR(): Promise<void> {
    if (prStatusData === null || prStatusData.pr === null) return;
    const prNum = prStatusData.pr.number;
    mergingPR = true;
    mergeResult = null;

    try {
      const resp = await fetch(
        `/api/ctx/${contextId}/pr/${contextId}/${prNum}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mergeMethod: "merge" }),
        },
      );
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData !== null && errData.error !== undefined
            ? errData.error
            : `Merge failed: ${resp.status}`,
        );
      }
      mergeResult = {
        success: true,
        message: `PR #${prNum} merged successfully`,
      };
      await fetchPRStatus();
    } catch (e) {
      mergeResult = {
        success: false,
        message: e instanceof Error ? e.message : "Merge failed",
      };
    } finally {
      mergingPR = false;
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
    <h2 class="text-lg font-semibold">GitHub Operations</h2>
  </header>

  <!-- Scrollable content -->
  <div class="flex-1 overflow-auto">
    {#if loading}
      <div class="p-8 text-center text-text-secondary">Loading...</div>
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
    {:else}
      <div class="max-w-3xl mx-auto p-6 space-y-8">
        <!-- Section 1: Local Changes Indicator -->
        {#if statusData !== null}
          <section>
            <h3 class="text-base font-semibold mb-4 text-text-primary">
              Local Status
            </h3>

            <!-- Branch name -->
            <div
              class="mb-4 px-4 py-3 bg-bg-secondary border border-border-default rounded-lg flex items-center gap-4"
            >
              <div>
                <span class="text-sm text-text-secondary">Branch:</span>
                <span class="ml-2 font-mono font-semibold text-accent-fg">
                  {statusData.branch}
                </span>
              </div>

              {#if pushStatusData !== null}
                <div class="flex items-center gap-3 ml-auto text-xs">
                  {#if pushStatusData.aheadCount > 0}
                    <span class="text-success-fg font-mono">
                      {pushStatusData.aheadCount} ahead
                    </span>
                  {/if}
                  {#if pushStatusData.behindCount > 0}
                    <span class="text-attention-fg font-mono">
                      {pushStatusData.behindCount} behind
                    </span>
                  {/if}
                  {#if pushStatusData.aheadCount === 0 && pushStatusData.behindCount === 0}
                    <span class="text-text-tertiary">up to date</span>
                  {/if}
                </div>
              {/if}
            </div>

            {#if hasUncommitted}
              <div
                class="px-4 py-3 bg-bg-secondary border border-attention-fg rounded-lg"
              >
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm font-medium text-attention-fg">
                    {uncommittedCount} uncommitted change{uncommittedCount !== 1
                      ? "s"
                      : ""}
                  </span>
                </div>

                <div class="flex flex-wrap gap-3 text-xs">
                  {#if statusData.staged.length > 0}
                    <button
                      type="button"
                      class="text-success-fg hover:underline cursor-pointer"
                      onclick={() => toggleSection("staged")}
                    >
                      {statusData.staged.length} staged
                    </button>
                  {/if}
                  {#if statusData.modified.length > 0}
                    <button
                      type="button"
                      class="text-attention-fg hover:underline cursor-pointer"
                      onclick={() => toggleSection("modified")}
                    >
                      {statusData.modified.length} modified
                    </button>
                  {/if}
                  {#if statusData.untracked.length > 0}
                    <button
                      type="button"
                      class="text-accent-fg hover:underline cursor-pointer"
                      onclick={() => toggleSection("untracked")}
                    >
                      {statusData.untracked.length} untracked
                    </button>
                  {/if}
                  {#if statusData.conflicts.length > 0}
                    <button
                      type="button"
                      class="text-danger-fg hover:underline cursor-pointer"
                      onclick={() => toggleSection("conflicts")}
                    >
                      {statusData.conflicts.length} conflicts
                    </button>
                  {/if}
                </div>

                <!-- Expandable file lists -->
                {#if expandedSections["staged"] && statusData.staged.length > 0}
                  <div
                    class="mt-3 p-2 bg-bg-primary border border-border-default rounded"
                  >
                    <h4 class="text-xs font-semibold text-success-fg mb-1">
                      Staged
                    </h4>
                    <ul class="space-y-0.5">
                      {#each statusData.staged as file}
                        <li
                          class="text-xs font-mono text-text-secondary truncate"
                        >
                          {file}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if expandedSections["modified"] && statusData.modified.length > 0}
                  <div
                    class="mt-3 p-2 bg-bg-primary border border-border-default rounded"
                  >
                    <h4 class="text-xs font-semibold text-attention-fg mb-1">
                      Modified
                    </h4>
                    <ul class="space-y-0.5">
                      {#each statusData.modified as file}
                        <li
                          class="text-xs font-mono text-text-secondary truncate"
                        >
                          {file}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if expandedSections["untracked"] && statusData.untracked.length > 0}
                  <div
                    class="mt-3 p-2 bg-bg-primary border border-border-default rounded"
                  >
                    <h4 class="text-xs font-semibold text-accent-fg mb-1">
                      Untracked
                    </h4>
                    <ul class="space-y-0.5">
                      {#each statusData.untracked as file}
                        <li
                          class="text-xs font-mono text-text-secondary truncate"
                        >
                          {file}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if expandedSections["conflicts"] && statusData.conflicts.length > 0}
                  <div
                    class="mt-3 p-2 bg-bg-primary border border-border-default rounded"
                  >
                    <h4 class="text-xs font-semibold text-danger-fg mb-1">
                      Conflicts
                    </h4>
                    <ul class="space-y-0.5">
                      {#each statusData.conflicts as file}
                        <li
                          class="text-xs font-mono text-text-secondary truncate"
                        >
                          {file}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {:else}
              <div
                class="px-4 py-3 bg-bg-secondary border border-success-emphasis rounded-lg text-success-fg text-sm"
              >
                Working tree clean
              </div>
            {/if}
          </section>
        {/if}

        <!-- Section 2: Pull Request -->
        <section>
          <h3 class="text-base font-semibold mb-4 text-text-primary">
            Pull Request
          </h3>

          {#if prStatusData !== null}
            <!-- Current PR info -->
            {#if prStatusData.hasPR && prStatusData.pr !== null}
              <div
                class="p-4 bg-bg-secondary border border-border-default rounded-lg space-y-3 mb-4"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <h4 class="text-sm font-semibold text-text-primary">
                      #{prStatusData.pr.number}: {prStatusData.pr.title}
                    </h4>
                    <div class="text-xs text-text-secondary mt-1">
                      {prStatusData.pr.headBranch} -> {prStatusData.pr
                        .baseBranch}
                    </div>
                  </div>
                  <span
                    class="text-xs px-2 py-0.5 rounded-full font-medium
                           {prStatusData.pr.state === 'open'
                      ? 'bg-success-muted text-success-fg'
                      : prStatusData.pr.state === 'merged'
                        ? 'bg-done-muted text-done-fg'
                        : 'bg-danger-muted text-danger-fg'}"
                  >
                    {prStatusData.pr.state}
                    {prStatusData.pr.isDraft ? " (draft)" : ""}
                  </span>
                </div>

                {#if prStatusData.pr.labels.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each prStatusData.pr.labels as label}
                      <span
                        class="text-xs px-2 py-0.5 bg-bg-tertiary border border-border-default rounded-full text-text-secondary"
                      >
                        {label}
                      </span>
                    {/each}
                  </div>
                {/if}

                {#if prStatusData.pr.reviewers.length > 0}
                  <div class="text-xs text-text-secondary">
                    Reviewers: {prStatusData.pr.reviewers.join(", ")}
                  </div>
                {/if}

                <div class="flex gap-2">
                  <a
                    href={prStatusData.pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="px-3 py-1.5 text-sm border border-border-default rounded
                           hover:bg-bg-tertiary transition-colors text-accent-fg"
                  >
                    View on GitHub
                  </a>

                  {#if prStatusData.pr.state === "open"}
                    <button
                      type="button"
                      class="px-3 py-1.5 text-sm bg-done-emphasis text-white rounded
                             hover:opacity-90 transition-colors disabled:opacity-50"
                      onclick={() => void handleMergePR()}
                      disabled={mergingPR}
                    >
                      {mergingPR ? "Merging..." : "Merge PR"}
                    </button>
                  {/if}
                </div>

                {#if mergeResult !== null}
                  <div
                    class="px-3 py-2 rounded text-sm {mergeResult.success
                      ? 'bg-success-muted text-success-fg'
                      : 'bg-danger-muted text-danger-fg'}"
                  >
                    {mergeResult.message}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Create PR section -->
            {#if prStatusData.canCreatePR && !prStatusData.hasPR}
              <div
                class="p-4 bg-bg-secondary border border-border-default rounded-lg space-y-3"
              >
                <div class="text-sm text-text-primary">Create Pull Request</div>

                <div class="flex items-center gap-2">
                  <label for="base-branch" class="text-sm text-text-secondary">
                    Base:
                  </label>
                  <select
                    id="base-branch"
                    class="px-2 py-1 text-sm bg-bg-primary border border-border-default rounded
                           text-text-primary focus:outline-none focus:border-accent-emphasis"
                    bind:value={selectedBaseBranch}
                  >
                    {#each prStatusData.availableBaseBranches as branch}
                      <option value={branch}>{branch}</option>
                    {/each}
                  </select>
                  <span class="text-xs text-text-tertiary">
                    &lt;- {statusData?.branch ?? "current"}
                  </span>
                </div>

                <button
                  type="button"
                  class="px-4 py-2 text-sm bg-success-emphasis text-white rounded
                         hover:opacity-90 transition-colors disabled:opacity-50"
                  onclick={() => void handleCreatePR()}
                  disabled={creatingPR || selectedBaseBranch === ""}
                >
                  {creatingPR ? "Creating..." : "Create PR"}
                </button>

                {#if prResult !== null}
                  <div
                    class="px-3 py-2 rounded text-sm {prResult.success
                      ? 'bg-success-muted text-success-fg'
                      : 'bg-danger-muted text-danger-fg'}"
                  >
                    {prResult.message}
                  </div>
                {/if}
              </div>
            {:else if !prStatusData.hasPR && !prStatusData.canCreatePR}
              <div
                class="p-4 bg-bg-secondary border border-border-default rounded-lg text-sm text-text-secondary"
              >
                Cannot create PR: {prStatusData.reason ?? "Unknown reason"}
              </div>
            {/if}
          {:else}
            <!-- PR routes not available -->
            <div
              class="p-4 bg-bg-secondary border border-border-default rounded-lg text-sm text-text-secondary"
            >
              PR information unavailable. GitHub integration may not be
              configured.
            </div>
          {/if}
        </section>

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
