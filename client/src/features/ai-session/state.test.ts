import { describe, expect, test } from "bun:test";
import type { QraftAiSessionId } from "../../../../src/types/ai";
import type { PromptQueueItem } from "../../../../client-shared/src/api/ai-sessions";
import {
  applyAiSessionSearchDraft,
  buildAiSessionOverviewRouteSearch,
  canApplyAiSessionScopedRequestResult,
  canLoadMoreAiSessionHistory,
  canClearAiSessionSearch,
  canLoadMoreAiSessionTranscript,
  createAiSessionScopeResetLoadingState,
  createAiSessionDetailRequestKey,
  createAiSessionSubmitContext,
  didAiSessionHistoryFilterChange,
  hasAiSessionActivityEntry,
  createAiSessionHiddenStateMessage,
  createAiSessionScopeResetState,
  createAiSessionHistoryFilters,
  createAiSessionDefaultPromptMessage,
  createAiSessionPromptContextState,
  createAiSessionScopeKey,
  isAiSessionScopeCurrent,
  createLatestAiSessionRequestGuard,
  normalizeAiSessionSearchQuery,
  parseAiSessionOverviewRouteState,
  resolveLoadedAiSessionTranscriptEventCount,
  resolveAiSessionRequestToken,
  resolveAiSessionRuntimeSession,
  resolveNextAiSessionTranscriptOffset,
  resolveAiSessionTargetSessionId,
  resolveAiSessionSubmitTarget,
  mergeAiSessionTranscriptLines,
  shouldShowAiSessionComposer,
  readAiSessionOverviewRouteSearchFromHash,
  replaceAiSessionOverviewRouteSearchInHash,
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

describe("ai-session state helpers", () => {
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
      runningDefaultPromptAction: null,
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
          content: "console.log('solid');",
          mimeType: "text/typescript",
          attachmentKind: "text",
        },
      ],
      selectedReferencePath: "src/app.ts",
      changedFileCount: 1,
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

  test("appends unique transcript lines when loading more events", () => {
    expect(
      mergeAiSessionTranscriptLines(
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

  test("uses loaded transcript event count as the next backend pagination offset", () => {
    expect(
      resolveNextAiSessionTranscriptOffset({
        append: false,
        loadedEventCount: 7,
      }),
    ).toBe(0);

    expect(
      resolveNextAiSessionTranscriptOffset({
        append: true,
        loadedEventCount: 7,
      }),
    ).toBe(7);
  });

  test("tracks loaded transcript events independently from rendered lines", () => {
    expect(
      resolveLoadedAiSessionTranscriptEventCount({
        append: false,
        currentLoadedEventCount: 80,
        responseOffset: 0,
        responseEventCount: 25,
      }),
    ).toBe(25);

    expect(
      resolveLoadedAiSessionTranscriptEventCount({
        append: true,
        currentLoadedEventCount: 25,
        responseOffset: 25,
        responseEventCount: 25,
      }),
    ).toBe(50);

    expect(
      resolveLoadedAiSessionTranscriptEventCount({
        append: true,
        currentLoadedEventCount: 50,
        responseOffset: 25,
        responseEventCount: 10,
      }),
    ).toBe(50);
  });

  test("creates a stable selected-session detail request key", () => {
    expect(
      createAiSessionDetailRequestKey({
        contextId: "ctx-1",
        qraftAiSessionId: asQraftAiSessionId("qs-existing"),
        hasHistoricalSession: true,
      }),
    ).toBe("ctx-1:qs-existing:history");

    expect(
      createAiSessionDetailRequestKey({
        contextId: "ctx-1",
        qraftAiSessionId: asQraftAiSessionId("qs-existing"),
        hasHistoricalSession: false,
      }),
    ).toBe("ctx-1:qs-existing:live");
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

  test("builds a primary-file submit context for the selected text file", () => {
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
      primaryFile: {
        path: "src/app.ts",
        startLine: 1,
        endLine: 2,
        content: "console.log('solid');\nconsole.log('qraftbox');",
      },
      references: [],
      diffSummary: undefined,
    });
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

  test("wraps default ai-session prompts with the internal session-action marker", () => {
    expect(
      createAiSessionDefaultPromptMessage(
        "ai-session-resume",
        "Resume this migration session",
      ),
    ).toBe(
      `<qraftbox-internal-prompt label="ai-session-resume" anchor="session-action-v1">
Resume this migration session
</qraftbox-internal-prompt>`,
    );
  });

  test("parses ai-session overview route state from the browser query string", () => {
    expect(
      parseAiSessionOverviewRouteState(
        "?ai_session_id=qs-existing&session_search=solid%20migration&session_search_in_transcript=false",
      ),
    ).toEqual({
      selectedSessionId: asQraftAiSessionId("qs-existing"),
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
      searchQuery: "solid migration",
      searchInTranscript: true,
    });
  });

  test("builds ai-session overview route search strings without empty values", () => {
    expect(
      buildAiSessionOverviewRouteSearch({
        selectedSessionId: asQraftAiSessionId("qs-existing"),
        searchQuery: "  solid migration  ",
        searchInTranscript: true,
      }),
    ).toBe(
      "?ai_session_id=qs-existing&session_search=solid+migration&session_search_in_transcript=true",
    );

    expect(
      buildAiSessionOverviewRouteSearch({
        selectedSessionId: null,
        searchQuery: "   ",
        searchInTranscript: false,
      }),
    ).toBe("");
  });

  test("reuses url-backed session/search state when the ai-session scope resets", () => {
    const scopeResetState = createAiSessionScopeResetState(
      "?ai_session_id=qs-existing&session_search=solid%20migration&session_search_in_transcript=true",
    );

    expect(scopeResetState.selectedSessionId).toBe(
      asQraftAiSessionId("qs-existing"),
    );
    expect(scopeResetState.searchQuery).toBe("solid migration");
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

  test("replaces ai-session overview route state inside the hash without touching the path", () => {
    expect(
      replaceAiSessionOverviewRouteSearchInHash(
        "#/qraftbox-dd412c/ai-session",
        "?ai_session_id=qs-existing",
      ),
    ).toBe("#/qraftbox-dd412c/ai-session?ai_session_id=qs-existing");

    expect(
      replaceAiSessionOverviewRouteSearchInHash(
        "#/qraftbox-dd412c/ai-session?ai_session_id=qs-old",
        "?ai_session_id=qs-new&session_search=hello",
      ),
    ).toBe(
      "#/qraftbox-dd412c/ai-session?ai_session_id=qs-new&session_search=hello",
    );
  });
});
