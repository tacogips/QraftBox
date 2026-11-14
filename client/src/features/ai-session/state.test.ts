import { describe, expect, test } from "bun:test";
import type { QraftAiSessionId } from "../../../../src/types/ai";
import type {
  AISessionInfo,
  PromptQueueItem,
} from "../../../../client-shared/src/api/ai-sessions";
import {
  AI_SESSION_SHOW_SYSTEM_PROMPTS_STORAGE_KEY,
  applyAiSessionSearchDraft,
  appendAiSessionSubmitContextReferences,
  buildAiSessionScreenHash,
  buildAiSessionOverviewRouteSearch,
  canSubmitAiSessionComposerPrompt,
  canApplyAiSessionScopedRequestResult,
  canLoadMoreAiSessionHistory,
  canClearAiSessionSearch,
  canLoadMoreAiSessionTranscript,
  countAiSessionSystemPromptLines,
  createAiSessionTranscriptPageState,
  createAiSessionScopeResetLoadingState,
  createAiSessionDetailRequestKey,
  createAiSessionImageAttachmentReferences,
  createAiSessionOptimisticUserMessage,
  createAiSessionSubmitContext,
  didAiSessionHistoryFilterChange,
  fetchAiSessionDetailArtifacts,
  filterAiSessionTranscriptSystemPromptLines,
  hasAiSessionActivityEntry,
  createAiSessionHiddenStateMessage,
  createAiSessionScopeResetState,
  createAiSessionHistoryFilters,
  createAiSessionPromptContextState,
  createAiSessionScopeKey,
  isAiSessionScopeCurrent,
  createLatestAiSessionRequestGuard,
  createAiSessionDefaultPromptMessage,
  normalizeAiSessionSearchQuery,
  normalizeAiSessionLiveAssistantStatusText,
  parseAiSessionOverviewRouteState,
  resolveAiSessionSelectedModelState,
  resolveAiSessionSubmitModelProfileId,
  resolveAiSessionRequestToken,
  resolveLatestAiSessionTranscriptOffset,
  resolveAiSessionRuntimeSession,
  resolveAiSessionStreamSessionId,
  resolvePreviousAiSessionTranscriptOffset,
  resolveAiSessionTargetSessionId,
  resolveAiSessionSubmitTarget,
  resolveAiSessionOverviewPollingMode,
  shouldRetireAiSessionLiveAssistantFromTranscript,
  shouldPreserveAiSessionLiveAssistantStateOnStreamOpen,
  mergeAiSessionTranscriptLines,
  shouldAutoRefreshAiSessionOverview,
  shouldShowAiSessionComposer,
  isAiSessionComposerBusy,
  loadAiSessionShowSystemPromptsPreference,
  readAiSessionOverviewRouteSearchFromHash,
  persistAiSessionShowSystemPromptsPreference,
  sanitizeAiSessionAttachmentFileName,
  updateHiddenAiSessionIds,
} from "./state";

function asQraftAiSessionId(value: string): QraftAiSessionId {
  return value as QraftAiSessionId;
}

function createPromptQueueItem(
  overrides: Omit<PromptQueueItem, "project_path"> &
    Partial<Pick<PromptQueueItem, "project_path">>,
): PromptQueueItem {
  return {
    project_path: "/tmp/repo",
    ...overrides,
  };
}

function createActiveSessionInfo(
  overrides: Partial<AISessionInfo> = {},
): AISessionInfo {
  return {
    id: "session-1",
    state: "running",
    prompt: "Review this change",
    projectPath: "/tmp/repo",
    createdAt: "2025-01-01T00:00:00.000Z",
    context: {},
    ...overrides,
  };
}

function createStorageStub(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
  };
}

