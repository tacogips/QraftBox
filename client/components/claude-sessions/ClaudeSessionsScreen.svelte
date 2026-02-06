<script lang="ts">
  /**
   * ClaudeSessionsScreen Component
   *
   * Main screen for browsing Claude Code sessions.
   * Integrates filter panel, search, session list with grouping, and pagination.
   *
   * Props:
   * - onBack: Callback to navigate back to previous screen
   *
   * Features:
   * - Session grouping by date (Today, Yesterday, Older)
   * - Filter panel for source, project, branch
   * - Search with debouncing
   * - Pagination with "Load More" button
   * - Loading states and error handling
   * - Responsive layout
   *
   * Design:
   * - Header with title, back button, and search
   * - Filter panel (collapsible)
   * - Session list grouped by date
   * - Pagination controls
   * - Empty states
   * - Error states
   */

  import { onMount } from "svelte";
  import { claudeSessionsStore } from "../../src/stores/claude-sessions";
  import type {
    ExtendedSessionEntry,
    SessionFilters,
  } from "../../../src/types/claude-session";
  import SearchInput from "./SearchInput.svelte";
  import FilterPanel from "./FilterPanel.svelte";
  import SessionCard from "./SessionCard.svelte";

  interface Props {
    onBack: () => void;
  }

  // Svelte 5 props syntax
  const { onBack }: Props = $props();

  /**
   * Get date grouping label for a session
   */
  function getDateGroup(modifiedDate: string): string {
    const date = new Date(modifiedDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    if (date >= today) return "today";
    if (date >= yesterday) return "yesterday";
    return "older";
  }

  /**
   * Group sessions by date
   */
  const groupedSessions = $derived.by(() => {
    const groups: {
      today: ExtendedSessionEntry[];
      yesterday: ExtendedSessionEntry[];
      older: ExtendedSessionEntry[];
    } = {
      today: [],
      yesterday: [],
      older: [],
    };

    for (const session of claudeSessionsStore.sessions) {
      const group = getDateGroup(session.modified);
      groups[group].push(session);
    }

    return groups;
  });

  /**
   * Whether there are any sessions
   */
  const hasSessions = $derived(claudeSessionsStore.sessions.length > 0);

  /**
   * Whether more sessions can be loaded
   */
  const hasMore = $derived(
    claudeSessionsStore.sessions.length < claudeSessionsStore.total
  );

  /**
   * Handle search input
   */
  function handleSearch(query: string): void {
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
    claudeSessionsStore.clearFilters();
  }

  /**
   * Handle resume session
   */
  async function handleResumeSession(sessionId: string): Promise<void> {
    try {
      const result = await claudeSessionsStore.resumeSession(sessionId);
      // TODO: Navigate to session or show success message
      console.log("Session resumed:", result);
    } catch (error) {
      // Error already handled in store
      console.error("Failed to resume session:", error);
    }
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
   * Load initial data on mount
   */
  onMount(async () => {
    await claudeSessionsStore.fetchProjects();
    await claudeSessionsStore.fetchSessions();
  });
</script>

<!-- Main Screen Container -->
<div
  class="claude-sessions-screen flex flex-col h-full bg-bg-primary"
  role="main"
  aria-label="Claude sessions browser"
>
  <!-- Header -->
  <header
    class="screen-header px-6 py-4 border-b border-bg-border bg-bg-secondary"
  >
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <!-- Back button -->
        <button
          type="button"
          onclick={onBack}
          class="p-2 min-w-[44px] min-h-[44px]
                 text-text-secondary hover:text-text-primary
                 hover:bg-bg-hover rounded-lg
                 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        <h1 class="text-2xl font-bold text-text-primary">Claude Sessions</h1>
      </div>

      <!-- Total Count -->
      <div class="text-sm text-text-tertiary">
        {#if claudeSessionsStore.total > 0}
          {claudeSessionsStore.total} session{claudeSessionsStore.total !== 1 ? "s" : ""}
          {#if claudeSessionsStore.sessions.length !== claudeSessionsStore.total}
            (showing {claudeSessionsStore.sessions.length})
          {/if}
        {/if}
      </div>
    </div>

    <!-- Search Bar -->
    <SearchInput
      value={claudeSessionsStore.filters.searchQuery ?? ""}
      onSearch={handleSearch}
    />
  </header>

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
      class="error-banner mx-6 mt-4 p-4 rounded-lg border border-red-500/30
             bg-red-500/10 text-red-400"
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
          class="p-1 rounded hover:bg-red-500/20 transition-colors"
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
          class="animate-spin h-8 w-8 text-blue-500 mb-4"
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
            No Claude Code sessions available yet.
          {/if}
        </p>
      </div>
    {:else}
      <!-- Session List (Grouped by Date) -->
      <div class="session-list space-y-6" role="list">
        <!-- Today -->
        {#if groupedSessions.today.length > 0}
          <section aria-labelledby="today-heading">
            <h2
              id="today-heading"
              class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3"
            >
              Today
            </h2>
            <div class="space-y-3">
              {#each groupedSessions.today as session (session.sessionId)}
                <SessionCard
                  {session}
                  onResume={handleResumeSession}
                />
              {/each}
            </div>
          </section>
        {/if}

        <!-- Yesterday -->
        {#if groupedSessions.yesterday.length > 0}
          <section aria-labelledby="yesterday-heading">
            <h2
              id="yesterday-heading"
              class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3"
            >
              Yesterday
            </h2>
            <div class="space-y-3">
              {#each groupedSessions.yesterday as session (session.sessionId)}
                <SessionCard
                  {session}
                  onResume={handleResumeSession}
                />
              {/each}
            </div>
          </section>
        {/if}

        <!-- Older -->
        {#if groupedSessions.older.length > 0}
          <section aria-labelledby="older-heading">
            <h2
              id="older-heading"
              class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3"
            >
              Older
            </h2>
            <div class="space-y-3">
              {#each groupedSessions.older as session (session.sessionId)}
                <SessionCard
                  {session}
                  onResume={handleResumeSession}
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
                   border border-bg-border hover:border-blue-500/30
                   disabled:opacity-50 disabled:cursor-not-allowed
                   focus:outline-none focus:ring-2 focus:ring-blue-500
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
