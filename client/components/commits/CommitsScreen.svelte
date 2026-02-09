<script lang="ts">
  import type {
    CommitInfo,
    CommitDetail,
    CommitLogResponse,
    CommitFileChange,
  } from "../../../src/types/commit";
  import type { DiffFile, DiffChunk } from "../../src/types/diff";
  import InlineDiff from "../diff/InlineDiff.svelte";
  import SearchInput from "../claude-sessions/SearchInput.svelte";

  interface Props {
    contextId: string;
  }

  const { contextId }: Props = $props();

  /**
   * Commit list state
   */
  let commits = $state<CommitInfo[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);
  let hasMore = $state(false);
  let offset = $state(0);
  const limit = 50;

  /**
   * Search state
   */
  let searchQuery = $state("");

  /**
   * Expanded commit detail state
   */
  let expandedHash = $state<string | null>(null);
  let commitDetail = $state<CommitDetail | null>(null);
  let loadingDetail = $state(false);
  let detailError = $state<string | null>(null);

  /**
   * File diff expansion state
   */
  let expandedFilePath = $state<string | null>(null);
  let fileDiffChunks = $state<readonly DiffChunk[]>([]);
  let loadingFileDiff = $state(false);
  let fileDiffError = $state<string | null>(null);
  // Cache parsed diff files per commit hash
  let diffCache = $state<Map<string, readonly DiffFile[]>>(new Map());

  /**
   * Handle search from SearchInput component (already debounced)
   */
  function handleSearch(query: string): void {
    searchQuery = query;
    offset = 0;
    commits = [];
    void fetchCommits(false);
  }

  /**
   * Fetch commits from the API
   */
  async function fetchCommits(append: boolean): Promise<void> {
    if (append) {
      loadingMore = true;
    } else {
      loading = true;
    }
    error = null;

    try {
      const params = new URLSearchParams();
      params.set("limit", limit.toString());
      params.set("offset", append ? offset.toString() : "0");
      if (searchQuery.trim().length > 0) {
        params.set("search", searchQuery.trim());
      }

      const resp = await fetch(
        `/api/ctx/${contextId}/commits?${params.toString()}`,
      );
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData?.error ?? `Failed to load commits (${resp.status})`,
        );
      }

      const data = (await resp.json()) as CommitLogResponse;
      if (append) {
        commits = [...commits, ...data.commits];
      } else {
        commits = [...data.commits];
      }
      hasMore = data.pagination.hasMore;
      offset = data.pagination.offset + data.pagination.limit;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load commits";
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  /**
   * Load more commits (pagination)
   */
  function handleLoadMore(): void {
    if (loadingMore || !hasMore) return;
    void fetchCommits(true);
  }

  /**
   * Retry after error
   */
  function handleRetry(): void {
    offset = 0;
    commits = [];
    void fetchCommits(false);
  }

  /**
   * Toggle expanded commit detail
   */
  async function toggleCommit(hash: string): Promise<void> {
    if (expandedHash === hash) {
      expandedHash = null;
      commitDetail = null;
      detailError = null;
      expandedFilePath = null;
      fileDiffChunks = [];
      return;
    }

    expandedHash = hash;
    commitDetail = null;
    detailError = null;
    expandedFilePath = null;
    fileDiffChunks = [];
    loadingDetail = true;

    try {
      const resp = await fetch(`/api/ctx/${contextId}/commits/${hash}`);
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData?.error ?? `Failed to load commit detail (${resp.status})`,
        );
      }
      commitDetail = (await resp.json()) as CommitDetail;
    } catch (e) {
      detailError =
        e instanceof Error ? e.message : "Failed to load commit detail";
    } finally {
      loadingDetail = false;
    }
  }

  /**
   * Toggle file diff inline display
   */
  async function toggleFileDiff(filePath: string): Promise<void> {
    if (expandedFilePath === filePath) {
      expandedFilePath = null;
      fileDiffChunks = [];
      fileDiffError = null;
      return;
    }

    expandedFilePath = filePath;
    fileDiffChunks = [];
    fileDiffError = null;

    if (expandedHash === null) return;

    // Check cache first
    const cached = diffCache.get(expandedHash);
    if (cached !== undefined) {
      const diffFile = cached.find((f) => f.path === filePath);
      fileDiffChunks = diffFile?.chunks ?? [];
      return;
    }

    // Fetch and cache the full commit diff
    loadingFileDiff = true;
    try {
      const resp = await fetch(
        `/api/ctx/${contextId}/commits/${expandedHash}/diff`,
      );
      if (!resp.ok) {
        throw new Error(`Failed to load diff (${resp.status})`);
      }
      const data = (await resp.json()) as { files: DiffFile[] };
      const newCache = new Map(diffCache);
      newCache.set(expandedHash, data.files);
      diffCache = newCache;

      const diffFile = data.files.find((f) => f.path === filePath);
      fileDiffChunks = diffFile?.chunks ?? [];
    } catch (e) {
      fileDiffError =
        e instanceof Error ? e.message : "Failed to load file diff";
    } finally {
      loadingFileDiff = false;
    }
  }

  /**
   * Format timestamp to relative date
   */
  function formatRelativeDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1 ? "just now" : `${minutes} min ago`;
      }
      return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    }
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) {
      const weeks = Math.floor(days / 7);
      return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
    }
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Get first line of commit message
   */
  function firstLine(message: string): string {
    const line = message.split("\n")[0];
    return line ?? message;
  }

  /**
   * Status label for file change
   */
  function statusLabel(status: CommitFileChange["status"]): string {
    switch (status) {
      case "A":
        return "Added";
      case "M":
        return "Modified";
      case "D":
        return "Deleted";
      case "R":
        return "Renamed";
      case "C":
        return "Copied";
      default:
        return status;
    }
  }

  /**
   * CSS class for file change status
   */
  function statusClass(status: CommitFileChange["status"]): string {
    switch (status) {
      case "A":
        return "text-success-fg";
      case "D":
        return "text-danger-fg";
      case "M":
        return "text-attention-fg";
      case "R":
        return "text-accent-fg";
      case "C":
        return "text-accent-fg";
      default:
        return "text-text-secondary";
    }
  }

  // Fetch commits on mount
  $effect(() => {
    void fetchCommits(false);
  });
