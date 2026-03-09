import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  untrack,
} from "solid-js";
import {
  createAiSessionsApiClient,
  type AISessionInfo,
  type PromptQueueItem,
} from "../../../../client-shared/src/api/ai-sessions";
import { createModelConfigApiClient } from "../../../../client-shared/src/api/model-config";
import type { DiffOverviewState } from "../../../../client-shared/src/contracts/diff";
import type { FileContent } from "../../../../client-shared/src/contracts/files";
import {
  generateQraftAiSessionId,
  type QraftAiSessionId,
} from "../../../../src/types/ai";
import type { ExtendedSessionEntry } from "../../../../src/types/claude-session";
import type { ModelProfile } from "../../../../src/types/model-config";
import {
  type AiSessionTranscriptLine,
  buildAiSessionListEntries,
  buildAiSessionTranscriptLines,
  describeAiSessionPromptContext,
  resolveAiSessionCancelAction,
  describeAiSessionEntryModel,
  describeAiSessionModelProfile,
  describeAiSessionTarget,
  formatAiSessionTimestamp,
  getQueuedPromptSummary,
} from "./presentation";
import {
  applyAiSessionSearchDraft,
  canApplyAiSessionScopedRequestResult,
  canLoadMoreAiSessionHistory,
  canLoadMoreAiSessionTranscript,
  canClearAiSessionSearch,
  type AiSessionRequestToken,
  buildAiSessionOverviewRouteSearch,
  createAiSessionSubmitContext,
  didAiSessionHistoryFilterChange,
  createAiSessionScopeResetState,
  hasAiSessionActivityEntry,
  createAiSessionHistoryFilters,
  createAiSessionDefaultPromptMessage,
  createAiSessionHiddenStateMessage,
  createAiSessionScopeKey,
  createAiSessionScopeResetLoadingState,
  createAiSessionPromptContextState,
  createLatestAiSessionRequestGuard,
  isAiSessionScopeCurrent,
  mergeAiSessionTranscriptLines,
  parseAiSessionOverviewRouteState,
  resolveLoadedAiSessionTranscriptEventCount,
  resolveNextAiSessionTranscriptOffset,
  resolveAiSessionRequestToken,
  resolveAiSessionTargetSessionId,
  resolveAiSessionSubmitTarget,
  updateHiddenAiSessionIds,
} from "./state";

export interface AiSessionScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly projectPath: string;
  readonly selectedPath: string | null;
  readonly fileContent: FileContent | null;
  readonly diffOverview: DiffOverviewState;
  readonly onOpenFilesScreen: (() => void) | undefined;
}

const ACTIVE_SESSION_POLL_MS = 5000;
const SESSION_HISTORY_PAGE_SIZE = 50;
const SELECTED_SESSION_TRANSCRIPT_PAGE_SIZE = 200;

