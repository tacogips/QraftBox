import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
  type JSX,
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
import { ToolbarIconButton } from "../../components/ToolbarIconButton";
import { AiSessionDetailPane } from "../ai-session/AiSessionDetailPane";
import type {
  AiSessionListEntry,
  AiSessionLiveAssistantPhase,
  AiSessionTranscriptLine,
} from "../ai-session/presentation";
import {
  buildAiSessionTranscriptLines,
  describeAiSessionEntryModel,
  describeAiSessionExecutionFlow,
  formatAiSessionTimestamp,
  mergePendingAiSessionTranscriptLines,
  reconcileAiSessionTranscriptLines,
  resolveAiSessionCancelAction,
} from "../ai-session/presentation";
import {
  appendAiSessionSubmitContextReferences,
  canApplyAiSessionScopedRequestResult,
  canLoadMoreAiSessionTranscript,
  canSubmitAiSessionComposerPrompt,
  countAiSessionSystemPromptLines,
  createAiSessionDefaultPromptMessage,
  createAiSessionDetailRequestKey,
  createAiSessionImageAttachmentReferences,
  createAiSessionOptimisticUserMessage,
  createAiSessionScopeKey,
  createAiSessionSubmitContext,
  createAiSessionTranscriptPageState,
  createLatestAiSessionRequestGuard,
  fetchAiSessionDetailArtifacts,
  filterAiSessionTranscriptSystemPromptLines,
  isAiSessionComposerBusy,
  isAiSessionScopeCurrent,
  loadAiSessionShowSystemPromptsPreference,
  normalizeAiSessionLiveAssistantStatusText,
  persistAiSessionShowSystemPromptsPreference,
  resolveAiSessionRequestToken,
  resolveAiSessionRuntimeSession,
  resolveAiSessionSelectedModelState,
  resolveAiSessionStreamSessionId,
  resolveAiSessionSubmitModelProfileId,
  resolveAiSessionSubmitTarget,
  shouldPreserveAiSessionLiveAssistantStateOnStreamOpen,
  shouldRetireAiSessionLiveAssistantFromTranscript,
  type AiSessionDefaultPromptAction,
  type AiSessionRequestToken,
} from "../ai-session/state";

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

export interface ChatSessionColumnSelectionState {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly draftSessionId?: QraftAiSessionId | undefined;
}

export interface ChatSessionColumnProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly projectPath: string;
  readonly selectedPath: string | null;
  readonly fileContent: FileContent | null;
  readonly diffOverview: DiffOverviewState;
  readonly sessionEntries: readonly AiSessionListEntry[];
  readonly activeSessions: readonly AISessionInfo[];
  readonly promptQueue: readonly PromptQueueItem[];
  readonly historicalSessions: readonly ExtendedSessionEntry[];
  readonly modelProfiles: readonly ModelProfile[];
  readonly defaultModelProfileId: string | null;
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly draftSessionId: QraftAiSessionId;
  readonly onSelectionChange: (
    nextState: ChatSessionColumnSelectionState,
  ) => void;
  readonly onApplyActivitySnapshot: (nextState: {
    readonly activeSessions: readonly AISessionInfo[];
    readonly promptQueue: readonly PromptQueueItem[];
  }) => void;
  readonly onRequestActivityRefresh: () => Promise<void>;
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

