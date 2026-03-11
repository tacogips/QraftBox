import {
  createEffect,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
  untrack,
} from "solid-js";
import { CheckboxField } from "../../components/CheckboxField";
import { SummaryCard } from "../../components/SummaryCard";
import { ToolbarIconButton } from "../../components/ToolbarIconButton";
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
  describeAiSessionEntryAgent,
  describeAiSessionEntryOrigin,
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
  createAiSessionDetailRequestKey,
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
  readonly onOpenProjectScreen: (() => void) | undefined;
}

const ACTIVE_SESSION_POLL_MS = 5000;
const SESSION_HISTORY_PAGE_SIZE = 50;
const SELECTED_SESSION_TRANSCRIPT_PAGE_SIZE = 200;

function renderPlusIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path d="M10 4v12" stroke-linecap="round" />
      <path d="M4 10h12" stroke-linecap="round" />
    </svg>
  );
}

function renderSearchIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path d="m12 12 4 4" stroke-linecap="round" />
    </svg>
  );
}

function renderRefreshIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="M15.5 9.5a5.5 5.5 0 1 1-1.2-3.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12.5 3.5h3v3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function renderClearIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path d="m5 5 10 10" stroke-linecap="round" />
      <path d="M15 5 5 15" stroke-linecap="round" />
    </svg>
  );
}

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
  let activeSelectedSessionDetailKey: string | null = null;
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
    const qraftAiSessionId = selectedQraftAiSessionId();
    if (props.contextId === null || qraftAiSessionId === null) {
      return null;
    }

    return {
      contextId: props.contextId,
      qraftAiSessionId,
      hasHistoricalSession: historicalSessions().some(
        (historicalSession) =>
          historicalSession.qraftAiSessionId === qraftAiSessionId,
      ),
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
    if (nextScopeKey === null) {
      return;
    }
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

    if (detailTarget === null) {
      activeSelectedSessionDetailKey = null;
      selectedSessionRequestGuard.invalidate();
      setSelectedSessionDetail(null);
      setSelectedSessionTranscript([]);
      setSelectedSessionTranscriptLoadedEventCount(0);
      setSelectedSessionTranscriptTotal(0);
      setSelectedSessionError(null);
      setSelectedSessionLoading(false);
      setSelectedSessionLoadingMore(false);
      return;
    }

    const nextDetailKey = createAiSessionDetailRequestKey(detailTarget);
    if (activeSelectedSessionDetailKey === nextDetailKey) {
      return;
    }

    activeSelectedSessionDetailKey = nextDetailKey;
    selectedSessionRequestGuard.invalidate();
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

  function getRelativeSessionTime(timestamp: string): string {
    const parsedTimestamp = Date.parse(timestamp);
    if (Number.isNaN(parsedTimestamp)) {
      return "-";
    }

    const elapsedMilliseconds = Date.now() - parsedTimestamp;
    const elapsedMinutes = Math.floor(elapsedMilliseconds / 60_000);
    const elapsedHours = Math.floor(elapsedMilliseconds / 3_600_000);
    const elapsedDays = Math.floor(elapsedMilliseconds / 86_400_000);

    if (elapsedMinutes < 1) {
      return "just now";
    }
    if (elapsedMinutes < 60) {
      return `${elapsedMinutes}m ago`;
    }
    if (elapsedHours < 24) {
      return `${elapsedHours}h ago`;
    }
    if (elapsedDays === 1) {
      return "yesterday";
    }
    return `${elapsedDays}d ago`;
  }

  function getSessionStatusBadgeClass(status: string): string {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes("run")) {
      return "bg-accent-muted text-accent-fg";
    }
    if (normalizedStatus.includes("queue")) {
      return "bg-attention-emphasis/20 text-attention-fg";
    }
    if (
      normalizedStatus.includes("fail") ||
      normalizedStatus.includes("cancel") ||
      normalizedStatus.includes("error")
    ) {
      return "bg-danger-emphasis/20 text-danger-fg";
    }
    if (normalizedStatus.includes("await")) {
      return "bg-success-muted text-success-fg";
    }
    return "bg-bg-tertiary text-text-secondary";
  }

  function getSessionOriginBadgeClass(origin: string | null): string {
    if (origin === "QRAFTBOX") {
      return "bg-accent-muted text-accent-fg";
    }
    if (origin === "CLIENT") {
      return "bg-bg-tertiary text-text-primary";
    }
    return "bg-bg-tertiary text-text-secondary";
  }

  function getSessionAgentBadgeClass(agent: string | null): string {
    if (agent === "CODEX") {
      return "bg-success-muted text-success-fg";
    }
    if (agent === "CLAUDE-CODE") {
      return "bg-attention-emphasis/20 text-attention-fg";
    }
    return "bg-bg-tertiary text-text-secondary";
  }

  function dismissSessionDetail(): void {
    setSelectedQraftAiSessionId(null);
    setSelectedSessionError(null);
  }

  return (
    <section class="mx-auto flex h-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div class="flex flex-col gap-2">
        <h2 class="text-2xl font-semibold text-text-primary">AiSession</h2>
      </div>
      <Show
        when={props.contextId !== null}
        fallback={
          <div class="flex flex-1 items-center justify-center">
            <div class="flex max-w-xl flex-col gap-4 rounded-2xl border border-border-default bg-bg-secondary p-6 shadow-lg shadow-black/20">
              <div class="flex flex-col gap-2">
                <p class="text-sm font-medium text-accent-fg">
                  Project required
                </p>
                <h3 class="text-2xl font-semibold text-text-primary">
                  Open a workspace before browsing sessions
                </h3>
                <p class="text-sm leading-6 text-text-secondary">
                  The legacy Svelte screen always anchored Sessions to an active
                  project. Open or activate a project tab first, then return to
                  this screen to inspect history, active runs, and queued
                  prompts.
                </p>
              </div>
              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  class="rounded-md bg-accent-emphasis px-4 py-2 text-sm font-medium text-text-on-emphasis transition-colors hover:bg-accent-fg"
                  onClick={() => props.onOpenProjectScreen?.()}
                >
                  Open project selector
                </button>
                <Show when={props.onOpenFilesScreen !== undefined}>
                  <button
                    type="button"
                    class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
                    onClick={() => props.onOpenFilesScreen?.()}
                  >
                    Go to Files
                  </button>
                </Show>
              </div>
            </div>
          </div>
        }
      >
        <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-primary">
          <form
            class="flex flex-col gap-3 border-b border-border-default bg-bg-primary px-4 py-3 lg:flex-row lg:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <input
                type="search"
                class="min-w-0 flex-1 rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-emphasis"
                value={searchDraftQuery()}
                placeholder="Search session purpose/summary/chat text"
                onInput={(event) =>
                  setSearchDraftQuery(event.currentTarget.value)
                }
              />
              <ToolbarIconButton label="New session" onClick={startNewSession}>
                {renderPlusIcon()}
              </ToolbarIconButton>
              <ToolbarIconButton
                type="submit"
                label={
                  historyLoading() ? "Searching sessions" : "Search sessions"
                }
                disabled={historyLoading() || activityLoading()}
              >
                {renderSearchIcon()}
              </ToolbarIconButton>
            </div>
            <CheckboxField
              checked={searchDraftInTranscript()}
              label="Include chat transcript"
              labelClass="text-xs text-text-secondary"
              onInput={(event) =>
                setSearchDraftInTranscript(event.currentTarget.checked)
              }
            />
            <CheckboxField
              checked={includeHiddenSessions()}
              label="Include hidden sessions"
              labelClass="text-xs text-text-secondary"
              onInput={(event) =>
                setIncludeHiddenSessions(event.currentTarget.checked)
              }
            />
            <ToolbarIconButton
              label={
                activityLoading() ? "Refreshing sessions" : "Refresh sessions"
              }
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
              {renderRefreshIcon()}
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Clear session search"
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
              {renderClearIcon()}
            </ToolbarIconButton>
          </form>

          <div class="px-4 pt-3">
            <Show when={errorMessage() !== null}>
              <p
                role="alert"
                class="rounded-md border border-danger-emphasis/40 bg-danger-subtle px-3 py-2 text-sm text-danger-fg"
              >
                {errorMessage()}
              </p>
            </Show>
            <Show when={submitResultMessage() !== null}>
              <p class="rounded-md border border-success-emphasis/30 bg-success-subtle px-3 py-2 text-sm text-success-fg">
                {submitResultMessage()}
              </p>
            </Show>
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-4">
            <Show
              when={historyLoading() && visibleSessionEntries().length === 0}
            >
              <div class="flex flex-col items-center justify-center gap-3 py-16 text-text-tertiary">
                <div class="flex items-center gap-2">
                  <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis" />
                  <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis [animation-delay:120ms]" />
                  <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis [animation-delay:240ms]" />
                </div>
                <p class="text-xs">
                  {searchQuery().trim().length > 0
                    ? "Searching sessions..."
                    : "Loading sessions..."}
                </p>
              </div>
            </Show>

            <Show
              when={!(historyLoading() && visibleSessionEntries().length === 0)}
            >
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                <button
                  type="button"
                  class="flex min-h-[164px] items-center justify-center rounded-xl border border-dashed border-accent-emphasis/60 bg-accent-muted/10 p-4 text-accent-fg transition hover:bg-accent-muted/20"
                  aria-label="Create new session"
                  onClick={startNewSession}
                >
                  <span class="text-6xl font-light leading-none">+</span>
                </button>

                <For each={visibleSessionEntries()}>
                  {(sessionEntry) => {
                    const originLabel =
                      describeAiSessionEntryOrigin(sessionEntry);
                    const agentLabel =
                      describeAiSessionEntryAgent(sessionEntry);

                    return (
                      <SummaryCard
                        selected={
                          selectedQraftAiSessionId() ===
                          sessionEntry.qraftAiSessionId
                        }
                        ariaLabel={`Open session ${sessionEntry.qraftAiSessionId}`}
                        onActivate={() =>
                          setSelectedQraftAiSessionId(
                            sessionEntry.qraftAiSessionId,
                          )
                        }
                        topSlot={
                          <div class="flex items-start justify-between gap-3">
                            <div class="flex flex-wrap items-center gap-2">
                              <span
                                class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getSessionStatusBadgeClass(
                                  sessionEntry.status,
                                )}`}
                              >
                                {sessionEntry.status}
                              </span>
                              <Show when={originLabel !== null}>
                                <span
                                  class={`rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${getSessionOriginBadgeClass(
                                    originLabel,
                                  )}`}
                                >
                                  {originLabel}
                                </span>
                              </Show>
                              <Show when={agentLabel !== null}>
                                <span
                                  class={`rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${getSessionAgentBadgeClass(
                                    agentLabel,
                                  )}`}
                                >
                                  {agentLabel}
                                </span>
                              </Show>
                              <Show
                                when={hiddenSessionIds().includes(
                                  sessionEntry.qraftAiSessionId,
                                )}
                              >
                                <span class="rounded bg-danger-emphasis/20 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-danger-fg">
                                  Hidden
                                </span>
                              </Show>
                            </div>
                            <div class="flex items-center gap-2">
                              <span class="text-[11px] text-text-tertiary">
                                {getRelativeSessionTime(sessionEntry.updatedAt)}
                              </span>
                              <button
                                type="button"
                                class="rounded border border-border-default px-2 py-1 text-[10px] text-text-secondary transition hover:bg-bg-primary hover:text-text-primary"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void toggleSessionHidden(
                                    sessionEntry.qraftAiSessionId,
                                    hiddenSessionIds().includes(
                                      sessionEntry.qraftAiSessionId,
                                    ) === false,
                                  );
                                }}
                              >
                                {hiddenSessionIds().includes(
                                  sessionEntry.qraftAiSessionId,
                                )
                                  ? "Show"
                                  : "Hide"}
                              </button>
                            </div>
                          </div>
                        }
                        titleLabel="Purpose"
                        title={sessionEntry.title}
                        bodyLabel="Latest activity"
                        body={sessionEntry.detail}
                        footerSlot={
                          <>
                            <Show when={sessionEntry.queuedPromptCount > 0}>
                              <span>
                                {sessionEntry.queuedPromptCount} queued
                              </span>
                            </Show>
                            <span>
                              {describeAiSessionEntryModel(
                                sessionEntry,
                                modelProfiles(),
                              )}
                            </span>
                          </>
                        }
                      />
                    );
                  }}
                </For>
              </div>
            </Show>

            <Show
              when={
                visibleSessionEntries().length === 0 &&
                !historyLoading() &&
                searchQuery().trim().length === 0
              }
            >
              <div class="py-12 text-center text-sm text-text-secondary">
                No sessions found for this project.
              </div>
            </Show>

            <Show
              when={
                visibleSessionEntries().length === 0 &&
                !historyLoading() &&
                searchQuery().trim().length > 0
              }
            >
              <div class="py-12 text-center text-sm text-text-secondary">
                No sessions matched your search.
              </div>
            </Show>

            <Show
              when={canLoadMoreAiSessionHistory({
                loadedCount: historicalSessions().length,
                totalCount: historyTotal(),
              })}
            >
              <div class="flex justify-center pt-4">
                <button
                  type="button"
                  class="rounded-md border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={historyLoadingMore() || historyLoading()}
                  onClick={() => void loadMoreSessionHistory()}
                >
                  {historyLoadingMore()
                    ? "Loading more..."
                    : `Load ${SESSION_HISTORY_PAGE_SIZE} more`}
                </button>
              </div>
            </Show>
          </div>

          <Show when={selectedQraftAiSessionId() !== null}>
            <div class="absolute inset-0 z-40 flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div class="flex h-[min(88vh,920px)] w-full max-w-7xl overflow-hidden rounded-2xl border border-border-default bg-bg-secondary shadow-2xl shadow-black/40">
                <div class="flex min-w-0 flex-1 flex-col border-r border-border-default">
                  <div class="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getSessionStatusBadgeClass(
                            selectedSessionEntry()?.status ?? "",
                          )}`}
                        >
                          {selectedSessionEntry()?.status}
                        </span>
                        <span class="rounded bg-bg-tertiary px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                          {describeAiSessionEntryModel(
                            selectedSessionEntry() ?? {
                              modelProfileId: undefined,
                              modelVendor: undefined,
                              modelName: undefined,
                            },
                            modelProfiles(),
                          )}
                        </span>
                      </div>
                      <h3 class="mt-2 truncate text-lg font-semibold text-text-primary">
                        {selectedSessionEntry()?.title}
                      </h3>
                      <p class="mt-1 text-xs text-text-secondary">
                        {selectedSessionEntry()?.detail}
                      </p>
                    </div>
                    <button
                      type="button"
                      class="rounded-md border border-border-default px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-primary hover:text-text-primary"
                      onClick={dismissSessionDetail}
                    >
                      Close
                    </button>
                  </div>

                  <div class="min-h-0 flex-1 overflow-auto px-4 py-4">
                    <Show when={selectedSessionDetail() !== null}>
                      <div class="mb-4 grid gap-3 sm:grid-cols-3">
                        <div class="rounded-lg border border-border-default bg-bg-primary p-3 text-xs text-text-secondary">
                          <p class="uppercase tracking-wide text-text-tertiary">
                            Source
                          </p>
                          <p class="mt-1 text-sm text-text-primary">
                            {selectedSessionDetail()?.source}
                          </p>
                        </div>
                        <div class="rounded-lg border border-border-default bg-bg-primary p-3 text-xs text-text-secondary">
                          <p class="uppercase tracking-wide text-text-tertiary">
                            Branch
                          </p>
                          <p class="mt-1 text-sm text-text-primary">
                            {selectedSessionDetail()?.gitBranch}
                          </p>
                        </div>
                        <div class="rounded-lg border border-border-default bg-bg-primary p-3 text-xs text-text-secondary">
                          <p class="uppercase tracking-wide text-text-tertiary">
                            Updated
                          </p>
                          <p class="mt-1 text-sm text-text-primary">
                            {formatAiSessionTimestamp(
                              selectedSessionEntry()?.updatedAt ?? "",
                            )}
                          </p>
                        </div>
                      </div>
                    </Show>

                    <Show when={selectedSessionLoading()}>
                      <p class="text-sm text-text-secondary">
                        Loading selected session transcript...
                      </p>
                    </Show>
                    <Show when={selectedSessionError() !== null}>
                      <p
                        role="alert"
                        class="rounded-md border border-danger-emphasis/40 bg-danger-subtle px-3 py-2 text-sm text-danger-fg"
                      >
                        {selectedSessionError()}
                      </p>
                    </Show>
                    <div class="space-y-3">
                      <For each={selectedSessionTranscript()}>
                        {(transcriptLine) => (
                          <article class="rounded-xl border border-border-default bg-bg-primary p-4">
                            <div class="mb-2 flex items-center justify-between gap-3">
                              <span
                                class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                  transcriptLine.role === "assistant"
                                    ? "bg-success-muted text-success-fg"
                                    : transcriptLine.role === "system"
                                      ? "bg-attention-emphasis/20 text-attention-fg"
                                      : "bg-accent-muted text-accent-fg"
                                }`}
                              >
                                {transcriptLine.role}
                              </span>
                              <span class="text-[11px] text-text-tertiary">
                                {transcriptLine.timestamp === null
                                  ? ""
                                  : formatAiSessionTimestamp(
                                      transcriptLine.timestamp,
                                    )}
                              </span>
                            </div>
                            <p class="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
                              {transcriptLine.text}
                            </p>
                          </article>
                        )}
                      </For>
                    </div>
                    <Show
                      when={
                        !selectedSessionLoading() &&
                        selectedSessionError() === null &&
                        selectedSessionTranscript().length === 0
                      }
                    >
                      <p class="text-sm text-text-secondary">
                        No transcript events are available for this session yet.
                      </p>
                    </Show>
                    <Show
                      when={canLoadMoreAiSessionTranscript({
                        loadedEventCount:
                          selectedSessionTranscriptLoadedEventCount(),
                        totalCount: selectedSessionTranscriptTotal(),
                      })}
                    >
                      <div class="flex justify-center pt-4">
                        <button
                          type="button"
                          class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={selectedSessionLoadingMore()}
                          onClick={() =>
                            void loadMoreSelectedSessionTranscript()
                          }
                        >
                          {selectedSessionLoadingMore()
                            ? "Loading more transcript..."
                            : "Load more transcript"}
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>

                <aside class="flex w-full max-w-sm flex-col bg-bg-primary">
                  <div class="border-b border-border-default px-4 py-3">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                      Profile
                    </p>
                    <p class="mt-2 text-sm text-text-primary">
                      {describeAiSessionTarget({
                        selectedQraftAiSessionId: selectedQraftAiSessionId(),
                        draftSessionId: draftSessionId(),
                      })}
                    </p>
                    <p class="mt-1 text-xs text-text-secondary">
                      {describeAiSessionPromptContext(promptContextState())}
                    </p>
                  </div>

                  <div class="flex flex-1 flex-col gap-4 overflow-auto px-4 py-4">
                    <label class="flex flex-col gap-2 text-sm text-text-secondary">
                      <span>Model profile</span>
                      <select
                        class="rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-emphasis"
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

                    <p class="text-xs leading-5 text-text-secondary">
                      {describeAiSessionModelProfile(
                        selectedModelProfileId(),
                        modelProfiles(),
                      )}
                    </p>

                    <label class="flex flex-1 flex-col gap-2 text-sm text-text-secondary">
                      <span>Next prompt</span>
                      <textarea
                        class="min-h-[220px] flex-1 rounded-md border border-border-default bg-bg-secondary px-3 py-3 text-sm leading-6 text-text-primary outline-none transition focus:border-accent-emphasis"
                        rows={10}
                        value={promptInput()}
                        onInput={(event) =>
                          setPromptInput(event.currentTarget.value)
                        }
                      />
                    </label>

                    <div class="grid gap-2">
                      <button
                        type="button"
                        class="rounded-md bg-accent-emphasis px-4 py-2 text-sm font-medium text-text-on-emphasis transition hover:bg-accent-fg disabled:cursor-not-allowed disabled:opacity-60"
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
                        class="rounded-md border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={
                          submitting() ||
                          modelProfilesLoading() ||
                          runningDefaultPromptAction() !== null
                        }
                        onClick={() => void submitPrompt(false)}
                      >
                        Queue prompt
                      </button>
                      <button
                        type="button"
                        class="rounded-md border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={
                          submitting() ||
                          modelProfilesLoading() ||
                          runningDefaultPromptAction() !== null
                        }
                        onClick={() =>
                          void runDefaultPromptAction("ai-session-purpose")
                        }
                      >
                        {runningDefaultPromptAction() === "ai-session-purpose"
                          ? "Running purpose prompt..."
                          : "Run default purpose prompt"}
                      </button>

                      <Show when={selectedSessionEntry() !== null}>
                        <button
                          type="button"
                          class="rounded-md border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            submitting() ||
                            runningDefaultPromptAction() !== null
                          }
                          onClick={() =>
                            void runDefaultPromptAction(
                              "ai-session-refresh-purpose",
                            )
                          }
                        >
                          {runningDefaultPromptAction() ===
                          "ai-session-refresh-purpose"
                            ? "Running refresh prompt..."
                            : "Refresh purpose"}
                        </button>
                        <button
                          type="button"
                          class="rounded-md border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            submitting() ||
                            runningDefaultPromptAction() !== null
                          }
                          onClick={() =>
                            void runDefaultPromptAction("ai-session-resume")
                          }
                        >
                          {runningDefaultPromptAction() === "ai-session-resume"
                            ? "Running resume prompt..."
                            : "Resume session"}
                        </button>
                        <button
                          type="button"
                          class="rounded-md border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            submitting() ||
                            runningDefaultPromptAction() !== null ||
                            promptInput().trim().length === 0
                          }
                          onClick={() =>
                            void restartSelectedSessionFromBeginning()
                          }
                        >
                          Restart from beginning
                        </button>
                        <Show when={selectedSessionCancelAction() !== null}>
                          <button
                            type="button"
                            class="rounded-md border border-danger-emphasis/40 bg-danger-subtle px-4 py-2 text-sm font-medium text-danger-fg transition hover:bg-danger-emphasis/20"
                            onClick={() => {
                              const cancelAction =
                                selectedSessionCancelAction();
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
                      </Show>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </section>
  );
}
