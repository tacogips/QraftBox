<script lang="ts">
  /**
   * HistorySessionsPanel Component
   *
   * Displays a unified chronologically sorted session list with date grouping,
   * search, and pagination. The server merges QraftBox + CLI sessions.
   *
   * Props:
   * - contextId: Context ID for API calls
   * - onResumeSession: Callback for resuming sessions
   * - onSelectSession: Callback for viewing session details
   *
   * Features:
   * - Server-side merge and deduplication (QraftBox + CLI)
   * - Date grouping (Today, Yesterday, Older)
   * - Search via SearchInput
   * - Accordion list with inline transcript viewer
   * - Session summary with tool usage, files modified, and tasks
   * - Pagination with "Load More" button
   * - Loading and error states
   */

  import { claudeSessionsStore } from "../../src/stores/claude-sessions";
  import type {
    ExtendedSessionEntry,
    SessionFilters,
  } from "../../../src/types/claude-session";
  import SearchInput from "../claude-sessions/SearchInput.svelte";
  import SessionTranscriptInline from "./SessionTranscriptInline.svelte";
  import { stripSystemTags } from "../../../src/utils/strip-system-tags";

  /**
   * Session summary types (matching server response)
   */
  interface ToolUsageEntry {
    readonly name: string;
    readonly count: number;
  }

  interface SessionTask {
    readonly id: string;
    readonly subject: string;
    readonly status: string;
  }

  interface FileModEntry {
    readonly path: string;
    readonly tool: string;
  }

  interface SessionUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheCreationTokens: number;
    readonly cacheReadTokens: number;
  }

  interface SessionSummaryData {
    readonly sessionId: string;
    readonly toolUsage: readonly ToolUsageEntry[];
    readonly tasks: readonly SessionTask[];
    readonly filesModified: readonly FileModEntry[];
    readonly usage?: SessionUsage | undefined;
  }

  interface Props {
    contextId: string;
    onResumeSession: (qraftAiSessionId: string) => void;
    onSelectSession: (sessionId: string) => void;
  }

  const { contextId, onResumeSession, onSelectSession }: Props = $props();

  /**
   * Expanded session IDs for accordion
   */
  let expandedSessionIds = $state<Set<string>>(new Set());

  /**
   * Session summaries keyed by session ID
   */
  let sessionSummaries = $state<Map<string, SessionSummaryData>>(new Map());

  /**
   * Session IDs currently loading summaries
   */
  let summaryLoading = $state<Set<string>>(new Set());

  /**
   * Session IDs with expanded task lists
   */
  let expandedSummaryTasks = $state<Set<string>>(new Set());

  /**
   * Session IDs with expanded file lists
   */
  let expandedSummaryFiles = $state<Set<string>>(new Set());

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
   * Group sessions by date (server returns merged + sorted list)
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

    for (const item of cliSessions) {
      const group = getDateGroup(item.modified);
      groups[group].push(item);
    }

    return groups;
  });

  /**
   * Whether there are any sessions to display
   */
  const hasSessions = $derived(cliSessions.length > 0);

  /**
   * Whether more sessions can be loaded
   */
  const hasMore = $derived(cliSessions.length < cliTotal);

  /**
   * Total session count for display
   */
  const totalCount = $derived(cliSessions.length);

  /**
   * Handle search input
   */
  function handleSearch(query: string): void {
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
   * Get a unique key for each session item
   */
  function getItemKey(item: ExtendedSessionEntry): string {
    return item.qraftAiSessionId;
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
      // Fetch summary if session has a CLI transcript file
      if (item_has_transcript(sessionId)) {
        void fetchSessionSummary(sessionId);
      }
    }
    expandedSessionIds = newSet;
  }

  /**
   * Check if a session has a CLI transcript file (non-empty fullPath)
   */
  function item_has_transcript(sessionId: string): boolean {
    const session = cliSessions.find((s) => s.qraftAiSessionId === sessionId);
    return session !== undefined && session.fullPath.length > 0;
  }

  /**
   * Fetch session summary from API
   */
  async function fetchSessionSummary(sessionId: string): Promise<void> {
    if (sessionSummaries.has(sessionId) || summaryLoading.has(sessionId)) {
      return;
    }

    summaryLoading = new Set([...summaryLoading, sessionId]);

    try {
      const response = await fetch(
        `/api/ctx/${contextId}/claude-sessions/sessions/${sessionId}/summary`,
      );
      if (response.ok) {
        const data = (await response.json()) as SessionSummaryData;
        const newMap = new Map(sessionSummaries);
        newMap.set(sessionId, data);
        sessionSummaries = newMap;
      }
    } catch {
      // Silently ignore summary fetch errors
    } finally {
      const newLoading = new Set(summaryLoading);
      newLoading.delete(sessionId);
      summaryLoading = newLoading;
    }
  }

  /**
   * Toggle task list expansion in summary
   */
  function toggleSummaryTasks(sessionId: string): void {
    const newSet = new Set(expandedSummaryTasks);
    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
    }
    expandedSummaryTasks = newSet;
  }

  /**
   * Toggle file list expansion in summary
   */
  function toggleSummaryFiles(sessionId: string): void {
    const newSet = new Set(expandedSummaryFiles);
    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
    }
    expandedSummaryFiles = newSet;
  }

  /**
   * Get short file name from full path
   */
  function shortPath(fullPath: string): string {
    const parts = fullPath.split("/");
    if (parts.length <= 2) return fullPath;
    return ".../" + parts.slice(-2).join("/");
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
   * Get task status dot color
   */
  function getTaskStatusColor(status: string): string {
    switch (status) {
      case "completed":
        return "bg-success-emphasis";
      case "in_progress":
        return "bg-attention-emphasis";
      default:
        return "bg-border-default";
    }
  }

  /**
   * Format token count with k/M suffixes
   */
  function formatTokenCount(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}k`;
    }
    return count.toString();
  }

  /**
   * Handle accordion header click - only toggle if user is not selecting text
   */
  function handleAccordionClick(sessionId: string): void {
    const selection = window.getSelection();
    if (selection !== null && selection.toString().length > 0) {
      return;
    }
    toggleSessionExpansion(sessionId);
  }

  /**
   * Subscribe to store changes and sync reactive state.
   * The parent (UnifiedSessionsScreen) configures and triggers fetches via $effect;
   * this subscription ensures we update local reactive state whenever the store changes.
   */
  $effect(() => {
    const unsub = claudeSessionsStore.subscribe(() => syncFromStore());
    // Initial sync in case the store already has data
    syncFromStore();
    return () => {
      unsub();
    };
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
      {/if}
    </div>

    <!-- Spacer pushes search to right -->
    <div class="flex-1"></div>

    <!-- Compact search bar, right-aligned -->
    <SearchInput value={cliFilters.searchQuery ?? ""} onSearch={handleSearch} />
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
  <div class="content-area flex-1 overflow-y-auto px-6 pb-4">
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
        <!-- Reusable accordion row snippet -->
        {#snippet sessionRow(item: ExtendedSessionEntry, isFirst: boolean)}
          {@const itemId = item.qraftAiSessionId}
          {@const isExpanded = expandedSessionIds.has(itemId)}
          {@const summary = sessionSummaries.get(itemId)}
          {@const isLoadingSummary = summaryLoading.has(itemId)}
          {@const hasSummaryContent =
            summary !== undefined &&
            (summary.toolUsage.length > 0 ||
              summary.filesModified.length > 0 ||
              summary.tasks.length > 0)}
          {@const isQraftBoxSource = item.source === "qraftbox"}
          {@const displayTitle = stripSystemTags(item.firstPrompt)}

          <!-- Accordion Row (contents = layout-invisible wrapper for sticky) -->
          <div class="contents">
            <!-- Header Row (clickable, sticky) -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              onclick={() => handleAccordionClick(itemId)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleSessionExpansion(itemId);
                }
              }}
              role="button"
              tabindex={0}
              class="sticky top-0 z-10 w-full flex items-center gap-2 px-4 py-3 bg-bg-primary hover:bg-bg-secondary transition-colors text-left border shadow-sm cursor-pointer select-text {isFirst
                ? ''
                : 'mt-3'} {isExpanded
                ? 'rounded-t-lg border-accent-emphasis/40'
                : 'rounded-lg border-border-default'}"
            >
              <!-- Expand/Collapse chevron -->
              <svg
                class="w-4 h-4 text-text-tertiary transition-transform shrink-0 {isExpanded
                  ? 'rotate-90'
                  : ''}"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path
                  d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"
                />
              </svg>

              <!-- Resume button (always visible, no expand needed) -->
              <button
                type="button"
                onclick={(e: MouseEvent) => {
                  e.stopPropagation();
                  onResumeSession(itemId);
                }}
                class="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded
                       bg-accent-muted/60 hover:bg-accent-muted text-accent-fg
                       border border-accent-emphasis/30 hover:border-accent-emphasis/60
                       transition-colors"
                title="Resume this session"
              >
                Resume
              </button>

              <!-- Source badge -->
              <span
                class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold {isQraftBoxSource
                  ? 'bg-accent-muted text-accent-fg'
                  : 'bg-bg-tertiary text-text-secondary'}"
              >
                {isQraftBoxSource ? "QraftBox" : "CLI"}
              </span>

              <!-- Title (first user prompt; server strips system tags) -->
              <span class="flex-1 text-sm text-text-primary truncate">
                {displayTitle ||
                  stripSystemTags(item.summary || item.firstPrompt)}
              </span>

              <!-- Message count -->
              {#if item.messageCount > 0}
                <span class="text-xs text-text-tertiary shrink-0">
                  {item.messageCount} msgs
                </span>
              {/if}

              <!-- Relative time -->
              <span class="text-xs text-text-tertiary shrink-0">
                {getRelativeTime(item.modified)}
              </span>
            </div>

            <!-- Expanded Content -->
            {#if isExpanded}
              <div
                class="border-x border-b border-accent-emphasis/40 rounded-b-lg overflow-hidden"
              >
                <!-- Session Summary / Resume Bar -->
                {#if isLoadingSummary}
                  <div
                    class="flex items-center gap-2 px-4 py-2 bg-bg-tertiary/30 border-b border-border-default"
                  >
                    <button
                      type="button"
                      onclick={() => onResumeSession(itemId)}
                      class="shrink-0 px-2.5 py-0.5 text-xs font-medium rounded bg-bg-tertiary hover:bg-bg-hover text-text-primary border border-border-default"
                    >
                      Resume
                    </button>
                    <span class="text-text-tertiary text-xs">|</span>
                    <svg
                      class="animate-spin h-3 w-3 text-text-tertiary"
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
                    <span class="text-xs text-text-tertiary"
                      >Loading summary...</span
                    >
                  </div>
                {:else if summary !== undefined}
                  <div
                    class="px-4 py-2 bg-bg-tertiary/30 border-b border-border-default"
                  >
                    <!-- Top row: Resume + tool pills + counts -->
                    <div class="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onclick={() => onResumeSession(itemId)}
                        class="shrink-0 px-2.5 py-0.5 text-xs font-medium rounded bg-bg-tertiary hover:bg-bg-hover text-text-primary border border-border-default"
                      >
                        Resume
                      </button>

                      {#if hasSummaryContent}
                        <span class="text-text-tertiary text-xs">|</span>
                      {/if}

                      {#each summary.toolUsage.slice(0, 6) as tool}
                        <span
                          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-tertiary text-text-secondary"
                        >
                          {tool.name}<span class="text-text-tertiary"
                            >:{tool.count}</span
                          >
                        </span>
                      {/each}
                      {#if summary.toolUsage.length > 6}
                        <span class="text-[10px] text-text-tertiary"
                          >+{summary.toolUsage.length - 6} more</span
                        >
                      {/if}

                      {#if summary.filesModified.length > 0 || summary.tasks.length > 0}
                        <span class="text-text-tertiary text-xs mx-1">|</span>
                      {/if}

                      {#if summary.filesModified.length > 0}
                        <button
                          type="button"
                          onclick={() => toggleSummaryFiles(itemId)}
                          class="text-[11px] text-text-secondary hover:text-accent-fg transition-colors"
                        >
                          {summary.filesModified.length} file{summary
                            .filesModified.length !== 1
                            ? "s"
                            : ""}
                        </button>
                      {/if}

                      {#if summary.tasks.length > 0}
                        {#if summary.filesModified.length > 0}
                          <span class="text-text-tertiary text-xs">|</span>
                        {/if}
                        <button
                          type="button"
                          onclick={() => toggleSummaryTasks(itemId)}
                          class="text-[11px] text-text-secondary hover:text-accent-fg transition-colors"
                        >
                          {summary.tasks.length} task{summary.tasks.length !== 1
                            ? "s"
                            : ""}
                        </button>
                      {/if}
                    </div>

                    <!-- Token usage display -->
                    {#if summary.usage !== undefined && (summary.usage.inputTokens > 0 || summary.usage.outputTokens > 0)}
                      <div
                        class="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-text-tertiary"
                      >
                        <span
                          >in:{formatTokenCount(
                            summary.usage.inputTokens,
                          )}</span
                        >
                        <span
                          >out:{formatTokenCount(
                            summary.usage.outputTokens,
                          )}</span
                        >
                        {#if summary.usage.cacheCreationTokens > 0}
                          <span
                            >cache-w:{formatTokenCount(
                              summary.usage.cacheCreationTokens,
                            )}</span
                          >
                        {/if}
                        {#if summary.usage.cacheReadTokens > 0}
                          <span
                            >cache-r:{formatTokenCount(
                              summary.usage.cacheReadTokens,
                            )}</span
                          >
                        {/if}
                      </div>
                    {/if}

                    <!-- Expandable file list -->
                    {#if expandedSummaryFiles.has(itemId) && summary.filesModified.length > 0}
                      <div class="mt-2 space-y-0.5">
                        {#each summary.filesModified as file}
                          <div
                            class="flex items-center gap-2 py-0.5 text-[11px]"
                          >
                            <span
                              class="shrink-0 px-1 rounded text-[9px] font-bold {file.tool ===
                              'Edit'
                                ? 'bg-attention-muted text-attention-fg'
                                : 'bg-success-muted text-success-fg'}"
                            >
                              {file.tool === "Edit" ? "M" : "A"}
                            </span>
                            <span
                              class="text-text-secondary font-mono truncate"
                              title={file.path}
                            >
                              {shortPath(file.path)}
                            </span>
                          </div>
                        {/each}
                      </div>
                    {/if}

                    <!-- Expandable task list -->
                    {#if expandedSummaryTasks.has(itemId) && summary.tasks.length > 0}
                      <div class="mt-2 space-y-0.5">
                        {#each summary.tasks as task}
                          <div
                            class="flex items-center gap-2 py-0.5 text-[11px]"
                          >
                            <span
                              class="shrink-0 w-2 h-2 rounded-full {getTaskStatusColor(
                                task.status,
                              )}"
                            ></span>
                            <span class="text-text-primary truncate"
                              >{task.subject}</span
                            >
                            <span class="text-text-tertiary shrink-0"
                              >{task.status}</span
                            >
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <!-- No summary yet (not loading) - just show Resume button -->
                  <div
                    class="flex items-center gap-2 px-4 py-2 bg-bg-tertiary/30 border-b border-border-default"
                  >
                    <button
                      type="button"
                      onclick={() => onResumeSession(itemId)}
                      class="shrink-0 px-2.5 py-0.5 text-xs font-medium rounded bg-bg-tertiary hover:bg-bg-hover text-text-primary border border-border-default"
                    >
                      Resume
                    </button>
                  </div>
                {/if}

                <!-- Inline Transcript -->
                {#if item.fullPath.length > 0}
                  <!-- CLI session with transcript file on disk -->
                  <SessionTranscriptInline sessionId={itemId} {contextId} />
                {:else}
                  <!-- QraftBox-only session (no CLI transcript file) -->
                  <div class="px-4 py-3">
                    <!-- User prompt -->
                    <div
                      class="border-l-4 border-accent-emphasis bg-bg-secondary rounded-r mb-2"
                    >
                      <div class="px-3 py-1.5">
                        <span
                          class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-muted text-accent-fg"
                          >user</span
                        >
                      </div>
                      <div
                        class="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words text-text-primary"
                      >
                        {stripSystemTags(item.firstPrompt)}
                      </div>
                    </div>
                    <!-- Assistant summary -->
                    {#if item.summary.length > 0}
                      <div
                        class="border-l-4 border-success-emphasis bg-bg-secondary rounded-r"
                      >
                        <div class="px-3 py-1.5">
                          <span
                            class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success-muted text-success-fg"
                            >assistant</span
                          >
                        </div>
                        <div
                          class="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words text-text-primary max-h-[300px] overflow-y-auto"
                        >
                          {stripSystemTags(item.summary)}
                        </div>
                      </div>
                    {:else}
                      <div class="text-xs text-success-fg py-2">
                        Session completed.
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/snippet}

        <!-- Today -->
        {#if groupedSessions.today.length > 0}
          <section aria-labelledby="history-today-heading">
            <h2
              id="history-today-heading"
              class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3"
            >
              Today
            </h2>
            <div>
              {#each groupedSessions.today as item, index (getItemKey(item))}
                {@render sessionRow(item, index === 0)}
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
            <div>
              {#each groupedSessions.yesterday as item, index (getItemKey(item))}
                {@render sessionRow(item, index === 0)}
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
            <div>
              {#each groupedSessions.older as item, index (getItemKey(item))}
                {@render sessionRow(item, index === 0)}
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
