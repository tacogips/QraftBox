<script lang="ts">
  import type {
    CommitInfo,
    CommitDetail,
    CommitLogResponse,
    CommitFileChange,
  } from "../../../src/types/commit";
  import type { DiffFile, DiffChunk } from "../../src/types/diff";
  import InlineDiff from "../diff/InlineDiff.svelte";

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
  let searchInput = $state("");
  let searchQuery = $state("");
  let searchTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

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
   * Debounce search input
   */
  function handleSearchInput(value: string): void {
    searchInput = value;
    if (searchTimeout !== null) {
      clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
      searchQuery = value;
      offset = 0;
      commits = [];
      void fetchCommits(false);
    }, 300);
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
  <!-- Search -->
  <div class="px-4 py-3 border-b border-border-default shrink-0">
    <input
      type="text"
      class="w-full px-3 py-2 text-sm border border-border-default rounded bg-bg-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-transparent"
      placeholder="Search by message, author, or hash prefix (4+ chars)..."
      value={searchInput}
      oninput={(e) => handleSearchInput(e.currentTarget.value)}
      aria-label="Search commits"
    />
  </div>

  <!-- Commit List -->
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <!-- Loading State -->
      <div class="flex items-center justify-center p-8 text-text-secondary">
        <div class="flex flex-col items-center gap-2">
          <div
            class="w-6 h-6 border-2 border-border-default border-t-accent-emphasis rounded-full animate-spin"
          ></div>
          <p class="text-sm">Loading commits...</p>
        </div>
      </div>
    {:else if error !== null && commits.length === 0}
      <!-- Error State -->
      <div class="flex items-center justify-center p-8">
        <div class="flex flex-col items-center gap-3 text-center">
          <p class="text-sm text-danger-fg">{error}</p>
          <button
            type="button"
            class="px-4 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded hover:bg-bg-hover transition-colors"
            onclick={handleRetry}
          >
            Retry
          </button>
        </div>
      </div>
    {:else if commits.length === 0}
      <!-- Empty State -->
      <div class="flex items-center justify-center p-8 text-text-secondary">
        <p class="text-sm">
          {searchQuery.trim().length > 0
            ? "No commits match your search"
            : "No commits found"}
        </p>
      </div>
    {:else}
      <!-- Commit Items -->
      {#each commits as commit (commit.hash)}
        {@const isExpanded = expandedHash === commit.hash}
        <div
          class="border-b border-border-default {isExpanded
            ? 'bg-bg-secondary'
            : ''}"
        >
          <!-- Commit Row -->
          <button
            type="button"
            class="w-full text-left px-4 py-3 hover:bg-bg-tertiary transition-colors flex flex-col gap-1"
            onclick={() => void toggleCommit(commit.hash)}
            aria-expanded={isExpanded}
          >
            <div class="flex items-center gap-2 text-xs text-text-secondary">
              <span class="font-mono text-accent-fg"
                >{commit.shortHash || commit.hash.slice(0, 7)}</span
              >
              <span>{formatRelativeDate(commit.date)}</span>
              <span class="ml-auto">{commit.author.name}</span>
            </div>
            <div class="text-sm text-text-primary truncate">
              {firstLine(commit.message)}
            </div>
          </button>

          <!-- Expanded Detail -->
          {#if isExpanded}
            <div class="px-4 pb-4 border-t border-border-default">
              {#if loadingDetail}
                <div
                  class="flex items-center gap-2 py-3 text-sm text-text-secondary"
                >
                  <div
                    class="w-4 h-4 border-2 border-border-default border-t-accent-emphasis rounded-full animate-spin"
                  ></div>
                  Loading detail...
                </div>
              {:else if detailError !== null}
                <div class="py-3 text-sm text-danger-fg">{detailError}</div>
              {:else if commitDetail !== null}
                <!-- Full hash -->
                <div class="py-3 space-y-3">
                  <div class="text-xs text-text-secondary">
                    <span class="font-mono select-all"
                      >{commitDetail.hash}</span
                    >
                  </div>

                  <!-- Full message -->
                  {#if commitDetail.body.trim().length > 0}
                    <div
                      class="text-sm text-text-primary whitespace-pre-wrap bg-bg-primary p-3 rounded border border-border-default"
                    >
                      {commitDetail.message}{commitDetail.body.trim().length > 0
                        ? "\n\n" + commitDetail.body
                        : ""}
                    </div>
                  {:else}
                    <div class="text-sm text-text-primary">
                      {commitDetail.message}
                    </div>
                  {/if}

                  <!-- Stats -->
                  <div class="flex items-center gap-4 text-xs">
                    <span class="text-text-secondary">
                      {commitDetail.stats.filesChanged} file{commitDetail.stats
                        .filesChanged !== 1
                        ? "s"
                        : ""} changed
                    </span>
                    <span class="text-success-fg"
                      >+{commitDetail.stats.additions}</span
                    >
                    <span class="text-danger-fg"
                      >-{commitDetail.stats.deletions}</span
                    >
                  </div>

                  <!-- Changed Files -->
                  {#if commitDetail.files.length > 0}
                    <div class="space-y-1">
                      <div
                        class="text-xs font-medium text-text-secondary uppercase tracking-wide"
                      >
                        Changed Files
                      </div>
                      <div
                        class="bg-bg-primary rounded border border-border-default divide-y divide-border-default"
                      >
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
                              <span class="font-medium {statusClass(file.status)}"
                                >{statusLabel(file.status)}</span
                              >
                              <span class="font-mono text-text-primary truncate text-left"
                                >{file.path}</span
                              >
                              <div class="flex items-center gap-2 ml-auto shrink-0">
                                {#if file.additions > 0}
                                  <span class="text-success-fg"
                                    >+{file.additions}</span
                                  >
                                {/if}
                                {#if file.deletions > 0}
                                  <span class="text-danger-fg"
                                    >-{file.deletions}</span
                                  >
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
        <div class="px-4 py-2 text-sm text-danger-fg bg-danger-subtle">{error}</div>
      {/if}

      <!-- Load More -->
      {#if hasMore}
        <div class="p-4">
          <button
            type="button"
            class="w-full px-4 py-2 text-sm border border-border-default rounded hover:bg-bg-tertiary transition-colors text-text-secondary"
            onclick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load More"}
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