export function ChatSessionColumn(props: ChatSessionColumnProps): JSX.Element {
  const aiSessionsApi = createAiSessionsApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const modelConfigApi = createModelConfigApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });

  const [promptInput, setPromptInput] = createSignal("");
  const [attachmentError, setAttachmentError] = createSignal<string | null>(
    null,
  );
  const [imageAttachments, setImageAttachments] = createSignal<
    readonly ComposerImageAttachment[]
  >([]);
  const [submitting, setSubmitting] = createSignal(false);
  const [runningDefaultPromptAction, setRunningDefaultPromptAction] =
    createSignal<AiSessionDefaultPromptAction | null>(null);
  const [selectedModelProfileId, setSelectedModelProfileId] = createSignal<
    string | null
  >(props.defaultModelProfileId);
  const [isPurposeExpanded, setIsPurposeExpanded] = createSignal(false);
  const [isTranscriptHistoryCollapsed, setIsTranscriptHistoryCollapsed] =
    createSignal(props.selectedQraftAiSessionId === null);
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
  let activeDraftSessionId: QraftAiSessionId | null = null;

  let activeSelectedSessionDetailKey: string | null = null;
  let activeSelectedSessionStreamKey: string | null = null;
  let activeSelectedSessionEventSource: EventSource | null = null;
  let transcriptScrollContainer: HTMLDivElement | null = null;
  let copiedTranscriptLineResetTimer: ReturnType<typeof setTimeout> | null =
    null;
  const selectedSessionRequestGuard = createLatestAiSessionRequestGuard();
  const mutationRequestGuard = createLatestAiSessionRequestGuard();

  const selectedSessionEntry = () =>
    props.sessionEntries.find(
      (sessionEntry) =>
        sessionEntry.qraftAiSessionId === props.selectedQraftAiSessionId,
    ) ?? null;
  const selectedRuntimeSession = () =>
    resolveAiSessionRuntimeSession({
      selectedQraftAiSessionId: props.selectedQraftAiSessionId,
      activeSessions: props.activeSessions,
    });
  const selectedStreamSessionId = () =>
    resolveAiSessionStreamSessionId({
      selectedQraftAiSessionId: props.selectedQraftAiSessionId,
      preferredRuntimeSessionId: preferredStreamRuntimeSessionId(),
      preferredRuntimeSessionOwnerQraftAiSessionId:
        preferredStreamRuntimeSessionOwnerQraftAiSessionId(),
      runtimeSession: selectedRuntimeSession(),
    });
  const displayedSelectedSessionTranscript = () =>
    mergePendingAiSessionTranscriptLines({
      transcriptLines: selectedSessionTranscript(),
      optimisticUserText: optimisticUserText(),
      optimisticUserTimestamp: optimisticUserTimestamp(),
      optimisticAnchorIndex: optimisticUserAnchorIndex(),
      liveAssistantPhase: liveAssistantPhase(),
      liveAssistantText: liveAssistantText(),
      liveAssistantTimestamp: liveAssistantTimestamp(),
      liveAssistantStatusText: liveAssistantStatusText(),
    });
  const visibleSelectedSessionTranscript = () =>
    filterAiSessionTranscriptSystemPromptLines({
      transcriptLines: displayedSelectedSessionTranscript(),
      showSystemPrompts: showSystemPrompts(),
    });
  const hiddenSystemPromptCount = () =>
    countAiSessionSystemPromptLines(displayedSelectedSessionTranscript());
  const transcriptSectionSummary = () => {
    if (props.selectedQraftAiSessionId === null) {
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
    if (props.contextId === null || props.selectedQraftAiSessionId === null) {
      return null;
    }

    return {
      contextId: props.contextId,
      qraftAiSessionId: props.selectedQraftAiSessionId,
      hasHistoricalSession: props.historicalSessions.some(
        (historicalSession) =>
          historicalSession.qraftAiSessionId === props.selectedQraftAiSessionId,
      ),
    };
  };
  const selectedSessionModelState = () =>
    resolveAiSessionSelectedModelState({
      overviewModelState: selectedSessionEntry(),
      detailModelState: selectedSessionDetail(),
    });
  const selectedSessionModelLabel = () =>
    describeAiSessionEntryModel(
      selectedSessionModelState(),
      props.modelProfiles,
      {
        unknownLabel: "-",
      },
    );
  const selectedSessionCancelAction = () => {
    const sessionEntry = selectedSessionEntry();
    return sessionEntry === null
      ? null
      : resolveAiSessionCancelAction(sessionEntry);
  };
  const composerBusy = () =>
    isAiSessionComposerBusy({
      submitting: submitting(),
      modelProfilesLoading: false,
      runningDefaultPromptAction: runningDefaultPromptAction(),
    });
  const promptSubmissionDisabled = () =>
    !canSubmitAiSessionComposerPrompt({
      promptInput: promptInput(),
      submitting: submitting(),
      modelProfilesLoading: false,
      runningDefaultPromptAction: runningDefaultPromptAction(),
    });

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
    if (
      props.selectedQraftAiSessionId === null &&
      selectedModelProfileId() === null
    ) {
      setSelectedModelProfileId(props.defaultModelProfileId);
    }
  });

  createEffect(() => {
    persistAiSessionShowSystemPromptsPreference(showSystemPrompts());
  });

  createEffect(() => {
    if (props.selectedQraftAiSessionId !== null) {
      activeDraftSessionId = null;
      return;
    }

    if (activeDraftSessionId === props.draftSessionId) {
      return;
    }

    activeDraftSessionId = props.draftSessionId;
    clearImageAttachments();
    setAttachmentError(null);
    setPromptInput("");
    setSelectedModelProfileId(props.defaultModelProfileId);
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
    setErrorMessage(null);

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
      setIsTranscriptHistoryCollapsed(true);
      return;
    }

    const nextDetailKey = createAiSessionDetailRequestKey(detailTarget);
    if (activeSelectedSessionDetailKey === nextDetailKey) {
      return;
    }

    activeSelectedSessionDetailKey = nextDetailKey;
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
    setIsTranscriptHistoryCollapsed(false);
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
    const selectedSessionKey = props.selectedQraftAiSessionId;
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

    const handleTerminalEvent = (): void => {
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

      void props.onRequestActivityRefresh();

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
        const toolName = payload.data?.["toolName"];
        return typeof toolName === "string" && toolName.length > 0
          ? `Using ${toolName}...`
          : "Thinking...";
      }),
    );
    eventSource.addEventListener("tool_result", (event) =>
      handleToolLifecycleEvent(event, (payload) => {
        const toolName = payload.data?.["toolName"];
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

  onCleanup(() => {
    activeSelectedSessionEventSource?.close();
    if (copiedTranscriptLineResetTimer !== null) {
      clearTimeout(copiedTranscriptLineResetTimer);
    }
    clearImageAttachments();
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
    } else if (params.preserveExistingContent !== true) {
      setSelectedSessionLoading(true);
      setSelectedSessionDetail(null);
      setSelectedSessionTranscript([]);
      setSelectedSessionTranscriptLoadedEventCount(0);
      setSelectedSessionTranscriptStartOffset(0);
      setSelectedSessionTranscriptTotal(0);
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
    setSubmitting(true);

    try {
      const submitTarget = resolveAiSessionSubmitTarget({
        selectedQraftAiSessionId: props.selectedQraftAiSessionId,
        draftSessionId: props.draftSessionId,
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
          selectedQraftAiSessionId: props.selectedQraftAiSessionId,
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
      props.onSelectionChange({
        selectedQraftAiSessionId: submitTarget.qraftAiSessionId,
      });
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
          props.onApplyActivitySnapshot({
            activeSessions: nextActiveSessions,
            promptQueue: nextPromptQueue,
          });
        }
      } catch {
        // Keep optimistic UI and rely on full refresh below.
      }

      await props.onRequestActivityRefresh();
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
      await props.onRequestActivityRefresh();
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
      await props.onRequestActivityRefresh();
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

  const selectedComposerHeading = () =>
    selectedSessionEntry()?.title ?? "New AI session";
  const selectedComposerDescription = () =>
    selectedSessionEntry()?.detail ??
    "Compose the first prompt for a new session. Nothing will be sent until you run or queue it.";

  return (
    <div class="flex h-full min-h-0 flex-col gap-3">
      <Show when={errorMessage() !== null}>
        <p
          role="alert"
          class="rounded-md border border-danger-emphasis/40 bg-danger-subtle px-3 py-2 text-sm text-danger-fg"
        >
          {errorMessage()}
        </p>
      </Show>

      <AiSessionDetailPane
        heading={selectedComposerHeading()}
        description={selectedComposerDescription()}
        purposeExpanded={isPurposeExpanded()}
        onTogglePurposeExpanded={() =>
          setIsPurposeExpanded(!isPurposeExpanded())
        }
        status={selectedSessionEntry()?.status ?? null}
        modelLabel={selectedSessionModelLabel()}
        showSystemPrompts={showSystemPrompts()}
        hiddenSystemPromptCount={hiddenSystemPromptCount()}
        onToggleSystemPrompts={() => setShowSystemPrompts(!showSystemPrompts())}
        transcriptSummary={transcriptSectionSummary()}
        transcriptCollapsed={isTranscriptHistoryCollapsed()}
        onToggleTranscriptCollapsed={() =>
          setIsTranscriptHistoryCollapsed(!isTranscriptHistoryCollapsed())
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
                <p class="uppercase tracking-wide text-text-tertiary">Branch</p>
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
                : formatAiSessionTimestamp(transcriptLine.timestamp),
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
          <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] md:items-end">
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                Session
              </p>
              <p class="mt-1 break-words text-sm text-text-primary">
                {props.selectedQraftAiSessionId === null
                  ? `New session ${props.draftSessionId}`
                  : `Continuing session ${props.selectedQraftAiSessionId}`}
              </p>
            </div>
            <Show
              when={props.selectedQraftAiSessionId === null}
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
                  onChange={(event) =>
                    setSelectedModelProfileId(
                      event.currentTarget.value.length > 0
                        ? event.currentTarget.value
                        : null,
                    )
                  }
                >
                  <option value="">Server default AI profile</option>
                  {props.modelProfiles.map((modelProfile) => (
                    <option value={modelProfile.id}>
                      {modelProfile.name} ({modelProfile.vendor}/
                      {modelProfile.model})
                    </option>
                  ))}
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
              onChange={(event) => void handleImageAttachmentInput(event)}
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
          sizeLabel: formatAttachmentBytes(imageAttachment.sizeBytes),
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
            <Show when={props.selectedQraftAiSessionId !== null}>
              <button
                type="button"
                class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                disabled={promptSubmissionDisabled()}
                onClick={() => void restartSelectedSessionFromBeginning()}
              >
                Restart from beginning
              </button>
            </Show>
            <Show when={selectedSessionCancelAction() !== null}>
              <button
                type="button"
                class="rounded-md border border-danger-emphasis/40 bg-danger-subtle px-4 py-2 text-sm font-medium text-danger-fg transition hover:bg-danger-emphasis/20"
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
          </>
        }
        canRunDraftSessionDefaultPrompt={
          props.selectedQraftAiSessionId === null
        }
        canRunSelectedSessionDefaultPrompts={
          props.selectedQraftAiSessionId !== null
        }
        describeDefaultPromptActionLabel={describeDefaultPromptActionLabel}
        composerBusy={composerBusy()}
        onRunDefaultPromptAction={(action) => runDefaultPromptAction(action)}
        onReloadTranscript={() => reloadSelectedSessionArtifacts()}
        reloadTranscriptDisabled={
          selectedSessionLoading() || selectedSessionLoadingMore()
        }
        onJumpToHead={() => jumpSelectedTranscriptToHead()}
        jumpToHeadDisabled={
          isTranscriptHistoryCollapsed() ||
          visibleSelectedSessionTranscript().length === 0
        }
        onJumpToLatest={() => scrollSelectedTranscriptToLatest()}
        jumpToLatestDisabled={
          isTranscriptHistoryCollapsed() ||
          visibleSelectedSessionTranscript().length === 0
        }
        rightToolbarActions={
          <Show when={props.selectedQraftAiSessionId === null}>
            <ToolbarIconButton
              label="Reset draft"
              onClick={() => {
                clearImageAttachments();
                setAttachmentError(null);
                setPromptInput("");
                props.onSelectionChange({
                  selectedQraftAiSessionId: null,
                  draftSessionId: generateQraftAiSessionId(),
                });
              }}
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path
                  d="M5 5h10v10H5Z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path d="M7.5 7.5h5" stroke-linecap="round" />
                <path d="M7.5 10h5" stroke-linecap="round" />
                <path d="M7.5 12.5h3" stroke-linecap="round" />
              </svg>
            </ToolbarIconButton>
          </Show>
        }
      />
    </div>
  );
}
