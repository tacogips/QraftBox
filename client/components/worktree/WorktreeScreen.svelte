<script lang="ts">
  /**
   * WorktreeScreen Component
   *
   * Main screen for managing git worktrees.
   * Provides list, create, and delete functionality.
   *
   * Props:
   * - contextId: Current workspace context ID
   * - onBack: Callback to navigate back to previous screen
   */

  interface WorktreeInfo {
    path: string;
    head: string;
    branch: string | null;
    isMain: boolean;
    locked: boolean;
    prunable: boolean;
    mainRepositoryPath: string;
  }

  interface WorktreeListResponse {
    worktrees: WorktreeInfo[];
    mainRepository: string;
  }

  interface CreateWorktreeRequest {
    branch: string;
    worktreeName?: string;
    createBranch?: boolean;
    baseBranch?: string;
    customPath?: string;
  }

  interface Props {
    contextId: string;
    onBack: () => void;
  }

  const { contextId, onBack }: Props = $props();

  // State
  let worktrees = $state<WorktreeInfo[]>([]);
  let mainRepository = $state<string>("");
  let loading = $state(true);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);

  // Create form state
  let showCreateForm = $state(false);
  let createBranch = $state("");
  let createNewBranch = $state(false);
  let createBaseBranch = $state("");
  let createCustomPath = $state("");
  let creating = $state(false);
  let createError = $state<string | null>(null);

  // Delete confirmation state
  let deletingPath = $state<string | null>(null);
  let deleting = $state(false);

  /**
   * Non-main worktrees (for empty state messaging)
   */
  const additionalWorktrees = $derived(
    worktrees.filter((wt) => !wt.isMain),
  );

  /**
   * Fetch worktrees from API
   */
  async function fetchWorktrees(): Promise<void> {
    try {
      loading = true;
      error = null;
      const resp = await fetch(
        `/api/ctx/${contextId}/worktree/${contextId}/worktree`,
      );
      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as WorktreeListResponse;
      worktrees = data.worktrees;
      mainRepository = data.mainRepository;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch worktrees";
    } finally {
      loading = false;
    }
  }

  /**
   * Create a new worktree
   */
  async function handleCreate(): Promise<void> {
    if (createBranch.trim().length === 0) return;

    try {
      creating = true;
      createError = null;
      successMessage = null;

      const body: CreateWorktreeRequest = {
        branch: createBranch.trim(),
      };
      if (createNewBranch) {
        body.createBranch = true;
        if (createBaseBranch.trim().length > 0) {
          body.baseBranch = createBaseBranch.trim();
        }
      }
      if (createCustomPath.trim().length > 0) {
        body.customPath = createCustomPath.trim();
      }

      const resp = await fetch(
        `/api/ctx/${contextId}/worktree/${contextId}/worktree`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }

      const result = (await resp.json()) as {
        success: boolean;
        path: string;
        branch: string;
        error?: string;
      };

      if (!result.success) {
        throw new Error(result.error ?? "Failed to create worktree");
      }

      successMessage = `Worktree created at ${result.path}`;
      resetCreateForm();
      await fetchWorktrees();
    } catch (e) {
      createError =
        e instanceof Error ? e.message : "Failed to create worktree";
    } finally {
      creating = false;
    }
  }

  /**
   * Delete a worktree
   */
  async function handleDelete(path: string): Promise<void> {
    try {
      deleting = true;
      error = null;
      successMessage = null;

      const resp = await fetch(
        `/api/ctx/${contextId}/worktree/${contextId}/worktree?path=${encodeURIComponent(path)}&force=false`,
        { method: "DELETE" },
      );

      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }

      const result = (await resp.json()) as {
        success: boolean;
        removed: boolean;
        error?: string;
      };

      if (!result.success) {
        throw new Error(result.error ?? "Failed to remove worktree");
      }

      successMessage = "Worktree removed successfully";
      deletingPath = null;
      await fetchWorktrees();
    } catch (e) {
      error =
        e instanceof Error ? e.message : "Failed to remove worktree";
      deletingPath = null;
    } finally {
      deleting = false;
    }
  }

  /**
   * Reset create form fields
   */
  function resetCreateForm(): void {
    showCreateForm = false;
    createBranch = "";
    createNewBranch = false;
    createBaseBranch = "";
    createCustomPath = "";
    createError = null;
  }

  /**
   * Truncate long paths for display
   */
  function truncatePath(path: string, maxLen: number): string {
    if (path.length <= maxLen) return path;
    return "..." + path.slice(path.length - maxLen + 3);
  }

  // Fetch on mount
  $effect(() => {
    void fetchWorktrees();
  });