</script>

<div class="flex flex-col h-full bg-bg-primary text-text-primary">
  <!-- Header: count and compact search (matching sessions format) -->
  <div class="flex items-center gap-3 px-6 py-3 border-b border-bg-border bg-bg-secondary">
    <div class="text-sm text-text-tertiary shrink-0">
      {#if commits.length > 0}
        {commits.length} commit{commits.length !== 1 ? "s" : ""}
        {#if hasMore}
          (more available)
        {/if}
      {/if}
    </div>

    <!-- Spacer pushes search to right -->
    <div class="flex-1"></div>

    <!-- Compact search bar, right-aligned -->
    <SearchInput
      value={searchQuery}
      onSearch={handleSearch}
      placeholder="Search commits..."
    />
  </div>

  <!-- Commit List -->
  <div class="content-area flex-1 overflow-y-auto px-6 pb-4">
    {#if loading}
      <!-- Loading State -->
      <div class="loading-state flex flex-col items-center justify-center h-64" role="status" aria-live="polite">
        <svg class="animate-spin h-8 w-8 text-accent-fg mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p class="text-text-secondary">Loading commits...</p>
      </div>
    {:else if error !== null && commits.length === 0}
      <!-- Error State -->
      <div class="flex flex-col items-center justify-center h-64">
        <div class="p-4 rounded-lg border border-danger-emphasis/30 bg-danger-emphasis/10 text-danger-fg max-w-md">
          <div class="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 mt-0.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div class="flex-1">
              <p class="font-medium">Error Loading Commits</p>
              <p class="text-sm mt-1">{error}</p>
            </div>
          </div>
          <div class="mt-3 flex justify-end">
            <button
              type="button"
              class="px-4 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded hover:bg-bg-hover transition-colors"
              onclick={handleRetry}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    {:else if commits.length === 0}
      <!-- Empty State -->
      <div class="empty-state flex flex-col items-center justify-center h-64" role="status">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-tertiary mb-4" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p class="text-text-secondary text-lg mb-2">
          {searchQuery.trim().length > 0
            ? "No commits match your search"
            : "No commits found"}
        </p>
        <p class="text-text-tertiary text-sm">
          {#if searchQuery.trim().length > 0}
            Try adjusting your search query.
          {:else}
            No commits found for this repository.
          {/if}
        </p>
      </div>
    {:else}
      <!-- Commit Items (accordion cards matching sessions format) -->
      {#each commits as commit, index (commit.hash)}
        {@const isExpanded = expandedHash === commit.hash}
        <div class="contents">
          <!-- Header Row (clickable, sticky) -->
          <button
            type="button"
            onclick={() => void toggleCommit(commit.hash)}
            aria-expanded={isExpanded}
            class="sticky top-0 z-10 w-full flex items-center gap-3 px-4 py-3 bg-bg-primary hover:bg-bg-secondary transition-colors text-left border shadow-sm {index === 0 ? '' : 'mt-3'} {isExpanded ? 'rounded-t-lg border-accent-emphasis/40' : 'rounded-lg border-border-default'}"
          >
            <!-- Expand/Collapse chevron -->
            <svg
              class="w-4 h-4 text-text-tertiary transition-transform {isExpanded ? 'rotate-90' : ''}"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
            </svg>

            <!-- Short hash badge -->
            <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-bg-tertiary text-accent-fg">
              {commit.shortHash || commit.hash.slice(0, 7)}
            </span>

            <!-- Commit message (first line) -->
            <span class="flex-1 text-sm truncate text-text-primary">
              {firstLine(commit.message)}
            </span>

            <!-- Author name -->
            <span class="text-xs text-text-tertiary shrink-0">
              {commit.author.name}
            </span>

            <!-- Relative time -->
            <span class="text-xs text-text-tertiary shrink-0">
              {formatRelativeDate(commit.date)}
            </span>
          </button>

          <!-- Expanded Detail -->
          {#if isExpanded}
            <div class="border-x border-b border-accent-emphasis/40 rounded-b-lg overflow-hidden">
              {#if loadingDetail}
                <div class="flex items-center gap-2 px-4 py-3 text-sm text-text-secondary">
                  <div class="w-4 h-4 border-2 border-border-default border-t-accent-emphasis rounded-full animate-spin"></div>
                  Loading detail...
                </div>
              {:else if detailError !== null}
                <div class="px-4 py-3 text-sm text-danger-fg">{detailError}</div>
              {:else if commitDetail !== null}
                <div class="px-4 pb-4 space-y-3">
                  <!-- Full hash -->
                  <div class="pt-3 text-xs text-text-secondary">
                    <span class="font-mono select-all">{commitDetail.hash}</span>
                  </div>

                  <!-- Full message -->
                  {#if commitDetail.body.trim().length > 0}
                    <div class="text-sm text-text-primary whitespace-pre-wrap bg-bg-primary p-3 rounded border border-border-default">
                      {commitDetail.message}{commitDetail.body.trim().length > 0 ? "\n\n" + commitDetail.body : ""}
                    </div>
                  {:else}
                    <div class="text-sm text-text-primary">
                      {commitDetail.message}
                    </div>
                  {/if}

                  <!-- Stats -->
                  <div class="flex items-center gap-4 text-xs">
                    <span class="text-text-secondary">
                      {commitDetail.stats.filesChanged} file{commitDetail.stats.filesChanged !== 1 ? "s" : ""} changed
                    </span>
                    <span class="text-success-fg">+{commitDetail.stats.additions}</span>
                    <span class="text-danger-fg">-{commitDetail.stats.deletions}</span>
                  </div>

                  <!-- Changed Files -->
                  {#if commitDetail.files.length > 0}
                    <div class="space-y-1">
                      <div class="text-xs font-medium text-text-secondary uppercase tracking-wide">
                        Changed Files
                      </div>
                      <div class="bg-bg-primary rounded border border-border-default divide-y divide-border-default">
                        {#each commitDetail.files as file (file.path)}
                          {@const isFileExpanded = expandedFilePath === file.path}
                          <div>
                            <button
                              type="button"
                              class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-tertiary transition-colors cursor-pointer"
                              onclick={() => void toggleFileDiff(file.path)}
                              aria-expanded={isFileExpanded}
                            >
                              <span class="text-text-secondary shrink-0">{isFileExpanded ? "v" : ">"}</span>
                              <span class="font-medium {statusClass(file.status)}">{statusLabel(file.status)}</span>
                              <span class="font-mono text-text-primary truncate text-left">{file.path}</span>
                              <div class="flex items-center gap-2 ml-auto shrink-0">
                                {#if file.additions > 0}
                                  <span class="text-success-fg">+{file.additions}</span>
                                {/if}
                                {#if file.deletions > 0}
                                  <span class="text-danger-fg">-{file.deletions}</span>
                                {/if}
                              </div>
                            </button>
                            {#if isFileExpanded}
                              <div class="border-t border-border-default bg-bg-primary overflow-x-auto text-xs">
                                {#if loadingFileDiff}
                                  <div class="flex items-center gap-2 p-3 text-text-secondary">
                                    <div class="w-3 h-3 border-2 border-border-default border-t-accent-emphasis rounded-full animate-spin"></div>
                                    Loading diff...
                                  </div>
                                {:else if fileDiffError !== null}
                                  <div class="p-3 text-danger-fg">{fileDiffError}</div>
                                {:else if fileDiffChunks.length === 0}
                                  <div class="p-3 text-text-secondary">No diff available (binary file or empty change)</div>
                                {:else}
                                  <InlineDiff chunks={fileDiffChunks} />
                                {/if}
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      <!-- Error banner (non-blocking, when we have some commits loaded) -->
      {#if error !== null && commits.length > 0}
        <div class="mt-4 p-4 rounded-lg border border-danger-emphasis/30 bg-danger-emphasis/10 text-danger-fg text-sm">
          {error}
        </div>
      {/if}

      <!-- Load More -->
      {#if hasMore}
        <div class="pagination mt-6 flex justify-center">
          <button
            type="button"
            onclick={handleLoadMore}
            disabled={loadingMore}
            class="px-6 py-3 rounded-lg text-sm font-medium
                   bg-bg-secondary hover:bg-bg-hover text-text-primary
                   border border-bg-border hover:border-accent-emphasis/30
                   disabled:opacity-50 disabled:cursor-not-allowed
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                   transition-all duration-150"
            aria-label="Load more commits"
          >
            {#if loadingMore}
              <span class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading...
              </span>
            {:else}
              Load More
            {/if}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
