<script lang="ts">
  import type { AISession } from "../../../src/types/ai";
  import type { PromptQueueItem } from "../../src/lib/app-api";
  import type { ExtendedSessionEntry } from "../../../src/types/claude-session";
  import { stripSystemTags } from "../../../src/utils/strip-system-tags";
  import AiSessionOverviewPopup from "./AiSessionOverviewPopup.svelte";

  interface OverviewSessionCard {
    readonly qraftAiSessionId: string;
    readonly title: string;
    readonly purpose: string;
    readonly latestResponse: string;
    readonly status: "running" | "queued" | "idle";
    readonly queuedPromptCount: number;
    readonly updatedAt: string;
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

  function normalizeText(text: string): string {
    const strippedText = stripSystemTags(text).replaceAll("\n", " ").trim();
    return strippedText;
  }

  function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}...`;
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

  function queuedPromptMessagesForSession(
    sessionId: string,
  ): readonly string[] {
    const queuedMessages = pendingPrompts
      .filter(
        (pendingPrompt) =>
          pendingPrompt.qraft_ai_session_id === sessionId &&
          pendingPrompt.status === "queued",
      )
      .map((pendingPrompt) => pendingPrompt.message);
    return queuedMessages;
  }

  function buildCardFromSession(
    entry: ExtendedSessionEntry,
  ): OverviewSessionCard {
    const { runningMatch, queuedMatch } = findSessionRuntimeByGroupId(
      entry.qraftAiSessionId,
    );

    const queuedPromptMessages = queuedPromptMessagesForSession(
      entry.qraftAiSessionId,
    );

    const status: OverviewSessionCard["status"] =
      runningMatch !== undefined
        ? "running"
        : queuedMatch !== undefined || queuedPromptMessages.length > 0
          ? "queued"
          : "idle";

    const normalizedSummary = normalizeText(entry.summary);
    const normalizedFirstPrompt = normalizeText(entry.firstPrompt);
    const normalizedRuntimePrompt = normalizeText(
      runningMatch?.prompt ?? queuedMatch?.prompt ?? "",
    );

    const purposeCandidate =
      normalizedRuntimePrompt || normalizedSummary || normalizedFirstPrompt;

    const runtimeLatest = normalizeText(
      runningMatch?.currentActivity ??
        runningMatch?.lastAssistantMessage ??
        queuedMatch?.currentActivity ??
        queuedMatch?.lastAssistantMessage ??
        "",
    );

    const queuedHead = normalizeText(queuedPromptMessages[0] ?? "");

    const latestResponseCandidate =
      runtimeLatest ||
      queuedHead ||
      normalizedSummary ||
      "No active response available";

    return {
      qraftAiSessionId: entry.qraftAiSessionId,
      title: truncate(normalizedFirstPrompt || "Untitled session", 90),
      purpose: truncate(purposeCandidate || "No purpose available", 140),
      latestResponse: truncate(latestResponseCandidate, 160),
      status,
      queuedPromptCount: queuedPromptMessages.length,
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

      const queuedPromptMessages = queuedPromptMessagesForSession(groupId);
      const status: OverviewSessionCard["status"] =
        sessionEntry.state === "running"
          ? "running"
          : queuedPromptMessages.length > 0 || sessionEntry.state === "queued"
            ? "queued"
            : "idle";

      fallbackCards.push({
        qraftAiSessionId: groupId,
        title: truncate(
          normalizeText(sessionEntry.prompt) || "Live session",
          90,
        ),
        purpose: truncate(
          normalizeText(sessionEntry.prompt) || "No purpose available",
          140,
        ),
        latestResponse: truncate(
          normalizeText(
            sessionEntry.currentActivity ??
              sessionEntry.lastAssistantMessage ??
              queuedPromptMessages[0] ??
              "No active response available",
          ),
          160,
        ),
        status,
        queuedPromptCount: queuedPromptMessages.length,
        updatedAt:
          sessionEntry.completedAt ??
          sessionEntry.startedAt ??
          sessionEntry.createdAt,
      });
    }

    return fallbackCards;
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

  const selectedCard = $derived.by(() => {
    if (selectedSessionId === null) {
      return null;
    }
    const card = cards.find(
      (sessionCard) => sessionCard.qraftAiSessionId === selectedSessionId,
    );
    return card ?? null;
  });

  async function fetchOverviewSessions(): Promise<void> {
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

      const response = await fetch(
        `/api/ctx/${contextId}/claude-sessions/sessions?${query.toString()}`,
      );

      if (!response.ok) {
        throw new Error(`Failed to load sessions (${response.status})`);
      }

      const data = (await response.json()) as {
        sessions: ExtendedSessionEntry[];
      };
      sessions = data.sessions;
    } catch (error: unknown) {
      sessions = [];
      sessionsError =
        error instanceof Error ? error.message : "Failed to load sessions";
    } finally {
      sessionsLoading = false;
    }
  }

  $effect(() => {
    void fetchOverviewSessions();
  });

  $effect(() => {
    if (contextId === null) {
      return;
    }
    const refreshTimerId = setInterval(() => {
      void fetchOverviewSessions();
    }, 4000);
    return () => {
      clearInterval(refreshTimerId);
    };
  });

  $effect(() => {
    if (selectedSessionId === null) {
      return;
    }
    const exists = cards.some(
      (sessionCard) => sessionCard.qraftAiSessionId === selectedSessionId,
    );
    if (!exists) {
      selectedSessionId = null;
    }
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
        Monitor active and idle sessions across parallel terminals
      </p>
    </div>
    <div class="text-xs text-text-secondary shrink-0">
      {cards.length} sessions
    </div>
  </div>

  <div class="flex-1 min-h-0 overflow-auto p-4">
    {#if sessionsLoading && cards.length === 0}
      <div class="text-sm text-text-secondary">Loading sessions...</div>
    {:else if sessionsError !== null && cards.length === 0}
      <div class="text-sm text-danger-fg">{sessionsError}</div>
    {:else if cards.length === 0}
      <div class="text-sm text-text-secondary">
        No sessions found for this project.
      </div>
    {:else}
      <div class="overview-grid">
        {#each cards as card (card.qraftAiSessionId)}
          <button
            type="button"
            class="w-full text-left rounded-lg border border-border-default bg-bg-secondary
                   hover:border-accent-emphasis/60 hover:bg-bg-hover transition-colors
                   p-3 flex flex-col gap-2 min-h-[190px]"
            onclick={() => {
              selectedSessionId = card.qraftAiSessionId;
            }}
          >
            <div class="flex items-center justify-between gap-2">
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
              <span class="text-[11px] text-text-tertiary"
                >{getRelativeTime(card.updatedAt)}</span
              >
            </div>

            <h3 class="text-xs font-semibold text-text-primary line-clamp-2">
              {card.title}
            </h3>

            <div class="space-y-1">
              <p class="text-[11px] text-text-tertiary uppercase tracking-wide">
                Purpose
              </p>
              <p class="text-xs text-text-secondary line-clamp-3">
                {card.purpose}
              </p>
            </div>

            <div class="space-y-1 mt-auto">
              <p class="text-[11px] text-text-tertiary uppercase tracking-wide">
                Latest Response
              </p>
              <p class="text-xs text-text-primary line-clamp-3">
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

{#if selectedCard !== null}
  <AiSessionOverviewPopup
    open={true}
    {contextId}
    sessionId={selectedCard.qraftAiSessionId}
    title={selectedCard.title}
    status={selectedCard.status}
    purpose={selectedCard.purpose}
    latestResponse={selectedCard.latestResponse}
    queuedPromptCount={selectedCard.queuedPromptCount}
    onClose={() => {
      selectedSessionId = null;
    }}
    {onResumeSession}
    onSubmitPrompt={(message, immediate) =>
      handlePopupSubmit(selectedCard.qraftAiSessionId, message, immediate)}
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
