<script lang="ts">
  /**
   * SessionSearchPopup Component
   *
   * Session search popup that fetches the unified session list from the
   * server API (which merges QraftBox + CLI sessions server-side).
   *
   * Props:
   * - contextId: Context ID for API calls
   * - projectPath: Project path for filtering
   * - onResumeSession: Callback when user clicks Resume on a session
   * - onClose: Callback when popup should close
   *
   * Features:
   * - Fetches unified sessions from API with search and filtering
   * - Server-side merge and deduplication (QraftBox + CLI)
   * - Debounced search input (300ms)
   * - Loading, error, and empty states
   */

  import { stripSystemTags } from "../../src/utils/strip-system-tags";

  /**
   * Session entry from the unified sessions API
   */
  interface SessionEntry {
    readonly qraftAiSessionId: string;
    readonly firstPrompt: string;
    readonly summary: string;
    readonly messageCount: number;
    readonly modified: string;
    readonly model?: string | undefined;
    readonly source?: string | undefined;
  }

  interface Props {
    contextId: string | null;
    projectPath: string;
    onResumeSession: (qraftAiSessionId: string) => void;
    onClose: () => void;
  }

  const { contextId, projectPath, onResumeSession, onClose }: Props = $props();

  /**
   * Search state
   */
  let searchQuery = $state("");
  let searchDebounceTimer: number | null = $state(null);
  let debouncedSearchQuery = $state("");

  /**
   * Fetched sessions (unified: CLI + QraftBox, merged server-side)
   */
  let sessions = $state<readonly SessionEntry[]>([]);
  let isLoading = $state(false);
  let errorMessage = $state<string | null>(null);

  /**
   * Fetch sessions from API (server returns merged list)
   */
  async function fetchSessions(query: string): Promise<void> {
    if (contextId === null) {
      errorMessage = "Context ID not available";
      return;
    }

    isLoading = true;
    errorMessage = null;

    try {
      const params = new URLSearchParams({
        offset: "0",
        limit: "50",
        sortBy: "modified",
        sortOrder: "desc",
      });

      if (projectPath.length > 0) {
        params.set("workingDirectoryPrefix", projectPath);
      }
      if (query.length > 0) {
        params.set("search", query);
      }

      const response = await fetch(
        `/api/ctx/${contextId}/claude-sessions/sessions?${params.toString()}`,
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch sessions: ${text}`);
      }

      const data = (await response.json()) as {
        sessions: SessionEntry[];
        total: number;
      };
      sessions = data.sessions;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      sessions = [];
    } finally {
      isLoading = false;
    }
  }

  /**
   * Handle search input with debouncing
   */
  function handleSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    searchQuery = target.value;

    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer);
    }

    searchDebounceTimer = window.setTimeout(() => {
      debouncedSearchQuery = searchQuery;
      void fetchSessions(searchQuery);
      searchDebounceTimer = null;
    }, 300);
  }

  /**
   * Handle resume session click
   */
  function handleResumeClick(qraftAiSessionId: string): void {
    onResumeSession(qraftAiSessionId);
  }

  /**
   * Truncate session text for display
   */
  function truncateSessionText(text: string, maxLen = 80): string {
    const stripped = stripSystemTags(text).replaceAll("\n", " ");
    if (stripped.length <= maxLen) return stripped;
    return stripped.slice(0, maxLen) + "...";
  }

  /**
   * Get relative time string from ISO date
   */
  function getRelativeTime(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    return `${diffDays}d ago`;
  }

  /**
   * Fetch initial sessions on mount
   */
  $effect(() => {
    void fetchSessions("");
  });
</script>

<!-- Search header -->
<div class="p-3 border-b border-border-default shrink-0">
  <div class="relative">
    <div
      class="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-text-tertiary"
      aria-hidden="true"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    </div>
    <input
      type="text"
      value={searchQuery}
      oninput={handleSearchInput}
      placeholder="Search sessions..."
      class="w-full pl-8 pr-3 py-1.5 text-sm rounded
             bg-bg-secondary border border-border-default
             text-text-primary placeholder-text-tertiary
             focus:outline-none focus:ring-1 focus:ring-accent-emphasis"
      aria-label="Search sessions"
      autocomplete="off"
      spellcheck="false"
    />
  </div>
</div>

<!-- Session list -->
<div class="flex-1 overflow-y-auto">
  {#if isLoading}
    <div class="flex items-center justify-center py-8">
      <svg
        class="animate-spin h-5 w-5 text-accent-fg"
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
    </div>
  {:else if errorMessage !== null}
    <div class="p-4 text-center text-danger-fg text-sm">
      <p class="font-medium">Error loading sessions</p>
      <p class="text-xs text-text-tertiary mt-1">
        {errorMessage}
      </p>
    </div>
  {:else if sessions.length === 0}
    <div class="p-8 text-center text-text-tertiary text-sm">
      {#if debouncedSearchQuery.length > 0}
        <p>No sessions found for "{debouncedSearchQuery}"</p>
      {:else}
        <p>No sessions found</p>
      {/if}
    </div>
  {:else}
    {#each sessions as session (session.qraftAiSessionId)}
      <div
        class="flex items-center gap-2 px-3 py-2 hover:bg-bg-hover border-b border-border-default/50 last:border-b-0"
      >
        <button
          type="button"
          onclick={() => handleResumeClick(session.qraftAiSessionId)}
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
          class="shrink-0 px-1.5 py-0.5 text-[9px] font-medium rounded
                 {session.source === 'qraftbox'
            ? 'bg-accent-muted text-accent-fg'
            : 'bg-bg-tertiary text-text-tertiary'}"
        >
          {session.source === "qraftbox" ? "QraftBox" : "CLI"}
        </span>

        <div class="flex-1 min-w-0">
          <p class="text-xs text-text-primary truncate">
            {truncateSessionText(session.firstPrompt || session.summary)}
          </p>
          <div
            class="flex items-center gap-2 mt-0.5 text-[10px] text-text-tertiary"
          >
            {#if session.messageCount > 0}
              <span>{session.messageCount} msgs</span>
              <span>&bull;</span>
            {/if}
            <span>{getRelativeTime(session.modified)}</span>
            {#if session.model !== undefined}
              <span>&bull;</span>
              <span class="truncate">{session.model}</span>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>
