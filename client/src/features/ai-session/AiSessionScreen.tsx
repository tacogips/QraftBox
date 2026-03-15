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
import { AiSessionChatPane } from "./AiSessionChatPane";
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
  type AiSessionLiveAssistantPhase,
  type AiSessionTranscriptLine,
  buildAiSessionListEntries,
  buildAiSessionTranscriptLines,
  reconcileAiSessionTranscriptLines,
  describeAiSessionExecutionFlow,
  describeAiSessionEntryAgent,
  describeAiSessionEntryOrigin,
  resolveAiSessionCancelAction,
  describeAiSessionEntryModel,
  describeAiSessionTarget,
  formatAiSessionTimestamp,
  getQueuedPromptSummary,
  mergePendingAiSessionTranscriptLines,
} from "./presentation";
import {
  applyAiSessionSearchDraft,
  appendAiSessionSubmitContextReferences,
  canApplyAiSessionScopedRequestResult,
  buildAiSessionScreenHash,
  canSubmitAiSessionComposerPrompt,
  canLoadMoreAiSessionHistory,
  canLoadMoreAiSessionTranscript,
  canClearAiSessionSearch,
  countAiSessionSystemPromptLines,
  createAiSessionTranscriptPageState,
  type AiSessionRequestToken,
  createAiSessionDefaultPromptMessage,
  createAiSessionImageAttachmentReferences,
  createAiSessionOptimisticUserMessage,
  resolveAiSessionSelectedModelState,
  createAiSessionSubmitContext,
  didAiSessionHistoryFilterChange,
  createAiSessionScopeResetState,
  createAiSessionHistoryFilters,
  createAiSessionDetailRequestKey,
  type AiSessionDefaultPromptAction,
  createAiSessionScopeKey,
  createAiSessionScopeResetLoadingState,
  isAiSessionComposerBusy,
  createLatestAiSessionRequestGuard,
  fetchAiSessionDetailArtifacts,
  filterAiSessionTranscriptSystemPromptLines,
  isAiSessionScopeCurrent,
  loadAiSessionShowSystemPromptsPreference,
  parseAiSessionOverviewRouteState,
  persistAiSessionShowSystemPromptsPreference,
  readAiSessionOverviewRouteSearchFromHash,
  resolveAiSessionRequestToken,
  resolveAiSessionRuntimeSession,
  resolveAiSessionStreamSessionId,
  resolveAiSessionSubmitModelProfileId,
  resolveAiSessionSubmitTarget,
  resolveAiSessionOverviewPollingMode,
  normalizeAiSessionLiveAssistantStatusText,
  shouldRetireAiSessionLiveAssistantFromTranscript,
  shouldPreserveAiSessionLiveAssistantStateOnStreamOpen,
  shouldShowAiSessionComposer,
  shouldAutoRefreshAiSessionOverview,
  updateHiddenAiSessionIds,
} from "./state";

export interface AiSessionScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly projectSlug: string | null;
  readonly projectPath: string;
  readonly selectedPath: string | null;
  readonly fileContent: FileContent | null;
  readonly diffOverview: DiffOverviewState;
  readonly onOpenFilesScreen: (() => void) | undefined;
  readonly onOpenProjectScreen: (() => void) | undefined;
}

const ACTIVE_SESSION_POLL_MS = 4000;
const IDLE_SESSION_POLL_MS = 20_000;
const SESSION_HISTORY_PAGE_SIZE = 20;
const SELECTED_SESSION_TRANSCRIPT_PAGE_SIZE = 200;
const MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const DEFAULT_PROMPT_ACTION_LABELS: Readonly<
  Record<
    AiSessionDefaultPromptAction,
    {
      readonly idleLabel: string;
      readonly runningLabel: string;
    }
  >
> = {
  "ai-session-purpose": {
    idleLabel: "Create Purpose",
    runningLabel: "Creating...",
  },
  "ai-session-refresh-purpose": {
    idleLabel: "Refresh Purpose",
    runningLabel: "Refreshing...",
  },
  "ai-session-resume": {
    idleLabel: "Resume Session",
    runningLabel: "Resuming...",
  },
};

interface ComposerImageAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly base64: string;
  readonly previewUrl: string;
}

function createComposerImageAttachmentId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createComposerImageAttachmentKey(params: {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}): string {
  return `${params.fileName}:${params.sizeBytes}:${params.mimeType}`;
}

function formatAttachmentBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onload = () => {
      if (typeof fileReader.result === "string") {
        resolve(fileReader.result);
        return;
      }

      reject(new Error("Failed to read image file."));
    };

    fileReader.onerror = () => {
      reject(new Error("Failed to read image file."));
    };

    fileReader.readAsDataURL(file);
  });
}

function detectPhoneViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= 768;
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

function renderCreatePurposeIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="M10 3.5 11.6 7l3.9.5-2.9 2.8.8 4-3.4-1.9-3.4 1.9.8-4-2.9-2.8 3.9-.5Z"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M14.5 4.5v3" stroke-linecap="round" />
      <path d="M13 6h3" stroke-linecap="round" />
    </svg>
  );
}

function renderRefreshPurposeIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="M14.8 10.2a4.8 4.8 0 1 1-1.1-3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12.4 4.1h2.8v2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M10 7.2v1.8" stroke-linecap="round" />
      <path d="M10 11.2V13" stroke-linecap="round" />
      <path d="M7.9 10.1h1.8" stroke-linecap="round" />
      <path d="M11.9 10.1h1.8" stroke-linecap="round" />
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

function renderAttachImageIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="M6.5 10.5 10 7l3.5 3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M4 15.5h12a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 16 4.5H4A1.5 1.5 0 0 0 2.5 6v8A1.5 1.5 0 0 0 4 15.5Z"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="6.5" cy="7" r="1" />
    </svg>
  );
}

function renderJumpToLatestIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="m6.5 6 3.5 3.5L13.5 6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="m6.5 10.5 3.5 3.5 3.5-3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function renderJumpToHeadIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="m6.5 14 3.5-3.5 3.5 3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="m6.5 9.5 3.5-3.5 3.5 3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function renderCloseIcon(): JSX.Element {
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

function renderSystemPromptVisibilityIcon(hiddenCount: number): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <rect x="3.5" y="4" width="13" height="10" rx="2" />
      <path d="M6.5 7.5h7" stroke-linecap="round" />
      <path d="M6.5 10.5h4" stroke-linecap="round" />
      <Show when={hiddenCount > 0}>
        <path d="M4 16 16 4" stroke-linecap="round" />
      </Show>
    </svg>
  );
}

