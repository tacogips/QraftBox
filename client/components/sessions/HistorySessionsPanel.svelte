<script lang="ts">
  /**
   * HistorySessionsPanel Component
   *
   * Merges completed QraftBox sessions with Claude CLI sessions into
   * a single chronologically sorted list with date grouping,
   * search, filtering, and pagination.
   *
   * Props:
   * - completedSessions: Completed/failed/cancelled QraftBox sessions
   * - onResumeSession: Callback for resuming claude-cli sessions
   * - onSelectSession: Callback for viewing session details
   *
   * Features:
   * - Merged chronological list from two data sources
   * - Date grouping (Today, Yesterday, Older)
   * - Search via SearchInput (reused from claude-sessions)
   * - FilterPanel for source, project, branch (reused from claude-sessions)
   * - UnifiedSessionCard for rendering each item
   * - Pagination with "Load More" button
   * - Loading and error states
   * - "Clear Completed" button for QraftBox completed sessions
   */

  import { onMount } from "svelte";
  import { claudeSessionsStore } from "../../src/stores/claude-sessions";
  import type { AISession } from "../../../src/types/ai";
  import type { UnifiedSessionItem } from "../../src/types/unified-session";
  import type { SessionFilters } from "../../../src/types/claude-session";
  import SearchInput from "../claude-sessions/SearchInput.svelte";
  import FilterPanel from "../claude-sessions/FilterPanel.svelte";
  import UnifiedSessionCard from "./UnifiedSessionCard.svelte";

  interface Props {
    completedSessions: readonly AISession[];
    onResumeSession: (sessionId: string) => void;
    onSelectSession: (sessionId: string) => void;
    onClearCompleted?: (() => void) | undefined;
  }

  const {
    completedSessions,
    onResumeSession,
    onSelectSession,
    onClearCompleted = undefined,
  }: Props = $props();

  /**
   * Get date group for a given date string
   */
  function getDateGroup(dateStr: string): "today" | "yesterday" | "older" {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    if (date >= today) return "today";
    if (date >= yesterday) return "yesterday";
    return "older";
  }

  /**
   * Get sort date for a unified session item
   */
  function getSortDate(item: UnifiedSessionItem): string {
    if (item.kind === "qraftbox") {
      return item.session.completedAt ?? item.session.createdAt;
    }
    return item.session.modified;
  }

  /**
   * Local search query state for filtering QraftBox sessions client-side
   */
  let localSearchQuery = $state("");

  /**
   * Merge completed QraftBox sessions with Claude CLI sessions
   * and sort chronologically (most recent first)
   */
  const mergedSessions = $derived.by(() => {
    const items: UnifiedSessionItem[] = [];

    // Add QraftBox completed sessions, optionally filtered by local search
    for (const s of completedSessions) {
      if (localSearchQuery.length > 0) {
        const query = localSearchQuery.toLowerCase();
        const matchesPrompt = s.prompt.toLowerCase().includes(query);
        if (!matchesPrompt) continue;
      }
      items.push({ kind: "qraftbox", session: s });
    }

    // Add Claude CLI sessions (already filtered server-side by the store)
    for (const s of claudeSessionsStore.sessions) {
      items.push({ kind: "claude-cli", session: s });
    }

    // Sort by most recent first
    items.sort((a, b) => {
      const dateA = getSortDate(a);
      const dateB = getSortDate(b);
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return items;
  });

  /**
   * Group merged sessions by date
   */
  const groupedSessions = $derived.by(() => {
    const groups: {
      today: UnifiedSessionItem[];
      yesterday: UnifiedSessionItem[];
      older: UnifiedSessionItem[];
    } = {
      today: [],
      yesterday: [],
      older: [],
    };

    for (const item of mergedSessions) {
      const dateStr = getSortDate(item);
      const group = getDateGroup(dateStr);
      groups[group].push(item);
    }

    return groups;
  });

  /**
   * Whether there are any sessions to display
   */
  const hasSessions = $derived(mergedSessions.length > 0);

  /**
   * Whether more Claude CLI sessions can be loaded
   */
  const hasMore = $derived(
    claudeSessionsStore.sessions.length < claudeSessionsStore.total,
  );

  /**
   * Total session count for display
   */
  const totalCount = $derived(
    completedSessions.length + claudeSessionsStore.total,
  );

  /**
   * Handle search input
   */
  function handleSearch(query: string): void {
    localSearchQuery = query;
    claudeSessionsStore.setFilters({ searchQuery: query || undefined });
  }

  /**
   * Handle filter changes
   */
  function handleFilterChange(filters: Partial<SessionFilters>): void {
    claudeSessionsStore.setFilters(filters);
  }

  /**
   * Handle clear all filters
   */
  function handleClearFilters(): void {
    localSearchQuery = "";
    claudeSessionsStore.clearFilters();
  }

  /**
   * Handle load more
   */
  async function handleLoadMore(): Promise<void> {
    await claudeSessionsStore.loadMore();
  }

  /**
   * Clear error
   */
  function handleClearError(): void {
    claudeSessionsStore.clearError();
  }

  /**
   * Get a unique key for each unified session item
   */
  function getItemKey(item: UnifiedSessionItem): string {
    if (item.kind === "qraftbox") {
      return `qb-${item.session.id}`;
    }
    return `cli-${item.session.sessionId}`;
  }

  /**
   * Load initial data on mount
   */
  onMount(async () => {
    await claudeSessionsStore.fetchProjects();
    await claudeSessionsStore.fetchSessions();
  });
</script>

<!-- History Sessions Panel -->
<div
  class="history-sessions-panel flex flex-col h-full"
  role="region"
  aria-label="Session history"
>
  <!-- Search and Count Header -->
  <div class="px-6 py-4 border-b border-bg-border bg-bg-secondary">
    <div class="flex items-center justify-between mb-3">
      <div class="text-sm text-text-tertiary">
        {#if totalCount > 0}
          {totalCount} session{totalCount !== 1 ? "s" : ""}
          {#if mergedSessions.length !== totalCount}
            (showing {mergedSessions.length})
          {/if}
        {/if}
      </div>

      <!-- Clear Completed Button -->
      {#if completedSessions.length > 0 && onClearCompleted !== undefined}
        <button
          type="button"
          onclick={onClearCompleted}
          class="px-3 py-1.5 text-xs font-medium rounded-md
                 bg-bg-tertiary hover:bg-bg-hover text-text-secondary hover:text-danger-fg
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 transition-colors duration-150"
          aria-label="Clear completed QraftBox sessions"
        >
          Clear Completed
        </button>
      {/if}
    </div>

    <!-- Search Bar -->
    <SearchInput
      value={claudeSessionsStore.filters.searchQuery ?? ""}
      onSearch={handleSearch}
    />
  </div>

  <!-- Filter Panel -->
  <FilterPanel
    filters={claudeSessionsStore.filters}
    projects={claudeSessionsStore.projects}
    onFilterChange={handleFilterChange}
    onClearFilters={handleClearFilters}
  />

  <!-- Error Banner -->
  {#if claudeSessionsStore.error}
    <div
      class="error-banner mx-6 mt-4 p-4 rounded-lg border border-danger-emphasis/30
             bg-danger-emphasis/10 text-danger-fg"
      role="alert"
    >
      <div class="flex items-start gap-3">
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
          class="shrink-0 mt-0.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div class="flex-1">
          <p class="font-medium">Error Loading Sessions</p>
          <p class="text-sm mt-1">{claudeSessionsStore.error}</p>
        </div>
        <button
          type="button"
          onclick={handleClearError}
          class="p-1 rounded hover:bg-danger-emphasis/20 transition-colors"
          aria-label="Dismiss error"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Content Area -->
  <div class="content-area flex-1 overflow-y-auto px-6 py-4">
    {#if claudeSessionsStore.isLoading && !hasSessions}
      <!-- Loading State -->
      <div
        class="loading-state flex flex-col items-center justify-center h-64"
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
        <p class="text-text-secondary">Loading sessions...</p>
      </div>
    {:else if !hasSessions}
      <!-- Empty State -->
      <div
        class="empty-state flex flex-col items-center justify-center h-64"
        role="status"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-text-tertiary mb-4"
          aria-hidden="true"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        <p class="text-text-secondary text-lg mb-2">No sessions found</p>
        <p class="text-text-tertiary text-sm">
          {#if claudeSessionsStore.filters.searchQuery || claudeSessionsStore.filters.source || claudeSessionsStore.filters.branch || claudeSessionsStore.filters.workingDirectoryPrefix}
            Try adjusting your filters or search query.
          {:else}
            No completed sessions yet.
          {/if}
        </p>
      </div>
    {:else}
      <!-- Session List (Grouped by Date) -->
      <div class="session-list space-y-6" role="list">
        <!-- Today -->
        {#if groupedSessions.today.length > 0}
          <section aria-labelledby="history-today-heading">
            <h2
              id="history-today-heading"
              class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3"
            >
              Today
            </h2>
            <div class="space-y-3">
              {#each groupedSessions.today as item (getItemKey(item))}
                <UnifiedSessionCard
                  {item}
                  {onResumeSession}
                  {onSelectSession}
                />
              {/each}
            </div>
          </section>
        {/if}

        <!-- Yesterday -->
        {#if groupedSessions.yesterday.length > 0}
          <section aria-labelledby="history-yesterday-heading">
            <h2
              id="history-yesterday-heading"
              class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3"
            >
              Yesterday
            </h2>
            <div class="space-y-3">
              {#each groupedSessions.yesterday as item (getItemKey(item))}
                <UnifiedSessionCard
                  {item}
                  {onResumeSession}
                  {onSelectSession}
                />
              {/each}
            </div>
          </section>
        {/if}

        <!-- Older -->
        {#if groupedSessions.older.length > 0}
          <section aria-labelledby="history-older-heading">
            <h2
              id="history-older-heading"
              class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3"
            >
              Older
            </h2>
            <div class="space-y-3">
              {#each groupedSessions.older as item (getItemKey(item))}
                <UnifiedSessionCard
                  {item}
                  {onResumeSession}
                  {onSelectSession}
                />
              {/each}
            </div>
          </section>
        {/if}
      </div>

      <!-- Pagination: Load More Button -->
      {#if hasMore}
        <div class="pagination mt-6 flex justify-center">
          <button
            type="button"
            onclick={handleLoadMore}
            disabled={claudeSessionsStore.isLoading}
            class="px-6 py-3 rounded-lg text-sm font-medium
                   bg-bg-secondary hover:bg-bg-hover text-text-primary
                   border border-bg-border hover:border-accent-emphasis/30
                   disabled:opacity-50 disabled:cursor-not-allowed
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                   transition-all duration-150"
            aria-label="Load more sessions"
          >
            {#if claudeSessionsStore.isLoading}
              <span class="flex items-center gap-2">
                <svg
                  class="animate-spin h-4 w-4"
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
