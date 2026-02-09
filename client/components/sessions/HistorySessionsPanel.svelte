<script lang="ts">
  /**
   * HistorySessionsPanel Component
   *
   * Merges completed QraftBox sessions with Claude CLI sessions into
   * a single chronologically sorted list with date grouping,
   * search, and pagination.
   *
   * Props:
   * - contextId: Context ID for API calls
   * - completedSessions: Completed/failed/cancelled QraftBox sessions
   * - onResumeSession: Callback for resuming claude-cli sessions
   * - onSelectSession: Callback for viewing session details
   * - onClearCompleted: Callback to clear completed QraftBox sessions
   *
   * Features:
   * - Merged chronological list from two data sources
   * - Date grouping (Today, Yesterday, Older)
   * - Search via SearchInput
   * - Accordion list with inline transcript viewer
   * - Pagination with "Load More" button
   * - Loading and error states
   * - "Clear Completed" button for QraftBox completed sessions
   */

  import { onMount } from "svelte";
  import { claudeSessionsStore } from "../../src/stores/claude-sessions";
  import type { AISession } from "../../../src/types/ai";
  import type {
    ExtendedSessionEntry,
    SessionFilters,
  } from "../../../src/types/claude-session";
  import type { UnifiedSessionItem } from "../../src/types/unified-session";
  import SearchInput from "../claude-sessions/SearchInput.svelte";
  import SessionTranscriptInline from "./SessionTranscriptInline.svelte";

  interface Props {
    contextId: string;
    completedSessions: readonly AISession[];
    onResumeSession: (sessionId: string) => void;
    onSelectSession: (sessionId: string) => void;
    onClearCompleted?: (() => void) | undefined;
  }

  const {
    contextId,
    completedSessions,
    onResumeSession,
    onSelectSession,
    onClearCompleted = undefined,
  }: Props = $props();

  /**
   * Expanded session IDs for accordion
   */
  let expandedSessionIds = $state<Set<string>>(new Set());

  /**
   * Reactive snapshots of store state.
   * The claudeSessionsStore is a plain JS object - Svelte 5 $derived
   * cannot track property changes. We use $state variables that get
   * updated after each store operation.
   */
  let cliSessions = $state<readonly ExtendedSessionEntry[]>([]);
  let cliTotal = $state(0);
  let cliIsLoading = $state(false);
  let cliError = $state<string | null>(null);
  let cliFilters = $state<SessionFilters>({});

  /**
   * Sync reactive state from the store
   */
  function syncFromStore(): void {
    cliSessions = claudeSessionsStore.sessions;
    cliTotal = claudeSessionsStore.total;
    cliIsLoading = claudeSessionsStore.isLoading;
    cliError = claudeSessionsStore.error;
    cliFilters = claudeSessionsStore.filters;
  }

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
    for (const s of cliSessions) {
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
  const hasMore = $derived(cliSessions.length < cliTotal);

  /**
   * Total session count for display
   */
  const totalCount = $derived(completedSessions.length + cliTotal);

  /**
   * Handle search input
   */
  function handleSearch(query: string): void {
    localSearchQuery = query;
    claudeSessionsStore.setFilters({ searchQuery: query || undefined });
    // setFilters triggers fetchSessions internally; sync after a tick
    setTimeout(syncFromStore, 100);
  }

  /**
   * Handle load more
   */
  async function handleLoadMore(): Promise<void> {
    cliIsLoading = true;
    await claudeSessionsStore.loadMore();
    syncFromStore();
  }

  /**
   * Clear error
   */
  function handleClearError(): void {
    claudeSessionsStore.clearError();
    syncFromStore();
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
   * Toggle session expansion in accordion
   */
  function toggleSessionExpansion(sessionId: string): void {
    const newSet = new Set(expandedSessionIds);
    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
    }
    expandedSessionIds = newSet;
  }

  /**
   * Get relative time string (e.g., "2 hours ago", "yesterday")
   */
  function getRelativeTime(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  }

  /**
   * Load initial data on mount
   */
  onMount(async () => {
    await claudeSessionsStore.fetchSessions();
    syncFromStore();
  });
</script>

<!-- History Sessions Panel -->
<div
  class="history-sessions-panel flex flex-col h-full"
  role="region"
  aria-label="Session history"
>
  <!-- Header: count, clear button, and compact search -->
  <div
    class="flex items-center gap-3 px-6 py-3 border-b border-bg-border bg-bg-secondary"
  >
    <div class="text-sm text-text-tertiary shrink-0">
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
        class="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md
               bg-bg-tertiary hover:bg-bg-hover text-text-secondary hover:text-danger-fg
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis
               transition-colors duration-150"
        aria-label="Clear completed QraftBox sessions"
      >
        Clear Completed
      </button>
    {/if}

    <!-- Spacer pushes search to right -->
    <div class="flex-1"></div>

    <!-- Compact search bar, right-aligned -->
    <div class="w-48">
      <SearchInput
        value={cliFilters.searchQuery ?? ""}
        onSearch={handleSearch}
      />
    </div>
  </div>

  <!-- Error Banner -->
  {#if cliError}
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
          <p class="text-sm mt-1">{cliError}</p>
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
    {#if cliIsLoading && !hasSessions}
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
          {#if cliFilters.searchQuery}
            Try adjusting your search query.
          {:else}
            No sessions found for this project.
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
                {@const itemId =
                  item.kind === "qraftbox"
                    ? item.session.id
                    : item.session.sessionId}
                {@const isExpanded = expandedSessionIds.has(itemId)}

                <!-- Accordion Row -->
                <div
                  class="rounded-lg border border-border-default overflow-hidden {isExpanded
                    ? 'border-accent-emphasis/40'
                    : ''}"
                >
                  <!-- Header Row (clickable) -->
                  <button
                    type="button"
                    onclick={() => toggleSessionExpansion(itemId)}
                    class="w-full flex items-center gap-3 px-4 py-3 bg-bg-primary hover:bg-bg-secondary transition-colors text-left"
                  >
                    <!-- Expand/Collapse chevron -->
                    <svg
                      class="w-4 h-4 text-text-tertiary transition-transform {isExpanded
                        ? 'rotate-90'
                        : ''}"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path
                        d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"
                      />
                    </svg>

                    <!-- Source badge -->
                    <span
                      class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold {item.kind ===
                      'qraftbox'
                        ? 'bg-accent-muted text-accent-fg'
                        : 'bg-bg-tertiary text-text-secondary'}"
                    >
                      {item.kind === "qraftbox" ? "QraftBox" : "CLI"}
                    </span>

                    <!-- Title (first prompt) -->
                    <span class="flex-1 text-sm text-text-primary truncate">
                      {item.kind === "qraftbox"
                        ? item.session.prompt
                        : item.session.firstPrompt}
                    </span>

                    <!-- Message count -->
                    {#if item.kind === "claude-cli"}
                      <span class="text-xs text-text-tertiary shrink-0">
                        {item.session.messageCount} msgs
                      </span>
                    {/if}

                    <!-- Relative time -->
                    <span class="text-xs text-text-tertiary shrink-0">
                      {getRelativeTime(getSortDate(item))}
                    </span>
                  </button>

                  <!-- Expanded Content -->
                  {#if isExpanded}
                    <div class="border-t border-border-default">
                      <!-- Resume button row -->
                      <div
                        class="flex items-center gap-2 px-4 py-2 bg-bg-tertiary/50"
                      >
                        <button
                          type="button"
                          onclick={() => onResumeSession(itemId)}
                          class="px-3 py-1 text-xs font-medium rounded bg-bg-tertiary hover:bg-bg-hover text-text-primary border border-border-default"
                        >
                          Resume
                        </button>
                        {#if item.kind === "claude-cli" && item.session.summary}
                          <span class="text-xs text-text-secondary truncate"
                            >{item.session.summary}</span
                          >
                        {/if}
                      </div>
                      <!-- Inline Transcript -->
                      <SessionTranscriptInline sessionId={itemId} {contextId} />
                    </div>
                  {/if}
                </div>
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
                {@const itemId =
                  item.kind === "qraftbox"
                    ? item.session.id
                    : item.session.sessionId}
                {@const isExpanded = expandedSessionIds.has(itemId)}

                <!-- Accordion Row -->
                <div
                  class="rounded-lg border border-border-default overflow-hidden {isExpanded
                    ? 'border-accent-emphasis/40'
                    : ''}"
                >
                  <!-- Header Row (clickable) -->
                  <button
                    type="button"
                    onclick={() => toggleSessionExpansion(itemId)}
                    class="w-full flex items-center gap-3 px-4 py-3 bg-bg-primary hover:bg-bg-secondary transition-colors text-left"
                  >
                    <!-- Expand/Collapse chevron -->
                    <svg
                      class="w-4 h-4 text-text-tertiary transition-transform {isExpanded
                        ? 'rotate-90'
                        : ''}"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path
                        d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"
                      />
                    </svg>

                    <!-- Source badge -->
                    <span
                      class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold {item.kind ===
                      'qraftbox'
                        ? 'bg-accent-muted text-accent-fg'
                        : 'bg-bg-tertiary text-text-secondary'}"
                    >
                      {item.kind === "qraftbox" ? "QraftBox" : "CLI"}
                    </span>

                    <!-- Title (first prompt) -->
                    <span class="flex-1 text-sm text-text-primary truncate">
                      {item.kind === "qraftbox"
                        ? item.session.prompt
                        : item.session.firstPrompt}
                    </span>

                    <!-- Message count -->
                    {#if item.kind === "claude-cli"}
                      <span class="text-xs text-text-tertiary shrink-0">
                        {item.session.messageCount} msgs
                      </span>
                    {/if}

                    <!-- Relative time -->
                    <span class="text-xs text-text-tertiary shrink-0">
                      {getRelativeTime(getSortDate(item))}
                    </span>
                  </button>

                  <!-- Expanded Content -->
                  {#if isExpanded}
                    <div class="border-t border-border-default">
                      <!-- Resume button row -->
                      <div
                        class="flex items-center gap-2 px-4 py-2 bg-bg-tertiary/50"
                      >
                        <button
                          type="button"
                          onclick={() => onResumeSession(itemId)}
                          class="px-3 py-1 text-xs font-medium rounded bg-bg-tertiary hover:bg-bg-hover text-text-primary border border-border-default"
                        >
                          Resume
                        </button>
                        {#if item.kind === "claude-cli" && item.session.summary}
                          <span class="text-xs text-text-secondary truncate"
                            >{item.session.summary}</span
                          >
                        {/if}
                      </div>
                      <!-- Inline Transcript -->
                      <SessionTranscriptInline sessionId={itemId} {contextId} />
                    </div>
                  {/if}
                </div>
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
                {@const itemId =
                  item.kind === "qraftbox"
                    ? item.session.id
                    : item.session.sessionId}
                {@const isExpanded = expandedSessionIds.has(itemId)}

                <!-- Accordion Row -->
                <div
                  class="rounded-lg border border-border-default overflow-hidden {isExpanded
                    ? 'border-accent-emphasis/40'
                    : ''}"
                >
                  <!-- Header Row (clickable) -->
                  <button
                    type="button"
                    onclick={() => toggleSessionExpansion(itemId)}
                    class="w-full flex items-center gap-3 px-4 py-3 bg-bg-primary hover:bg-bg-secondary transition-colors text-left"
                  >
                    <!-- Expand/Collapse chevron -->
                    <svg
                      class="w-4 h-4 text-text-tertiary transition-transform {isExpanded
                        ? 'rotate-90'
                        : ''}"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path
                        d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"
                      />
                    </svg>

                    <!-- Source badge -->
                    <span
                      class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold {item.kind ===
                      'qraftbox'
                        ? 'bg-accent-muted text-accent-fg'
                        : 'bg-bg-tertiary text-text-secondary'}"
                    >
                      {item.kind === "qraftbox" ? "QraftBox" : "CLI"}
                    </span>

                    <!-- Title (first prompt) -->
                    <span class="flex-1 text-sm text-text-primary truncate">
                      {item.kind === "qraftbox"
                        ? item.session.prompt
                        : item.session.firstPrompt}
                    </span>

                    <!-- Message count -->
                    {#if item.kind === "claude-cli"}
                      <span class="text-xs text-text-tertiary shrink-0">
                        {item.session.messageCount} msgs
                      </span>
                    {/if}

                    <!-- Relative time -->
                    <span class="text-xs text-text-tertiary shrink-0">
                      {getRelativeTime(getSortDate(item))}
                    </span>
                  </button>

                  <!-- Expanded Content -->
                  {#if isExpanded}
                    <div class="border-t border-border-default">
                      <!-- Resume button row -->
                      <div
                        class="flex items-center gap-2 px-4 py-2 bg-bg-tertiary/50"
                      >
                        <button
                          type="button"
                          onclick={() => onResumeSession(itemId)}
                          class="px-3 py-1 text-xs font-medium rounded bg-bg-tertiary hover:bg-bg-hover text-text-primary border border-border-default"
                        >
                          Resume
                        </button>
                        {#if item.kind === "claude-cli" && item.session.summary}
                          <span class="text-xs text-text-secondary truncate"
                            >{item.session.summary}</span
                          >
                        {/if}
                      </div>
                      <!-- Inline Transcript -->
                      <SessionTranscriptInline sessionId={itemId} {contextId} />
                    </div>
                  {/if}
                </div>
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
            disabled={cliIsLoading}
            class="px-6 py-3 rounded-lg text-sm font-medium
                   bg-bg-secondary hover:bg-bg-hover text-text-primary
                   border border-bg-border hover:border-accent-emphasis/30
                   disabled:opacity-50 disabled:cursor-not-allowed
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                   transition-all duration-150"
            aria-label="Load more sessions"
          >
            {#if cliIsLoading}
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
