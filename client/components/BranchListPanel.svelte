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
    /** Called when a branch is selected */
    onSelect: (branch: BranchInfo) => void;
    /** If true, the current branch cannot be selected */
    disableCurrentBranch?: boolean;
    /** If provided, this branch name is pre-highlighted */
    selectedBranch?: string | undefined;
  }

  const {
    contextId,
    currentBranch,
    headerText,
    filterPlaceholder = "Filter branches...",
    warningMessage = undefined,
    onSelect,
    disableCurrentBranch = false,
    selectedBranch = undefined,
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
      if (branch !== undefined) {
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
    <div class="text-xs text-text-secondary font-semibold mb-1.5">
      {headerText}
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

  <!-- Warning message -->
  {#if warningMessage !== undefined}
    <div
      class="px-3 py-1.5 text-xs bg-attention-subtle text-attention-fg border-b border-border-default flex items-center gap-1.5"
    >
      <svg
        class="w-3.5 h-3.5 shrink-0"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
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
        {@const isSelected = selectedBranch !== undefined
          ? branch.name === selectedBranch
          : false}
        {@const isDisabled = disableCurrentBranch && isCurrent}
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors
                 {focusedIndex === index ? 'bg-bg-tertiary' : 'hover:bg-bg-secondary'}
                 {isSelected ? 'font-semibold' : ''}
                 {isDisabled ? 'cursor-default opacity-50' : 'cursor-pointer'}"
          onclick={() => {
            if (!isDisabled) {
              onSelect(branch);
            }
          }}
          onmouseenter={() => {
            focusedIndex = index;
          }}
          disabled={isDisabled}
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
                <span title="Behind upstream"
                  >{branch.aheadBehind.behind}v</span
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
