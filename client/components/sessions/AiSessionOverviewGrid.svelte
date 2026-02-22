<script lang="ts">
  import type { AISession, AISessionSubmitResult } from "../../../src/types/ai";
  import { AIAgent } from "../../../src/types/ai-agent";
  import type { ModelProfile } from "../../../src/types/model-config";
  import type { PromptQueueItem } from "../../src/lib/app-api";
  import type { ExtendedSessionEntry } from "../../../src/types/claude-session";
  import { stripSystemTags } from "../../../src/utils/strip-system-tags";
  import {
    defaultLatestActivity,
    deriveSessionStatus,
    getSessionStatusMeta,
    type SessionStatus,
  } from "../../src/lib/session-status";
  import {
    fetchHiddenAISessionIdsApi,
    setAISessionHiddenApi,
  } from "../../src/lib/app-api";
  import AiSessionOverviewPopup from "./AiSessionOverviewPopup.svelte";

  interface OverviewSessionCard {
    readonly qraftAiSessionId: string;
    readonly purpose: string;
    readonly latestResponse: string;
    readonly source: "qraftbox" | "claude-cli" | "codex-cli" | "unknown";
    readonly aiAgent: AIAgent;
    readonly status: SessionStatus;
    readonly queuedPromptCount: number;
    readonly updatedAt: string;
  }

  interface SelectedSessionMeta {
    readonly title: string;
    readonly purpose: string;
    readonly latestResponse: string;
    readonly source: "qraftbox" | "claude-cli" | "codex-cli" | "unknown";
    readonly aiAgent: AIAgent;
    readonly status: SessionStatus;
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
    newSessionSeedId?: string | null;
    runningSessions: readonly AISession[];
    queuedSessions: readonly AISession[];
    pendingPrompts: readonly PromptQueueItem[];
    newSessionModelProfiles?: readonly ModelProfile[];
    selectedNewSessionModelProfileId?: string | undefined;
    onSelectNewSessionModelProfile?: (profileId: string | undefined) => void;
    onNewSession?: () => void;
    onStartNewSessionPrompt?: (
      message: string,
      immediate: boolean,
    ) => Promise<AISessionSubmitResult | null>;
    onCancelActiveSession?: (sessionId: string) => Promise<void>;
    onSubmitPrompt: (
      sessionId: string,
      message: string,
      immediate: boolean,
    ) => Promise<AISessionSubmitResult | null>;
  }

  interface PendingPromptMessage {
    readonly message: string;
    readonly status: "queued" | "running";
    readonly ai_agent?: AIAgent | undefined;
  }

  interface FallbackPendingPromptMessage extends PendingPromptMessage {
    readonly createdAtMs: number;
  }

  const {
    contextId,
    projectPath,
    newSessionSeedId = null,
    runningSessions,
    queuedSessions,
    pendingPrompts,
    newSessionModelProfiles = [],
    selectedNewSessionModelProfileId = undefined,
    onSelectNewSessionModelProfile,
    onNewSession,
    onStartNewSessionPrompt,
    onCancelActiveSession,
    onSubmitPrompt,
  }: Props = $props();

  let sessions = $state<readonly ExtendedSessionEntry[]>([]);
  let sessionsLoading = $state(false);
  let sessionsError = $state<string | null>(null);
  let selectedSessionId = $state<string | null>(null);
  let creatingNewSession = $state(false);
  let fallbackPendingPromptBySessionId = $state<
    ReadonlyMap<string, FallbackPendingPromptMessage>
  >(new Map());
  const FALLBACK_PENDING_PROMPT_TTL_MS = 20_000;
  let selectedSessionMeta = $state<SelectedSessionMeta>({
    title: "Session",
    purpose: "No purpose available",
    latestResponse: "Waiting for next user input",
    source: "unknown",
    aiAgent: AIAgent.CLAUDE,
    status: "awaiting_input",
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
  let latestHiddenFetchToken = 0;
  const SESSION_QUERY_KEY = "ai_session_id";
  let hiddenSessionIds = $state<ReadonlySet<string>>(new Set());
  let includeHiddenSessions = $state(false);
  let cancellingPrompt = $state(false);
  let cancelPromptError = $state<string | null>(null);

  function openSessionById(
    sessionId: string,
    fallbackMeta?: Partial<SelectedSessionMeta>,
  ): void {
    selectedSessionId = sessionId;
    creatingNewSession = false;
    selectedSessionMeta = {
      ...selectedSessionMeta,
      ...fallbackMeta,
    };
  }

  function setFallbackPendingPrompt(
    sessionId: string,
    message: string,
    status: "queued" | "running",
  ): void {
    const nextFallbackMap = new Map(fallbackPendingPromptBySessionId);
    nextFallbackMap.set(sessionId, {
      message,
      status,
      createdAtMs: Date.now(),
    });
    fallbackPendingPromptBySessionId = nextFallbackMap;
  }

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

    const status = deriveSessionStatus({
      hasRunningTask: runningMatch !== undefined,
      hasQueuedTask:
        queuedMatch !== undefined || activePromptMessages.length > 0,
    });

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
      defaultLatestActivity(status);

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
      const status = deriveSessionStatus({
        hasRunningTask: sessionEntry.state === "running",
        hasQueuedTask:
          activePromptMessages.length > 0 || sessionEntry.state === "queued",
      });

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
              defaultLatestActivity(status),
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

  const visibleCards = $derived.by(() => {
    if (includeHiddenSessions) {
      return cards;
    }
    return cards.filter((card) => !hiddenSessionIds.has(card.qraftAiSessionId));
  });

  const filteredCards = $derived.by(() => {
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length === 0) {
      return visibleCards;
    }

    if (searchInTranscript) {
      return visibleCards.filter(
        (card) =>
          transcriptMatchedSessionIds.has(card.qraftAiSessionId) ||
          cardMatchesQuery(card, normalizedQuery),
      );
    }

    return visibleCards.filter((card) =>
      cardMatchesQuery(card, normalizedQuery),
    );
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
    const activePromptMessages =
      activePromptMessagesForSession(selectedSessionId);
    const fallbackPendingPrompt =
      fallbackPendingPromptBySessionId.get(selectedSessionId);

    if (fallbackPendingPrompt === undefined) {
      return activePromptMessages;
    }

    const isFallbackExpired =
      Date.now() - fallbackPendingPrompt.createdAtMs >
      FALLBACK_PENDING_PROMPT_TTL_MS;
    if (isFallbackExpired) {
      return activePromptMessages;
    }

    if (selectedCard?.status === "awaiting_input") {
      return activePromptMessages;
    }

    const fallbackNormalizedText = normalizeText(fallbackPendingPrompt.message);
    const hasMatchingActivePrompt = activePromptMessages.some(
      (activePromptMessage) =>
        normalizeText(activePromptMessage.message) === fallbackNormalizedText,
    );

    if (hasMatchingActivePrompt) {
      return activePromptMessages;
    }

    return [fallbackPendingPrompt, ...activePromptMessages];
  });

  $effect(() => {
    const nowMs = Date.now();
    const nextFallbackMap = new Map(fallbackPendingPromptBySessionId);
    let hasUpdates = false;

    for (const [
      sessionId,
      fallbackPrompt,
    ] of fallbackPendingPromptBySessionId) {
      const fallbackExpired =
        nowMs - fallbackPrompt.createdAtMs > FALLBACK_PENDING_PROMPT_TTL_MS;
      const sessionCard = cards.find(
        (card) => card.qraftAiSessionId === sessionId,
      );
      const sessionIsWaitingForInput = sessionCard?.status === "awaiting_input";

      if (fallbackExpired || sessionIsWaitingForInput) {
        nextFallbackMap.delete(sessionId);
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      fallbackPendingPromptBySessionId = nextFallbackMap;
    }
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

  async function fetchHiddenSessionIds(): Promise<void> {
    const fetchToken = ++latestHiddenFetchToken;
    try {
      const sessionIds = await fetchHiddenAISessionIdsApi();
      if (fetchToken !== latestHiddenFetchToken) {
        return;
      }
      hiddenSessionIds = new Set(sessionIds);
    } catch {
      if (fetchToken !== latestHiddenFetchToken) {
        return;
      }
      hiddenSessionIds = new Set();
    }
  }

  async function handleToggleSessionHidden(sessionId: string): Promise<void> {
    const nextHidden = !hiddenSessionIds.has(sessionId);
    await setAISessionHiddenApi(sessionId, nextHidden);

    const nextHiddenIds = new Set(hiddenSessionIds);
    if (nextHidden) {
      nextHiddenIds.add(sessionId);
    } else {
      nextHiddenIds.delete(sessionId);
    }
    hiddenSessionIds = nextHiddenIds;

    if (
      nextHidden &&
      !includeHiddenSessions &&
      selectedSessionId === sessionId
    ) {
      creatingNewSession = false;
      selectedSessionId = null;
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
    void fetchHiddenSessionIds();

    if (activeContextId === null) {
      return;
    }

    const refreshTimerId = setInterval(() => {
      void fetchOverviewSessions();
      void fetchHiddenSessionIds();
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
      aiAgent: selectedCard.aiAgent,
      queuedPromptCount: selectedCard.queuedPromptCount,
    };
  });

  $effect(() => {
    if (!creatingNewSession || selectedSessionId !== null) {
      return;
    }
    if (typeof newSessionSeedId !== "string") {
      return;
    }
    const normalizedSeedId = newSessionSeedId.trim();
    if (normalizedSeedId.length === 0) {
      return;
    }
    selectedSessionId = normalizedSeedId;
  });

  $effect(() => {
    writeSelectedSessionIdToUrl(selectedSessionId);
  });

  async function handlePopupSubmit(
    message: string,
    immediate: boolean,
  ): Promise<void> {
    if (creatingNewSession) {
      if (onStartNewSessionPrompt === undefined) {
        return;
      }
      const result = await onStartNewSessionPrompt(message, immediate);
      if (result !== null) {
        const stableSessionId =
          selectedSessionId ?? newSessionSeedId ?? result.sessionId;
        setFallbackPendingPrompt(
          stableSessionId,
          message,
          immediate ? "running" : "queued",
        );
        openSessionById(stableSessionId, {
          title: "New Session",
          purpose: "New session",
          latestResponse: message,
          source: "qraftbox",
          aiAgent: AIAgent.CLAUDE,
          status: immediate ? "running" : "queued",
        });
        await fetchOverviewSessions();
      }
      return;
    }

    if (selectedSessionId === null) {
      return;
    }

    await onSubmitPrompt(selectedSessionId, message, immediate);
    setFallbackPendingPrompt(
      selectedSessionId,
      message,
      immediate ? "running" : "queued",
    );
    await fetchOverviewSessions();
  }

  const canCancelSelectedPrompt = $derived.by(() => {
    if (creatingNewSession || selectedSessionId === null) {
      return false;
    }
    const currentStatus = selectedCard?.status ?? selectedSessionMeta.status;
    return (
      typeof onCancelActiveSession === "function" &&
      (currentStatus === "running" || currentStatus === "queued")
    );
  });

  async function handleCancelSelectedPrompt(): Promise<void> {
    if (
      creatingNewSession ||
      selectedSessionId === null ||
      typeof onCancelActiveSession !== "function" ||
      cancellingPrompt
    ) {
      return;
    }

    cancellingPrompt = true;
    cancelPromptError = null;
    try {
      await onCancelActiveSession(selectedSessionId);
      await fetchOverviewSessions();
    } catch (error: unknown) {
      cancelPromptError =
        error instanceof Error ? error.message : "Failed to cancel prompt";
    } finally {
      cancellingPrompt = false;
    }
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
      {filteredCards.length} / {visibleCards.length} sessions
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
      <label class="inline-flex items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          class="rounded border-border-default"
          bind:checked={includeHiddenSessions}
        />
        Include hidden sessions
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
    {:else}
      <div class="space-y-3">
        <div class="overview-grid">
          <button
            type="button"
            class="w-full rounded-lg border border-dashed border-accent-emphasis/60
                   bg-accent-muted/10 hover:bg-accent-muted/20 transition-colors
                   p-2.5 min-h-[142px] flex items-center justify-center"
            aria-label="Create new session"
            onclick={() => {
              selectedSessionId = null;
              creatingNewSession = true;
              selectedSessionMeta = {
                title: "New Session",
                purpose: "New session",
                latestResponse: "Submit the first prompt to start this session",
                source: "qraftbox",
                aiAgent: AIAgent.CLAUDE,
                status: "awaiting_input",
                queuedPromptCount: 0,
              };
              onNewSession?.();
            }}
          >
            <span class="text-6xl leading-none font-light text-accent-fg"
              >+</span
            >
          </button>

          {#each filteredCards as card (card.qraftAiSessionId)}
            <div
              class="w-full text-left rounded-lg border border-border-default bg-bg-secondary
                     hover:border-accent-emphasis/60 hover:bg-bg-hover transition-colors
                     p-2.5 flex flex-col gap-1.5 min-h-[142px] cursor-pointer
                     focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
              role="button"
              tabindex="0"
              aria-label={`${getSessionStatusMeta(card.status).label} ${getRelativeTime(card.updatedAt)} ${card.purpose} ${card.latestResponse}`}
              onclick={() => {
                openSessionById(card.qraftAiSessionId, {
                  title: card.purpose,
                  purpose: card.purpose,
                  latestResponse: card.latestResponse,
                  source: card.source,
                  aiAgent: card.aiAgent,
                  status: card.status,
                  queuedPromptCount: card.queuedPromptCount,
                });
              }}
              onkeydown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openSessionById(card.qraftAiSessionId, {
                    title: card.purpose,
                    purpose: card.purpose,
                    latestResponse: card.latestResponse,
                    source: card.source,
                    aiAgent: card.aiAgent,
                    status: card.status,
                    queuedPromptCount: card.queuedPromptCount,
                  });
                }
              }}
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5">
                  <span
                    class={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${getSessionStatusMeta(card.status).badgeClass}`}
                  >
                    {getSessionStatusMeta(card.status).label}
                  </span>
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide {card.source ===
                    'qraftbox'
                      ? 'bg-success-muted text-success-fg'
                      : card.source === 'claude-cli'
                        ? 'bg-accent-muted text-accent-fg'
                        : card.source === 'codex-cli'
                          ? 'bg-attention-emphasis/20 text-attention-fg'
                        : 'bg-bg-tertiary text-text-secondary'}"
                  >
                    {card.source}
                  </span>
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-bg-tertiary text-text-secondary"
                  >
                    {card.aiAgent}
                  </span>
                  {#if hiddenSessionIds.has(card.qraftAiSessionId)}
                    <span
                      class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-danger-emphasis/15 text-danger-fg"
                    >
                      Hidden
                    </span>
                  {/if}
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] text-text-tertiary"
                    >{getRelativeTime(card.updatedAt)}</span
                  >
                  <button
                    type="button"
                    class="px-2 py-0.5 rounded border border-border-default text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                    onclick={(event) => {
                      event.stopPropagation();
                      void handleToggleSessionHidden(card.qraftAiSessionId);
                    }}
                    title={hiddenSessionIds.has(card.qraftAiSessionId)
                      ? "Show session"
                      : "Hide session"}
                    aria-label={hiddenSessionIds.has(card.qraftAiSessionId)
                      ? "Show session"
                      : "Hide session"}
                  >
                    {hiddenSessionIds.has(card.qraftAiSessionId)
                      ? "Show"
                      : "Hide"}
                  </button>
                </div>
              </div>

              <div class="space-y-1">
                <p
                  class="text-[10px] text-text-tertiary uppercase tracking-wide"
                >
                  Purpose
                </p>
                <p class="text-[11px] text-text-secondary line-clamp-2">
                  {card.purpose}
                </p>
              </div>

              <div class="space-y-1 mt-auto">
                <p
                  class="text-[10px] text-text-tertiary uppercase tracking-wide"
                >
                  Latest Activity
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
            </div>
          {/each}
        </div>

        {#if filteredCards.length === 0}
          <div class="text-sm text-text-secondary">
            {searchQuery.length > 0
              ? "No sessions matched your search."
              : "No sessions found for this project."}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if selectedSessionId !== null || creatingNewSession}
  <AiSessionOverviewPopup
    open={true}
    {contextId}
    sessionId={selectedSessionId ?? null}
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
    isHidden={selectedSessionId !== null &&
      hiddenSessionIds.has(selectedSessionId)}
    onToggleHidden={async () => {
      if (selectedSessionId === null) {
        return;
      }
      await handleToggleSessionHidden(selectedSessionId);
    }}
    onClose={() => {
      creatingNewSession = false;
      selectedSessionId = null;
      cancellingPrompt = false;
      cancelPromptError = null;
    }}
    onSubmitPrompt={(message, immediate) =>
      handlePopupSubmit(message, immediate)}
    showModelProfileSelector={creatingNewSession}
    modelProfiles={newSessionModelProfiles}
    selectedModelProfileId={selectedNewSessionModelProfileId}
    onModelProfileChange={onSelectNewSessionModelProfile}
    canCancelPrompt={canCancelSelectedPrompt}
    cancelPromptInProgress={cancellingPrompt}
    {cancelPromptError}
    onCancelPrompt={handleCancelSelectedPrompt}
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
