<script lang="ts">
  /**
   * WorktreeButton Component
   *
   * A button in the secondary header bar (left of Changes tab) that provides:
   * 1. Click "Worktree" -> opens a popover to create a new worktree
   * 2. Click arrow icon -> expands a dropdown list of existing worktrees
   * 3. Selecting a worktree switches the current directory
   *
   * Uses fixed positioning so dropdowns escape overflow-hidden/auto ancestors.
   *
   * Props:
   * - contextId: Current workspace context ID
   * - projectPath: Current project directory path
   * - onWorktreeSwitch: Callback when worktree is switched (triggers app reload)
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

  interface Props {
    contextId: string;
    projectPath: string;
    onWorktreeSwitch: () => void;
    disabled?: boolean;
  }

  const {
    contextId,
    projectPath,
    onWorktreeSwitch,
    disabled = false,
  }: Props = $props();

  // Dropdown list state
  let listOpen = $state(false);
  let worktrees = $state<WorktreeInfo[]>([]);
  let listLoading = $state(false);
  let listError = $state<string | null>(null);

  // Create form state
  let createOpen = $state(false);
  let createBranch = $state("");
  let createNewBranch = $state(true);
  let createBaseBranch = $state("");
  let creating = $state(false);
  let createError = $state<string | null>(null);

  // Button refs for fixed positioning
  let buttonRef: HTMLButtonElement | undefined = $state(undefined);
  let arrowRef: HTMLButtonElement | undefined = $state(undefined);

  // Fixed dropdown position
  let dropdownTop = $state(0);
  let dropdownLeft = $state(0);
  let isPhoneViewport = $state(false);

  function detectPhoneViewport(): boolean {
    return window.innerWidth <= 768;
  }

  /**
   * Fetch worktree list
   */
  async function fetchWorktrees(): Promise<void> {
    try {
      listLoading = true;
      listError = null;
      const resp = await fetch(
        `/api/ctx/${contextId}/worktree/${contextId}/worktree`,
      );
      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as {
        worktrees: WorktreeInfo[];
        mainRepository: string;
      };
      worktrees = data.worktrees;
    } catch (e) {
      listError = e instanceof Error ? e.message : "Failed to fetch worktrees";
    } finally {
      listLoading = false;
    }
  }

  /**
   * Compute fixed position from a button element
   */
  function computePosition(el: HTMLButtonElement | undefined): void {
    if (el !== undefined) {
      const rect = el.getBoundingClientRect();
      dropdownTop = rect.bottom + 4;
      const viewportPadding = 8;
      const estimatedPopoverWidth = Math.min(320, window.innerWidth - 16);
      const maxLeft = Math.max(
        viewportPadding,
        window.innerWidth - estimatedPopoverWidth - viewportPadding,
      );
      dropdownLeft = Math.min(Math.max(rect.left, viewportPadding), maxLeft);
    }
  }

  /**
   * Toggle worktree list dropdown
   */
  async function toggleList(): Promise<void> {
    if (listOpen) {
      listOpen = false;
      return;
    }
    computePosition(buttonRef);
    listOpen = true;
    createOpen = false;
    await fetchWorktrees();
  }

  /**
   * Toggle create worktree form
   */
  async function toggleCreate(): Promise<void> {
    if (createOpen) {
      createOpen = false;
      return;
    }
    computePosition(buttonRef);
    createOpen = true;
    listOpen = false;
    createBranch = "";
    createNewBranch = true;
    createBaseBranch = "";
    createError = null;
    await fetchWorktrees();
  }

  /**
   * Create a new worktree and switch to it
   */
  async function handleCreate(): Promise<void> {
    const branch = createBranch.trim();
    if (branch.length === 0) return;

    try {
      creating = true;
      createError = null;

      const body: Record<string, unknown> = { branch };
      if (createNewBranch) {
        body["createBranch"] = true;
        const base = createBaseBranch.trim();
        if (base.length > 0) {
          body["baseBranch"] = base;
        }
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

      // Switch to the new worktree
      await switchToDirectory(result.path);

      createOpen = false;
    } catch (e) {
      createError =
        e instanceof Error ? e.message : "Failed to create worktree";
    } finally {
      creating = false;
    }
  }

  /**
   * Switch current directory to the given worktree path
   */
  async function switchToDirectory(path: string): Promise<void> {
    if (path === projectPath) {
      listOpen = false;
      return;
    }

    try {
      // Open the directory via workspace tabs API
      const resp = await fetch("/api/workspace/tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }

      listOpen = false;
      createOpen = false;

      // Trigger app reload
      onWorktreeSwitch();
    } catch (e) {
      listError = e instanceof Error ? e.message : "Failed to switch directory";
    }
  }

  /**
   * Close all dropdowns
   */
  function closeAll(): void {
    listOpen = false;
    createOpen = false;
  }

  /**
   * Truncate path for display
   */
  function truncPath(p: string, max: number): string {
    if (p.length <= max) return p;
    return "..." + p.slice(p.length - max + 3);
  }

  $effect(() => {
    const updateViewport = (): void => {
      isPhoneViewport = detectPhoneViewport();
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  });
</script>

<!-- Backdrop to close dropdowns -->
{#if listOpen || createOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40"
    onclick={closeAll}
    onkeydown={() => {}}
    role="presentation"
  ></div>
{/if}

<div class="flex items-center h-full">
  <!-- Worktree button (opens create form) -->
  <button
    type="button"
    bind:this={buttonRef}
    class="{isPhoneViewport ? 'px-3 py-2 min-h-[40px]' : 'px-2 py-1.5'} text-sm transition-colors h-full flex items-center gap-1
           {disabled
      ? 'text-text-tertiary cursor-not-allowed opacity-50'
      : createOpen
        ? 'text-text-primary font-semibold'
        : 'text-text-secondary hover:text-text-primary'}"
    onclick={() => {
      if (!disabled) void toggleCreate();
    }}
    title={disabled ? "Not a git repository" : "Create new worktree"}
    {disabled}
  >
    <!-- Git branch icon -->
    <svg
      width={isPhoneViewport ? "16" : "14"}
      height={isPhoneViewport ? "16" : "14"}
      viewBox="0 0 16 16"
      fill="currentColor"
      class="shrink-0"
    >
      <path
        d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
      />
    </svg>
    Worktree
  </button>

  <!-- Arrow icon (opens worktree list) -->
  <button
    type="button"
    bind:this={arrowRef}
    class="{isPhoneViewport ? 'px-2.5 py-2 min-h-[40px] min-w-[32px]' : 'px-1 py-1.5'} text-sm transition-colors h-full flex items-center justify-center
           {disabled
      ? 'text-text-tertiary cursor-not-allowed opacity-50'
      : listOpen
        ? 'text-text-primary'
        : 'text-text-secondary hover:text-text-primary'}"
    onclick={() => {
      if (!disabled) void toggleList();
    }}
    title={disabled ? "Not a git repository" : "Show worktrees"}
    {disabled}
  >
    <svg
      width={isPhoneViewport ? "14" : "12"}
      height={isPhoneViewport ? "14" : "12"}
      viewBox="0 0 16 16"
      fill="currentColor"
      class="transition-transform {listOpen ? 'rotate-180' : ''}"
    >
      <path
        d="m4.427 7.427 3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z"
      />
    </svg>
  </button>
</div>

<!-- Create Worktree Popover (fixed position) -->
{#if createOpen}
  <div
    class="fixed w-[min(20rem,calc(100vw-1rem))] bg-bg-secondary border border-border-default rounded-lg shadow-lg z-50"
    style="top: {dropdownTop}px; left: {dropdownLeft}px;"
  >
    <div class="p-3 border-b border-border-default">
      <h3 class="text-sm font-semibold text-text-primary">
        Create New Worktree
      </h3>
    </div>

    {#if createError !== null}
      <div
        class="mx-3 mt-3 p-2 rounded border border-danger-muted bg-danger-subtle text-danger-fg text-xs"
        role="alert"
      >
        {createError}
      </div>
    {/if}

    <div class="p-3 space-y-3">
      <!-- Branch name -->
      <div>
        <label for="wt-branch" class="block text-xs text-text-secondary mb-1">
          Branch name
        </label>
        <input
          id="wt-branch"
          type="text"
          bind:value={createBranch}
          placeholder="feature/my-branch"
          class="w-full px-2 py-1.5 text-sm rounded border border-border-default
                 bg-bg-primary text-text-primary
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 placeholder:text-text-tertiary"
          onkeydown={(e) => {
            if (e.key === "Enter" && createBranch.trim().length > 0) {
              e.preventDefault();
              void handleCreate();
            }
          }}
        />
      </div>

      <!-- Create new branch toggle -->
      <label class="flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          bind:checked={createNewBranch}
          class="rounded border-border-default"
        />
        Create new branch
      </label>

      <!-- Base branch -->
      {#if createNewBranch}
        <div>
          <label for="wt-base" class="block text-xs text-text-secondary mb-1">
            Base branch (optional)
          </label>
          <input
            id="wt-base"
            type="text"
            bind:value={createBaseBranch}
            placeholder="main"
            class="w-full px-2 py-1.5 text-sm rounded border border-border-default
                   bg-bg-primary text-text-primary
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                   placeholder:text-text-tertiary"
          />
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={creating || createBranch.trim().length === 0}
          onclick={() => void handleCreate()}
          class="px-3 py-1.5 rounded text-sm font-medium
                 bg-success-emphasis hover:brightness-110 text-white
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-colors"
        >
          {creating ? "Creating..." : "Create & Switch"}
        </button>
        <button
          type="button"
          onclick={() => {
            createOpen = false;
          }}
          class="px-3 py-1.5 rounded text-sm
                 text-text-secondary hover:text-text-primary
                 hover:bg-bg-tertiary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Worktree List Dropdown (fixed position) -->
{#if listOpen}
  <div
    class="fixed w-[min(20rem,calc(100vw-1rem))] max-h-96 bg-bg-secondary border border-border-default rounded-lg shadow-lg z-50 flex flex-col"
    style="top: {dropdownTop}px; left: {dropdownLeft}px;"
  >
    <div class="p-3 border-b border-border-default shrink-0">
      <h3 class="text-sm font-semibold text-text-primary">Worktrees</h3>
    </div>

    {#if listError !== null}
      <div
        class="mx-3 mt-3 p-2 rounded border border-danger-muted bg-danger-subtle text-danger-fg text-xs shrink-0"
        role="alert"
      >
        {listError}
      </div>
    {/if}

    <div class="flex-1 overflow-y-auto">
      {#if listLoading}
        <div class="flex items-center justify-center py-6">
          <svg
            class="animate-spin h-5 w-5 text-accent-fg"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
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
        </div>
      {:else if worktrees.length === 0}
        <div class="py-6 text-center text-sm text-text-tertiary">
          No worktrees found
        </div>
      {:else}
        {#each worktrees as wt (wt.path)}
          <button
            type="button"
            onclick={() => void switchToDirectory(wt.path)}
            class="w-full text-left px-4 py-2.5 flex items-center gap-3
                   hover:bg-bg-tertiary transition-colors
                   border-b border-border-default last:border-b-0
                   {wt.path === projectPath ? 'bg-accent-subtle' : ''}"
            disabled={wt.path === projectPath}
          >
            <!-- Branch icon -->
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="shrink-0 {wt.path === projectPath
                ? 'text-accent-fg'
                : 'text-text-tertiary'}"
            >
              <path
                d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
              />
            </svg>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="text-sm text-text-primary truncate {wt.path ===
                  projectPath
                    ? 'font-semibold'
                    : ''}"
                >
                  {wt.branch ?? "(detached)"}
                </span>
                {#if wt.isMain}
                  <span
                    class="px-1.5 py-0.5 text-xs rounded bg-bg-tertiary text-text-secondary shrink-0"
                  >
                    root
                  </span>
                {/if}
                {#if wt.path === projectPath}
                  <span
                    class="px-1.5 py-0.5 text-xs rounded bg-accent-subtle text-accent-fg shrink-0"
                  >
                    current
                  </span>
                {/if}
              </div>
              <p
                class="text-xs text-text-tertiary font-mono truncate mt-0.5"
                title={wt.path}
              >
                {truncPath(wt.path, 50)}
              </p>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}
