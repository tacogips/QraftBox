<script lang="ts">
  /**
   * BranchSelector Component
   *
   * Clickable branch name that expands into a filterable branch list dropdown.
   * Uses fixed positioning so the dropdown escapes overflow-hidden/auto ancestors.
   * Loads 30 branches at a time with infinite scroll.
   * Sorted by latest commit date desc, default branch pinned at top.
   */

  interface Props {
    contextId: string;
    currentBranch: string;
    hasUncommittedChanges: boolean;
  }

  const { contextId, currentBranch, hasUncommittedChanges }: Props = $props();

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

  interface CheckoutResponse {
    readonly success: boolean;
    readonly previousBranch: string;
    readonly currentBranch: string;
    readonly stashCreated?: string | undefined;
    readonly error?: string | undefined;
  }

  const PAGE_SIZE = 30;

  /** Whether dropdown is open */
  let isOpen = $state(false);

  /** Filter input value */
  let filterQuery = $state("");

  /** Loaded branches (accumulated across pages) */
  let branches = $state<BranchInfo[]>([]);

  /** Total branch count from server */
  let totalCount = $state(0);

  /** Current offset for pagination */
  let currentOffset = $state(0);

  /** Loading initial page */
  let loading = $state(false);

  /** Loading more (infinite scroll) */
  let loadingMore = $state(false);

  /** Whether there are more branches to load */
  const hasMore = $derived(branches.length < totalCount);

  /** Checkout in progress */
  let checkingOut = $state(false);

  /** Error message */
  let errorMessage = $state<string | null>(null);

  /** Success message */
  let successMessage = $state<string | null>(null);

  /** Reference to the filter input for focusing */
  let filterInput: HTMLInputElement | undefined = $state(undefined);

  /** Focused branch index for keyboard navigation */
  let focusedIndex = $state(-1);

  /** Reference to trigger button for position calculation */
  let triggerRef: HTMLButtonElement | undefined = $state(undefined);

  /** Reference to the scroll container for infinite scroll */
  let scrollContainerRef: HTMLDivElement | undefined = $state(undefined);

  /** Dropdown fixed position */
  let dropdownTop = $state(0);
  let dropdownLeft = $state(0);

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
    // Load more when within 100px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      void loadMore();
    }
  }

  /**
   * Toggle dropdown open/close
   */
  function toggle(): void {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  /**
   * Open the dropdown and fetch first page
   */
  function open(): void {
    if (triggerRef !== undefined) {
      const rect = triggerRef.getBoundingClientRect();
      dropdownTop = rect.bottom + 4;
      dropdownLeft = rect.left;
    }
    isOpen = true;
    filterQuery = "";
    focusedIndex = -1;
    errorMessage = null;
    successMessage = null;
    branches = [];
    totalCount = 0;
    currentOffset = 0;
    void fetchBranches(0, false);
    requestAnimationFrame(() => {
      filterInput?.focus();
    });
  }

  /**
   * Close the dropdown
   */
  function close(): void {
    isOpen = false;
    filterQuery = "";
    focusedIndex = -1;
    errorMessage = null;
  }

  /**
   * Checkout a branch
   */
  async function checkout(branchName: string): Promise<void> {
    if (hasUncommittedChanges) {
      return;
    }
    if (branchName === currentBranch) {
      return;
    }

    checkingOut = true;
    errorMessage = null;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/branches/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: branchName }),
      });
      const data = (await resp.json()) as CheckoutResponse;
      if (data.success) {
        successMessage = `Switched to ${data.currentBranch}`;
        setTimeout(() => {
          close();
          successMessage = null;
          window.location.reload();
        }, 800);
      } else {
        errorMessage = data.error ?? "Checkout failed";
      }
    } catch {
      errorMessage = "Checkout failed";
    } finally {
      checkingOut = false;
    }
  }

  /**
   * Handle keydown in the dropdown
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      close();
      return;
    }
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
        void checkout(branch.name);
      }
    }
  }

  /**
   * Format relative time from timestamp
   */
  function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diffMs = now - timestamp * 1000;
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

<!-- Trigger button -->
<button
  bind:this={triggerRef}
  type="button"
  class="font-mono text-accent-fg hover:text-accent-emphasis hover:underline cursor-pointer text-sm flex items-center gap-1 transition-colors"
  onclick={toggle}
  title="Click to switch branches"
>
  <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
    <path
      fill-rule="evenodd"
      d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"
    />
  </svg>
  <span>{currentBranch}</span>
  <svg
    class="w-3 h-3 shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}"
    viewBox="0 0 16 16"
    fill="currentColor"
  >
    <path
      fill-rule="evenodd"
      d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"
    />
  </svg>
</button>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40"
    onclick={() => close()}
    onkeydown={() => {}}
    role="presentation"
  ></div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed w-80 max-h-96 bg-bg-primary border border-border-default rounded-md shadow-lg z-50 flex flex-col"
    style="top: {dropdownTop}px; left: {dropdownLeft}px;"
    onkeydown={handleKeydown}
    role="listbox"
    aria-label="Branch list"
  >
    <!-- Header -->
    <div class="px-3 py-2 border-b border-border-default">
      <div class="text-xs text-text-secondary font-semibold mb-1.5">
        Switch branches
      </div>
      <input
        bind:this={filterInput}
        type="text"
        placeholder="Filter branches..."
        class="w-full px-2 py-1 text-sm bg-bg-secondary border border-border-default rounded
               text-text-primary placeholder:text-text-placeholder
               focus:outline-none focus:ring-1 focus:ring-accent-emphasis focus:border-accent-emphasis"
        bind:value={filterQuery}
        oninput={() => {
          focusedIndex = -1;
        }}
      />
    </div>

    <!-- Uncommitted changes warning -->
    {#if hasUncommittedChanges}
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
        Uncommitted changes -- checkout disabled
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

    <!-- Success message -->
    {#if successMessage !== null}
      <div
        class="px-3 py-1.5 text-xs bg-success-subtle text-success-fg border-b border-border-default"
      >
        {successMessage}
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
          {@const canCheckout =
            !isCurrent && !hasUncommittedChanges && !checkingOut}
          <button
            type="button"
            class="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors
                   {focusedIndex === index
              ? 'bg-bg-tertiary'
              : 'hover:bg-bg-secondary'}
                   {isCurrent ? 'font-semibold' : ''}
                   {canCheckout ? 'cursor-pointer' : 'cursor-default'}"
            onclick={() => void checkout(branch.name)}
            onmouseenter={() => {
              focusedIndex = index;
            }}
            disabled={!canCheckout && !isCurrent}
            role="option"
            aria-selected={isCurrent}
          >
            <!-- Check mark for current branch -->
            <span class="w-4 shrink-0 text-success-fg">
              {#if isCurrent}
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
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
                  class="font-mono text-xs truncate {isCurrent
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
{/if}