function renderSessionVisibilityIcon(hidden: boolean): JSX.Element {
  if (hidden) {
    return (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      >
        <path
          d="M3 10c1.8-3 4.3-4.5 7-4.5s5.2 1.5 7 4.5c-1.8 3-4.3 4.5-7 4.5S4.8 13 3 10Z"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle cx="10" cy="10" r="2.25" />
        <path d="M4 16 16 4" stroke-linecap="round" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="M3 10c1.8-3 4.3-4.5 7-4.5s5.2 1.5 7 4.5c-1.8 3-4.3 4.5-7 4.5S4.8 13 3 10Z"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="10" cy="10" r="2.25" />
    </svg>
  );
}

export function AiSessionScreen(props: AiSessionScreenProps): JSX.Element {
  const initialOverviewRouteState = parseAiSessionOverviewRouteState(
    readAiSessionOverviewRouteSearchFromHash(window.location.hash),
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
  const [isDraftComposerOpen, setIsDraftComposerOpen] = createSignal(
    initialOverviewRouteState.isDraftComposerOpen,
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
  const [attachmentError, setAttachmentError] = createSignal<string | null>(
    null,
  );
  const [imageAttachments, setImageAttachments] = createSignal<
    readonly ComposerImageAttachment[]
  >([]);
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
    createSignal<AiSessionDefaultPromptAction | null>(null);
  const [isPurposeExpanded, setIsPurposeExpanded] = createSignal(false);
  const [isTranscriptHistoryCollapsed, setIsTranscriptHistoryCollapsed] =
    createSignal(initialOverviewRouteState.selectedSessionId === null);
  const [isComposerFooterCollapsed, setIsComposerFooterCollapsed] =
    createSignal(false);
  const [selectedSessionDetail, setSelectedSessionDetail] =
    createSignal<ExtendedSessionEntry | null>(null);
  const [selectedSessionTranscript, setSelectedSessionTranscript] =
    createSignal<readonly AiSessionTranscriptLine[]>([]);
  const [
    selectedSessionTranscriptLoadedEventCount,
    setSelectedSessionTranscriptLoadedEventCount,
  ] = createSignal(0);
  const [
    selectedSessionTranscriptStartOffset,
    setSelectedSessionTranscriptStartOffset,
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
  const [liveAssistantText, setLiveAssistantText] = createSignal<string | null>(
    null,
  );
  const [liveAssistantTimestamp, setLiveAssistantTimestamp] = createSignal<
    string | null
  >(null);
  const [liveAssistantPhase, setLiveAssistantPhase] =
    createSignal<AiSessionLiveAssistantPhase>("idle");
  const [liveAssistantStatusText, setLiveAssistantStatusText] = createSignal<
    string | null
  >(null);
  const [optimisticUserText, setOptimisticUserText] = createSignal<
    string | null
  >(null);
  const [optimisticUserTimestamp, setOptimisticUserTimestamp] = createSignal<
    string | null
  >(null);
  const [optimisticUserAnchorIndex, setOptimisticUserAnchorIndex] =
    createSignal<number | null>(null);
  const [preferredStreamRuntimeSessionId, setPreferredStreamRuntimeSessionId] =
    createSignal<QraftAiSessionId | null>(null);
  const [
    preferredStreamRuntimeSessionOwnerQraftAiSessionId,
    setPreferredStreamRuntimeSessionOwnerQraftAiSessionId,
  ] = createSignal<QraftAiSessionId | null>(null);
  const [showSystemPrompts, setShowSystemPrompts] = createSignal(
    loadAiSessionShowSystemPromptsPreference(),
  );
  const [copiedTranscriptLineId, setCopiedTranscriptLineId] = createSignal<
    string | null
  >(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [isPhoneViewport, setIsPhoneViewport] = createSignal(
    detectPhoneViewport(),
  );

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let activeScopeKey: string | null = null;
  let activePollingConfigKey: string | null = null;
  let lastPollingMode: "active" | "idle" | null = null;
  let activeSelectedSessionDetailKey: string | null = null;
  let activeSelectedSessionStreamKey: string | null = null;
  let activeSelectedSessionEventSource: EventSource | null = null;
  let transcriptScrollContainer: HTMLDivElement | null = null;
  let copiedTranscriptLineResetTimer: ReturnType<typeof setTimeout> | null =
    null;
  const activityRequestGuard = createLatestAiSessionRequestGuard();
  const hiddenSessionsRequestGuard = createLatestAiSessionRequestGuard();
  const modelProfilesRequestGuard = createLatestAiSessionRequestGuard();
  const selectedSessionRequestGuard = createLatestAiSessionRequestGuard();
  const mutationRequestGuard = createLatestAiSessionRequestGuard();

  const showComposer = () =>
    shouldShowAiSessionComposer({
      selectedQraftAiSessionId: selectedQraftAiSessionId(),
      isDraftComposerOpen: isDraftComposerOpen(),
    });
  const sessionTargetTextClass = () =>
    isPhoneViewport()
      ? "mt-1 break-words text-sm text-text-primary"
      : "mt-1 truncate text-sm text-text-primary";
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
  const selectedRuntimeSession = () =>
    resolveAiSessionRuntimeSession({
      selectedQraftAiSessionId: selectedQraftAiSessionId(),
      activeSessions: activeSessions(),
    });
  const selectedStreamSessionId = () =>
    resolveAiSessionStreamSessionId({
      selectedQraftAiSessionId: selectedQraftAiSessionId(),
      preferredRuntimeSessionId: preferredStreamRuntimeSessionId(),
      preferredRuntimeSessionOwnerQraftAiSessionId:
        preferredStreamRuntimeSessionOwnerQraftAiSessionId(),
      runtimeSession: selectedRuntimeSession(),
    });
  const displayedSelectedSessionTranscript = () => {
    return mergePendingAiSessionTranscriptLines({
      transcriptLines: selectedSessionTranscript(),
      optimisticUserText: optimisticUserText(),
      optimisticUserTimestamp: optimisticUserTimestamp(),
      optimisticAnchorIndex: optimisticUserAnchorIndex(),
      liveAssistantPhase: liveAssistantPhase(),
      liveAssistantText: liveAssistantText(),
      liveAssistantTimestamp: liveAssistantTimestamp(),
      liveAssistantStatusText: liveAssistantStatusText(),
    });
  };
  const visibleSelectedSessionTranscript = () =>
    filterAiSessionTranscriptSystemPromptLines({
      transcriptLines: displayedSelectedSessionTranscript(),
      showSystemPrompts: showSystemPrompts(),
    });
  const hiddenSystemPromptCount = () =>
    countAiSessionSystemPromptLines(displayedSelectedSessionTranscript());
  const transcriptSectionSummary = () => {
    if (selectedQraftAiSessionId() === null) {
      return "New sessions start without chat history.";
    }

    if (selectedSessionLoading()) {
      return "Loading chat history...";
    }

    if (selectedSessionError() !== null) {
      return "Chat history is unavailable right now.";
    }

    const transcriptLineCount = visibleSelectedSessionTranscript().length;
    return transcriptLineCount > 0
      ? `${transcriptLineCount} transcript entries`
      : "No chat history yet.";
  };
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
  const canRunDraftSessionDefaultPrompt = () =>
    selectedQraftAiSessionId() === null;
  const canRunSelectedSessionDefaultPrompts = () =>
    selectedQraftAiSessionId() !== null;
  const selectedComposerHeading = () =>
    selectedSessionEntry()?.title ?? "New AI session";
  const selectedComposerDescription = () =>
    selectedSessionEntry()?.detail ??
    "Compose the first prompt for a new session. Nothing will be sent until you run or queue it.";
  const selectedSessionModelState = () => {
    return resolveAiSessionSelectedModelState({
      overviewModelState: selectedSessionEntry(),
      detailModelState: selectedSessionDetail(),
    });
  };
  const selectedSessionModelLabel = () =>
    describeAiSessionEntryModel(selectedSessionModelState(), modelProfiles(), {
      unknownLabel: "-",
    });
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

  function clearImageAttachments(): void {
    for (const imageAttachment of imageAttachments()) {
      URL.revokeObjectURL(imageAttachment.previewUrl);
    }

    setImageAttachments([]);
  }

  function removeImageAttachment(imageAttachmentId: string): void {
    const nextImageAttachments: ComposerImageAttachment[] = [];

    for (const imageAttachment of imageAttachments()) {
      if (imageAttachment.id === imageAttachmentId) {
        URL.revokeObjectURL(imageAttachment.previewUrl);
        continue;
      }

      nextImageAttachments.push(imageAttachment);
    }

    setImageAttachments(nextImageAttachments);
  }

  async function handleImageAttachmentInput(event: Event): Promise<void> {
    const attachmentInput = event.currentTarget;
    if (!(attachmentInput instanceof HTMLInputElement)) {
      return;
    }

    const selectedFiles = attachmentInput.files;
    if (selectedFiles === null || selectedFiles.length === 0) {
      return;
    }

    setAttachmentError(null);
    const skippedMessages: string[] = [];
    const existingAttachmentKeys = new Set(
      imageAttachments().map((imageAttachment) =>
        createComposerImageAttachmentKey({
          fileName: imageAttachment.fileName,
          sizeBytes: imageAttachment.sizeBytes,
          mimeType: imageAttachment.mimeType,
        }),
      ),
    );
    const nextImageAttachments = [...imageAttachments()];

    for (const selectedFile of Array.from(selectedFiles)) {
      if (!selectedFile.type.startsWith("image/")) {
        skippedMessages.push(
          `${selectedFile.name}: only image files are supported.`,
        );
        continue;
      }

      if (selectedFile.size > MAX_IMAGE_ATTACHMENT_BYTES) {
        skippedMessages.push(
          `${selectedFile.name}: exceeds ${formatAttachmentBytes(
            MAX_IMAGE_ATTACHMENT_BYTES,
          )} limit.`,
        );
        continue;
      }

      const attachmentKey = createComposerImageAttachmentKey({
        fileName: selectedFile.name,
        sizeBytes: selectedFile.size,
        mimeType: selectedFile.type,
      });
      if (existingAttachmentKeys.has(attachmentKey)) {
        continue;
      }

      try {
        const dataUrl = await readImageFileAsDataUrl(selectedFile);
        const base64 = dataUrl.split(",", 2)[1];
        if (base64 === undefined || base64.length === 0) {
          skippedMessages.push(`${selectedFile.name}: failed to encode image.`);
          continue;
        }

        nextImageAttachments.push({
          id: createComposerImageAttachmentId(),
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          sizeBytes: selectedFile.size,
          base64,
          previewUrl: URL.createObjectURL(selectedFile),
        });
        existingAttachmentKeys.add(attachmentKey);
      } catch {
        skippedMessages.push(`${selectedFile.name}: failed to read image.`);
      }
    }

    setImageAttachments(nextImageAttachments);
    setAttachmentError(
      skippedMessages.length > 0 ? skippedMessages.join(" ") : null,
    );
    attachmentInput.value = "";
  }

  createEffect(() => {
    persistAiSessionShowSystemPromptsPreference(showSystemPrompts());
  });

  createEffect(() => {
    const syncPhoneViewport = () => {
      setIsPhoneViewport(detectPhoneViewport());
    };

    syncPhoneViewport();
    window.addEventListener("resize", syncPhoneViewport);

    onCleanup(() => {
      window.removeEventListener("resize", syncPhoneViewport);
    });
  });

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

  function restartPolling(params: {
    readonly contextId: string;
    readonly projectPath: string;
    readonly scopeKey: string;
    readonly pollingMode: "active" | "idle";
  }): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }

    const refreshIntervalMs =
      params.pollingMode === "active"
        ? ACTIVE_SESSION_POLL_MS
        : IDLE_SESSION_POLL_MS;

    pollTimer = setInterval(() => {
      if (
        !shouldAutoRefreshAiSessionOverview({
          selectedQraftAiSessionId: selectedQraftAiSessionId(),
        })
      ) {
        return;
      }

      void refreshActivity(params.contextId, params.projectPath);
      if (params.pollingMode === "idle") {
        void refreshHiddenSessions(params.scopeKey);
      }
    }, refreshIntervalMs);
  }

  createEffect(() => {
    const contextId = props.contextId;
    const projectPath = props.projectPath;
    const nextScopeKey = createAiSessionScopeKey(contextId, projectPath);

    if (activeScopeKey !== nextScopeKey) {
      activeScopeKey = nextScopeKey;
      clearImageAttachments();
      const scopeResetState = createAiSessionScopeResetState(
        readAiSessionOverviewRouteSearchFromHash(window.location.hash),
      );
      setSelectedQraftAiSessionId(scopeResetState.selectedSessionId);
      setIsDraftComposerOpen(scopeResetState.isDraftComposerOpen);
      setDraftSessionId(scopeResetState.draftSessionId);
      setPromptInput(scopeResetState.promptInput);
      setAttachmentError(null);
      setSearchDraftQuery(scopeResetState.searchQuery);
      setSearchDraftInTranscript(scopeResetState.searchInTranscript);
      setSearchQuery(scopeResetState.searchQuery);
      setSearchInTranscript(scopeResetState.searchInTranscript);
      setHistoryRequestedLimit(SESSION_HISTORY_PAGE_SIZE);
      activePollingConfigKey = null;
      lastPollingMode = null;
    }

    activityRequestGuard.invalidate();
    hiddenSessionsRequestGuard.invalidate();
    modelProfilesRequestGuard.invalidate();
    setErrorMessage(null);
    setActiveSessions([]);
    setPromptQueue([]);
    setHistoricalSessions([]);
    setHistoryTotal(0);
    selectedSessionRequestGuard.invalidate();
    setSelectedSessionDetail(null);
    setSelectedSessionTranscript([]);
    setSelectedSessionTranscriptLoadedEventCount(0);
    setSelectedSessionTranscriptStartOffset(0);
    setSelectedSessionTranscriptTotal(0);
    setSelectedSessionError(null);
    setLiveAssistantText(null);
    setLiveAssistantTimestamp(null);
    setLiveAssistantPhase("idle");
    setLiveAssistantStatusText(null);
    setOptimisticUserText(null);
    setOptimisticUserTimestamp(null);
    setOptimisticUserAnchorIndex(null);
    setPreferredStreamRuntimeSessionId(null);
    setPreferredStreamRuntimeSessionOwnerQraftAiSessionId(null);
    const resetLoadingState = createAiSessionScopeResetLoadingState();
    setHistoryLoading(resetLoadingState.historyLoading);
    setActivityLoading(resetLoadingState.activityLoading);
    setModelProfilesLoading(resetLoadingState.modelProfilesLoading);
    setSelectedSessionLoading(resetLoadingState.selectedSessionLoading);
    setSelectedSessionLoadingMore(resetLoadingState.selectedSessionLoadingMore);
    setSubmitting(resetLoadingState.submitting);
    setRunningDefaultPromptAction(null);
    setHistoryLoadingMore(false);

    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    activePollingConfigKey = null;
    lastPollingMode = null;

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
  });

  createEffect(() => {
    const contextId = props.contextId;
    const projectPath = props.projectPath;
    const scopeKey = createAiSessionScopeKey(contextId, projectPath);
    const autoRefreshEnabled = shouldAutoRefreshAiSessionOverview({
      selectedQraftAiSessionId: selectedQraftAiSessionId(),
    });

    if (
      contextId === null ||
      scopeKey === null ||
      autoRefreshEnabled === false
    ) {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      activePollingConfigKey = null;
      lastPollingMode = null;
      return;
    }

    const pollingMode = resolveAiSessionOverviewPollingMode({
      activeSessions: activeSessions(),
      promptQueue: promptQueue(),
    });
    const nextPollingConfigKey = `${scopeKey}:${pollingMode}`;
    const previousPollingMode = lastPollingMode;

    if (activePollingConfigKey === nextPollingConfigKey) {
      return;
    }

    activePollingConfigKey = nextPollingConfigKey;
    lastPollingMode = pollingMode;
    restartPolling({
      contextId,
      projectPath,
      scopeKey,
      pollingMode,
    });

    if (previousPollingMode !== null && previousPollingMode !== pollingMode) {
      void refreshActivity(contextId, projectPath);
      if (pollingMode === "idle") {
        void refreshHiddenSessions(scopeKey);
      }
    }
  });

  async function refreshSelectedSessionArtifacts(params: {
    readonly contextId: string;
    readonly qraftAiSessionId: QraftAiSessionId;
    readonly hasHistoricalSession: boolean;
    readonly loadOlderTranscript: boolean;
    readonly preserveExistingContent?: boolean | undefined;
  }): Promise<void> {
    const requestScopeKey = `${params.contextId}:${params.qraftAiSessionId}`;
    const requestToken = selectedSessionRequestGuard.issue(requestScopeKey);
    const currentTranscriptStartOffset = selectedSessionTranscriptStartOffset();
    const currentLoadedEventCount = selectedSessionTranscriptLoadedEventCount();

    if (params.loadOlderTranscript) {
      setSelectedSessionLoadingMore(true);
    } else {
      if (params.preserveExistingContent !== true) {
        setSelectedSessionLoading(true);
        setSelectedSessionDetail(null);
        setSelectedSessionTranscript([]);
        setSelectedSessionTranscriptLoadedEventCount(0);
        setSelectedSessionTranscriptStartOffset(0);
        setSelectedSessionTranscriptTotal(0);
      }
    }
    setSelectedSessionError(null);

    try {
      const { sessionDetail, transcript } = await fetchAiSessionDetailArtifacts(
        {
          pageSize: SELECTED_SESSION_TRANSCRIPT_PAGE_SIZE,
          loadOlderTranscript: params.loadOlderTranscript,
          preserveExistingContent: params.preserveExistingContent === true,
          hasHistoricalSession: params.hasHistoricalSession,
          currentSessionDetail: selectedSessionDetail(),
          currentTranscriptStartOffset,
          currentLoadedEventCount,
          fetchSessionDetail: () =>
            aiSessionsApi.fetchClaudeSession(
              params.contextId,
              params.qraftAiSessionId,
            ),
          fetchTranscript: (query) =>
            aiSessionsApi.fetchClaudeSessionTranscript(
              params.contextId,
              params.qraftAiSessionId,
              query,
            ),
        },
      );

      if (!selectedSessionRequestGuard.isCurrent(requestToken)) {
        return;
      }

      setSelectedSessionDetail(sessionDetail);
      if (transcript === null) {
        return;
      }

      const nextTranscriptState = createAiSessionTranscriptPageState({
        currentTranscriptLines: selectedSessionTranscript(),
        nextTranscriptLines: buildAiSessionTranscriptLines(transcript.events, {
          offset: transcript.offset,
        }),
        currentLoadedEventCount,
        loadOlderTranscript: params.loadOlderTranscript,
        transcriptOffset: transcript.offset,
        transcriptTotal: transcript.total,
        transcriptEventCount: transcript.events.length,
      });
      setSelectedSessionTranscript((currentTranscriptLines) =>
        reconcileAiSessionTranscriptLines(
          currentTranscriptLines,
          nextTranscriptState.transcriptLines,
        ),
      );
      setSelectedSessionTranscriptLoadedEventCount(
        nextTranscriptState.loadedEventCount,
      );
      setSelectedSessionTranscriptStartOffset(nextTranscriptState.startOffset);
      setSelectedSessionTranscriptTotal(nextTranscriptState.totalCount);

      if (
        !params.loadOlderTranscript &&
        params.preserveExistingContent !== true
      ) {
        window.requestAnimationFrame(() => {
          scrollSelectedTranscriptToLatest("auto");
        });
      }
    } catch (error) {
      if (!selectedSessionRequestGuard.isCurrent(requestToken)) {
        return;
      }

      if (
        !params.loadOlderTranscript &&
        params.preserveExistingContent !== true
      ) {
        setSelectedSessionDetail(null);
        setSelectedSessionTranscript([]);
        setSelectedSessionTranscriptLoadedEventCount(0);
        setSelectedSessionTranscriptStartOffset(0);
        setSelectedSessionTranscriptTotal(0);
      }
      setSelectedSessionError(
        error instanceof Error
          ? error.message
          : params.loadOlderTranscript
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
    const nextHash = buildAiSessionScreenHash({
      projectSlug: props.projectSlug,
      overviewRouteState: {
        selectedSessionId,
        isDraftComposerOpen:
          selectedSessionId === null && isDraftComposerOpen(),
        searchQuery: searchQuery(),
        searchInTranscript: searchInTranscript(),
      },
    });

    if (window.location.hash !== nextHash) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}${nextHash}`,
      );
    }
  });

  createEffect(() => {
    setIsTranscriptHistoryCollapsed(selectedQraftAiSessionId() === null);
  });

  createEffect(() => {
    if (isTranscriptHistoryCollapsed()) {
      transcriptScrollContainer = null;
    }
  });

  createEffect(() => {
    const detailTarget = selectedSessionDetailTarget();
    setIsPurposeExpanded(false);
    setIsComposerFooterCollapsed(false);

    if (detailTarget === null) {
      activeSelectedSessionDetailKey = null;
      selectedSessionRequestGuard.invalidate();
      setSelectedSessionDetail(null);
      setSelectedSessionTranscript([]);
      setSelectedSessionTranscriptLoadedEventCount(0);
      setSelectedSessionTranscriptStartOffset(0);
      setSelectedSessionTranscriptTotal(0);
      setSelectedSessionError(null);
      setLiveAssistantText(null);
      setLiveAssistantTimestamp(null);
      setLiveAssistantPhase("idle");
      setLiveAssistantStatusText(null);
      setOptimisticUserText(null);
      setOptimisticUserTimestamp(null);
      setOptimisticUserAnchorIndex(null);
      setPreferredStreamRuntimeSessionId(null);
      setPreferredStreamRuntimeSessionOwnerQraftAiSessionId(null);
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
    setLiveAssistantText(null);
    setLiveAssistantTimestamp(null);
    setLiveAssistantPhase("idle");
    setLiveAssistantStatusText(null);
    setOptimisticUserText(null);
    setOptimisticUserTimestamp(null);
    setOptimisticUserAnchorIndex(null);
    setPreferredStreamRuntimeSessionId(null);
    setPreferredStreamRuntimeSessionOwnerQraftAiSessionId(null);
    void refreshSelectedSessionArtifacts({
      ...detailTarget,
      loadOlderTranscript: false,
    });
  });

  createEffect(() => {
    const optimisticText = optimisticUserText();
    if (optimisticText === null || optimisticText.trim().length === 0) {
      return;
    }

    const normalizedOptimisticText = optimisticText.replace(/\s+/g, " ").trim();
    if (normalizedOptimisticText.length === 0) {
      setOptimisticUserText(null);
      setOptimisticUserTimestamp(null);
      return;
    }

    const persistedTranscriptLines = selectedSessionTranscript();
    const optimisticAnchorIndex = optimisticUserAnchorIndex();
    const transcriptTail =
      optimisticAnchorIndex === null
        ? persistedTranscriptLines
        : persistedTranscriptLines.slice(optimisticAnchorIndex);
    const hasPersistedUserMessage = transcriptTail.some(
      (transcriptLine) =>
        transcriptLine.role === "user" &&
        transcriptLine.text.replace(/\s+/g, " ").trim() ===
          normalizedOptimisticText,
    );

    if (!hasPersistedUserMessage) {
      return;
    }

    setOptimisticUserText(null);
    setOptimisticUserTimestamp(null);
  });

  createEffect(() => {
    if (
      !shouldRetireAiSessionLiveAssistantFromTranscript({
        transcriptLines: selectedSessionTranscript(),
        optimisticAnchorIndex: optimisticUserAnchorIndex(),
        liveAssistantPhase: liveAssistantPhase(),
        liveAssistantText: liveAssistantText(),
      })
    ) {
      return;
    }

    setLiveAssistantText(null);
    setLiveAssistantTimestamp(null);
    setLiveAssistantPhase("idle");
    setLiveAssistantStatusText(null);
    setOptimisticUserAnchorIndex(null);
  });

  createEffect(() => {
    const contextId = props.contextId;
    const selectedSessionKey = selectedQraftAiSessionId();
    const streamSessionId = selectedStreamSessionId();
    const nextStreamKey =
      contextId !== null &&
      selectedSessionKey !== null &&
      streamSessionId !== null
        ? `${streamSessionId}:${selectedSessionKey}`
        : null;

    if (nextStreamKey === activeSelectedSessionStreamKey) {
      return;
    }

    const preserveLiveAssistantState =
      shouldPreserveAiSessionLiveAssistantStateOnStreamOpen({
        selectedQraftAiSessionId: selectedSessionKey,
        streamSessionId,
        preferredRuntimeSessionId: preferredStreamRuntimeSessionId(),
        preferredRuntimeSessionOwnerQraftAiSessionId:
          preferredStreamRuntimeSessionOwnerQraftAiSessionId(),
        liveAssistantPhase: liveAssistantPhase(),
      });

    activeSelectedSessionStreamKey = nextStreamKey;
    activeSelectedSessionEventSource?.close();
    activeSelectedSessionEventSource = null;
    setLiveAssistantText(null);
    if (!preserveLiveAssistantState) {
      setLiveAssistantTimestamp(null);
      setLiveAssistantPhase("idle");
      setLiveAssistantStatusText(null);
    }

    if (
      contextId === null ||
      selectedSessionKey === null ||
      streamSessionId === null
    ) {
      return;
    }

    const eventSource = new EventSource(
      `${props.apiBaseUrl}/ai/sessions/${encodeURIComponent(streamSessionId)}/stream`,
    );
    activeSelectedSessionEventSource = eventSource;

    const showLiveAssistantPlaceholder = (
      phase: Exclude<AiSessionLiveAssistantPhase, "idle">,
      statusText: string | null,
      timestamp: string | null,
    ): void => {
      setLiveAssistantPhase(phase);
      setLiveAssistantStatusText(
        normalizeAiSessionLiveAssistantStatusText(statusText),
      );
      setLiveAssistantTimestamp(timestamp);
    };

    const resolvePayloadTimestamp = (payload: {
      readonly timestamp?: unknown;
    }): string | null =>
      typeof payload.timestamp === "string" ? payload.timestamp : null;

    const handleConnected = (event: Event): void => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      showLiveAssistantPlaceholder("starting", "Thinking...", null);
    };

    const handleStreamOpen = (): void => {
      if (
        liveAssistantPhase() === "streaming" &&
        liveAssistantText() !== null
      ) {
        return;
      }

      showLiveAssistantPlaceholder(
        "starting",
        liveAssistantStatusText() ?? "Thinking...",
        liveAssistantTimestamp(),
      );
    };

    const handleSessionStarted = (event: Event): void => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as {
          readonly timestamp?: unknown;
        };
        showLiveAssistantPlaceholder(
          "thinking",
          "Thinking...",
          resolvePayloadTimestamp(payload),
        );
      } catch {
        showLiveAssistantPlaceholder("thinking", "Thinking...", null);
      }
    };

    const handleThinkingEvent = (event: Event): void => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as {
          readonly data?: {
            readonly message?: unknown;
          };
          readonly timestamp?: unknown;
        };
        showLiveAssistantPlaceholder(
          "thinking",
          typeof payload.data?.message === "string" &&
            payload.data.message.length > 0
            ? payload.data.message
            : "Thinking...",
          resolvePayloadTimestamp(payload),
        );
      } catch {
        showLiveAssistantPlaceholder("thinking", "Thinking...", null);
      }
    };

    const handleToolLifecycleEvent = (
      event: Event,
      resolveStatusText: (payload: {
        readonly data?: Record<string, unknown> | undefined;
      }) => string,
    ): void => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as {
          readonly data?: Record<string, unknown>;
          readonly timestamp?: unknown;
        };
        showLiveAssistantPlaceholder(
          "thinking",
          resolveStatusText(payload),
          resolvePayloadTimestamp(payload),
        );
      } catch {
        showLiveAssistantPlaceholder("thinking", "Thinking...", null);
      }
    };

    const handleAssistantMessage = (event: Event): void => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as {
          readonly data?: {
            readonly role?: unknown;
            readonly content?: unknown;
          };
          readonly timestamp?: unknown;
        };

        if (payload.data?.role !== "assistant") {
          return;
        }

        if (typeof payload.data.content !== "string") {
          return;
        }

        setLiveAssistantPhase("streaming");
        setLiveAssistantText(payload.data.content);
        setLiveAssistantTimestamp(
          typeof payload.timestamp === "string" ? payload.timestamp : null,
        );
        setLiveAssistantStatusText(null);
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    const handleTerminalEvent = (event: Event): void => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      eventSource.close();
      if (activeSelectedSessionEventSource === eventSource) {
        activeSelectedSessionEventSource = null;
        activeSelectedSessionStreamKey = null;
      }
      setPreferredStreamRuntimeSessionId(null);
      setPreferredStreamRuntimeSessionOwnerQraftAiSessionId(null);
      if (liveAssistantText() === null) {
        setLiveAssistantTimestamp(null);
        setLiveAssistantPhase("idle");
        setLiveAssistantStatusText(null);
      }

      if (props.contextId !== null && props.projectPath.length > 0) {
        void refreshActivity(props.contextId, props.projectPath);
      }

      const detailTarget = selectedSessionDetailTarget();
      if (
        detailTarget !== null &&
        detailTarget.qraftAiSessionId === selectedSessionKey
      ) {
        void refreshSelectedSessionArtifacts({
          ...detailTarget,
          loadOlderTranscript: false,
          preserveExistingContent: true,
        });
      }
    };

    eventSource.addEventListener("open", handleStreamOpen);
    eventSource.addEventListener("connected", handleConnected);
    eventSource.addEventListener("session_started", handleSessionStarted);
    eventSource.addEventListener("thinking", handleThinkingEvent);
    eventSource.addEventListener("tool_use", (event) =>
      handleToolLifecycleEvent(event, (payload) => {
        const toolName = payload.data?.toolName;
        return typeof toolName === "string" && toolName.length > 0
          ? `Using ${toolName}...`
          : "Thinking...";
      }),
    );
    eventSource.addEventListener("tool_result", (event) =>
      handleToolLifecycleEvent(event, (payload) => {
        const toolName = payload.data?.toolName;
        return typeof toolName === "string" && toolName.length > 0
          ? `Processing ${toolName} result...`
          : "Thinking...";
      }),
    );
    eventSource.addEventListener("message", handleAssistantMessage);
    eventSource.addEventListener("completed", handleTerminalEvent);
    eventSource.addEventListener("cancelled", handleTerminalEvent);
    eventSource.addEventListener("error", handleTerminalEvent);
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
      setIsDraftComposerOpen(false);
    }
  });

  createEffect(() => {
    const handlePopState = (): void => {
      const nextOverviewRouteState = parseAiSessionOverviewRouteState(
        readAiSessionOverviewRouteSearchFromHash(window.location.hash),
      );
      const shouldRefreshHistory = didAiSessionHistoryFilterChange({
        currentSearchQuery: searchQuery(),
        currentSearchInTranscript: searchInTranscript(),
        nextOverviewRouteState,
      });
      setSelectedQraftAiSessionId(nextOverviewRouteState.selectedSessionId);
      setIsDraftComposerOpen(nextOverviewRouteState.isDraftComposerOpen);
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
    activeSelectedSessionEventSource?.close();
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }
    if (copiedTranscriptLineResetTimer !== null) {
      clearTimeout(copiedTranscriptLineResetTimer);
    }
    clearImageAttachments();
  });

  async function writeTextToClipboard(text: string): Promise<void> {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.clipboard?.writeText === "function" &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    textarea.style.fontSize = "16px";
    textarea.style.pointerEvents = "none";
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) {
      throw new Error("Clipboard copy failed");
    }
  }

  async function copyTranscriptLine(
    transcriptLine: AiSessionTranscriptLine,
  ): Promise<void> {
    const normalizedText = transcriptLine.text.trim();
    if (normalizedText.length === 0) {
      return;
    }

    try {
      await writeTextToClipboard(normalizedText);
      setCopiedTranscriptLineId(transcriptLine.id);
      if (copiedTranscriptLineResetTimer !== null) {
        clearTimeout(copiedTranscriptLineResetTimer);
      }
      copiedTranscriptLineResetTimer = setTimeout(() => {
        setCopiedTranscriptLineId((currentCopiedTranscriptLineId) =>
          currentCopiedTranscriptLineId === transcriptLine.id
            ? null
            : currentCopiedTranscriptLineId,
        );
        copiedTranscriptLineResetTimer = null;
      }, 1500);
    } catch {
      setErrorMessage("Failed to copy the transcript message.");
    }
  }

  async function submitPromptMessage(
    message: string,
    runImmediately: boolean,
    options: {
      readonly clearComposerInput: boolean;
      readonly includeComposerAttachments: boolean;
      readonly forceNewSession?: boolean | undefined;
      readonly requestToken?: AiSessionRequestToken | undefined;
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
    const requestToken = resolveAiSessionRequestToken({
      requestGuard: mutationRequestGuard,
      scopeKey,
      requestToken: options.requestToken,
    });
    activityRequestGuard.invalidate();
    setSubmitting(true);
    try {
      const submitTarget = resolveAiSessionSubmitTarget({
        selectedQraftAiSessionId: selectedQraftAiSessionId(),
        draftSessionId: draftSessionId(),
        restartFromBeginning: options.forceNewSession === true,
      });
      const submitContext = appendAiSessionSubmitContextReferences({
        submitContext: createAiSessionSubmitContext({
          selectedPath: props.selectedPath,
          fileContent: props.fileContent,
          diffOverview: props.diffOverview,
        }),
        additionalReferences: options.includeComposerAttachments
          ? createAiSessionImageAttachmentReferences(imageAttachments())
          : [],
      });
      const optimisticUserMessage = options.includeComposerAttachments
        ? createAiSessionOptimisticUserMessage({
            message,
            submitContext,
          })
        : message;
      const submitResult = await aiSessionsApi.submitPrompt({
        runImmediately,
        message,
        projectPath,
        qraftAiSessionId: submitTarget.qraftAiSessionId,
        forceNewSession: submitTarget.forceNewSession,
        modelProfileId: resolveAiSessionSubmitModelProfileId({
          selectedQraftAiSessionId: selectedQraftAiSessionId(),
          selectedSessionModelProfileId:
            selectedSessionModelState().modelProfileId,
          draftModelProfileId: selectedModelProfileId(),
        }),
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
      if (options.includeComposerAttachments) {
        clearImageAttachments();
        setAttachmentError(null);
      }
      setSelectedQraftAiSessionId(submitTarget.qraftAiSessionId);
      setIsDraftComposerOpen(false);
      setSelectedSessionError(null);
      setOptimisticUserText(optimisticUserMessage);
      setOptimisticUserTimestamp(new Date().toISOString());
      setOptimisticUserAnchorIndex(selectedSessionTranscript().length);
      setLiveAssistantText(null);
      setLiveAssistantTimestamp(null);
      setLiveAssistantPhase(runImmediately ? "starting" : "idle");
      setLiveAssistantStatusText(runImmediately ? "Thinking..." : null);
      setPreferredStreamRuntimeSessionId(
        runImmediately ? submitResult.sessionId : null,
      );
      setPreferredStreamRuntimeSessionOwnerQraftAiSessionId(
        runImmediately ? submitTarget.qraftAiSessionId : null,
      );
      try {
        const [nextActiveSessions, nextPromptQueue] = await Promise.all([
          aiSessionsApi.fetchActiveSessions({
            projectPath,
          }),
          aiSessionsApi.fetchPromptQueue({
            projectPath,
          }),
        ]);
        if (
          mutationRequestGuard.isCurrent(requestToken) &&
          isAiSessionScopeCurrent({
            expectedScopeKey: scopeKey,
            contextId: props.contextId,
            projectPath: props.projectPath,
          })
        ) {
          setActiveSessions(nextActiveSessions);
          setPromptQueue(nextPromptQueue);
        }
      } catch {
        // Keep the optimistic transcript visible even if the lightweight
        // activity refresh fails; the full refresh below will retry.
      }
      void refreshActivity(contextId, projectPath);
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
      setOptimisticUserText(null);
      setOptimisticUserTimestamp(null);
      setOptimisticUserAnchorIndex(null);
      setPreferredStreamRuntimeSessionId(null);
      setPreferredStreamRuntimeSessionOwnerQraftAiSessionId(null);
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
      includeComposerAttachments: true,
    });
  }

  async function restartSelectedSessionFromBeginning(): Promise<void> {
    await submitPromptMessage(promptInput().trim(), true, {
      clearComposerInput: true,
      includeComposerAttachments: true,
      forceNewSession: true,
    });
  }

  const composerBusy = () =>
    isAiSessionComposerBusy({
      submitting: submitting(),
      modelProfilesLoading: modelProfilesLoading(),
      runningDefaultPromptAction: runningDefaultPromptAction(),
    });
  const promptSubmissionDisabled = () =>
    !canSubmitAiSessionComposerPrompt({
      promptInput: promptInput(),
      submitting: submitting(),
      modelProfilesLoading: modelProfilesLoading(),
      runningDefaultPromptAction: runningDefaultPromptAction(),
    });

  function handlePromptInputKeyDown(event: KeyboardEvent): void {
    if (!event.ctrlKey || event.key !== "Enter" || promptSubmissionDisabled()) {
      return;
    }

    event.preventDefault();
    void submitPrompt(false);
  }

  function isRunningDefaultPrompt(
    action: AiSessionDefaultPromptAction,
  ): boolean {
    return runningDefaultPromptAction() === action;
  }

  function describeDefaultPromptActionLabel(
    action: AiSessionDefaultPromptAction,
  ): string {
    const actionLabels = DEFAULT_PROMPT_ACTION_LABELS[action];
    return isRunningDefaultPrompt(action)
      ? actionLabels.runningLabel
      : actionLabels.idleLabel;
  }

  async function runDefaultPromptAction(
    action: AiSessionDefaultPromptAction,
  ): Promise<void> {
    const scopeKey = createAiSessionScopeKey(
      props.contextId,
      props.projectPath,
    );
    if (scopeKey === null || props.contextId === null) {
      return;
    }

    const requestToken = mutationRequestGuard.issue(scopeKey);
    setErrorMessage(null);
    setRunningDefaultPromptAction(action);

    try {
      const promptResponse = await modelConfigApi.fetchGitActionPrompt(action);
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

      await submitPromptMessage(
        createAiSessionDefaultPromptMessage(action, promptResponse.content),
        true,
        {
          clearComposerInput: false,
          includeComposerAttachments: false,
          requestToken,
        },
      );
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
          : "Failed to run the default session action",
      );
    } finally {
      if (
        canApplyAiSessionScopedRequestResult({
          requestGuard: mutationRequestGuard,
          requestToken,
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
    setIsDraftComposerOpen(true);
    setIsTranscriptHistoryCollapsed(true);
    setErrorMessage(null);
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
    setHistoryLoading(true);
    await refreshActivity(props.contextId, props.projectPath);
  }

  function clearSearchTextBox(): void {
    setSearchDraftQuery("");
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

    const container = transcriptScrollContainer;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;

    await refreshSelectedSessionArtifacts({
      ...detailTarget,
      loadOlderTranscript: true,
    });

    if (container !== null) {
      window.requestAnimationFrame(() => {
        const nextScrollDelta = container.scrollHeight - previousScrollHeight;
        container.scrollTop = previousScrollTop + nextScrollDelta;
      });
    }
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
    setIsDraftComposerOpen(false);
    setSelectedSessionError(null);
  }

  function scrollSelectedTranscriptToLatest(
    behavior: ScrollBehavior = "smooth",
  ): void {
    const container = transcriptScrollContainer;
    if (container === null) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }

  function handleTranscriptScroll(): void {
    const container = transcriptScrollContainer;
    if (container === null || container.scrollTop > 120) {
      return;
    }

    void loadMoreSelectedSessionTranscript();
  }

  async function jumpSelectedTranscriptToHead(): Promise<void> {
    const detailTarget = selectedSessionDetailTarget();
    if (
      detailTarget === null ||
      selectedSessionLoading() ||
      selectedSessionLoadingMore()
    ) {
      return;
    }

    while (
      canLoadMoreAiSessionTranscript({
        loadedEventCount: selectedSessionTranscriptLoadedEventCount(),
        totalCount: selectedSessionTranscriptTotal(),
      })
    ) {
      const previousLoadedEventCount =
        selectedSessionTranscriptLoadedEventCount();
      await refreshSelectedSessionArtifacts({
        ...detailTarget,
        loadOlderTranscript: true,
      });

      if (
        selectedSessionTranscriptLoadedEventCount() <= previousLoadedEventCount
      ) {
        break;
      }
    }

    window.requestAnimationFrame(() => {
      transcriptScrollContainer?.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }

  async function reloadSelectedSessionArtifacts(): Promise<void> {
    const detailTarget = selectedSessionDetailTarget();
    if (
      detailTarget === null ||
      selectedSessionLoading() ||
      selectedSessionLoadingMore()
    ) {
      return;
    }

    await refreshSelectedSessionArtifacts({
      ...detailTarget,
      loadOlderTranscript: false,
      preserveExistingContent: true,
    });
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
        <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border-default bg-bg-primary">
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
              <ToolbarIconButton
                type="submit"
                label={
                  historyLoading() ? "Searching sessions" : "Search sessions"
                }
                disabled={historyLoading() || activityLoading()}
              >
                {renderSearchIcon()}
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Clear search text"
                disabled={searchDraftQuery().length === 0}
                onClick={clearSearchTextBox}
              >
                {renderClearIcon()}
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
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-4">
            <Show when={historyLoading()}>
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

            <Show when={!historyLoading()}>
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
                    const isHidden = hiddenSessionIds().includes(
                      sessionEntry.qraftAiSessionId,
                    );

                    return (
                      <SummaryCard
                        selected={
                          selectedQraftAiSessionId() ===
                          sessionEntry.qraftAiSessionId
                        }
                        ariaLabel={`Open session ${sessionEntry.qraftAiSessionId}`}
                        onActivate={() => {
                          setIsDraftComposerOpen(false);
                          setSelectedQraftAiSessionId(
                            sessionEntry.qraftAiSessionId,
                          );
                        }}
                        topSlot={
                          <div class="flex items-start justify-between gap-3">
                            <div class="flex flex-wrap items-center gap-2">
                              <Show when={sessionEntry.status !== null}>
                                <span
                                  class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getSessionStatusBadgeClass(
                                    sessionEntry.status ?? "",
                                  )}`}
                                >
                                  {sessionEntry.status}
                                </span>
                              </Show>
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
                                class="rounded-md border border-border-default bg-bg-secondary p-2 text-text-primary transition hover:bg-bg-hover"
                                aria-label={
                                  isHidden ? "Show session" : "Hide session"
                                }
                                title={
                                  isHidden ? "Show session" : "Hide session"
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void toggleSessionHidden(
                                    sessionEntry.qraftAiSessionId,
                                    isHidden === false,
                                  );
                                }}
                              >
                                <span class="block h-4 w-4">
                                  {renderSessionVisibilityIcon(isHidden)}
                                </span>
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

          <Show when={showComposer()}>
            <div class="absolute inset-0 z-40 flex items-start justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4">
              <div class="flex h-[min(96vh,920px)] w-full max-w-7xl flex-col overflow-hidden rounded-none border border-border-default bg-bg-secondary shadow-2xl shadow-black/40">
                <div class="flex min-h-0 min-w-0 flex-1 flex-col">
                  <AiSessionChatPane
                    heading={selectedComposerHeading()}
                    description={selectedComposerDescription()}
                    purposeExpanded={isPurposeExpanded()}
                    onTogglePurposeExpanded={() =>
                      setIsPurposeExpanded(!isPurposeExpanded())
                    }
                    headerBadges={
                      <Show when={selectedSessionEntry() !== null}>
                        <>
                          <span
                            class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getSessionStatusBadgeClass(
                              selectedSessionEntry()?.status ?? "",
                            )}`}
                          >
                            {selectedSessionEntry()?.status}
                          </span>
                          <span class="rounded bg-bg-tertiary px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                            {selectedSessionModelLabel()}
                          </span>
                        </>
                      </Show>
                    }
                    toolbarActions={
                      <>
                        <button
                          type="button"
                          class={`rounded-md border p-2 transition ${
                            showSystemPrompts()
                              ? "border-accent-emphasis/50 bg-accent-muted text-accent-fg"
                              : "border-border-default bg-bg-primary text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                          }`}
                          aria-pressed={showSystemPrompts()}
                          aria-label={
                            showSystemPrompts()
                              ? "Hide system prompts"
                              : hiddenSystemPromptCount() > 0
                                ? `Show system prompts (${hiddenSystemPromptCount()} hidden)`
                                : "Show system prompts"
                          }
                          title={
                            showSystemPrompts()
                              ? "Hide system prompts"
                              : hiddenSystemPromptCount() > 0
                                ? `Show system prompts (${hiddenSystemPromptCount()} hidden)`
                                : "Show system prompts"
                          }
                          onClick={() =>
                            setShowSystemPrompts(!showSystemPrompts())
                          }
                        >
                          <span class="block h-5 w-5">
                            {renderSystemPromptVisibilityIcon(
                              showSystemPrompts()
                                ? 0
                                : hiddenSystemPromptCount(),
                            )}
                          </span>
                        </button>
                        <Show when={canRunDraftSessionDefaultPrompt()}>
                          <ToolbarIconButton
                            label={describeDefaultPromptActionLabel(
                              "ai-session-purpose",
                            )}
                            disabled={composerBusy()}
                            onClick={() =>
                              void runDefaultPromptAction("ai-session-purpose")
                            }
                          >
                            {renderCreatePurposeIcon()}
                          </ToolbarIconButton>
                        </Show>
                        <Show when={canRunSelectedSessionDefaultPrompts()}>
                          <ToolbarIconButton
                            label={describeDefaultPromptActionLabel(
                              "ai-session-refresh-purpose",
                            )}
                            disabled={composerBusy()}
                            onClick={() =>
                              void runDefaultPromptAction(
                                "ai-session-refresh-purpose",
                              )
                            }
                          >
                            {renderRefreshPurposeIcon()}
                          </ToolbarIconButton>
                        </Show>
                        <ToolbarIconButton
                          label="Reload transcript"
                          disabled={
                            selectedSessionLoading() ||
                            selectedSessionLoadingMore()
                          }
                          onClick={() => void reloadSelectedSessionArtifacts()}
                        >
                          {renderRefreshIcon()}
                        </ToolbarIconButton>
                        <ToolbarIconButton
                          label="Jump to head"
                          disabled={
                            isTranscriptHistoryCollapsed() ||
                            visibleSelectedSessionTranscript().length === 0
                          }
                          onClick={() => void jumpSelectedTranscriptToHead()}
                        >
                          {renderJumpToHeadIcon()}
                        </ToolbarIconButton>
                        <ToolbarIconButton
                          label="Jump to latest"
                          disabled={
                            isTranscriptHistoryCollapsed() ||
                            visibleSelectedSessionTranscript().length === 0
                          }
                          onClick={() => scrollSelectedTranscriptToLatest()}
                        >
                          {renderJumpToLatestIcon()}
                        </ToolbarIconButton>
                        <button
                          type="button"
                          class="rounded-md border border-danger-emphasis bg-danger-emphasis p-2 text-danger-fg shadow-sm shadow-danger-emphasis/20 transition hover:border-danger-fg hover:bg-danger-fg hover:text-text-on-emphasis"
                          aria-label="Close"
                          title="Close"
                          onClick={dismissSessionDetail}
                        >
                          <span class="block h-5 w-5">{renderCloseIcon()}</span>
                        </button>
                      </>
                    }
                    transcriptSummary={transcriptSectionSummary()}
                    transcriptCollapsed={isTranscriptHistoryCollapsed()}
                    onToggleTranscriptCollapsed={() =>
                      setIsTranscriptHistoryCollapsed(
                        !isTranscriptHistoryCollapsed(),
                      )
                    }
                    metadata={
                      <Show when={selectedSessionDetail() !== null}>
                        <div class="grid gap-3 sm:grid-cols-3">
                          <div class="rounded-lg border border-border-default bg-bg-primary p-3 text-xs text-text-secondary">
                            <p class="uppercase tracking-wide text-text-tertiary">
                              Execution flow
                            </p>
                            <p class="mt-1 text-sm text-text-primary">
                              {describeAiSessionExecutionFlow(
                                selectedSessionEntry() ?? {
                                  aiAgent: undefined,
                                  sessionSource: undefined,
                                  modelVendor: undefined,
                                },
                              )}
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
                    }
                    transcriptContainerRef={(element) => {
                      transcriptScrollContainer = element;
                    }}
                    onTranscriptScroll={handleTranscriptScroll}
                    transcriptLoading={selectedSessionLoading()}
                    transcriptLoadingMore={selectedSessionLoadingMore()}
                    transcriptError={selectedSessionError()}
                    transcriptLines={visibleSelectedSessionTranscript().map(
                      (transcriptLine) => ({
                        ...transcriptLine,
                        timestamp:
                          transcriptLine.timestamp === null
                            ? null
                            : formatAiSessionTimestamp(
                                transcriptLine.timestamp,
                              ),
                      }),
                    )}
                    copiedTranscriptLineId={copiedTranscriptLineId()}
                    onCopyTranscriptLine={(transcriptLine) =>
                      copyTranscriptLine(transcriptLine)
                    }
                    emptyTranscriptText={
                      hiddenSystemPromptCount() > 0
                        ? "Only system prompts are currently hidden for this session."
                        : "No transcript events are available for this session yet."
                    }
                    composerCollapsed={isComposerFooterCollapsed()}
                    onToggleComposerCollapsed={() =>
                      setIsComposerFooterCollapsed(!isComposerFooterCollapsed())
                    }
                    composerContext={
                      <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] md:items-end">
                        <div class="min-w-0">
                          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                            Session
                          </p>
                          <p class={sessionTargetTextClass()}>
                            {describeAiSessionTarget({
                              selectedQraftAiSessionId:
                                selectedQraftAiSessionId(),
                              draftSessionId: draftSessionId(),
                            })}
                          </p>
                        </div>
                        <Show
                          when={selectedQraftAiSessionId() === null}
                          fallback={
                            <div class="flex flex-col gap-1 text-sm text-text-secondary">
                              <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                                Model profile
                              </span>
                              <p class="rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary">
                                {selectedSessionModelLabel()}
                              </p>
                            </div>
                          }
                        >
                          <label class="flex flex-col gap-1 text-sm text-text-secondary">
                            <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                              Model profile
                            </span>
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
                              <option value="">
                                Server default AI profile
                              </option>
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
                        </Show>
                      </div>
                    }
                    promptInput={promptInput()}
                    onPromptInput={setPromptInput}
                    onPromptKeyDown={handlePromptInputKeyDown}
                    attachmentTrigger={
                      <div class="relative inline-flex max-w-full">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          class="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                          aria-label="Attach images to the next prompt"
                          disabled={submitting()}
                          onChange={(event) =>
                            void handleImageAttachmentInput(event)
                          }
                        />
                        <div class="pointer-events-none inline-flex items-center gap-2 rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary">
                          <span class="block h-4 w-4 shrink-0">
                            {renderAttachImageIcon()}
                          </span>
                          <span class="truncate">
                            {imageAttachments().length > 0
                              ? `Add images (${imageAttachments().length})`
                              : "Attach images"}
                          </span>
                        </div>
                      </div>
                    }
                    attachmentHint={`Images only. Up to ${formatAttachmentBytes(
                      MAX_IMAGE_ATTACHMENT_BYTES,
                    )} each.`}
                    attachments={imageAttachments().map((imageAttachment) => ({
                      id: imageAttachment.id,
                      fileName: imageAttachment.fileName,
                      mimeType: imageAttachment.mimeType,
                      sizeLabel: formatAttachmentBytes(
                        imageAttachment.sizeBytes,
                      ),
                      previewUrl: imageAttachment.previewUrl,
                    }))}
                    onRemoveAttachment={(attachmentId) =>
                      removeImageAttachment(attachmentId)
                    }
                    attachmentError={attachmentError()}
                    composerActions={
                      <>
                        <button
                          type="button"
                          class="rounded-md bg-accent-emphasis px-4 py-2 text-sm font-medium text-text-on-emphasis transition hover:bg-accent-fg disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={promptSubmissionDisabled()}
                          onClick={() => void submitPrompt(false)}
                        >
                          {submitting() ? "Submitting..." : "Queue prompt"}
                        </button>
                        <button
                          type="button"
                          class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={promptSubmissionDisabled()}
                          onClick={() => void submitPrompt(true)}
                        >
                          Run now
                        </button>
                        <Show when={selectedQraftAiSessionId() !== null}>
                          <button
                            type="button"
                            class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={promptSubmissionDisabled()}
                            onClick={() =>
                              void restartSelectedSessionFromBeginning()
                            }
                          >
                            Restart from beginning
                          </button>
                        </Show>
                        <Show when={selectedSessionCancelAction() !== null}>
                          <button
                            type="button"
                            class={`rounded-md border border-danger-emphasis/40 bg-danger-subtle px-4 py-2 text-sm font-medium text-danger-fg transition hover:bg-danger-emphasis/20 ${
                              isPhoneViewport() ? "" : "ml-auto"
                            }`}
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
                      </>
                    }
                  />
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </section>
  );
}