export function AiSessionScreen(props: AiSessionScreenProps): JSX.Element {
  const initialOverviewRouteState = parseAiSessionOverviewRouteState(
    window.location.search,
  );
  const aiSessionsApi = createAiSessionsApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const modelConfigApi = createModelConfigApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });

  const [activeSessions, setActiveSessions] = createSignal<
    readonly AISessionInfo[]
  >([]);
  const [historicalSessions, setHistoricalSessions] = createSignal<
    readonly ExtendedSessionEntry[]
  >([]);
  const [promptQueue, setPromptQueue] = createSignal<
    readonly PromptQueueItem[]
  >([]);
  const [selectedQraftAiSessionId, setSelectedQraftAiSessionId] =
    createSignal<QraftAiSessionId | null>(
      initialOverviewRouteState.selectedSessionId,
    );
  const [draftSessionId, setDraftSessionId] = createSignal<QraftAiSessionId>(
    generateQraftAiSessionId(),
  );
  const [searchDraftQuery, setSearchDraftQuery] = createSignal(
    initialOverviewRouteState.searchQuery,
  );
  const [searchDraftInTranscript, setSearchDraftInTranscript] = createSignal(
    initialOverviewRouteState.searchInTranscript,
  );
  const [searchQuery, setSearchQuery] = createSignal(
    initialOverviewRouteState.searchQuery,
  );
  const [searchInTranscript, setSearchInTranscript] = createSignal(
    initialOverviewRouteState.searchInTranscript,
  );
  const [promptInput, setPromptInput] = createSignal("");
  const [hiddenSessionIds, setHiddenSessionIds] = createSignal<
    readonly QraftAiSessionId[]
  >([]);
  const [includeHiddenSessions, setIncludeHiddenSessions] = createSignal(false);
  const [modelProfiles, setModelProfiles] = createSignal<
    readonly ModelProfile[]
  >([]);
  const [selectedModelProfileId, setSelectedModelProfileId] = createSignal<
    string | null
  >(null);
  const [historyLoading, setHistoryLoading] = createSignal(false);
  const [historyLoadingMore, setHistoryLoadingMore] = createSignal(false);
  const [historyRequestedLimit, setHistoryRequestedLimit] = createSignal(
    SESSION_HISTORY_PAGE_SIZE,
  );
  const [historyTotal, setHistoryTotal] = createSignal(0);
  const [activityLoading, setActivityLoading] = createSignal(false);
  const [modelProfilesLoading, setModelProfilesLoading] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [runningDefaultPromptAction, setRunningDefaultPromptAction] =
    createSignal<string | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] =
    createSignal<ExtendedSessionEntry | null>(null);
  const [selectedSessionTranscript, setSelectedSessionTranscript] =
    createSignal<readonly AiSessionTranscriptLine[]>([]);
  const [
    selectedSessionTranscriptLoadedEventCount,
    setSelectedSessionTranscriptLoadedEventCount,
  ] = createSignal(0);
  const [selectedSessionTranscriptTotal, setSelectedSessionTranscriptTotal] =
    createSignal(0);
  const [selectedSessionLoading, setSelectedSessionLoading] =
    createSignal(false);
  const [selectedSessionLoadingMore, setSelectedSessionLoadingMore] =
    createSignal(false);
  const [selectedSessionError, setSelectedSessionError] = createSignal<
    string | null
  >(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [submitResultMessage, setSubmitResultMessage] = createSignal<
    string | null
  >(null);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let activeScopeKey: string | null = null;
  const activityRequestGuard = createLatestAiSessionRequestGuard();
  const hiddenSessionsRequestGuard = createLatestAiSessionRequestGuard();
  const modelProfilesRequestGuard = createLatestAiSessionRequestGuard();
  const selectedSessionRequestGuard = createLatestAiSessionRequestGuard();
  const mutationRequestGuard = createLatestAiSessionRequestGuard();

  const selectedSessionId = () =>
    resolveAiSessionTargetSessionId({
      selectedQraftAiSessionId: selectedQraftAiSessionId(),
      draftSessionId: draftSessionId(),
    });
  const promptContextState = () =>
    createAiSessionPromptContextState({
      selectedPath: props.selectedPath,
      fileContent: props.fileContent,
      diffOverview: props.diffOverview,
    });
  const sessionEntries = () =>
    buildAiSessionListEntries(
      activeSessions(),
      promptQueue(),
      historicalSessions(),
    );
  const selectedSessionEntry = () =>
    sessionEntries().find(
      (sessionEntry) =>
        sessionEntry.qraftAiSessionId === selectedQraftAiSessionId(),
    ) ?? null;
  const selectedSessionDetailTarget = () => {
    const sessionEntry = selectedSessionEntry();
    if (props.contextId === null || sessionEntry === null) {
      return null;
    }

    return {
      contextId: props.contextId,
      qraftAiSessionId: sessionEntry.qraftAiSessionId,
      hasHistoricalSession: sessionEntry.historySessionId !== null,
    };
  };
  const selectedSessionCancelAction = () => {
    const sessionEntry = selectedSessionEntry();
    return sessionEntry === null
      ? null
      : resolveAiSessionCancelAction(sessionEntry);
  };
  const visibleSessionEntries = () => {
    if (includeHiddenSessions()) {
      return sessionEntries();
    }

    const hiddenSessionIdSet = new Set(hiddenSessionIds());
    return sessionEntries().filter(
      (sessionEntry) =>
        hiddenSessionIdSet.has(sessionEntry.qraftAiSessionId) === false,
    );
  };

  async function refreshHiddenSessions(scopeKey: string): Promise<void> {
    const requestToken = hiddenSessionsRequestGuard.issue(scopeKey);

    try {
      const nextHiddenSessionIds = await aiSessionsApi.fetchHiddenSessionIds();
      if (
        !canApplyAiSessionScopedRequestResult({
          requestGuard: hiddenSessionsRequestGuard,
          requestToken,
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }

      setHiddenSessionIds(nextHiddenSessionIds);
    } catch {
      if (
        !canApplyAiSessionScopedRequestResult({
          requestGuard: hiddenSessionsRequestGuard,
          requestToken,
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }

      setHiddenSessionIds([]);
    }
  }

  async function refreshModelProfiles(scopeKey: string): Promise<void> {
    const requestToken = modelProfilesRequestGuard.issue(scopeKey);
    setModelProfilesLoading(true);

    try {
      const modelConfigState = await modelConfigApi.fetchModelConfigState();
      if (!modelProfilesRequestGuard.isCurrent(requestToken)) {
        return;
      }
      setModelProfiles(modelConfigState.profiles);
      setSelectedModelProfileId(
        modelConfigState.operationBindings.aiDefaultProfileId,
      );
    } catch (error) {
      if (!modelProfilesRequestGuard.isCurrent(requestToken)) {
        return;
      }
      setModelProfiles([]);
      setSelectedModelProfileId(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load model profiles",
      );
    } finally {
      if (modelProfilesRequestGuard.isCurrent(requestToken)) {
        setModelProfilesLoading(false);
      }
    }
  }

  async function refreshActivity(
    contextId: string,
    projectPath: string,
  ): Promise<void> {
    const scopeKey = createAiSessionScopeKey(contextId, projectPath);
    if (scopeKey === null) {
      return;
    }

    const requestToken = activityRequestGuard.issue(scopeKey);
    const sessionFilters = untrack(() =>
      createAiSessionHistoryFilters({
        projectPath,
        rawSearchQuery: searchQuery(),
        searchInTranscript: searchInTranscript(),
      }),
    );
    const requestedHistoryLimit = untrack(() => historyRequestedLimit());
    setActivityLoading(true);

    try {
      const [nextActiveSessions, nextPromptQueue, nextHistory] =
        await Promise.all([
          aiSessionsApi.fetchActiveSessions({
            projectPath,
          }),
          aiSessionsApi.fetchPromptQueue({
            projectPath,
          }),
          aiSessionsApi.fetchClaudeSessions(contextId, sessionFilters, {
            offset: 0,
            limit: requestedHistoryLimit,
          }),
        ]);

      if (!activityRequestGuard.isCurrent(requestToken)) {
        return;
      }

      setActiveSessions(nextActiveSessions);
      setPromptQueue(nextPromptQueue);
      setHistoricalSessions(nextHistory.sessions);
      setHistoryTotal(nextHistory.total);
      setErrorMessage(null);
      const liveSessionId = selectedQraftAiSessionId();
      if (
        liveSessionId !== null &&
        !hasAiSessionActivityEntry({
          qraftAiSessionId: liveSessionId,
          activeSessions: nextActiveSessions,
          promptQueue: nextPromptQueue,
          historicalSessions: nextHistory.sessions,
        })
      ) {
        setSelectedQraftAiSessionId(null);
      }
    } catch (error) {
      if (!activityRequestGuard.isCurrent(requestToken)) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load AI sessions",
      );
    } finally {
      if (activityRequestGuard.isCurrent(requestToken)) {
        setActivityLoading(false);
        setHistoryLoading(false);
        setHistoryLoadingMore(false);
      }
    }
  }

  function restartPolling(contextId: string, projectPath: string): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }
    pollTimer = setInterval(() => {
      void refreshActivity(contextId, projectPath);
    }, ACTIVE_SESSION_POLL_MS);
  }

  createEffect(() => {
    const contextId = props.contextId;
    const projectPath = props.projectPath;
    const nextScopeKey = createAiSessionScopeKey(contextId, projectPath);

    if (activeScopeKey !== nextScopeKey) {
      activeScopeKey = nextScopeKey;
      const scopeResetState = createAiSessionScopeResetState(
        window.location.search,
      );
      setSelectedQraftAiSessionId(scopeResetState.selectedSessionId);
      setDraftSessionId(scopeResetState.draftSessionId);
      setPromptInput(scopeResetState.promptInput);
      setSearchDraftQuery(scopeResetState.searchQuery);
      setSearchDraftInTranscript(scopeResetState.searchInTranscript);
      setSearchQuery(scopeResetState.searchQuery);
      setSearchInTranscript(scopeResetState.searchInTranscript);
      setHistoryRequestedLimit(SESSION_HISTORY_PAGE_SIZE);
    }

    activityRequestGuard.invalidate();
    hiddenSessionsRequestGuard.invalidate();
    modelProfilesRequestGuard.invalidate();
    setSubmitResultMessage(null);
    setErrorMessage(null);
    setActiveSessions([]);
    setPromptQueue([]);
    setHistoricalSessions([]);
    setHistoryTotal(0);
    selectedSessionRequestGuard.invalidate();
    setSelectedSessionDetail(null);
    setSelectedSessionTranscript([]);
    setSelectedSessionTranscriptLoadedEventCount(0);
    setSelectedSessionTranscriptTotal(0);
    setSelectedSessionError(null);
    const resetLoadingState = createAiSessionScopeResetLoadingState();
    setHistoryLoading(resetLoadingState.historyLoading);
    setActivityLoading(resetLoadingState.activityLoading);
    setModelProfilesLoading(resetLoadingState.modelProfilesLoading);
    setSelectedSessionLoading(resetLoadingState.selectedSessionLoading);
    setSelectedSessionLoadingMore(resetLoadingState.selectedSessionLoadingMore);
    setSubmitting(resetLoadingState.submitting);
    setRunningDefaultPromptAction(resetLoadingState.runningDefaultPromptAction);
    setHistoryLoadingMore(false);

    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    mutationRequestGuard.invalidate();

    if (contextId === null || projectPath.length === 0) {
      setHiddenSessionIds([]);
      setModelProfiles([]);
      setSelectedModelProfileId(null);
      return;
    }

    setHistoryLoading(true);
    void refreshActivity(contextId, projectPath);
    void refreshHiddenSessions(nextScopeKey);
    void refreshModelProfiles(nextScopeKey);
    restartPolling(contextId, projectPath);
  });

  async function refreshSelectedSessionArtifacts(params: {
    readonly contextId: string;
    readonly qraftAiSessionId: QraftAiSessionId;
    readonly hasHistoricalSession: boolean;
    readonly appendTranscript: boolean;
  }): Promise<void> {
    const requestScopeKey = `${params.contextId}:${params.qraftAiSessionId}`;
    const requestToken = selectedSessionRequestGuard.issue(requestScopeKey);
    const transcriptOffset = resolveNextAiSessionTranscriptOffset({
      append: params.appendTranscript,
      loadedEventCount: selectedSessionTranscriptLoadedEventCount(),
    });

    if (params.appendTranscript) {
      setSelectedSessionLoadingMore(true);
    } else {
      setSelectedSessionLoading(true);
      setSelectedSessionDetail(null);
      setSelectedSessionTranscript([]);
      setSelectedSessionTranscriptLoadedEventCount(0);
      setSelectedSessionTranscriptTotal(0);
    }
    setSelectedSessionError(null);

    try {
      const [sessionDetail, transcript] = await Promise.all(
        params.appendTranscript
          ? [
              Promise.resolve(selectedSessionDetail()),
              aiSessionsApi.fetchClaudeSessionTranscript(
                params.contextId,
                params.qraftAiSessionId,
                {
                  offset: transcriptOffset,
                  limit: SELECTED_SESSION_TRANSCRIPT_PAGE_SIZE,
                },
              ),
            ]
          : [
              params.hasHistoricalSession
                ? aiSessionsApi.fetchClaudeSession(
                    params.contextId,
                    params.qraftAiSessionId,
                  )
                : Promise.resolve(null),
              aiSessionsApi.fetchClaudeSessionTranscript(
                params.contextId,
                params.qraftAiSessionId,
                {
                  offset: 0,
                  limit: SELECTED_SESSION_TRANSCRIPT_PAGE_SIZE,
                },
              ),
            ],
      );

      if (!selectedSessionRequestGuard.isCurrent(requestToken)) {
        return;
      }

      setSelectedSessionDetail(sessionDetail);
      const nextTranscriptLines = buildAiSessionTranscriptLines(
        transcript.events,
        {
          offset: transcript.offset,
        },
      );
      setSelectedSessionTranscript((currentTranscriptLines) =>
        mergeAiSessionTranscriptLines(
          currentTranscriptLines,
          nextTranscriptLines,
          params.appendTranscript,
        ),
      );
      setSelectedSessionTranscriptLoadedEventCount((currentLoadedEventCount) =>
        resolveLoadedAiSessionTranscriptEventCount({
          append: params.appendTranscript,
          currentLoadedEventCount,
          responseOffset: transcript.offset,
          responseEventCount: transcript.events.length,
        }),
      );
      setSelectedSessionTranscriptTotal(transcript.total);
    } catch (error) {
      if (!selectedSessionRequestGuard.isCurrent(requestToken)) {
        return;
      }

      if (!params.appendTranscript) {
        setSelectedSessionDetail(null);
        setSelectedSessionTranscript([]);
        setSelectedSessionTranscriptLoadedEventCount(0);
        setSelectedSessionTranscriptTotal(0);
      }
      setSelectedSessionError(
        error instanceof Error
          ? error.message
          : params.appendTranscript
            ? "Failed to load more transcript events"
            : "Failed to load selected session details",
      );
    } finally {
      if (selectedSessionRequestGuard.isCurrent(requestToken)) {
        setSelectedSessionLoading(false);
        setSelectedSessionLoadingMore(false);
      }
    }
  }

  createEffect(() => {
    const selectedSessionId = selectedQraftAiSessionId();
    const nextSearch = buildAiSessionOverviewRouteSearch({
      selectedSessionId,
      searchQuery: searchQuery(),
      searchInTranscript: searchInTranscript(),
    });
    const currentUrl = new URL(window.location.href);
    const nextUrl = `${currentUrl.pathname}${nextSearch}${currentUrl.hash}`;
    const currentVisibleUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentVisibleUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  });

  createEffect(() => {
    const detailTarget = selectedSessionDetailTarget();
    selectedSessionRequestGuard.invalidate();

    if (detailTarget === null) {
      setSelectedSessionDetail(null);
      setSelectedSessionTranscript([]);
      setSelectedSessionTranscriptLoadedEventCount(0);
      setSelectedSessionTranscriptTotal(0);
      setSelectedSessionError(null);
      setSelectedSessionLoading(false);
      setSelectedSessionLoadingMore(false);
      return;
    }

    void refreshSelectedSessionArtifacts({
      ...detailTarget,
      appendTranscript: false,
    });
  });

  createEffect(() => {
    const hiddenSessionIdSet = new Set(hiddenSessionIds());
    const selectedSessionId = selectedQraftAiSessionId();
    if (
      includeHiddenSessions() === false &&
      selectedSessionId !== null &&
      hiddenSessionIdSet.has(selectedSessionId)
    ) {
      setSelectedQraftAiSessionId(null);
    }
  });

  createEffect(() => {
    const handlePopState = (): void => {
      const nextOverviewRouteState = parseAiSessionOverviewRouteState(
        window.location.search,
      );
      const shouldRefreshHistory = didAiSessionHistoryFilterChange({
        currentSearchQuery: searchQuery(),
        currentSearchInTranscript: searchInTranscript(),
        nextOverviewRouteState,
      });
      setSelectedQraftAiSessionId(nextOverviewRouteState.selectedSessionId);
      setSearchDraftQuery(nextOverviewRouteState.searchQuery);
      setSearchDraftInTranscript(nextOverviewRouteState.searchInTranscript);
      setSearchQuery(nextOverviewRouteState.searchQuery);
      setSearchInTranscript(nextOverviewRouteState.searchInTranscript);
      if (
        shouldRefreshHistory &&
        props.contextId !== null &&
        props.projectPath.length > 0
      ) {
        setHistoryRequestedLimit(SESSION_HISTORY_PAGE_SIZE);
        setHistoryLoadingMore(false);
        setErrorMessage(null);
        setSubmitResultMessage(null);
        setHistoryLoading(true);
        void refreshActivity(props.contextId, props.projectPath);
      }
    };

    window.addEventListener("popstate", handlePopState);
    onCleanup(() => {
      window.removeEventListener("popstate", handlePopState);
    });
  });

  onCleanup(() => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }
  });

  async function submitPromptMessage(
    message: string,
    runImmediately: boolean,
    options: {
      readonly clearComposerInput: boolean;
      readonly forceNewSession?: boolean | undefined;
      readonly requestToken?: AiSessionRequestToken | undefined;
      readonly successLabel?: string | undefined;
    },
  ): Promise<void> {
    const contextId = props.contextId;
    const projectPath = props.projectPath;
    const scopeKey = createAiSessionScopeKey(contextId, projectPath);
    if (contextId === null || scopeKey === null) {
      return;
    }

    if (message.length === 0) {
      setErrorMessage("Prompt message is required.");
      return;
    }

    setErrorMessage(null);
    setSubmitResultMessage(null);
    const requestToken = resolveAiSessionRequestToken({
      requestGuard: mutationRequestGuard,
      scopeKey,
      requestToken: options.requestToken,
    });
    setSubmitting(true);
    try {
      const submitTarget = resolveAiSessionSubmitTarget({
        selectedQraftAiSessionId: selectedQraftAiSessionId(),
        draftSessionId: draftSessionId(),
        restartFromBeginning: options.forceNewSession === true,
      });
      const submitContext = createAiSessionSubmitContext({
        selectedPath: props.selectedPath,
        fileContent: props.fileContent,
        diffOverview: props.diffOverview,
      });
      const submitResult = await aiSessionsApi.submitPrompt({
        runImmediately,
        message,
        projectPath,
        qraftAiSessionId: submitTarget.qraftAiSessionId,
        forceNewSession: submitTarget.forceNewSession,
        modelProfileId: selectedModelProfileId() ?? undefined,
        context: submitContext,
      });
      if (
        !mutationRequestGuard.isCurrent(requestToken) ||
        !isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }

      if (options.clearComposerInput) {
        setPromptInput("");
      }
      setSubmitResultMessage(
        options.successLabel ??
          `${runImmediately ? "Started" : "Queued"} prompt for ${
            submitResult.sessionId
          }.`,
      );
      setSelectedQraftAiSessionId(submitResult.sessionId as QraftAiSessionId);
      await refreshActivity(contextId, projectPath);
    } catch (error) {
      if (
        !mutationRequestGuard.isCurrent(requestToken) ||
        !isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to submit prompt",
      );
    } finally {
      if (
        mutationRequestGuard.isCurrent(requestToken) &&
        isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        setSubmitting(false);
      }
    }
  }

  async function submitPrompt(runImmediately: boolean): Promise<void> {
    await submitPromptMessage(promptInput().trim(), runImmediately, {
      clearComposerInput: true,
    });
  }

  async function restartSelectedSessionFromBeginning(): Promise<void> {
    await submitPromptMessage(promptInput().trim(), true, {
      clearComposerInput: false,
      forceNewSession: true,
      successLabel: "Restarted the selected session from the beginning.",
    });
  }

  async function runDefaultPromptAction(
    action:
      | "ai-session-purpose"
      | "ai-session-refresh-purpose"
      | "ai-session-resume",
  ): Promise<void> {
    const scopeKey = createAiSessionScopeKey(
      props.contextId,
      props.projectPath,
    );
    if (scopeKey === null) {
      return;
    }

    const requestToken = mutationRequestGuard.issue(scopeKey);
    setErrorMessage(null);
    setSubmitResultMessage(null);
    setRunningDefaultPromptAction(action);

    try {
      const promptDefinition =
        await modelConfigApi.fetchGitActionPrompt(action);
      if (
        !mutationRequestGuard.isCurrent(requestToken) ||
        !isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }
      const wrappedPrompt = createAiSessionDefaultPromptMessage(
        action,
        promptDefinition.content,
      );

      await submitPromptMessage(wrappedPrompt, true, {
        clearComposerInput: false,
        requestToken,
        successLabel:
          action === "ai-session-purpose"
            ? "Started the default session-purpose prompt."
            : action === "ai-session-refresh-purpose"
              ? "Started the default refresh-purpose prompt."
              : "Started the default resume-session prompt.",
      });
    } catch (error) {
      if (
        !mutationRequestGuard.isCurrent(requestToken) ||
        !isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to run the default session action",
      );
    } finally {
      if (
        mutationRequestGuard.isCurrent(requestToken) &&
        isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        setRunningDefaultPromptAction(null);
      }
    }
  }

  async function cancelActiveSession(sessionId: string): Promise<void> {
    const scopeKey = createAiSessionScopeKey(
      props.contextId,
      props.projectPath,
    );
    if (scopeKey === null) {
      return;
    }

    const requestToken = mutationRequestGuard.issue(scopeKey);
    setErrorMessage(null);
    try {
      await aiSessionsApi.cancelActiveSession(sessionId);
      if (
        !mutationRequestGuard.isCurrent(requestToken) ||
        !isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }
      setSubmitResultMessage("Cancelled the selected active session.");
      if (props.contextId !== null) {
        await refreshActivity(props.contextId, props.projectPath);
      }
    } catch (error) {
      if (
        !mutationRequestGuard.isCurrent(requestToken) ||
        !isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to cancel session",
      );
    }
  }

  async function cancelQueuedPrompt(promptId: string): Promise<void> {
    const scopeKey = createAiSessionScopeKey(
      props.contextId,
      props.projectPath,
    );
    if (scopeKey === null) {
      return;
    }

    const requestToken = mutationRequestGuard.issue(scopeKey);
    setErrorMessage(null);
    try {
      await aiSessionsApi.cancelQueuedPrompt(promptId);
      if (
        !mutationRequestGuard.isCurrent(requestToken) ||
        !isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }
      setSubmitResultMessage("Cancelled the selected queued prompt.");
      if (props.contextId !== null) {
        await refreshActivity(props.contextId, props.projectPath);
      }
    } catch (error) {
      if (
        !mutationRequestGuard.isCurrent(requestToken) ||
        !isAiSessionScopeCurrent({
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to cancel queued prompt",
      );
    }
  }

  function startNewSession(): void {
    setDraftSessionId(generateQraftAiSessionId());
    setSelectedQraftAiSessionId(null);
    setErrorMessage(null);
    setSubmitResultMessage("Prepared a new AI session draft.");
  }

  async function runSearch(): Promise<void> {
    if (props.contextId === null) {
      return;
    }

    const appliedSearchState = applyAiSessionSearchDraft({
      rawSearchQuery: searchDraftQuery(),
      searchInTranscript: searchDraftInTranscript(),
    });
    setSearchQuery(appliedSearchState.searchQuery);
    setSearchInTranscript(appliedSearchState.searchInTranscript);
    setHistoryRequestedLimit(SESSION_HISTORY_PAGE_SIZE);
    setHistoryLoadingMore(false);
    setErrorMessage(null);
    setSubmitResultMessage(null);
    setHistoryLoading(true);
    await refreshActivity(props.contextId, props.projectPath);
  }

  async function clearSearch(): Promise<void> {
    const hadAppliedSearchState =
      searchQuery().trim().length > 0 || searchInTranscript() === false;
    setSearchDraftQuery("");
    setSearchDraftInTranscript(true);
    setSearchQuery("");
    setSearchInTranscript(true);
    setHistoryRequestedLimit(SESSION_HISTORY_PAGE_SIZE);
    setHistoryLoadingMore(false);

    if (!hadAppliedSearchState || props.contextId === null) {
      return;
    }

    setErrorMessage(null);
    setSubmitResultMessage(null);
    setHistoryLoading(true);
    await refreshActivity(props.contextId, props.projectPath);
  }

  async function toggleSessionHidden(
    sessionId: QraftAiSessionId,
    hidden: boolean,
  ): Promise<void> {
    const scopeKey = createAiSessionScopeKey(
      props.contextId,
      props.projectPath,
    );
    if (scopeKey === null) {
      return;
    }

    const requestToken = mutationRequestGuard.issue(scopeKey);
    setErrorMessage(null);
    setSubmitResultMessage(null);

    try {
      await aiSessionsApi.setSessionHidden(sessionId, hidden);
      if (
        !canApplyAiSessionScopedRequestResult({
          requestGuard: mutationRequestGuard,
          requestToken,
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }

      setHiddenSessionIds((currentHiddenSessionIds) =>
        updateHiddenAiSessionIds({
          hiddenSessionIds: currentHiddenSessionIds,
          sessionId,
          hidden,
        }),
      );
      setSubmitResultMessage(createAiSessionHiddenStateMessage(hidden));
    } catch (error) {
      if (
        !canApplyAiSessionScopedRequestResult({
          requestGuard: mutationRequestGuard,
          requestToken,
          expectedScopeKey: scopeKey,
          contextId: props.contextId,
          projectPath: props.projectPath,
        })
      ) {
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to update the session visibility",
      );
    }
  }

  async function loadMoreSelectedSessionTranscript(): Promise<void> {
    const detailTarget = selectedSessionDetailTarget();
    if (
      detailTarget === null ||
      selectedSessionLoading() ||
      selectedSessionLoadingMore() ||
      !canLoadMoreAiSessionTranscript({
        loadedEventCount: selectedSessionTranscriptLoadedEventCount(),
        totalCount: selectedSessionTranscriptTotal(),
      })
    ) {
      return;
    }

    await refreshSelectedSessionArtifacts({
      ...detailTarget,
      appendTranscript: true,
    });
  }

  async function loadMoreSessionHistory(): Promise<void> {
    if (
      props.contextId === null ||
      historyLoading() ||
      activityLoading() ||
      historyLoadingMore() ||
      !canLoadMoreAiSessionHistory({
        loadedCount: historicalSessions().length,
        totalCount: historyTotal(),
      })
    ) {
      return;
    }

    setHistoryRequestedLimit(
      historyRequestedLimit() + SESSION_HISTORY_PAGE_SIZE,
    );
    setHistoryLoadingMore(true);
    setErrorMessage(null);
    await refreshActivity(props.contextId, props.projectPath);
  }

  return (
    <section>
      <h2>AI Sessions</h2>
      <p>
        Browse project-scoped session history, monitor active work, and submit
        prompts into either a new or existing AI session.
      </p>
      <Show
        when={props.contextId !== null}
        fallback={<p>Open a project tab to use the AI Sessions screen.</p>}
      >
        <div>
          <button type="button" onClick={startNewSession}>
            New session
          </button>
          <button
            type="button"
            disabled={activityLoading()}
            onClick={() => {
              if (props.contextId === null) {
                return;
              }
              setErrorMessage(null);
              setSubmitResultMessage(null);
              void refreshActivity(props.contextId, props.projectPath);
            }}
          >
            {activityLoading() ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <Show when={errorMessage() !== null}>
          <p role="alert">{errorMessage()}</p>
        </Show>
        <Show when={submitResultMessage() !== null}>
          <p>{submitResultMessage()}</p>
        </Show>

        <section>
          <h3>Session history</h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <label>
              Search
              <input
                type="search"
                value={searchDraftQuery()}
                placeholder="Search summaries or prompts"
                onInput={(event) =>
                  setSearchDraftQuery(event.currentTarget.value)
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={searchDraftInTranscript()}
                onInput={(event) =>
                  setSearchDraftInTranscript(event.currentTarget.checked)
                }
              />{" "}
              Search full transcript
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeHiddenSessions()}
                onInput={(event) =>
                  setIncludeHiddenSessions(event.currentTarget.checked)
                }
              />{" "}
              Include hidden sessions
            </label>
            <button
              type="submit"
              disabled={historyLoading() || activityLoading()}
            >
              {historyLoading() ? "Searching..." : "Search history"}
            </button>
            <button
              type="button"
              disabled={
                historyLoading() ||
                activityLoading() ||
                !canClearAiSessionSearch({
                  draftSearchQuery: searchDraftQuery(),
                  appliedSearchQuery: searchQuery(),
                  draftSearchInTranscript: searchDraftInTranscript(),
                  appliedSearchInTranscript: searchInTranscript(),
                })
              }
              onClick={() => void clearSearch()}
            >
              Clear search
            </button>
          </form>
          <p>
            {searchQuery().trim().length > 0
              ? searchInTranscript()
                ? "Searching session history and transcript content."
                : "Searching session summaries and prompts."
              : "Showing the latest project-scoped session history."}
          </p>
          <Show
            when={canLoadMoreAiSessionHistory({
              loadedCount: historicalSessions().length,
              totalCount: historyTotal(),
            })}
          >
            <p>
              Loaded {historicalSessions().length} of {historyTotal()} recorded
              sessions.
            </p>
          </Show>
          <Show when={historyLoading() && !activityLoading()}>
            <p>Refreshing session history...</p>
          </Show>
        </section>

        <section>
          <h3>Composer</h3>
          <p>
            {describeAiSessionTarget({
              selectedQraftAiSessionId: selectedQraftAiSessionId(),
              draftSessionId: draftSessionId(),
            })}
          </p>
          <label>
            Model profile
            <select
              value={selectedModelProfileId() ?? ""}
              disabled={modelProfilesLoading()}
              onChange={(event) =>
                setSelectedModelProfileId(
                  event.currentTarget.value.length > 0
                    ? event.currentTarget.value
                    : null,
                )
              }
            >
              <option value="">Server default AI profile</option>
              <For each={modelProfiles()}>
                {(modelProfile) => (
                  <option value={modelProfile.id}>
                    {modelProfile.name} ({modelProfile.vendor}/
                    {modelProfile.model})
                  </option>
                )}
              </For>
            </select>
          </label>
          <p>
            {describeAiSessionModelProfile(
              selectedModelProfileId(),
              modelProfiles(),
            )}
          </p>
          <p>{describeAiSessionPromptContext(promptContextState())}</p>
          <p>
            Default session actions stay aligned with the prompts configured in
            Action Defaults.
          </p>
          <Show when={props.selectedPath !== null}>
            <button type="button" onClick={() => props.onOpenFilesScreen?.()}>
              Open current file in Files screen
            </button>
          </Show>
          <Show when={selectedSessionEntry() !== null}>
            <div>
              <p>
                <strong>{selectedSessionEntry()?.title}</strong>
              </p>
              <p>{selectedSessionEntry()?.detail}</p>
              <p>
                Status: {selectedSessionEntry()?.status} | Updated:{" "}
                {formatAiSessionTimestamp(
                  selectedSessionEntry()?.updatedAt ?? "",
                )}
              </p>
              <p>
                Model:{" "}
                {describeAiSessionEntryModel(
                  selectedSessionEntry() ?? {
                    modelProfileId: undefined,
                    modelVendor: undefined,
                    modelName: undefined,
                  },
                  modelProfiles(),
                )}
              </p>
              <div>
                <button
                  type="button"
                  disabled={
                    submitting() ||
                    runningDefaultPromptAction() !== null ||
                    selectedQraftAiSessionId() === null
                  }
                  onClick={() =>
                    void runDefaultPromptAction("ai-session-refresh-purpose")
                  }
                >
                  {runningDefaultPromptAction() === "ai-session-refresh-purpose"
                    ? "Running refresh prompt..."
                    : "Run refresh prompt"}
                </button>
                <button
                  type="button"
                  disabled={
                    submitting() ||
                    runningDefaultPromptAction() !== null ||
                    selectedQraftAiSessionId() === null
                  }
                  onClick={() =>
                    void runDefaultPromptAction("ai-session-resume")
                  }
                >
                  {runningDefaultPromptAction() === "ai-session-resume"
                    ? "Running resume prompt..."
                    : "Run resume prompt"}
                </button>
                <button
                  type="button"
                  disabled={
                    submitting() ||
                    runningDefaultPromptAction() !== null ||
                    selectedQraftAiSessionId() === null ||
                    promptInput().trim().length === 0
                  }
                  onClick={() => void restartSelectedSessionFromBeginning()}
                >
                  {submitting() ? "Submitting..." : "Restart from beginning"}
                </button>
              </div>
            </div>
          </Show>
          <label>
            Prompt
            <textarea
              rows={6}
              value={promptInput()}
              onInput={(event) => setPromptInput(event.currentTarget.value)}
            />
          </label>
          <div>
            <button
              type="button"
              disabled={
                submitting() ||
                modelProfilesLoading() ||
                runningDefaultPromptAction() !== null
              }
              onClick={() => void runDefaultPromptAction("ai-session-purpose")}
            >
              {runningDefaultPromptAction() === "ai-session-purpose"
                ? "Running purpose prompt..."
                : "Run default purpose prompt"}
            </button>
            <button
              type="button"
              disabled={
                submitting() ||
                modelProfilesLoading() ||
                runningDefaultPromptAction() !== null
              }
              onClick={() => void submitPrompt(true)}
            >
              {submitting() ? "Submitting..." : "Run now"}
            </button>
            <button
              type="button"
              disabled={
                submitting() ||
                modelProfilesLoading() ||
                runningDefaultPromptAction() !== null
              }
              onClick={() => void submitPrompt(false)}
            >
              {submitting() ? "Submitting..." : "Queue prompt"}
            </button>
          </div>
        </section>

        <section>
          <h3>Active work</h3>
          <p>{getQueuedPromptSummary(promptQueue())}</p>
          <Show
            when={activeSessions().length > 0}
            fallback={<p>No active AI sessions.</p>}
          >
            <ul>
              <For each={activeSessions()}>
                {(activeSession) => (
                  <li>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedQraftAiSessionId(
                          (activeSession.clientSessionId ??
                            activeSession.id) as QraftAiSessionId,
                        )
                      }
                    >
                      <strong>{activeSession.state}</strong>{" "}
                      {activeSession.prompt}
                    </button>
                    <div>
                      <span>
                        Started{" "}
                        {formatAiSessionTimestamp(activeSession.createdAt)}
                      </span>
                      <Show when={activeSession.currentActivity !== undefined}>
                        <span>{` | ${activeSession.currentActivity}`}</span>
                      </Show>
                    </div>
                    <button
                      type="button"
                      onClick={() => void cancelActiveSession(activeSession.id)}
                    >
                      Cancel
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>

          <Show when={promptQueue().length > 0}>
            <h4>Prompt queue</h4>
            <ul>
              <For each={promptQueue()}>
                {(promptQueueItem) => (
                  <li>
                    <strong>{promptQueueItem.status}</strong>{" "}
                    {promptQueueItem.message}
                    <button
                      type="button"
                      onClick={() =>
                        void cancelQueuedPrompt(promptQueueItem.id)
                      }
                    >
                      Cancel queued prompt
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <Show
              when={canLoadMoreAiSessionHistory({
                loadedCount: historicalSessions().length,
                totalCount: historyTotal(),
              })}
            >
              <button
                type="button"
                disabled={historyLoadingMore() || historyLoading()}
                onClick={() => void loadMoreSessionHistory()}
              >
                {historyLoadingMore()
                  ? "Loading more history..."
                  : `Load ${SESSION_HISTORY_PAGE_SIZE} more sessions`}
              </button>
            </Show>
          </Show>
        </section>

        <section>
          <h3>Sessions</h3>
          <p>
            Session filtering is controlled from the Session history search form
            so polling and URL state stay aligned with the applied query.
          </p>
          <button
            type="button"
            onClick={() => setSelectedQraftAiSessionId(null)}
          >
            Use new draft
          </button>
          <Show when={selectedSessionEntry() !== null}>
            <div>
              <h4>Selected session</h4>
              <p>
                <strong>{selectedSessionEntry()?.title}</strong>
              </p>
              <p>{selectedSessionEntry()?.latestPrompt}</p>
              <p>
                {selectedSessionEntry()?.status} |{" "}
                {formatAiSessionTimestamp(
                  selectedSessionEntry()?.updatedAt ?? "",
                )}
                <Show
                  when={(selectedSessionEntry()?.queuedPromptCount ?? 0) > 0}
                >
                  <span>
                    {` | ${selectedSessionEntry()?.queuedPromptCount} queued`}
                  </span>
                </Show>
              </p>
              <Show when={selectedSessionCancelAction() !== null}>
                <button
                  type="button"
                  onClick={() => {
                    const cancelAction = selectedSessionCancelAction();
                    if (cancelAction === null) {
                      return;
                    }
                    if (cancelAction.kind === "active-session") {
                      void cancelActiveSession(cancelAction.targetId);
                      return;
                    }
                    void cancelQueuedPrompt(cancelAction.targetId);
                  }}
                >
                  {selectedSessionCancelAction()?.label}
                </button>
              </Show>
              <Show when={selectedSessionDetail() !== null}>
                <p>
                  Source: {selectedSessionDetail()?.source} | Branch:{" "}
                  {selectedSessionDetail()?.gitBranch}
                </p>
                <p>Summary: {selectedSessionDetail()?.summary}</p>
                <p>First prompt: {selectedSessionDetail()?.firstPrompt}</p>
              </Show>
              <h5>Transcript</h5>
              <Show when={selectedSessionLoading()}>
                <p>Loading selected session transcript...</p>
              </Show>
              <Show when={selectedSessionError() !== null}>
                <p role="alert">{selectedSessionError()}</p>
              </Show>
              <Show
                when={
                  !selectedSessionLoading() &&
                  selectedSessionError() === null &&
                  selectedSessionTranscript().length === 0
                }
              >
                <p>No transcript events are available for this session yet.</p>
              </Show>
              <Show when={selectedSessionTranscript().length > 0}>
                <p>
                  Showing {selectedSessionTranscript().length} transcript lines
                  from {selectedSessionTranscriptLoadedEventCount()} loaded
                  events
                  {selectedSessionTranscriptTotal() >
                  selectedSessionTranscriptLoadedEventCount()
                    ? ` of ${selectedSessionTranscriptTotal()}`
                    : ""}
                  .
                </p>
                <ul>
                  <For each={selectedSessionTranscript()}>
                    {(transcriptLine) => (
                      <li>
                        <strong>{transcriptLine.role}</strong>
                        {transcriptLine.timestamp !== null
                          ? ` | ${formatAiSessionTimestamp(
                              transcriptLine.timestamp,
                            )}`
                          : ""}
                        <p>{transcriptLine.text}</p>
                      </li>
                    )}
                  </For>
                </ul>
                <Show
                  when={canLoadMoreAiSessionTranscript({
                    loadedEventCount:
                      selectedSessionTranscriptLoadedEventCount(),
                    totalCount: selectedSessionTranscriptTotal(),
                  })}
                >
                  <button
                    type="button"
                    disabled={selectedSessionLoadingMore()}
                    onClick={() => void loadMoreSelectedSessionTranscript()}
                  >
                    {selectedSessionLoadingMore()
                      ? "Loading more transcript..."
                      : "Load more transcript"}
                  </button>
                </Show>
              </Show>
            </div>
          </Show>
          <Show
            when={visibleSessionEntries().length > 0}
            fallback={<p>No recorded sessions for this workspace.</p>}
          >
            <ul>
              <For each={visibleSessionEntries()}>
                {(sessionEntry) => (
                  <li>
                    <button
                      type="button"
                      aria-pressed={
                        selectedQraftAiSessionId() ===
                        sessionEntry.qraftAiSessionId
                      }
                      onClick={() =>
                        setSelectedQraftAiSessionId(
                          sessionEntry.qraftAiSessionId,
                        )
                      }
                    >
                      <strong>{sessionEntry.title}</strong>
                    </button>
                    <div>
                      <span>{sessionEntry.status}</span>
                      <span>{` | ${sessionEntry.detail}`}</span>
                    </div>
                    <div>
                      <span>
                        {formatAiSessionTimestamp(sessionEntry.updatedAt)}
                      </span>
                      <Show when={sessionEntry.queuedPromptCount > 0}>
                        <span>{` | ${sessionEntry.queuedPromptCount} queued`}</span>
                      </Show>
                      <span>
                        {` | ${describeAiSessionEntryModel(sessionEntry, modelProfiles())}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void toggleSessionHidden(
                          sessionEntry.qraftAiSessionId,
                          hiddenSessionIds().includes(
                            sessionEntry.qraftAiSessionId,
                          ) === false,
                        )
                      }
                    >
                      {hiddenSessionIds().includes(
                        sessionEntry.qraftAiSessionId,
                      )
                        ? "Show session"
                        : "Hide session"}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </Show>
    </section>
  );
}