describe("ai-session state helpers", () => {
  test("loads and persists the shared system prompt visibility preference", () => {
    const storage = createStorageStub();

    expect(loadAiSessionShowSystemPromptsPreference(storage)).toBe(false);

    persistAiSessionShowSystemPromptsPreference(true, storage);
    expect(loadAiSessionShowSystemPromptsPreference(storage)).toBe(true);
    expect(storage.getItem(AI_SESSION_SHOW_SYSTEM_PROMPTS_STORAGE_KEY)).toBe(
      "true",
    );

    persistAiSessionShowSystemPromptsPreference(false, storage);
    expect(loadAiSessionShowSystemPromptsPreference(storage)).toBe(false);
  });

  test("filters system prompt transcript lines when the preference is disabled", () => {
    const transcriptLines = [
      {
        role: "user" as const,
        text: "# AGENTS.md instructions for /repo",
        isInjectedSystemPrompt: true,
      },
      {
        role: "system" as const,
        text: "System prompt",
        isInjectedSystemPrompt: false,
      },
      {
        role: "assistant" as const,
        text: "Answer",
        isInjectedSystemPrompt: false,
      },
    ];

    expect(
      filterAiSessionTranscriptSystemPromptLines({
        transcriptLines,
        showSystemPrompts: false,
      }),
    ).toEqual([
      {
        role: "assistant",
        text: "Answer",
        isInjectedSystemPrompt: false,
      },
    ]);

    expect(
      filterAiSessionTranscriptSystemPromptLines({
        transcriptLines,
        showSystemPrompts: true,
      }),
    ).toEqual(transcriptLines);
    expect(countAiSessionSystemPromptLines(transcriptLines)).toBe(2);
  });

  test("loads the latest transcript page when fetching shared session detail artifacts", async () => {
    const transcriptQueries: Array<{
      offset: number;
      limit: number;
    }> = [];

    const artifacts = await fetchAiSessionDetailArtifacts({
      pageSize: 200,
      loadOlderTranscript: false,
      preserveExistingContent: false,
      hasHistoricalSession: true,
      currentSessionDetail: null,
      currentTranscriptStartOffset: 0,
      currentLoadedEventCount: 0,
      fetchSessionDetail: async () => ({
        sessionId: "claude-1",
      }),
      fetchTranscript: async (query) => {
        transcriptQueries.push(query);
        return {
          events: [],
          qraftAiSessionId: asQraftAiSessionId("qs-latest"),
          offset: query.offset,
          limit: query.limit,
          total: 450,
        };
      },
    });

    expect(transcriptQueries).toEqual([
      { offset: 0, limit: 1 },
      { offset: 250, limit: 200 },
    ]);
    expect(artifacts.sessionDetail).toEqual({
      sessionId: "claude-1",
    });
    expect(artifacts.transcript?.offset).toBe(250);
  });

  test("builds shared transcript page state from the latest transcript response", () => {
    expect(
      createAiSessionTranscriptPageState({
        currentTranscriptLines: [{ id: "old-1" }],
        nextTranscriptLines: [{ id: "new-1" }, { id: "new-2" }],
        currentLoadedEventCount: 10,
        loadOlderTranscript: false,
        transcriptOffset: 250,
        transcriptTotal: 450,
        transcriptEventCount: 2,
      }),
    ).toEqual({
      transcriptLines: [{ id: "new-1" }, { id: "new-2" }],
      loadedEventCount: 2,
      startOffset: 250,
      totalCount: 450,
    });
  });

  test("builds a stable scope key from context and project path", () => {
    expect(createAiSessionScopeKey("ctx-1", "/tmp/repo")).toBe(
      "ctx-1:/tmp/repo",
    );
    expect(createAiSessionScopeKey(null, "/tmp/repo")).toBeNull();
    expect(createAiSessionScopeKey("ctx-1", "")).toBeNull();
  });

  test("detects whether async ai-session work still belongs to the active scope", () => {
    expect(
      isAiSessionScopeCurrent({
        expectedScopeKey: "ctx-1:/tmp/repo",
        contextId: "ctx-1",
        projectPath: "/tmp/repo",
      }),
    ).toBe(true);

    expect(
      isAiSessionScopeCurrent({
        expectedScopeKey: "ctx-1:/tmp/repo",
        contextId: "ctx-2",
        projectPath: "/tmp/repo",
      }),
    ).toBe(false);
  });

  test("treats queued prompts as live ai-session activity when preserving selection", () => {
    expect(
      hasAiSessionActivityEntry({
        qraftAiSessionId: asQraftAiSessionId("qs-queued"),
        activeSessions: [],
        promptQueue: [
          createPromptQueueItem({
            id: "prompt-1",
            message: "Queued follow-up",
            status: "queued",
            created_at: "2026-03-09T06:00:00.000Z",
            worktree_id: "wt-1",
            qraft_ai_session_id: asQraftAiSessionId("qs-queued"),
          }),
        ],
        historicalSessions: [],
      }),
    ).toBe(true);

    expect(
      hasAiSessionActivityEntry({
        qraftAiSessionId: asQraftAiSessionId("qs-missing"),
        activeSessions: [],
        promptQueue: [
          createPromptQueueItem({
            id: "prompt-1",
            message: "Queued follow-up",
            status: "queued",
            created_at: "2026-03-09T06:00:00.000Z",
            worktree_id: "wt-1",
            qraft_ai_session_id: asQraftAiSessionId("qs-queued"),
          }),
        ],
        historicalSessions: [],
      }),
    ).toBe(false);
  });

  test("resolves the running runtime session from either runtime id or client session id", () => {
    const activeSessions = [
      {
        id: "qs-runtime" as QraftAiSessionId,
        state: "running",
        prompt: "say hello",
        projectPath: "/tmp/repo",
        createdAt: "2026-03-11T07:40:00.000Z",
        context: { references: [] },
        clientSessionId: "qs-client" as QraftAiSessionId,
      },
    ];

    expect(
      resolveAiSessionRuntimeSession({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-client"),
        activeSessions,
      }),
    ).toEqual(activeSessions[0]);

    expect(
      resolveAiSessionRuntimeSession({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-runtime"),
        activeSessions,
      }),
    ).toEqual(activeSessions[0]);

    expect(
      resolveAiSessionRuntimeSession({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-missing"),
        activeSessions,
      }),
    ).toBeNull();
  });

  test("prefers a direct submit stream session id for the selected qraft session", () => {
    const runtimeSession = {
      id: "qs-runtime-fallback" as QraftAiSessionId,
      state: "running",
      prompt: "say hello",
      projectPath: "/tmp/repo",
      createdAt: "2026-03-11T07:40:00.000Z",
      context: { references: [] },
      clientSessionId: "qs-client" as QraftAiSessionId,
    };

    expect(
      resolveAiSessionStreamSessionId({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-client"),
        preferredRuntimeSessionId: asQraftAiSessionId("qs-runtime-direct"),
        preferredRuntimeSessionOwnerQraftAiSessionId:
          asQraftAiSessionId("qs-client"),
        runtimeSession,
      }),
    ).toBe(asQraftAiSessionId("qs-runtime-direct"));

    expect(
      resolveAiSessionStreamSessionId({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-other"),
        preferredRuntimeSessionId: asQraftAiSessionId("qs-runtime-direct"),
        preferredRuntimeSessionOwnerQraftAiSessionId:
          asQraftAiSessionId("qs-client"),
        runtimeSession,
      }),
    ).toBe(asQraftAiSessionId("qs-runtime-fallback"));

    expect(
      resolveAiSessionStreamSessionId({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-other"),
        preferredRuntimeSessionId: null,
        preferredRuntimeSessionOwnerQraftAiSessionId: null,
        runtimeSession: null,
      }),
    ).toBeNull();
  });

  test("preserves submit-time assistant thinking state while the direct stream opens", () => {
    expect(
      shouldPreserveAiSessionLiveAssistantStateOnStreamOpen({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-client"),
        streamSessionId: asQraftAiSessionId("qs-runtime-direct"),
        preferredRuntimeSessionId: asQraftAiSessionId("qs-runtime-direct"),
        preferredRuntimeSessionOwnerQraftAiSessionId:
          asQraftAiSessionId("qs-client"),
        liveAssistantPhase: "starting",
      }),
    ).toBe(true);

    expect(
      shouldPreserveAiSessionLiveAssistantStateOnStreamOpen({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-client"),
        streamSessionId: asQraftAiSessionId("qs-runtime-direct"),
        preferredRuntimeSessionId: asQraftAiSessionId("qs-runtime-direct"),
        preferredRuntimeSessionOwnerQraftAiSessionId:
          asQraftAiSessionId("qs-client"),
        liveAssistantPhase: "thinking",
      }),
    ).toBe(true);

    expect(
      shouldPreserveAiSessionLiveAssistantStateOnStreamOpen({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-client"),
        streamSessionId: asQraftAiSessionId("qs-runtime-direct"),
        preferredRuntimeSessionId: asQraftAiSessionId("qs-runtime-direct"),
        preferredRuntimeSessionOwnerQraftAiSessionId:
          asQraftAiSessionId("qs-client"),
        liveAssistantPhase: "streaming",
      }),
    ).toBe(false);

    expect(
      shouldPreserveAiSessionLiveAssistantStateOnStreamOpen({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-client"),
        streamSessionId: asQraftAiSessionId("qs-runtime-fallback"),
        preferredRuntimeSessionId: asQraftAiSessionId("qs-runtime-direct"),
        preferredRuntimeSessionOwnerQraftAiSessionId:
          asQraftAiSessionId("qs-client"),
        liveAssistantPhase: "starting",
      }),
    ).toBe(false);
  });

  test("normalizes opaque live assistant lifecycle markers to a stable thinking label", () => {
    expect(normalizeAiSessionLiveAssistantStatusText("TurnStarted")).toBe(
      "Thinking...",
    );
    expect(
      normalizeAiSessionLiveAssistantStatusText("Starting session..."),
    ).toBe("Thinking...");
    expect(normalizeAiSessionLiveAssistantStatusText("Using grep...")).toBe(
      "Using grep...",
    );
    expect(normalizeAiSessionLiveAssistantStatusText("")).toBeNull();
  });

  test("does not retire a new assistant placeholder because the previous turn already ended with an assistant message", () => {
    expect(
      shouldRetireAiSessionLiveAssistantFromTranscript({
        transcriptLines: [
          {
            role: "user",
            text: "say hello",
          },
          {
            role: "assistant",
            text: "Hello.",
          },
        ],
        optimisticAnchorIndex: 2,
        liveAssistantPhase: "starting",
        liveAssistantText: null,
      }),
    ).toBe(false);

    expect(
      shouldRetireAiSessionLiveAssistantFromTranscript({
        transcriptLines: [
          {
            role: "user",
            text: "say hello",
          },
          {
            role: "assistant",
            text: "Hello.",
          },
          {
            role: "user",
            text: "follow up",
          },
          {
            role: "assistant",
            text: "Hello again.",
          },
        ],
        optimisticAnchorIndex: 2,
        liveAssistantPhase: "thinking",
        liveAssistantText: null,
      }),
    ).toBe(true);
  });

  test("retires a streamed assistant row only when the persisted assistant after the submit boundary matches it", () => {
    expect(
      shouldRetireAiSessionLiveAssistantFromTranscript({
        transcriptLines: [
          {
            role: "user",
            text: "say hello",
          },
          {
            role: "assistant",
            text: "Hello.",
          },
          {
            role: "user",
            text: "follow up",
          },
        ],
        optimisticAnchorIndex: 2,
        liveAssistantPhase: "streaming",
        liveAssistantText: "Hello again.",
      }),
    ).toBe(false);

    expect(
      shouldRetireAiSessionLiveAssistantFromTranscript({
        transcriptLines: [
          {
            role: "user",
            text: "say hello",
          },
          {
            role: "assistant",
            text: "Hello.",
          },
          {
            role: "user",
            text: "follow up",
          },
          {
            role: "assistant",
            text: "Hello again.",
          },
        ],
        optimisticAnchorIndex: 2,
        liveAssistantPhase: "streaming",
        liveAssistantText: "Hello again.",
      }),
    ).toBe(true);
  });

  test("prefers the selected session id over the draft id", () => {
    expect(
      resolveAiSessionTargetSessionId({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-existing"),
        draftSessionId: asQraftAiSessionId("qs-draft"),
      }),
    ).toBe(asQraftAiSessionId("qs-existing"));
  });

  test("shows the composer for either a selected session or a draft session", () => {
    expect(
      shouldShowAiSessionComposer({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-existing"),
        isDraftComposerOpen: false,
      }),
    ).toBe(true);

    expect(
      shouldShowAiSessionComposer({
        selectedQraftAiSessionId: null,
        isDraftComposerOpen: true,
      }),
    ).toBe(true);

    expect(
      shouldShowAiSessionComposer({
        selectedQraftAiSessionId: null,
        isDraftComposerOpen: false,
      }),
    ).toBe(false);
  });

  test("keeps default session actions available while disabling empty prompt submission", () => {
    expect(
      isAiSessionComposerBusy({
        submitting: false,
        modelProfilesLoading: false,
        runningDefaultPromptAction: null,
      }),
    ).toBe(false);

    expect(
      canSubmitAiSessionComposerPrompt({
        promptInput: "   ",
        submitting: false,
        modelProfilesLoading: false,
        runningDefaultPromptAction: null,
      }),
    ).toBe(false);

    expect(
      canSubmitAiSessionComposerPrompt({
        promptInput: "Resume the review with fresh context",
        submitting: false,
        modelProfilesLoading: false,
        runningDefaultPromptAction: null,
      }),
    ).toBe(true);

    expect(
      isAiSessionComposerBusy({
        submitting: false,
        modelProfilesLoading: false,
        runningDefaultPromptAction: "ai-session-resume",
      }),
    ).toBe(true);
  });

  test("stops overview auto-refresh while a specific session is open", () => {
    expect(
      shouldAutoRefreshAiSessionOverview({
        selectedQraftAiSessionId: null,
      }),
    ).toBe(true);

    expect(
      shouldAutoRefreshAiSessionOverview({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-open"),
      }),
    ).toBe(false);
  });

  test("uses active polling only when sessions or pending prompts are live", () => {
    expect(
      resolveAiSessionOverviewPollingMode({
        activeSessions: [],
        promptQueue: [],
      }),
    ).toBe("idle");

    expect(
      resolveAiSessionOverviewPollingMode({
        activeSessions: [createActiveSessionInfo()],
        promptQueue: [],
      }),
    ).toBe("active");

    expect(
      resolveAiSessionOverviewPollingMode({
        activeSessions: [],
        promptQueue: [
          createPromptQueueItem({
            id: "prompt-1",
            message: "Queued work",
            status: "queued",
            created_at: "2025-01-01T00:00:00.000Z",
            worktree_id: "wt-1",
          }),
        ],
      }),
    ).toBe("active");

    expect(
      resolveAiSessionOverviewPollingMode({
        activeSessions: [],
        promptQueue: [
          createPromptQueueItem({
            id: "prompt-2",
            message: "Completed work",
            status: "completed",
            created_at: "2025-01-01T00:00:00.000Z",
            worktree_id: "wt-1",
          }),
        ],
      }),
    ).toBe("idle");
  });

  test("preserves restart-from-beginning as a force_new_session request on the selected session", () => {
    expect(
      resolveAiSessionSubmitTarget({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-existing"),
        draftSessionId: asQraftAiSessionId("qs-draft"),
        restartFromBeginning: true,
      }),
    ).toEqual({
      qraftAiSessionId: asQraftAiSessionId("qs-existing"),
      forceNewSession: true,
    });

    expect(
      resolveAiSessionSubmitTarget({
        selectedQraftAiSessionId: null,
        draftSessionId: asQraftAiSessionId("qs-draft"),
        restartFromBeginning: true,
      }),
    ).toEqual({
      qraftAiSessionId: asQraftAiSessionId("qs-draft"),
      forceNewSession: false,
    });
  });

  test("marks older ai-session requests as stale after a new request begins", () => {
    const requestGuard = createLatestAiSessionRequestGuard();
    const firstRequest = requestGuard.issue("ctx-1:/tmp/repo");
    const secondRequest = requestGuard.issue("ctx-1:/tmp/repo");

    expect(requestGuard.isCurrent(firstRequest)).toBe(false);
    expect(requestGuard.isCurrent(secondRequest)).toBe(true);
  });

  test("invalidates in-flight ai-session requests when the scope resets", () => {
    const requestGuard = createLatestAiSessionRequestGuard();
    const inFlightRequest = requestGuard.issue("ctx-1:/tmp/repo");

    requestGuard.invalidate();

    expect(requestGuard.isCurrent(inFlightRequest)).toBe(false);
  });

  test("reuses an existing mutation token across multi-step ai-session work", () => {
    const requestGuard = createLatestAiSessionRequestGuard();
    const initialRequest = requestGuard.issue("ctx-1:/tmp/repo");

    const reusedRequest = resolveAiSessionRequestToken({
      requestGuard,
      scopeKey: "ctx-1:/tmp/repo",
      requestToken: initialRequest,
    });

    expect(reusedRequest).toBe(initialRequest);
    expect(requestGuard.isCurrent(reusedRequest)).toBe(true);
  });

  test("only applies scoped ai-session results while both request token and scope stay current", () => {
    const requestGuard = createLatestAiSessionRequestGuard();
    const requestToken = requestGuard.issue("ctx-1:/tmp/repo");

    expect(
      canApplyAiSessionScopedRequestResult({
        requestGuard,
        requestToken,
        expectedScopeKey: "ctx-1:/tmp/repo",
        contextId: "ctx-1",
        projectPath: "/tmp/repo",
      }),
    ).toBe(true);

    requestGuard.invalidate();

    expect(
      canApplyAiSessionScopedRequestResult({
        requestGuard,
        requestToken,
        expectedScopeKey: "ctx-1:/tmp/repo",
        contextId: "ctx-1",
        projectPath: "/tmp/repo",
      }),
    ).toBe(false);

    const nextRequestToken = requestGuard.issue("ctx-1:/tmp/repo");

    expect(
      canApplyAiSessionScopedRequestResult({
        requestGuard,
        requestToken: nextRequestToken,
        expectedScopeKey: "ctx-1:/tmp/repo",
        contextId: "ctx-2",
        projectPath: "/tmp/repo",
      }),
    ).toBe(false);
  });

  test("normalizes the search query before requesting session history", () => {
    expect(normalizeAiSessionSearchQuery("  continue migration  ")).toBe(
      "continue migration",
    );
    expect(normalizeAiSessionSearchQuery("   ")).toBeUndefined();
  });

  test("keeps ai-session search draft state separate from the applied filter", () => {
    expect(
      applyAiSessionSearchDraft({
        rawSearchQuery: "  continue migration  ",
        searchInTranscript: false,
      }),
    ).toEqual({
      searchQuery: "continue migration",
      searchInTranscript: false,
    });
  });

  test("reports whether more ai-session history can be loaded", () => {
    expect(
      canLoadMoreAiSessionHistory({
        loadedCount: 50,
        totalCount: 120,
      }),
    ).toBe(true);

    expect(
      canLoadMoreAiSessionHistory({
        loadedCount: 120,
        totalCount: 120,
      }),
    ).toBe(false);
  });

  test("detects when popstate changes the applied ai-session history filter", () => {
    expect(
      didAiSessionHistoryFilterChange({
        currentSearchQuery: "continue migration",
        currentSearchInTranscript: true,
        nextOverviewRouteState: {
          selectedSessionId: asQraftAiSessionId("qs-1"),
          isDraftComposerOpen: false,
          searchQuery: "continue migration",
          searchInTranscript: true,
        },
      }),
    ).toBe(false);

    expect(
      didAiSessionHistoryFilterChange({
        currentSearchQuery: "continue migration",
        currentSearchInTranscript: true,
        nextOverviewRouteState: {
          selectedSessionId: asQraftAiSessionId("qs-1"),
          isDraftComposerOpen: false,
          searchQuery: "focus refresh",
          searchInTranscript: true,
        },
      }),
    ).toBe(true);

    expect(
      didAiSessionHistoryFilterChange({
        currentSearchQuery: "continue migration",
        currentSearchInTranscript: true,
        nextOverviewRouteState: {
          selectedSessionId: asQraftAiSessionId("qs-1"),
          isDraftComposerOpen: false,
          searchQuery: "continue migration",
          searchInTranscript: false,
        },
      }),
    ).toBe(true);
  });

  test("treats draft-only and applied search state as clearable", () => {
    expect(
      canClearAiSessionSearch({
        draftSearchQuery: " pending draft ",
        appliedSearchQuery: "",
        draftSearchInTranscript: true,
        appliedSearchInTranscript: true,
      }),
    ).toBe(true);

    expect(
      canClearAiSessionSearch({
        draftSearchQuery: "",
        appliedSearchQuery: "",
        draftSearchInTranscript: false,
        appliedSearchInTranscript: true,
      }),
    ).toBe(true);

    expect(
      canClearAiSessionSearch({
        draftSearchQuery: "",
        appliedSearchQuery: "applied",
        draftSearchInTranscript: true,
        appliedSearchInTranscript: false,
      }),
    ).toBe(true);

    expect(
      canClearAiSessionSearch({
        draftSearchQuery: "",
        appliedSearchQuery: "",
        draftSearchInTranscript: true,
        appliedSearchInTranscript: true,
      }),
    ).toBe(false);
  });

  test("updates hidden ai-session ids without duplicating entries", () => {
    expect(
      updateHiddenAiSessionIds({
        hiddenSessionIds: [
          asQraftAiSessionId("qs-hidden"),
          asQraftAiSessionId("qs-other"),
        ],
        sessionId: asQraftAiSessionId("qs-hidden"),
        hidden: true,
      }),
    ).toEqual([
      asQraftAiSessionId("qs-hidden"),
      asQraftAiSessionId("qs-other"),
    ]);

    expect(
      updateHiddenAiSessionIds({
        hiddenSessionIds: [
          asQraftAiSessionId("qs-hidden"),
          asQraftAiSessionId("qs-other"),
        ],
        sessionId: asQraftAiSessionId("qs-hidden"),
        hidden: false,
      }),
    ).toEqual([asQraftAiSessionId("qs-other")]);
  });

  test("describes hidden-session visibility changes for the overview", () => {
    expect(createAiSessionHiddenStateMessage(true)).toBe(
      "Hidden the selected session from the default overview.",
    );
    expect(createAiSessionHiddenStateMessage(false)).toBe(
      "Restored the selected session to the default overview.",
    );
  });

  test("clears transient loading and action state when the ai-session scope resets", () => {
    expect(createAiSessionScopeResetLoadingState()).toEqual({
      historyLoading: false,
      activityLoading: false,
      modelProfilesLoading: false,
      selectedSessionLoading: false,
      selectedSessionLoadingMore: false,
      submitting: false,
    });
  });

  test("builds transcript-aware session-history filters only when search is active", () => {
    expect(
      createAiSessionHistoryFilters({
        projectPath: "/tmp/repo",
        rawSearchQuery: "  continue migration ",
        searchInTranscript: true,
      }),
    ).toEqual({
      workingDirectoryPrefix: "/tmp/repo",
      searchQuery: "continue migration",
      searchInTranscript: true,
    });

    expect(
      createAiSessionHistoryFilters({
        projectPath: "/tmp/repo",
        rawSearchQuery: "   ",
        searchInTranscript: true,
      }),
    ).toEqual({
      workingDirectoryPrefix: "/tmp/repo",
    });
  });

  test("builds prompt context from the current files selection", () => {
    expect(
      createAiSessionPromptContextState({
        selectedPath: "src/app.ts",
        fileContent: {
          path: "src/app.ts",
          content: "console.log('solid');",
          language: "typescript",
          mimeType: "text/typescript",
        },
        diffOverview: {
          files: [
            {
              path: "src/app.ts",
              status: "modified",
              additions: 3,
              deletions: 1,
              chunks: [],
              isBinary: false,
            },
          ],
        },
      }),
    ).toEqual({
      references: [
        {
          path: "src/app.ts",
          fileName: "app.ts",
          mimeType: "text/typescript",
        },
      ],
      selectedReferencePath: "src/app.ts",
      changedFileCount: 1,
    });
  });

  test("wraps default ai-session prompts with the internal session-action marker", () => {
    expect(
      createAiSessionDefaultPromptMessage(
        "ai-session-purpose",
        "Summarize the initial session goal",
      ),
    ).toBe(
      `<qraftbox-internal-prompt label="ai-session-purpose" anchor="session-action-v1">
Summarize the initial session goal
</qraftbox-internal-prompt>`,
    );
  });

  test("reuses the selected session model profile instead of the draft profile", () => {
    expect(
      resolveAiSessionSubmitModelProfileId({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-existing"),
        selectedSessionModelProfileId: "profile-existing",
        draftModelProfileId: "profile-draft",
      }),
    ).toBe("profile-existing");

    expect(
      resolveAiSessionSubmitModelProfileId({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-existing"),
        selectedSessionModelProfileId: undefined,
        draftModelProfileId: "profile-draft",
      }),
    ).toBeUndefined();

    expect(
      resolveAiSessionSubmitModelProfileId({
        selectedQraftAiSessionId: null,
        selectedSessionModelProfileId: "profile-existing",
        draftModelProfileId: "profile-draft",
      }),
    ).toBe("profile-draft");
  });

  test("fills missing selected-session model metadata from loaded detail state", () => {
    expect(
      resolveAiSessionSelectedModelState({
        overviewModelState: {
          modelProfileId: undefined,
          modelVendor: "openai",
          modelName: undefined,
        },
        detailModelState: {
          modelProfileId: "profile-detail",
          modelVendor: "anthropic",
          modelName: "claude-sonnet",
        },
      }),
    ).toEqual({
      modelProfileId: "profile-detail",
      modelVendor: "openai",
      modelName: "claude-sonnet",
    });
  });

  test("replaces transcript lines on a fresh selected-session load", () => {
    expect(
      mergeAiSessionTranscriptLines(
        [
          {
            id: "line-1",
            text: "stale",
          },
        ],
        [
          {
            id: "line-2",
            text: "fresh",
          },
        ],
        false,
      ),
    ).toEqual([
      {
        id: "line-2",
        text: "fresh",
      },
    ]);
  });

  test("prepends older unique transcript lines when loading more events", () => {
    expect(
      mergeAiSessionTranscriptLines(
        [
          {
            id: "line-2",
            text: "second",
          },
          {
            id: "line-3",
            text: "third",
          },
        ],
        [
          {
            id: "line-1",
            text: "first",
          },
          {
            id: "line-2",
            text: "second",
          },
        ],
        true,
      ),
    ).toEqual([
      {
        id: "line-1",
        text: "first",
      },
      {
        id: "line-2",
        text: "second",
      },
      {
        id: "line-3",
        text: "third",
      },
    ]);
  });

  test("reports whether selected-session transcript pagination can continue", () => {
    expect(
      canLoadMoreAiSessionTranscript({
        loadedEventCount: 50,
        totalCount: 120,
      }),
    ).toBe(true);
    expect(
      canLoadMoreAiSessionTranscript({
        loadedEventCount: 120,
        totalCount: 120,
      }),
    ).toBe(false);
  });

  test("resolves the latest transcript offset from total event count", () => {
    expect(
      resolveLatestAiSessionTranscriptOffset({
        totalCount: 7,
        pageSize: 200,
      }),
    ).toBe(0);

    expect(
      resolveLatestAiSessionTranscriptOffset({
        totalCount: 275,
        pageSize: 200,
      }),
    ).toBe(75);
  });

  test("resolves the previous transcript offset when loading older history", () => {
    expect(
      resolvePreviousAiSessionTranscriptOffset({
        currentOffset: 80,
        pageSize: 25,
      }),
    ).toBe(55);

    expect(
      resolvePreviousAiSessionTranscriptOffset({
        currentOffset: 10,
        pageSize: 25,
      }),
    ).toBe(0);
  });

  test("creates a stable selected-session detail request key", () => {
    expect(
      createAiSessionDetailRequestKey({
        contextId: "ctx-1",
        qraftAiSessionId: asQraftAiSessionId("qs-existing"),
      }),
    ).toBe("ctx-1:qs-existing");

    expect(
      createAiSessionDetailRequestKey({
        contextId: "ctx-1",
        qraftAiSessionId: asQraftAiSessionId("qs-existing"),
      }),
    ).toBe("ctx-1:qs-existing");
  });

  test("omits prompt file references when no file is selected", () => {
    expect(
      createAiSessionPromptContextState({
        selectedPath: null,
        fileContent: null,
        diffOverview: {
          files: [],
        },
      }),
    ).toEqual({
      references: [],
      selectedReferencePath: null,
      changedFileCount: 0,
    });
  });

  test("builds a reference-only submit context for the selected text file without line selection", () => {
    expect(
      createAiSessionSubmitContext({
        selectedPath: "src/app.ts",
        fileContent: {
          path: "src/app.ts",
          content: "console.log('solid');\nconsole.log('qraftbox');",
          language: "typescript",
          mimeType: "text/typescript",
        },
        diffOverview: {
          files: [
            {
              path: "src/app.ts",
              status: "modified",
              additions: 2,
              deletions: 0,
              chunks: [],
              isBinary: false,
            },
          ],
        },
      }),
    ).toEqual({
      primaryFile: undefined,
      references: [
        {
          path: "src/app.ts",
          fileName: "app.ts",
          mimeType: "text/typescript",
        },
      ],
      diffSummary: undefined,
    });
  });

  test("builds the optimistic user message from the submitted prompt payload", () => {
    const optimisticUserMessage = createAiSessionOptimisticUserMessage({
      message: "say hello",
      submitContext: createAiSessionSubmitContext({
        selectedPath: "client/bun.lock",
        fileContent: {
          path: "client/bun.lock",
          content: "lockfile",
          language: "text",
          mimeType: "text/plain",
        },
        diffOverview: {
          files: [],
        },
      }),
    });

    expect(optimisticUserMessage.startsWith("# Context\n")).toBe(true);
    expect(optimisticUserMessage).toContain("## Referenced Files");
    expect(optimisticUserMessage).toContain("### File: client/bun.lock");
    expect(optimisticUserMessage.endsWith("say hello")).toBe(true);
  });

  test("falls back to attachment-style references for binary prompt context", () => {
    expect(
      createAiSessionSubmitContext({
        selectedPath: "docs/spec.pdf",
        fileContent: {
          path: "docs/spec.pdf",
          content: "",
          language: "pdf",
          mimeType: "application/pdf",
          isPdf: true,
        },
        diffOverview: {
          files: [],
        },
      }),
    ).toEqual({
      primaryFile: undefined,
      references: [
        {
          path: "docs/spec.pdf",
          fileName: "spec.pdf",
          mimeType: "application/pdf",
          attachmentKind: "binary",
        },
      ],
      diffSummary: undefined,
    });
  });

  test("creates upload references for image attachments", () => {
    expect(
      createAiSessionImageAttachmentReferences([
        {
          fileName: "design/mockup\\final.png",
          mimeType: "image/png",
          base64: "ZmFrZS1pbWFnZQ==",
        },
      ]),
    ).toEqual([
      {
        path: "upload/design_mockup_final.png",
        fileName: "design/mockup\\final.png",
        mimeType: "image/png",
        encoding: "base64",
        content: "ZmFrZS1pbWFnZQ==",
        attachmentKind: "image",
      },
    ]);
  });

  test("appends image attachment references without dropping primary file context", () => {
    expect(
      appendAiSessionSubmitContextReferences({
        submitContext: {
          primaryFile: {
            path: "src/app.ts",
            startLine: 1,
            endLine: 1,
            content: "console.log('qraftbox');",
          },
          references: [],
          diffSummary: undefined,
        },
        additionalReferences: createAiSessionImageAttachmentReferences([
          {
            fileName: "mockup.png",
            mimeType: "image/png",
            base64: "ZmFrZS1pbWFnZQ==",
          },
        ]),
      }),
    ).toEqual({
      primaryFile: {
        path: "src/app.ts",
        startLine: 1,
        endLine: 1,
        content: "console.log('qraftbox');",
      },
      references: [
        {
          path: "upload/mockup.png",
          fileName: "mockup.png",
          mimeType: "image/png",
          encoding: "base64",
          content: "ZmFrZS1pbWFnZQ==",
          attachmentKind: "image",
        },
      ],
      diffSummary: undefined,
    });
  });

  test("sanitizes attachment file names for upload references", () => {
    expect(sanitizeAiSessionAttachmentFileName("nested/path\\image.png")).toBe(
      "nested_path_image.png",
    );
  });

  test("parses ai-session overview route state from the browser query string", () => {
    expect(
      parseAiSessionOverviewRouteState(
        "?ai_session_id=qs-existing&session_search=solid%20migration&session_search_in_transcript=false",
      ),
    ).toEqual({
      selectedSessionId: asQraftAiSessionId("qs-existing"),
      isDraftComposerOpen: false,
      searchQuery: "solid migration",
      searchInTranscript: false,
    });
  });

  test("treats a missing ai-session id query param as no selection", () => {
    expect(
      parseAiSessionOverviewRouteState(
        "?session_search=solid%20migration&session_search_in_transcript=true",
      ),
    ).toEqual({
      selectedSessionId: null,
      isDraftComposerOpen: false,
      searchQuery: "solid migration",
      searchInTranscript: true,
    });
  });

  test("parses a new-session modal flag from the browser query string", () => {
    expect(
      parseAiSessionOverviewRouteState(
        "?new_session=true&session_search=solid%20migration&session_search_in_transcript=true",
      ),
    ).toEqual({
      selectedSessionId: null,
      isDraftComposerOpen: true,
      searchQuery: "solid migration",
      searchInTranscript: true,
    });
  });

  test("builds ai-session overview route search strings without empty values", () => {
    expect(
      buildAiSessionOverviewRouteSearch({
        selectedSessionId: asQraftAiSessionId("qs-existing"),
        isDraftComposerOpen: false,
        searchQuery: "  solid migration  ",
        searchInTranscript: true,
      }),
    ).toBe(
      "?ai_session_id=qs-existing&session_search=solid+migration&session_search_in_transcript=true",
    );

    expect(
      buildAiSessionOverviewRouteSearch({
        selectedSessionId: null,
        isDraftComposerOpen: false,
        searchQuery: "   ",
        searchInTranscript: false,
      }),
    ).toBe("");

    expect(
      buildAiSessionOverviewRouteSearch({
        selectedSessionId: null,
        isDraftComposerOpen: true,
        searchQuery: "",
        searchInTranscript: true,
      }),
    ).toBe("?new_session=true");
  });

  test("builds ai-session screen hashes through the feature-owned route helper", () => {
    expect(
      buildAiSessionScreenHash({
        projectSlug: "repo-slug",
        overviewRouteState: {
          selectedSessionId: asQraftAiSessionId("qs-selected"),
          isDraftComposerOpen: false,
          searchQuery: "resume",
          searchInTranscript: false,
        },
      }),
    ).toBe(
      "#/repo-slug/ai-session?ai_session_id=qs-selected&session_search=resume&session_search_in_transcript=false",
    );

    expect(
      buildAiSessionScreenHash({
        projectSlug: null,
        overviewRouteState: {
          selectedSessionId: null,
          isDraftComposerOpen: false,
          searchQuery: "",
          searchInTranscript: true,
        },
      }),
    ).toBe("#/ai-session");

    expect(
      buildAiSessionScreenHash({
        projectSlug: null,
        overviewRouteState: {
          selectedSessionId: null,
          isDraftComposerOpen: true,
          searchQuery: "",
          searchInTranscript: true,
        },
      }),
    ).toBe("#/ai-session?new_session=true");
  });

  test("reuses url-backed session/search state when the ai-session scope resets", () => {
    const scopeResetState = createAiSessionScopeResetState(
      "?ai_session_id=qs-existing&session_search=solid%20migration&session_search_in_transcript=true",
    );

    expect(scopeResetState.selectedSessionId).toBe(
      asQraftAiSessionId("qs-existing"),
    );
    expect(scopeResetState.isDraftComposerOpen).toBe(false);
    expect(scopeResetState.searchQuery).toBe("solid migration");
    expect(scopeResetState.searchInTranscript).toBe(true);
    expect(scopeResetState.promptInput).toBe("");
    expect(scopeResetState.draftSessionId.length).toBeGreaterThan(0);
  });

  test("reuses the new-session route flag when the ai-session scope resets", () => {
    const scopeResetState = createAiSessionScopeResetState("?new_session=true");

    expect(scopeResetState.selectedSessionId).toBeNull();
    expect(scopeResetState.isDraftComposerOpen).toBe(true);
    expect(scopeResetState.searchQuery).toBe("");
    expect(scopeResetState.searchInTranscript).toBe(true);
    expect(scopeResetState.promptInput).toBe("");
    expect(scopeResetState.draftSessionId.length).toBeGreaterThan(0);
  });

  test("reads ai-session overview route state from the hash query", () => {
    expect(
      readAiSessionOverviewRouteSearchFromHash(
        "#/qraftbox-dd412c/ai-session?ai_session_id=qs-existing&session_search=hello",
      ),
    ).toBe("?ai_session_id=qs-existing&session_search=hello");

    expect(
      readAiSessionOverviewRouteSearchFromHash("#/qraftbox-dd412c/ai-session"),
    ).toBe("");
  });
});
