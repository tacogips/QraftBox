<script lang="ts">
  import type { AISession } from "../../../src/types/ai";
  import { AIAgent } from "../../../src/types/ai-agent";
  import type { PromptQueueItem } from "../../src/lib/app-api";
  import type { ExtendedSessionEntry } from "../../../src/types/claude-session";
  import { stripSystemTags } from "../../../src/utils/strip-system-tags";
  import AiSessionOverviewPopup from "./AiSessionOverviewPopup.svelte";

  interface OverviewSessionCard {
    readonly qraftAiSessionId: string;
    readonly purpose: string;
    readonly latestResponse: string;
    readonly source: "qraftbox" | "claude-cli" | "unknown";
    readonly aiAgent: AIAgent;
    readonly status: "running" | "queued" | "idle";
    readonly queuedPromptCount: number;
    readonly updatedAt: string;
  }

  interface SelectedSessionMeta {
    readonly title: string;
    readonly purpose: string;
    readonly latestResponse: string;
    readonly source: "qraftbox" | "claude-cli" | "unknown";
    readonly aiAgent: AIAgent;
    readonly status: "running" | "queued" | "idle";
    readonly queuedPromptCount: number;
  }

  interface TranscriptEvent {
    readonly type: string;
    readonly raw: Record<string, unknown>;
    readonly content?: unknown;
  }

  interface TranscriptResponse {
    readonly events: readonly TranscriptEvent[];
  }

  interface Props {
    contextId: string | null;
    projectPath: string;
    runningSessions: readonly AISession[];
    queuedSessions: readonly AISession[];
    pendingPrompts: readonly PromptQueueItem[];
    onResumeSession: (sessionId: string) => void;
    onSubmitPrompt: (
      sessionId: string,
      message: string,
      immediate: boolean,
    ) => Promise<void>;
  }

  interface PendingPromptMessage {
    readonly message: string;
    readonly status: "queued" | "running";
    readonly ai_agent?: AIAgent | undefined;
  }

  const {
    contextId,
    projectPath,
    runningSessions,
    queuedSessions,
    pendingPrompts,
    onResumeSession,
    onSubmitPrompt,
  }: Props = $props();

  let sessions = $state<readonly ExtendedSessionEntry[]>([]);
  let sessionsLoading = $state(false);
  let sessionsError = $state<string | null>(null);
  let selectedSessionId = $state<string | null>(null);
  let selectedSessionMeta = $state<SelectedSessionMeta>({
    title: "Session",
    purpose: "No purpose available",
    latestResponse: "No active response available",
    source: "unknown",
    aiAgent: AIAgent.CLAUDE,
    status: "idle",
    queuedPromptCount: 0,
  });

  let searchQueryInput = $state("");
  let searchQuery = $state("");
  let searchInTranscript = $state(true);
  let transcriptSearchRunning = $state(false);
  let transcriptMatchedSessionIds = $state<Set<string>>(new Set());
  const transcriptSearchCache = new Map<string, string>();

  let latestFetchToken = 0;
  let latestTranscriptSearchToken = 0;
  const SESSION_QUERY_KEY = "ai_session_id";

  function normalizeText(text: string): string {
    return stripSystemTags(text)
      .replaceAll("\n", " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeForSearch(text: string): string {
    return normalizeText(text).toLowerCase();
  }

  function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}...`;
  }

  function readSelectedSessionIdFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(SESSION_QUERY_KEY);
    if (value === null || value.trim().length === 0) {
      return null;
    }
    return value.trim();
  }

  function writeSelectedSessionIdToUrl(sessionId: string | null): void {
    const url = new URL(window.location.href);
    if (sessionId === null || sessionId.length === 0) {
      url.searchParams.delete(SESSION_QUERY_KEY);
    } else {
      url.searchParams.set(SESSION_QUERY_KEY, sessionId);
    }

    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(window.history.state, "", next);
    }
  }

  function getRelativeTime(isoDate: string): string {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    return `${diffDays}d ago`;
  }

  function sessionGroupId(session: AISession): string {
    return session.clientSessionId ?? session.id;
  }

  function findSessionRuntimeByGroupId(sessionId: string): {
    runningMatch: AISession | undefined;
    queuedMatch: AISession | undefined;
  } {
    const runningMatch = runningSessions.find(
      (runningSession) => sessionGroupId(runningSession) === sessionId,
    );
    const queuedMatch = queuedSessions.find(
      (queuedSession) => sessionGroupId(queuedSession) === sessionId,
    );
    return { runningMatch, queuedMatch };
  }

  function activePromptMessagesForSession(
    sessionId: string,
  ): readonly PendingPromptMessage[] {
    return pendingPrompts
      .filter(
        (pendingPrompt) =>
          pendingPrompt.qraft_ai_session_id === sessionId &&
          (pendingPrompt.status === "queued" ||
            pendingPrompt.status === "running"),
      )
      .map((pendingPrompt) => ({
        message: pendingPrompt.message,
        status: pendingPrompt.status,
        ai_agent: pendingPrompt.ai_agent,
      }));
  }

  function buildCardFromSession(
    entry: ExtendedSessionEntry,
  ): OverviewSessionCard {
    const { runningMatch, queuedMatch } = findSessionRuntimeByGroupId(
      entry.qraftAiSessionId,
    );

    const activePromptMessages = activePromptMessagesForSession(
      entry.qraftAiSessionId,
    );

    const status: OverviewSessionCard["status"] =
      runningMatch !== undefined
        ? "running"
        : queuedMatch !== undefined || activePromptMessages.length > 0
          ? "queued"
          : "idle";

    const normalizedSummary = normalizeText(entry.summary);
    const normalizedFirstPrompt = normalizeText(entry.firstPrompt);
    const normalizedRuntimePrompt = normalizeText(
      runningMatch?.prompt ?? queuedMatch?.prompt ?? "",
    );

    const purposeCandidate =
      normalizedFirstPrompt || normalizedRuntimePrompt || normalizedSummary;

    const runtimeLatest = normalizeText(
      runningMatch?.currentActivity ??
        runningMatch?.lastAssistantMessage ??
        queuedMatch?.currentActivity ??
        queuedMatch?.lastAssistantMessage ??
        "",
    );

    const queuedHead = normalizeText(activePromptMessages[0]?.message ?? "");

    const latestResponseCandidate =
      runtimeLatest ||
      queuedHead ||
      normalizedSummary ||
      "No active response available";

    return {
      qraftAiSessionId: entry.qraftAiSessionId,
      purpose: truncate(purposeCandidate || "No purpose available", 90),
      latestResponse: truncate(latestResponseCandidate, 160),
      source: entry.source,
      aiAgent:
        entry.aiAgent ??
        runningMatch?.aiAgent ??
        queuedMatch?.aiAgent ??
        AIAgent.CLAUDE,
      status,
      queuedPromptCount: activePromptMessages.length,
      updatedAt: entry.modified,
    };
  }

  function buildFallbackCardsForActiveOnlySessions(
    existingCardIds: Set<string>,
  ): readonly OverviewSessionCard[] {
    const fallbackCards: OverviewSessionCard[] = [];

    for (const sessionEntry of [...runningSessions, ...queuedSessions]) {
      const groupId = sessionGroupId(sessionEntry);
      if (existingCardIds.has(groupId)) {
        continue;
      }

      const activePromptMessages = activePromptMessagesForSession(groupId);
      const status: OverviewSessionCard["status"] =
        sessionEntry.state === "running"
          ? "running"
          : activePromptMessages.length > 0 || sessionEntry.state === "queued"
            ? "queued"
            : "idle";

      fallbackCards.push({
        qraftAiSessionId: groupId,
        purpose: truncate(
          normalizeText(sessionEntry.prompt) || "No purpose available",
          90,
        ),
        latestResponse: truncate(
          normalizeText(
            sessionEntry.currentActivity ??
              sessionEntry.lastAssistantMessage ??
              activePromptMessages[0]?.message ??
              "No active response available",
          ),
          160,
        ),
        source: "qraftbox",
        aiAgent:
          sessionEntry.aiAgent ??
          activePromptMessages[0]?.ai_agent ??
          AIAgent.CLAUDE,
        status,
        queuedPromptCount: activePromptMessages.length,
        updatedAt:
          sessionEntry.completedAt ??
          sessionEntry.startedAt ??
          sessionEntry.createdAt,
      });
    }

    return fallbackCards;
  }

  function cardMatchesQuery(card: OverviewSessionCard, query: string): boolean {
    const normalizedQuery = normalizeForSearch(query);
    if (normalizedQuery.length === 0) {
      return true;
    }

    return (
      normalizeForSearch(card.purpose).includes(normalizedQuery) ||
      normalizeForSearch(card.latestResponse).includes(normalizedQuery)
    );
  }

  function extractTextFromContentBlocks(contentBlocks: unknown[]): string {
    const textSegments: string[] = [];
    for (const contentBlock of contentBlocks) {
      if (typeof contentBlock !== "object" || contentBlock === null) {
        continue;
      }
      const contentBlockObj = contentBlock as Record<string, unknown>;
      if (
        contentBlockObj["type"] === "text" &&
        typeof contentBlockObj["text"] === "string"
      ) {
        textSegments.push(contentBlockObj["text"]);
      }
    }
    return textSegments.join(" ");
  }

  function extractTranscriptEventText(
    transcriptEvent: TranscriptEvent,
  ): string {
    const raw = transcriptEvent.raw;

    if (
      (transcriptEvent.type === "user" ||
        transcriptEvent.type === "assistant") &&
      typeof raw["message"] === "object" &&
      raw["message"] !== null
    ) {
      const message = raw["message"] as Record<string, unknown>;
      const content = message["content"];
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        return extractTextFromContentBlocks(content);
      }
    }

    if (typeof transcriptEvent.content === "string") {
      return transcriptEvent.content;
    }

    if (typeof raw["summary"] === "string") {
      return raw["summary"];
    }

    return "";
  }

  async function fetchSessionTranscriptText(
    sessionId: string,
  ): Promise<string> {
    const cachedText = transcriptSearchCache.get(sessionId);
    if (cachedText !== undefined) {
      return cachedText;
    }

    if (contextId === null) {
      return "";
    }

    try {
      const response = await fetch(
        `/api/ctx/${contextId}/claude-sessions/sessions/${sessionId}/transcript?limit=1000`,
      );
      if (!response.ok) {
        transcriptSearchCache.set(sessionId, "");
        return "";
      }

      const transcript = (await response.json()) as TranscriptResponse;
      const text = transcript.events
        .map((transcriptEvent) => extractTranscriptEventText(transcriptEvent))
        .join(" ");
      const normalizedTranscriptText = normalizeForSearch(text);
      transcriptSearchCache.set(sessionId, normalizedTranscriptText);
      return normalizedTranscriptText;
    } catch {
      transcriptSearchCache.set(sessionId, "");
      return "";
    }
  }

  async function runTranscriptSearch(
    sessionEntries: readonly ExtendedSessionEntry[],
    query: string,
    token: number,
  ): Promise<void> {
    const normalizedQuery = normalizeForSearch(query);
    if (normalizedQuery.length === 0 || contextId === null) {
      transcriptMatchedSessionIds = new Set();
      transcriptSearchRunning = false;
      return;
    }

    transcriptSearchRunning = true;

    const matchedIds = new Set<string>();

    for (const sessionEntry of sessionEntries) {
      const metadataText = `${sessionEntry.firstPrompt} ${sessionEntry.summary}`;
      if (normalizeForSearch(metadataText).includes(normalizedQuery)) {
        matchedIds.add(sessionEntry.qraftAiSessionId);
      }
    }

    const candidates = sessionEntries.filter(
      (sessionEntry) => !matchedIds.has(sessionEntry.qraftAiSessionId),
    );

    let candidateIndex = 0;
    const workerCount = Math.min(6, candidates.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (candidateIndex < candidates.length) {
        const currentIndex = candidateIndex;
        candidateIndex += 1;
        const candidate = candidates[currentIndex];
        if (candidate === undefined) {
          continue;
        }

        const transcriptText = await fetchSessionTranscriptText(
          candidate.qraftAiSessionId,
        );
        if (transcriptText.includes(normalizedQuery)) {
          matchedIds.add(candidate.qraftAiSessionId);
        }
      }
    });

    await Promise.all(workers);

    if (token !== latestTranscriptSearchToken) {
      return;
    }

    transcriptMatchedSessionIds = matchedIds;
    transcriptSearchRunning = false;
  }

  const cards = $derived.by(() => {
    const sessionCards = sessions.map((sessionEntry) =>
      buildCardFromSession(sessionEntry),
    );
    const sessionCardIds = new Set(
      sessionCards.map((sessionCard) => sessionCard.qraftAiSessionId),
    );
    const fallbackCards =
      buildFallbackCardsForActiveOnlySessions(sessionCardIds);
    return [...sessionCards, ...fallbackCards].sort((cardA, cardB) => {
      const timeA = new Date(cardA.updatedAt).getTime();
      const timeB = new Date(cardB.updatedAt).getTime();
      return timeB - timeA;
    });
  });

  const filteredCards = $derived.by(() => {
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length === 0) {
      return cards;
    }

    if (searchInTranscript) {
      return cards.filter(
        (card) =>
          transcriptMatchedSessionIds.has(card.qraftAiSessionId) ||
          cardMatchesQuery(card, normalizedQuery),
      );
    }

    return cards.filter((card) => cardMatchesQuery(card, normalizedQuery));
  });

  const selectedCard = $derived.by(() => {
    if (selectedSessionId === null) {
      return null;
    }
    const card = cards.find(
      (sessionCard) => sessionCard.qraftAiSessionId === selectedSessionId,
    );
    return card ?? null;
  });

  const selectedSessionPendingPromptMessages = $derived.by(() => {
    if (selectedSessionId === null) {
      return [] as readonly PendingPromptMessage[];
    }
    return activePromptMessagesForSession(selectedSessionId);
  });

  async function fetchOverviewSessions(): Promise<void> {
    const fetchToken = ++latestFetchToken;

    if (contextId === null || contextId.length === 0) {
      sessions = [];
      sessionsError = null;
      return;
    }

    sessionsLoading = true;
    sessionsError = null;

    try {
      const query = new URLSearchParams({
        offset: "0",
        limit: "200",
        sortBy: "modified",
        sortOrder: "desc",
      });

      if (projectPath.length > 0) {
        query.set("workingDirectoryPrefix", projectPath);
      }

      const trimmedSearch = searchQuery.trim();
      if (trimmedSearch.length > 0 && !searchInTranscript) {
        query.set("search", trimmedSearch);
      }

      const response = await fetch(
        `/api/ctx/${contextId}/claude-sessions/sessions?${query.toString()}`,
      );

      if (!response.ok) {
        throw new Error(`Failed to load sessions (${response.status})`);
      }

      const data = (await response.json()) as {
        sessions: ExtendedSessionEntry[];
      };

      if (fetchToken !== latestFetchToken) {
        return;
      }

      sessions = data.sessions;

      if (trimmedSearch.length > 0 && searchInTranscript) {
        latestTranscriptSearchToken += 1;
        const transcriptSearchToken = latestTranscriptSearchToken;
        void runTranscriptSearch(
          data.sessions,
          trimmedSearch,
          transcriptSearchToken,
        );
      } else {
        transcriptMatchedSessionIds = new Set();
        transcriptSearchRunning = false;
      }
    } catch (error: unknown) {
      if (fetchToken !== latestFetchToken) {
        return;
      }
      sessions = [];
      sessionsError =
        error instanceof Error ? error.message : "Failed to load sessions";
      transcriptMatchedSessionIds = new Set();
      transcriptSearchRunning = false;
    } finally {
      if (fetchToken === latestFetchToken) {
        sessionsLoading = false;
      }
    }
  }

  $effect(() => {
    const debounceTimer = setTimeout(() => {
      searchQuery = searchQueryInput.trim();
    }, 250);

    return () => {
      clearTimeout(debounceTimer);
    };
  });

  $effect(() => {
    const onPopState = (): void => {
      selectedSessionId = readSelectedSessionIdFromUrl();
    };

    selectedSessionId = readSelectedSessionIdFromUrl();
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  });

  $effect(() => {
    const activeContextId = contextId;
    const activeProjectPath = projectPath;
    const activeSearchQuery = searchQuery;
    const activeSearchInTranscript = searchInTranscript;
    void activeContextId;
    void activeProjectPath;
    void activeSearchQuery;
    void activeSearchInTranscript;

    void fetchOverviewSessions();

    if (activeContextId === null) {
      return;
    }

    const refreshTimerId = setInterval(() => {
      void fetchOverviewSessions();
    }, 4000);

    return () => clearInterval(refreshTimerId);
  });

  $effect(() => {
    if (selectedCard === null) {
      return;
    }
    selectedSessionMeta = {
      title: selectedCard.purpose,
      purpose: selectedCard.purpose,
      latestResponse: selectedCard.latestResponse,
      source: selectedCard.source,
      status: selectedCard.status,
      queuedPromptCount: selectedCard.queuedPromptCount,
    };
  });

  $effect(() => {
    writeSelectedSessionIdToUrl(selectedSessionId);
  });

  async function handlePopupSubmit(
    sessionId: string,
    message: string,
    immediate: boolean,
  ): Promise<void> {
    await onSubmitPrompt(sessionId, message, immediate);
    await fetchOverviewSessions();
  }
</script>

<div class="h-full flex flex-col min-h-0 bg-bg-primary">
  <div
    class="px-4 py-2 border-b border-border-default bg-bg-secondary
           flex items-center justify-between gap-4"
  >
    <div class="min-w-0">
      <h2 class="text-sm font-semibold text-text-primary">Session Overview</h2>
      <p class="text-xs text-text-tertiary truncate">
        Monitor and search sessions across parallel terminals
      </p>
    </div>
    <div class="text-xs text-text-secondary shrink-0">
      {filteredCards.length} / {cards.length} sessions
    </div>
  </div>

  <div class="px-4 py-2 border-b border-border-default bg-bg-primary">
    <div class="flex flex-col md:flex-row gap-2 md:items-center">
      <input
        type="text"
        class="flex-1 min-w-0 rounded border border-border-default bg-bg-secondary
               px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
        placeholder="Search session purpose/summary/chat text"
        bind:value={searchQueryInput}
      />
      <label class="inline-flex items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          class="rounded border-border-default"
          bind:checked={searchInTranscript}
        />
        Include chat transcript
      </label>
      {#if transcriptSearchRunning}
        <span class="text-xs text-text-tertiary">Searching chat...</span>
      {/if}
    </div>
  </div>

  <div class="flex-1 min-h-0 overflow-auto p-4">
    {#if sessionsLoading && cards.length === 0}
      <div class="text-sm text-text-secondary">Loading sessions...</div>
    {:else if sessionsError !== null && cards.length === 0}
      <div class="text-sm text-danger-fg">{sessionsError}</div>
    {:else if filteredCards.length === 0}
      <div class="text-sm text-text-secondary">
        {searchQuery.length > 0
          ? "No sessions matched your search."
          : "No sessions found for this project."}
      </div>
    {:else}
      <div class="overview-grid">
        {#each filteredCards as card (card.qraftAiSessionId)}
          <button
            type="button"
            class="w-full text-left rounded-lg border border-border-default bg-bg-secondary
                   hover:border-accent-emphasis/60 hover:bg-bg-hover transition-colors
                   p-2.5 flex flex-col gap-1.5 min-h-[142px]"
            aria-label={`${card.status} ${getRelativeTime(card.updatedAt)} ${card.purpose} ${card.latestResponse}`}
            onclick={() => {
              selectedSessionId = card.qraftAiSessionId;
              selectedSessionMeta = {
                title: card.purpose,
                purpose: card.purpose,
                latestResponse: card.latestResponse,
                source: card.source,
                aiAgent: card.aiAgent,
                status: card.status,
                queuedPromptCount: card.queuedPromptCount,
              };
            }}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide {card.status ===
                  'running'
                    ? 'bg-accent-muted text-accent-fg'
                    : card.status === 'queued'
                      ? 'bg-attention-muted text-attention-fg'
                      : 'bg-bg-tertiary text-text-secondary'}"
                >
                  {card.status}
                </span>
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide {card.source ===
                  'qraftbox'
                    ? 'bg-success-muted text-success-fg'
                    : card.source === 'claude-cli'
                      ? 'bg-accent-muted text-accent-fg'
                      : 'bg-bg-tertiary text-text-secondary'}"
                >
                  {card.source}
                </span>
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-bg-tertiary text-text-secondary"
                >
                  {card.aiAgent}
                </span>
              </div>
              <span class="text-[11px] text-text-tertiary"
                >{getRelativeTime(card.updatedAt)}</span
              >
            </div>

            <div class="space-y-1">
              <p class="text-[10px] text-text-tertiary uppercase tracking-wide">
                Purpose
              </p>
              <p class="text-[11px] text-text-secondary line-clamp-2">
                {card.purpose}
              </p>
            </div>

            <div class="space-y-1 mt-auto">
              <p class="text-[10px] text-text-tertiary uppercase tracking-wide">
                Latest Response
              </p>
              <p class="text-[11px] text-text-primary line-clamp-2">
                {card.latestResponse}
              </p>
            </div>

            {#if card.queuedPromptCount > 0}
              <div class="pt-1 border-t border-border-default/60">
                <span class="text-[11px] text-attention-fg"
                  >{card.queuedPromptCount} prompt(s) waiting</span
                >
              </div>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if selectedSessionId !== null}
  <AiSessionOverviewPopup
    open={true}
    {contextId}
    sessionId={selectedSessionId}
    title={selectedCard?.purpose ?? selectedSessionMeta.title}
    status={selectedCard?.status ?? selectedSessionMeta.status}
    purpose={selectedCard?.purpose ?? selectedSessionMeta.purpose}
    latestResponse={selectedCard?.latestResponse ??
      selectedSessionMeta.latestResponse}
    source={selectedCard?.source ?? selectedSessionMeta.source}
    aiAgent={selectedCard?.aiAgent ?? selectedSessionMeta.aiAgent}
    queuedPromptCount={selectedCard?.queuedPromptCount ??
      selectedSessionMeta.queuedPromptCount}
    pendingPromptMessages={selectedSessionPendingPromptMessages}
    onClose={() => {
      selectedSessionId = null;
    }}
    {onResumeSession}
    onSubmitPrompt={(message, immediate) =>
      handlePopupSubmit(selectedSessionId, message, immediate)}
  />
{/if}

<style>
  .overview-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  @media (max-width: 1600px) {
    .overview-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (max-width: 1280px) {
    .overview-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .overview-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .overview-grid {
      grid-template-columns: repeat(1, minmax(0, 1fr));
    }
  }
</style>
