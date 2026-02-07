<script lang="ts">
  import type { CommitInfo } from "../src/types/commit";
  import CommitListItem from "./commit-log/CommitListItem.svelte";

  /**
   * CommitLogPanel component properties
   */
  interface Props {
    /**
     * List of commits to display
     */
    commits: readonly CommitInfo[];

    /**
     * Currently selected commit (null if none)
     */
    selectedCommit: CommitInfo | null;

    /**
     * Whether commits are currently loading
     */
    loading: boolean;

    /**
     * Whether more commits are being loaded (pagination)
     */
    loadingMore: boolean;

    /**
     * Error message if loading failed
     */
    error: string | null;

    /**
     * Search query for filtering commits
     */
    search: string;

    /**
     * Whether there are more commits to load
     */
    hasMore: boolean;

    /**
     * Callback when a commit is selected
     */
    onCommitSelect: (hash: string) => void;

    /**
     * Callback when search query changes
     */
    onSearchChange: (query: string) => void;

    /**
     * Callback when load more is clicked
     */
    onLoadMore: () => void;
  }

  const {
    commits,
    selectedCommit,
    loading,
    loadingMore,
    error,
    search,
    hasMore,
    onCommitSelect,
    onSearchChange,
    onLoadMore,
  }: Props = $props();

  /**
   * Panel collapsed state
   */
  let collapsed = $state(false);

  /**
   * Toggle panel collapse state
   */
  function toggleCollapse(): void {
    collapsed = !collapsed;
  }

  /**
   * Filter commits based on search query
   */
  const filteredCommits = $derived.by(() => {
    if (search.trim().length === 0) {
      return commits;
    }

    const query = search.toLowerCase();
    return commits.filter((commit) => {
      return (
        commit.message.toLowerCase().includes(query) ||
        commit.author.name.toLowerCase().includes(query) ||
        commit.author.email.toLowerCase().includes(query) ||
        commit.hash.toLowerCase().includes(query) ||
        commit.shortHash.toLowerCase().includes(query)
      );
    });
  });
</script>

<!-- Commit Log Panel Container -->
<div
  class="commit-log-panel flex flex-col bg-bg-primary border-t border-border-default"
  class:collapsed
>
  <!-- Panel Header -->
  <div
    class="panel-header border-b border-border-default p-4 flex items-center justify-between min-h-[48px]"
  >
    <h2 class="text-lg font-semibold text-text-primary">Commits</h2>

    <!-- Collapse/Expand Toggle Button -->
    <button
      type="button"
      class="collapse-toggle p-2 rounded-md hover:bg-bg-secondary focus:bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-2 transition-colors min-h-[44px] min-w-[44px]"
      onclick={toggleCollapse}
      aria-label={collapsed ? "Expand commit panel" : "Collapse commit panel"}
      aria-expanded={!collapsed}
    >
      <!-- Chevron Icon -->
      <svg
        class="chevron w-5 h-5 text-text-secondary transition-transform"
        class:rotate-180={collapsed}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        ></path>
      </svg>
    </button>
  </div>

  <!-- Panel Content (hidden when collapsed) -->
  {#if !collapsed}
    <div class="panel-content flex flex-col flex-1 min-h-0">
      <!-- Search Input -->
      <div class="search-container p-4 border-b border-border-default">
        <input
          type="text"
          class="search-input w-full px-3 py-2 border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-transparent min-h-[44px]"
          placeholder="Search commits by message, author, or hash..."
          value={search}
          oninput={(e) => onSearchChange(e.currentTarget.value)}
          aria-label="Search commits"
        />
      </div>

      <!-- Commit List -->
      <div class="commit-list flex-1 overflow-y-auto">
        {#if loading}
          <!-- Loading State -->
          <div
            class="loading-state flex items-center justify-center p-8 text-text-secondary"
          >
            <div class="flex flex-col items-center gap-2">
              <div
                class="spinner w-8 h-8 border-4 border-border-default border-t-blue-600 rounded-full animate-spin"
                aria-hidden="true"
              ></div>
              <p class="text-sm">Loading commits...</p>
            </div>
          </div>
        {:else if error !== null}
          <!-- Error State -->
          <div
            class="error-state flex items-center justify-center p-8 text-danger-fg"
          >
            <div class="flex flex-col items-center gap-2 text-center">
              <svg
                class="w-12 h-12 text-danger-fg"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                ></path>
              </svg>
              <p class="text-sm">{error}</p>
            </div>
          </div>
        {:else if filteredCommits.length === 0}
          <!-- Empty State -->
          <div
            class="empty-state flex items-center justify-center p-8 text-text-secondary"
          >
            <div class="flex flex-col items-center gap-2 text-center">
              <svg
                class="w-12 h-12 text-text-tertiary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                ></path>
              </svg>
              <p class="text-sm">
                {search.trim().length > 0
                  ? "No commits match your search"
                  : "No commits to display"}
              </p>
            </div>
          </div>
        {:else}
          <!-- Commit List Items -->
          {#each filteredCommits as commit (commit.hash)}
            <CommitListItem
              {commit}
              selected={selectedCommit?.hash === commit.hash}
              onSelect={() => onCommitSelect(commit.hash)}
            />
          {/each}

          <!-- Load More Button -->
          {#if hasMore}
            <div class="load-more-container p-4 border-t border-border-default">
              <button
                type="button"
                class="load-more-button w-full px-4 py-3 bg-bg-secondary hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-2 rounded-md text-sm font-medium text-text-primary transition-colors min-h-[48px]"
                onclick={onLoadMore}
                disabled={loadingMore}
                aria-label="Load more commits"
              >
                {loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /**
   * Commit log panel styling
   * - Touch-friendly 48px minimum heights for interactive elements
   * - Smooth collapse/expand transition
   * - Clear visual feedback on hover/focus
   */
  .commit-log-panel {
    max-height: 400px;
    -webkit-tap-highlight-color: transparent;
  }

  .commit-log-panel.collapsed {
    max-height: auto;
  }

  .chevron {
    transition: transform 0.2s ease-in-out;
  }

  .collapse-toggle {
    cursor: pointer;
  }

  .commit-list {
    scrollbar-width: thin;
    scrollbar-color: rgb(209 213 219) transparent;
  }

  .commit-list::-webkit-scrollbar {
    width: 8px;
  }

  .commit-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .commit-list::-webkit-scrollbar-thumb {
    background-color: rgb(209 213 219);
    border-radius: 4px;
  }

  .commit-list::-webkit-scrollbar-thumb:hover {
    background-color: rgb(156 163 175);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