</script>

<div
  class="worktree-screen flex flex-col h-full bg-bg-primary"
  role="main"
  aria-label="Worktree management"
>
  <!-- Header -->
  <header class="px-6 py-4 border-b border-border-default bg-bg-secondary">
    <div class="flex items-center gap-3">
      <button
        type="button"
        onclick={onBack}
        class="p-2 min-w-[44px] min-h-[44px]
               text-text-secondary hover:text-text-primary
               hover:bg-bg-tertiary rounded-lg
               transition-colors
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
        aria-label="Back to previous screen"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <h1 class="text-2xl font-bold text-text-primary">Worktrees</h1>
    </div>
  </header>

  <!-- Content Area -->
  <div class="flex-1 overflow-y-auto px-6 py-4">
    {#if loading}
      <!-- Loading State -->
      <div
        class="flex flex-col items-center justify-center h-64"
        role="status"
        aria-live="polite"
      >
        <svg
          class="animate-spin h-8 w-8 text-accent-fg mb-4"
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
        <p class="text-text-secondary">Loading worktrees...</p>
      </div>
    {:else}
      <!-- Error Banner -->
      {#if error !== null}
        <div
          class="mb-4 p-4 rounded-lg border border-danger-muted bg-danger-subtle text-danger-fg"
          role="alert"
        >
          <div class="flex items-start gap-3">
            <span class="shrink-0 mt-0.5 font-bold">!</span>
            <p class="flex-1">{error}</p>
            <button
              type="button"
              onclick={() => { error = null; }}
              class="p-1 rounded hover:bg-danger-subtle transition-colors text-sm"
              aria-label="Dismiss error"
            >
              x
            </button>
          </div>
        </div>
      {/if}

      <!-- Success Banner -->
      {#if successMessage !== null}
        <div
          class="mb-4 p-4 rounded-lg border border-success-muted bg-success-subtle text-success-fg"
          role="status"
        >
          <div class="flex items-start gap-3">
            <p class="flex-1">{successMessage}</p>
            <button
              type="button"
              onclick={() => { successMessage = null; }}
              class="p-1 rounded hover:bg-success-subtle transition-colors text-sm"
              aria-label="Dismiss message"
            >
              x
            </button>
          </div>
        </div>
      {/if}

      <!-- Main Repository Info -->
      {#if mainRepository}
        <div class="mb-6 p-3 rounded-lg border border-border-default bg-bg-secondary">
          <span class="text-xs text-text-tertiary uppercase tracking-wider">Main Repository</span>
          <p class="text-sm text-text-primary mt-1 font-mono" title={mainRepository}>
            {truncatePath(mainRepository, 80)}
          </p>
        </div>
      {/if}

      <!-- Worktree List -->
      <div class="mb-6">
        <h2 class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
          Worktrees ({worktrees.length})
        </h2>

        {#if worktrees.length === 0}
          <div class="text-center py-12 text-text-secondary">
            <p>No worktrees found</p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each worktrees as wt (wt.path)}
              <div
                class="p-4 rounded-lg border border-border-default bg-bg-secondary
                       flex items-center gap-4 group"
              >
                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <!-- Branch name -->
                    <span class="text-sm font-medium text-text-primary">
                      {wt.branch ?? "(detached)"}
                    </span>

                    <!-- Badges -->
                    {#if wt.isMain}
                      <span
                        class="px-2 py-0.5 text-xs rounded bg-bg-tertiary text-text-secondary"
                      >
                        main
                      </span>
                    {/if}
                    {#if wt.locked}
                      <span
                        class="px-2 py-0.5 text-xs rounded bg-attention-muted text-attention-fg"
                      >
                        locked
                      </span>
                    {/if}
                  </div>

                  <!-- Path -->
                  <p
                    class="text-xs text-text-tertiary font-mono truncate"
                    title={wt.path}
                  >
                    {truncatePath(wt.path, 60)}
                  </p>
                </div>

                <!-- Delete button -->
                {#if !wt.isMain}
                  {#if deletingPath === wt.path}
                    <!-- Inline confirmation -->
                    <div class="flex items-center gap-2 text-sm shrink-0">
                      <span class="text-text-secondary">Are you sure?</span>
                      <button
                        type="button"
                        disabled={deleting}
                        onclick={() => void handleDelete(wt.path)}
                        class="px-2 py-1 rounded text-danger-fg hover:bg-danger-subtle
                               disabled:opacity-50 transition-colors"
                      >
                        {deleting ? "Removing..." : "Yes"}
                      </button>
                      <button
                        type="button"
                        onclick={() => { deletingPath = null; }}
                        class="px-2 py-1 rounded text-text-secondary hover:bg-bg-tertiary
                               transition-colors"
                      >
                        No
                      </button>
                    </div>
                  {:else}
                    <button
                      type="button"
                      onclick={() => { deletingPath = wt.path; }}
                      class="px-2 py-1 rounded text-sm text-danger-fg
                             opacity-0 group-hover:opacity-100
                             hover:bg-danger-subtle transition-all"
                      aria-label="Remove worktree at {wt.path}"
                    >
                      Delete
                    </button>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>

          {#if additionalWorktrees.length === 0}
            <p class="mt-3 text-sm text-text-tertiary text-center">
              No additional worktrees
            </p>
          {/if}
        {/if}
      </div>

      <!-- Create Worktree -->
      <div class="mb-6">
        {#if !showCreateForm}
          <button
            type="button"
            onclick={() => { showCreateForm = true; }}
            class="px-4 py-2 rounded-lg text-sm font-medium
                   bg-bg-secondary hover:bg-bg-tertiary text-text-primary
                   border border-border-default hover:border-accent-muted
                   transition-all"
          >
            New Worktree
          </button>
        {:else}
          <div class="p-4 rounded-lg border border-border-default bg-bg-secondary">
            <h3 class="text-sm font-semibold text-text-primary mb-4">
              Create New Worktree
            </h3>

            <!-- Create Error -->
            {#if createError !== null}
              <div
                class="mb-4 p-3 rounded border border-danger-muted bg-danger-subtle text-danger-fg text-sm"
                role="alert"
              >
                {createError}
              </div>
            {/if}

            <div class="space-y-4">
              <!-- Branch name -->
              <div>
                <label
                  for="create-branch"
                  class="block text-xs text-text-secondary mb-1"
                >
                  Branch name (required)
                </label>
                <input
                  id="create-branch"
                  type="text"
                  bind:value={createBranch}
                  placeholder="feature/my-branch"
                  class="w-full px-3 py-2 text-sm rounded border border-border-default
                         bg-bg-primary text-text-primary
                         focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                         placeholder:text-text-tertiary"
                />
              </div>

              <!-- Create new branch toggle -->
              <div class="flex items-center gap-2">
                <input
                  id="create-new-branch"
                  type="checkbox"
                  bind:checked={createNewBranch}
                  class="rounded border-border-default text-accent-fg
                         focus:ring-accent-emphasis"
                />
                <label
                  for="create-new-branch"
                  class="text-sm text-text-secondary"
                >
                  Create new branch
                </label>
              </div>

              <!-- Base branch (only when creating new branch) -->
              {#if createNewBranch}
                <div>
                  <label
                    for="create-base-branch"
                    class="block text-xs text-text-secondary mb-1"
                  >
                    Base branch (optional, defaults to current HEAD)
                  </label>
                  <input
                    id="create-base-branch"
                    type="text"
                    bind:value={createBaseBranch}
                    placeholder="main"
                    class="w-full px-3 py-2 text-sm rounded border border-border-default
                           bg-bg-primary text-text-primary
                           focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                           placeholder:text-text-tertiary"
                  />
                </div>
              {/if}

              <!-- Custom path -->
              <div>
                <label
                  for="create-custom-path"
                  class="block text-xs text-text-secondary mb-1"
                >
                  Custom path (optional)
                </label>
                <input
                  id="create-custom-path"
                  type="text"
                  bind:value={createCustomPath}
                  placeholder="Leave empty for default location"
                  class="w-full px-3 py-2 text-sm rounded border border-border-default
                         bg-bg-primary text-text-primary
                         focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                         placeholder:text-text-tertiary"
                />
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={creating || createBranch.trim().length === 0}
                  onclick={() => void handleCreate()}
                  class="px-4 py-2 rounded-lg text-sm font-medium
                         bg-accent-emphasis hover:bg-accent-fg text-white
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onclick={resetCreateForm}
                  class="px-4 py-2 rounded-lg text-sm
                         text-text-secondary hover:text-text-primary
                         hover:bg-bg-tertiary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
