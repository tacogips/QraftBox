<script lang="ts">
  /**
   * SessionToolbar Component
   *
   * Thin toolbar panel above CurrentSessionPanel with New Session and Search Session buttons.
   * The Search Session button opens a floating popup that fetches and displays session history
   * with search functionality and resume capability.
   *
   * Props:
   * - contextId: Context ID for API calls (null if not available)
   * - onNewSession: Callback to create a new session
   * - onResumeSession: Callback to resume a selected session
   *
   * Features:
   * - New Session button (left side)
   * - Search Session button (opens popup)
   * - Popup with session search and list
   * - Click outside to close popup
   * - Debounced search (300ms)
   */

  import { stripSystemTags } from "../../src/utils/strip-system-tags";

  interface SessionEntry {
    readonly qraftAiSessionId: string;
    readonly firstPrompt: string;
    readonly summary: string;
    readonly messageCount: number;
    readonly modified: string;
    readonly model?: string | undefined;
  }

  interface Props {
    contextId: string | null;
    projectPath: string;
    onNewSession: () => void;
    onResumeSession: (sessionId: string) => void;
  }

  const {
    contextId,
    projectPath = "",
    onNewSession,
    onResumeSession,
  }: Props = $props();

  /**
   * Popup visibility state
   */
  let isPopupOpen = $state(false);

  /**
   * Search query state
   */
  let searchQuery = $state("");

  /**
   * Debounce timer for search
   */
  let searchDebounceTimer: number | null = $state(null);

  /**
   * Actual search query after debounce
   */
  let debouncedSearchQuery = $state("");

  /**
   * Session list state
   */
  let sessions = $state<readonly SessionEntry[]>([]);
  let isLoadingSessions = $state(false);
  let sessionsFetchError = $state<string | null>(null);

  /**
   * Popup container reference for click-outside detection
   */
  let popupRef: HTMLDivElement | null = $state(null);

  /**
   * Toggle popup visibility
   */
  function togglePopup(): void {
    isPopupOpen = !isPopupOpen;
    if (isPopupOpen && sessions.length === 0) {
      void fetchSessions("");
    }
  }

  /**
   * Close popup
   */
  function closePopup(): void {
    isPopupOpen = false;
    searchQuery = "";
    debouncedSearchQuery = "";
  }

  /**
   * Handle search input change
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
   * Fetch sessions from API
   */
  async function fetchSessions(query: string): Promise<void> {
    if (contextId === null) {
      sessionsFetchError = "Context ID not available";
      return;
    }

    isLoadingSessions = true;
    sessionsFetchError = null;

    try {
      const params = new URLSearchParams({
        offset: "0",
        limit: "20",
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      sessionsFetchError = errorMessage;
      sessions = [];
    } finally {
      isLoadingSessions = false;
    }
  }

  /**
   * Handle resume session button click
   */
  function handleResumeClick(qraftAiSessionId: string): void {
    onResumeSession(qraftAiSessionId);
    closePopup();
  }

  /**
   * Handle window click for click-outside detection
   */
  function handleWindowClick(event: MouseEvent): void {
    if (
      isPopupOpen &&
      popupRef !== null &&
      !popupRef.contains(event.target as Node)
    ) {
      const target = event.target as HTMLElement;
      const isSearchButton = target.closest("[data-toolbar-search-button]");
      if (isSearchButton === null) {
        closePopup();
      }
    }
  }

  /**
   * Get relative time string
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
   * Truncate text for display
   */
  function truncateText(text: string, maxLen = 80): string {
    const stripped = stripSystemTags(text).replaceAll("\n", " ");
    if (stripped.length <= maxLen) return stripped;
    return stripped.slice(0, maxLen) + "...";
  }

  /**
   * Set up window click listener when popup opens
   */
  $effect(() => {
    if (isPopupOpen) {
      window.addEventListener("click", handleWindowClick);
      return () => {
        window.removeEventListener("click", handleWindowClick);
      };
    }
  });
</script>

<!-- Toolbar Container (relative for popup positioning) -->
<div class="session-toolbar-wrapper relative">
  <div
    class="session-toolbar h-8 flex items-center gap-2 px-3
           bg-bg-secondary border-b border-border-default"
    role="toolbar"
    aria-label="Session toolbar"
  >
    <!-- New Session Button -->
    <button
      type="button"
      onclick={onNewSession}
      class="shrink-0 p-1.5 rounded hover:bg-bg-hover transition-colors
             text-text-tertiary hover:text-text-primary"
      title="New Session"
      aria-label="Create new session"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>

    <!-- Search Session Button -->
    <button
      type="button"
      onclick={togglePopup}
      data-toolbar-search-button
      class="shrink-0 p-1.5 rounded hover:bg-bg-hover transition-colors
             text-text-tertiary hover:text-text-primary
             {isPopupOpen ? 'bg-bg-hover text-text-primary' : ''}"
      title="Search Sessions"
      aria-label="Search and browse sessions"
      aria-expanded={isPopupOpen}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    </button>
  </div>

  <!-- Popup Panel (positioned relative to toolbar wrapper) -->
  {#if isPopupOpen}
    <div
      bind:this={popupRef}
      class="absolute bottom-full left-0 right-0 z-50 mb-1
             bg-bg-primary border border-border-default rounded-lg shadow-lg
             max-h-[400px] flex flex-col"
      role="dialog"
      aria-label="Session search"
    >
      <!-- Search Input -->
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

      <!-- Session List -->
      <div class="flex-1 overflow-y-auto">
        {#if isLoadingSessions}
          <!-- Loading State -->
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
        {:else if sessionsFetchError !== null}
          <!-- Error State -->
          <div class="p-4 text-center text-danger-fg text-sm">
            <p class="font-medium">Error loading sessions</p>
            <p class="text-xs text-text-tertiary mt-1">{sessionsFetchError}</p>
          </div>
        {:else if sessions.length === 0}
          <!-- Empty State -->
          <div class="p-8 text-center text-text-tertiary text-sm">
            {#if debouncedSearchQuery.length > 0}
              <p>No sessions found for "{debouncedSearchQuery}"</p>
            {:else}
              <p>No sessions found</p>
            {/if}
          </div>
        {:else}
          <!-- Session Rows -->
          {#each sessions as session (session.qraftAiSessionId)}
            <div
              class="flex items-center gap-2 px-3 py-2 hover:bg-bg-hover border-b border-border-default/50 last:border-b-0"
            >
              <!-- Resume Button -->
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

              <!-- Session Info -->
              <div class="flex-1 min-w-0">
                <p class="text-xs text-text-primary truncate">
                  {truncateText(session.firstPrompt || session.summary)}
                </p>
                <div
                  class="flex items-center gap-2 mt-0.5 text-[10px] text-text-tertiary"
                >
                  <span>{session.messageCount} msgs</span>
                  <span>•</span>
                  <span>{getRelativeTime(session.modified)}</span>
                  {#if session.model !== undefined}
                    <span>•</span>
                    <span class="truncate">{session.model}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
