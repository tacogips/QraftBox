<script lang="ts">
  /**
   * BranchListPanel Component
   *
   * Reusable filterable, paginated branch list panel with infinite scroll.
   * Displays branches sorted by latest commit date with the default branch pinned at top.
   * Used by both BranchSelector (for checkout) and MergeBranchDialog (for merge).
   */

  interface BranchInfo {
    readonly name: string;
    readonly isCurrent: boolean;
    readonly isDefault: boolean;
    readonly isRemote: boolean;
    readonly lastCommit: {
      readonly hash: string;
      readonly message: string;
      readonly author: string;
      readonly date: number;
    };
    readonly aheadBehind?:
      | {
          readonly ahead: number;
          readonly behind: number;
        }
      | undefined;
  }

  interface BranchListResponse {
    readonly branches: readonly BranchInfo[];
    readonly current: string;
    readonly defaultBranch: string;
    readonly total: number;
    readonly offset: number;
    readonly limit: number;
  }

  interface Props {
    contextId: string;
    currentBranch: string;
    /** Header text shown at top of panel */
    headerText: string;
    /** Placeholder text for filter input */
    filterPlaceholder?: string;
    /** Warning message shown when action is disabled */
    warningMessage?: string | undefined;
    /** If true, all selection and creation is disabled */
    disabled?: boolean;
    /** Called when a branch is selected */
    onSelect: (branch: BranchInfo) => void;
    /** If true, the current branch cannot be selected */
    disableCurrentBranch?: boolean;
    /** If provided, this branch name is pre-highlighted */
    selectedBranch?: string | undefined;
    /** Called when a new branch is created; if undefined, create button is hidden */
    onCreateBranch?: ((branchName: string) => void) | undefined;
  }

  const {
    contextId,
    currentBranch,
    headerText,
    filterPlaceholder = "Filter branches...",
    warningMessage = undefined,
    disabled = false,
    onSelect,
    disableCurrentBranch = false,
    selectedBranch = undefined,
    onCreateBranch = undefined,
  }: Props = $props();

  const PAGE_SIZE = 30;

  let filterQuery = $state("");
  let branches = $state<BranchInfo[]>([]);
  let totalCount = $state(0);
  let currentOffset = $state(0);
  let loading = $state(false);
  let loadingMore = $state(false);
  const hasMore = $derived(branches.length < totalCount);
  let errorMessage = $state<string | null>(null);
  let filterInput: HTMLInputElement | undefined = $state(undefined);
  let focusedIndex = $state(-1);
  let scrollContainerRef: HTMLDivElement | undefined = $state(undefined);
  let defaultBranchName = $state("");

  /** Whether the create branch form is visible */
  let showCreateForm = $state(false);
  /** New branch name input value */
  let newBranchName = $state("");
  /** Create form error message */
  let createErrorMessage = $state<string | null>(null);
  /** Whether branch creation is in progress */
  let creating = $state(false);
  /** Reference to the new branch name input */
  let newBranchInput: HTMLInputElement | undefined = $state(undefined);

  /**
   * Check if the new branch name already exists (client-side duplicate detection)
   */
  const isDuplicateBranch = $derived.by(() => {
    if (newBranchName.trim().length === 0) return false;
    const name = newBranchName.trim().toLowerCase();
    return branches.some((b) => b.name.toLowerCase() === name);
  });

  /**
   * Validate branch name against git naming rules (client-side)
   */
  function isValidBranchName(name: string): boolean {
    if (name.trim().length === 0) return false;
    const invalidChars = /[ ~^:?*[\]\\@{]/;
    if (invalidChars.test(name)) return false;
    if (name.includes("..")) return false;
    if (name.startsWith("/") || name.endsWith("/")) return false;
    if (name.includes("//")) return false;
    if (name.endsWith(".lock")) return false;
    return true;
  }

  /**
   * Toggle create branch form visibility
   */
  function toggleCreateForm(): void {
    showCreateForm = !showCreateForm;
    createErrorMessage = null;
    newBranchName = "";
    if (showCreateForm) {
      requestAnimationFrame(() => {
        newBranchInput?.focus();
      });
    }
  }

  /**
   * Handle create branch form submission
   */
  function handleCreateBranch(): void {
    if (onCreateBranch === undefined || disabled) return;
    const name = newBranchName.trim();
    if (name.length === 0) {
      createErrorMessage = "Branch name is required";
      return;
    }
    if (!isValidBranchName(name)) {
      createErrorMessage = "Invalid branch name";
      return;
    }
    if (isDuplicateBranch) {
      createErrorMessage = `Branch '${name}' already exists`;
      return;
    }
    createErrorMessage = null;
    onCreateBranch(name);
  }

  /**
   * Filtered branches based on query (client-side filter on loaded data)
   */
  const filteredBranches = $derived.by(() => {
    if (filterQuery.trim().length === 0) {
      return branches;
    }
    const q = filterQuery.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  });

  /**
   * Fetch branches from API with pagination
   */
  async function fetchBranches(offset: number, append: boolean): Promise<void> {
    if (append) {
      loadingMore = true;
    } else {
      loading = true;
    }
    errorMessage = null;
    try {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });
      const resp = await fetch(
        `/api/ctx/${contextId}/branches?${params.toString()}`,
      );
      if (resp.ok) {
        const data = (await resp.json()) as BranchListResponse;
        if (append) {
          branches = [...branches, ...data.branches];
        } else {
          branches = [...data.branches];
          defaultBranchName = data.defaultBranch;
        }
        totalCount = data.total;
        currentOffset = offset + data.branches.length;
      } else {
        errorMessage = "Failed to load branches";
      }
    } catch {
      errorMessage = "Failed to load branches";
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  /**
   * Load next page of branches
   */
  async function loadMore(): Promise<void> {
    if (loadingMore || !hasMore) {
      return;
    }
    await fetchBranches(currentOffset, true);
  }

  /**
   * Handle scroll to detect when near bottom
   */
  function handleScroll(): void {
    if (scrollContainerRef === undefined || loadingMore || !hasMore) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      void loadMore();
    }
  }

  /**
   * Initialize: fetch first page and focus filter
   */
  export function initialize(): void {
    filterQuery = "";
    focusedIndex = -1;
    errorMessage = null;
    branches = [];
    totalCount = 0;
    currentOffset = 0;
    showCreateForm = false;
    newBranchName = "";
    createErrorMessage = null;
    creating = false;
    void fetchBranches(0, false);
    requestAnimationFrame(() => {
      filterInput?.focus();
    });
  }

  /**
   * Handle keydown for keyboard navigation
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (focusedIndex < filteredBranches.length - 1) {
        focusedIndex++;
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (focusedIndex > 0) {
        focusedIndex--;
      }
      return;
    }
    if (event.key === "Enter" && focusedIndex >= 0) {
      event.preventDefault();
      const branch = filteredBranches[focusedIndex];
      if (branch !== undefined && !disabled) {
        const isDisabled =
          disableCurrentBranch && branch.name === currentBranch;
        if (!isDisabled) {
          onSelect(branch);
        }
      }
    }
  }

  /**
   * Format relative time from timestamp
   */
  function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${String(diffMinutes)}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${String(diffHours)}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${String(diffDays)}d ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${String(diffMonths)}mo ago`;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="flex flex-col max-h-80"
  onkeydown={handleKeydown}
  role="listbox"
  aria-label={headerText}
>
  <!-- Header with filter -->
  <div class="px-3 py-2 border-b border-border-default">
    <div class="flex items-center justify-between mb-1.5">
      <div class="text-xs text-text-secondary font-semibold">
        {headerText}
      </div>
      {#if onCreateBranch !== undefined}
        <button
          type="button"
          class="w-5 h-5 flex items-center justify-center rounded text-text-secondary
                 hover:text-accent-fg hover:bg-bg-tertiary transition-colors cursor-pointer
                 {disabled ? 'opacity-50 cursor-default' : ''}"
          onclick={toggleCreateForm}
          title="Create new branch"
          {disabled}
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 11-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z"
            />
          </svg>
        </button>
      {/if}
    </div>
    <input
      bind:this={filterInput}
      type="text"
      placeholder={filterPlaceholder}
      class="w-full px-2 py-1 text-sm bg-bg-secondary border border-border-default rounded
             text-text-primary placeholder:text-text-placeholder
             focus:outline-none focus:ring-1 focus:ring-accent-emphasis focus:border-accent-emphasis"
      bind:value={filterQuery}
      oninput={() => {
        focusedIndex = -1;
      }}
    />
  </div>

  <!-- Create branch form (hidden by default) -->
  {#if showCreateForm && onCreateBranch !== undefined}
    <div class="px-3 py-2 border-b border-border-default bg-bg-secondary">
      <div class="flex items-center gap-1.5">
        <input
          bind:this={newBranchInput}
          type="text"
          placeholder="New branch name..."
          class="flex-1 px-2 py-1 text-sm bg-bg-primary border rounded
                 text-text-primary placeholder:text-text-placeholder
                 focus:outline-none focus:ring-1 focus:ring-accent-emphasis
                 {isDuplicateBranch
            ? 'border-danger-emphasis'
            : 'border-border-default focus:border-accent-emphasis'}"
          bind:value={newBranchName}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreateBranch();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              toggleCreateForm();
            }
          }}
          disabled={creating}
        />
        <button
          type="button"
          class="px-2 py-1 text-xs font-medium rounded transition-colors
                 {newBranchName.trim().length === 0 ||
          isDuplicateBranch ||
          creating ||
          disabled
            ? 'bg-bg-tertiary text-text-placeholder cursor-default'
            : 'bg-accent-emphasis text-white hover:bg-accent-fg cursor-pointer'}"
          onclick={handleCreateBranch}
          disabled={newBranchName.trim().length === 0 ||
            isDuplicateBranch ||
            creating ||
            disabled}
        >
          {creating ? "Creating..." : "Create"}
        </button>
      </div>
      {#if isDuplicateBranch}
        <div class="text-[11px] text-danger-fg mt-1">
          Branch '{newBranchName.trim()}' already exists
        </div>
      {/if}
      {#if createErrorMessage !== null && !isDuplicateBranch}
        <div class="text-[11px] text-danger-fg mt-1">
          {createErrorMessage}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Warning message -->
  {#if warningMessage !== undefined}
    <div
      class="px-3 py-1.5 text-xs bg-attention-subtle text-attention-fg border-b border-border-default flex items-center gap-1.5"
    >
      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M8.22 1.754a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM9 11a1 1 0 11-2 0 1 1 0 012 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z"
        />
      </svg>
      {warningMessage}
    </div>
  {/if}

  <!-- Error message -->
  {#if errorMessage !== null}
    <div
      class="px-3 py-1.5 text-xs bg-danger-subtle text-danger-fg border-b border-border-default"
    >
      {errorMessage}
    </div>
  {/if}

  <!-- Branch list with infinite scroll -->
  <div
    bind:this={scrollContainerRef}
    class="overflow-y-auto flex-1"
    onscroll={handleScroll}
  >
    {#if loading}
      <div class="px-3 py-4 text-sm text-text-secondary text-center">
        Loading branches...
      </div>
    {:else if filteredBranches.length === 0}
      <div class="px-3 py-4 text-sm text-text-secondary text-center">
        {filterQuery.trim().length > 0
          ? "No branches match filter"
          : "No branches found"}
      </div>
    {:else}
      {#each filteredBranches as branch, index}
        {@const isCurrent = branch.name === currentBranch}
        {@const isSelected =
          selectedBranch !== undefined ? branch.name === selectedBranch : false}
        {@const isItemDisabled =
          disabled || (disableCurrentBranch && isCurrent)}
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors
                 {focusedIndex === index
            ? 'bg-bg-tertiary'
            : 'hover:bg-bg-secondary'}
                 {isSelected ? 'font-semibold' : ''}
                 {isItemDisabled
            ? 'cursor-default opacity-50'
            : 'cursor-pointer'}"
          onclick={() => {
            if (!isItemDisabled) {
              onSelect(branch);
            }
          }}
          onmouseenter={() => {
            focusedIndex = index;
          }}
          disabled={isItemDisabled}
          role="option"
          aria-selected={isSelected}
        >
          <!-- Check mark for selected branch -->
          <span class="w-4 shrink-0 text-success-fg">
            {#if isSelected}
              <svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
                />
              </svg>
            {/if}
          </span>

          <!-- Branch info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span
                class="font-mono text-xs truncate {isSelected
                  ? 'text-text-primary'
                  : 'text-text-secondary'}"
              >
                {branch.name}
              </span>
              {#if branch.isDefault}
                <span
                  class="text-[10px] px-1 py-0 rounded bg-accent-subtle text-accent-fg border border-accent-muted leading-tight"
                >
                  default
                </span>
              {/if}
              {#if isCurrent}
                <span
                  class="text-[10px] px-1 py-0 rounded bg-success-subtle text-success-fg border border-success-muted leading-tight"
                >
                  current
                </span>
              {/if}
            </div>
            {#if branch.lastCommit.message.length > 0}
              <div class="text-[11px] text-text-tertiary truncate mt-0.5">
                {branch.lastCommit.message}
                {#if branch.lastCommit.date > 0}
                  <span class="text-text-placeholder ml-1">
                    {formatRelativeTime(branch.lastCommit.date)}
                  </span>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Ahead/behind indicator -->
          {#if branch.aheadBehind !== undefined && (branch.aheadBehind.ahead > 0 || branch.aheadBehind.behind > 0)}
            <div
              class="flex items-center gap-1 text-[10px] text-text-tertiary shrink-0"
            >
              {#if branch.aheadBehind.ahead > 0}
                <span title="Ahead of upstream"
                  >{branch.aheadBehind.ahead}^</span
                >
              {/if}
              {#if branch.aheadBehind.behind > 0}
                <span title="Behind upstream">{branch.aheadBehind.behind}v</span
                >
              {/if}
            </div>
          {/if}
        </button>
      {/each}

      <!-- Loading more indicator -->
      {#if loadingMore}
        <div class="px-3 py-2 text-xs text-text-secondary text-center">
          Loading more...
        </div>
      {/if}
    {/if}
  </div>

  <!-- Footer with branch count -->
  <div
    class="px-3 py-1.5 text-[11px] text-text-tertiary border-t border-border-default"
  >
    {branches.length} of {totalCount} branches
  </div>
</div>
