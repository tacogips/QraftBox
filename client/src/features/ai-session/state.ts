import {
  generateQraftAiSessionId,
  type AIPromptContext,
  type FileReference,
  type QraftAiSessionId,
} from "../../../../src/types/ai";
import type {
  AISessionInfo,
  PromptQueueItem,
} from "../../../../client-shared/src/api/ai-sessions";
import { buildScreenHash } from "../../../../client-shared/src/contracts/navigation";
import type { FileContent } from "../../../../client-shared/src/contracts/files";
import type { DiffOverviewState } from "../../../../client-shared/src/contracts/diff";
import type { SessionFilters } from "../../../../src/types/claude-session";
import type { ExtendedSessionEntry } from "../../../../src/types/claude-session";
import { wrapQraftboxInternalPrompt } from "../../../../src/utils/strip-system-tags";

export type AiSessionDefaultPromptAction =
  | "ai-session-purpose"
  | "ai-session-refresh-purpose"
  | "ai-session-resume";

export function createAiSessionScopeKey(
  contextId: string | null,
  projectPath: string,
): string | null {
  if (contextId === null || projectPath.length === 0) {
    return null;
  }

  return `${contextId}:${projectPath}`;
}

export function isAiSessionScopeCurrent(params: {
  readonly expectedScopeKey: string;
  readonly contextId: string | null;
  readonly projectPath: string;
}): boolean {
  return (
    createAiSessionScopeKey(params.contextId, params.projectPath) ===
    params.expectedScopeKey
  );
}

export function resolveAiSessionTargetSessionId(params: {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly draftSessionId: QraftAiSessionId;
}): QraftAiSessionId {
  return params.selectedQraftAiSessionId ?? params.draftSessionId;
}

export function shouldShowAiSessionComposer(params: {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly isDraftComposerOpen: boolean;
}): boolean {
  return params.selectedQraftAiSessionId !== null || params.isDraftComposerOpen;
}

export function shouldAutoRefreshAiSessionOverview(params: {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
}): boolean {
  return params.selectedQraftAiSessionId === null;
}

export type AiSessionOverviewPollingMode = "active" | "idle";

export function resolveAiSessionOverviewPollingMode(params: {
  readonly activeSessions: readonly AISessionInfo[];
  readonly promptQueue: readonly PromptQueueItem[];
}): AiSessionOverviewPollingMode {
  const hasRunningPromptQueueItem = params.promptQueue.some(
    (promptQueueItem) =>
      promptQueueItem.status === "queued" ||
      promptQueueItem.status === "running",
  );

  return params.activeSessions.length > 0 || hasRunningPromptQueueItem
    ? "active"
    : "idle";
}

export interface ResolvedAiSessionSubmitTarget {
  readonly qraftAiSessionId: QraftAiSessionId;
  readonly forceNewSession: boolean;
}

export function resolveAiSessionSubmitTarget(params: {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly draftSessionId: QraftAiSessionId;
  readonly restartFromBeginning: boolean;
}): ResolvedAiSessionSubmitTarget {
  if (params.restartFromBeginning && params.selectedQraftAiSessionId !== null) {
    return {
      qraftAiSessionId: params.selectedQraftAiSessionId,
      forceNewSession: true,
    };
  }

  return {
    qraftAiSessionId: resolveAiSessionTargetSessionId(params),
    forceNewSession: false,
  };
}

export function normalizeAiSessionSearchQuery(
  rawSearchQuery: string,
): string | undefined {
  const normalizedSearchQuery = rawSearchQuery.trim();
  return normalizedSearchQuery.length > 0 ? normalizedSearchQuery : undefined;
}

export interface AppliedAiSessionSearchState {
  readonly searchQuery: string;
  readonly searchInTranscript: boolean;
}

export function applyAiSessionSearchDraft(params: {
  readonly rawSearchQuery: string;
  readonly searchInTranscript: boolean;
}): AppliedAiSessionSearchState {
  return {
    searchQuery: params.rawSearchQuery.trim(),
    searchInTranscript: params.searchInTranscript,
  };
}

export function canClearAiSessionSearch(params: {
  readonly draftSearchQuery: string;
  readonly appliedSearchQuery: string;
  readonly draftSearchInTranscript: boolean;
  readonly appliedSearchInTranscript: boolean;
}): boolean {
  return (
    params.draftSearchQuery.trim().length > 0 ||
    params.appliedSearchQuery.trim().length > 0 ||
    params.draftSearchInTranscript === false ||
    params.appliedSearchInTranscript === false
  );
}

export function updateHiddenAiSessionIds(params: {
  readonly hiddenSessionIds: readonly QraftAiSessionId[];
  readonly sessionId: QraftAiSessionId;
  readonly hidden: boolean;
}): readonly QraftAiSessionId[] {
  const nextHiddenSessionIds = new Set(params.hiddenSessionIds);

  if (params.hidden) {
    nextHiddenSessionIds.add(params.sessionId);
  } else {
    nextHiddenSessionIds.delete(params.sessionId);
  }

  return [...nextHiddenSessionIds];
}

export function createAiSessionHiddenStateMessage(hidden: boolean): string {
  return hidden
    ? "Hidden the selected session from the default overview."
    : "Restored the selected session to the default overview.";
}

export function createAiSessionHistoryFilters(params: {
  readonly projectPath: string;
  readonly rawSearchQuery: string;
  readonly searchInTranscript: boolean;
}): SessionFilters {
  const filters: SessionFilters = {
    workingDirectoryPrefix: params.projectPath,
  };
  const normalizedSearchQuery = normalizeAiSessionSearchQuery(
    params.rawSearchQuery,
  );

  if (normalizedSearchQuery !== undefined) {
    filters.searchQuery = normalizedSearchQuery;
    filters.searchInTranscript = params.searchInTranscript;
  }

  return filters;
}

export interface AiSessionPromptContextInput {
  readonly selectedPath: string | null;
  readonly fileContent: FileContent | null;
  readonly diffOverview: Pick<DiffOverviewState, "files">;
}

export interface AiSessionPromptContextState {
  readonly references: readonly FileReference[];
  readonly selectedReferencePath: string | null;
  readonly changedFileCount: number;
}

function countFileContentLines(fileContent: string): number {
  return fileContent.length === 0 ? 1 : fileContent.split("\n").length;
}

export interface AiSessionOverviewRouteState {
  readonly selectedSessionId: QraftAiSessionId | null;
  readonly isDraftComposerOpen: boolean;
  readonly searchQuery: string;
  readonly searchInTranscript: boolean;
}

export function readAiSessionOverviewRouteSearchFromHash(hash: string): string {
  const hashQueryStart = hash.indexOf("?");
  if (hashQueryStart < 0) {
    return "";
  }

  return hash.slice(hashQueryStart);
}

export function didAiSessionHistoryFilterChange(params: {
  readonly currentSearchQuery: string;
  readonly currentSearchInTranscript: boolean;
  readonly nextOverviewRouteState: AiSessionOverviewRouteState;
}): boolean {
  return (
    params.currentSearchQuery !== params.nextOverviewRouteState.searchQuery ||
    params.currentSearchInTranscript !==
      params.nextOverviewRouteState.searchInTranscript
  );
}

export interface AiSessionScopeResetState extends AiSessionOverviewRouteState {
  readonly draftSessionId: QraftAiSessionId;
  readonly promptInput: string;
}

export interface AiSessionScopeLoadingState {
  readonly historyLoading: boolean;
  readonly activityLoading: boolean;
  readonly modelProfilesLoading: boolean;
  readonly selectedSessionLoading: boolean;
  readonly selectedSessionLoadingMore: boolean;
  readonly submitting: boolean;
}

const SESSION_QUERY_KEY = "ai_session_id";
const SESSION_DRAFT_QUERY_KEY = "new_session";
const SESSION_SEARCH_QUERY_KEY = "session_search";
const SESSION_SEARCH_TRANSCRIPT_KEY = "session_search_in_transcript";

function resolveFileReferenceAttachmentKind(
  fileContent: FileContent | null,
): FileReference["attachmentKind"] | undefined {
  if (fileContent === null) {
    return undefined;
  }

  if (fileContent.isImage === true) {
    return "image";
  }

  if (
    fileContent.isBinary === true ||
    fileContent.isVideo === true ||
    fileContent.isPdf === true
  ) {
    return "binary";
  }

  return "text";
}

function canInlineFileContent(
  fileContent: FileContent | null,
): fileContent is FileContent {
  return (
    fileContent !== null &&
    fileContent.isBinary !== true &&
    fileContent.isImage !== true &&
    fileContent.isVideo !== true &&
    fileContent.isPdf !== true
  );
}

export function createAiSessionPromptContextState(
  input: AiSessionPromptContextInput,
): AiSessionPromptContextState {
  if (input.selectedPath === null) {
    return {
      references: [],
      selectedReferencePath: null,
      changedFileCount: input.diffOverview.files.length,
    };
  }

  const selectedFileContent =
    input.fileContent?.path === input.selectedPath ? input.fileContent : null;
  const selectedPathSegments = input.selectedPath.split("/");
  const selectedFileName =
    selectedPathSegments[selectedPathSegments.length - 1] ?? input.selectedPath;

  return {
    references: [
      {
        path: input.selectedPath,
        fileName: selectedFileName,
        content: canInlineFileContent(selectedFileContent)
          ? selectedFileContent.content
          : undefined,
        mimeType: selectedFileContent?.mimeType,
        attachmentKind: resolveFileReferenceAttachmentKind(selectedFileContent),
      },
    ],
    selectedReferencePath: input.selectedPath,
    changedFileCount: input.diffOverview.files.length,
  };
}

export function createAiSessionSubmitContext(
  input: AiSessionPromptContextInput,
): AIPromptContext {
  if (input.selectedPath === null) {
    return {
      references: [],
      diffSummary: undefined,
    };
  }

  const promptContextState = createAiSessionPromptContextState(input);
  const selectedFileContent =
    input.fileContent?.path === input.selectedPath ? input.fileContent : null;
  const canInlinePrimaryFile = canInlineFileContent(selectedFileContent);

  return {
    primaryFile: canInlinePrimaryFile
      ? {
          path: input.selectedPath,
          startLine: 1,
          endLine:
            selectedFileContent.lineCount ??
            countFileContentLines(selectedFileContent.content),
          content: selectedFileContent.content,
        }
      : undefined,
    references: canInlinePrimaryFile ? [] : promptContextState.references,
    diffSummary: undefined,
  };
}

export interface AiSessionImageAttachmentInput {
  readonly fileName: string;
  readonly mimeType: string;
  readonly base64: string;
}

export function sanitizeAiSessionAttachmentFileName(fileName: string): string {
  return fileName.replace(/[\\/]/g, "_");
}

export function createAiSessionImageAttachmentReferences(
  imageAttachments: readonly AiSessionImageAttachmentInput[],
): readonly FileReference[] {
  return imageAttachments.map((imageAttachment) => ({
    path: `upload/${sanitizeAiSessionAttachmentFileName(
      imageAttachment.fileName,
    )}`,
    fileName: imageAttachment.fileName,
    mimeType: imageAttachment.mimeType,
    encoding: "base64",
    content: imageAttachment.base64,
    attachmentKind: "image",
  }));
}

export function appendAiSessionSubmitContextReferences(params: {
  readonly submitContext: AIPromptContext;
  readonly additionalReferences: readonly FileReference[];
}): AIPromptContext {
  if (params.additionalReferences.length === 0) {
    return params.submitContext;
  }

  return {
    ...params.submitContext,
    references: [
      ...params.submitContext.references,
      ...params.additionalReferences,
    ],
  };
}

export function createAiSessionDefaultPromptMessage(
  action: AiSessionDefaultPromptAction,
  promptContent: string,
): string {
  return wrapQraftboxInternalPrompt(action, promptContent, "session-action-v1");
}

export function isAiSessionComposerBusy(params: {
  readonly submitting: boolean;
  readonly modelProfilesLoading: boolean;
  readonly runningDefaultPromptAction: AiSessionDefaultPromptAction | null;
}): boolean {
  return (
    params.submitting ||
    params.modelProfilesLoading ||
    params.runningDefaultPromptAction !== null
  );
}

export function canSubmitAiSessionComposerPrompt(params: {
  readonly promptInput: string;
  readonly submitting: boolean;
  readonly modelProfilesLoading: boolean;
  readonly runningDefaultPromptAction: AiSessionDefaultPromptAction | null;
}): boolean {
  return (
    params.promptInput.trim().length > 0 &&
    !isAiSessionComposerBusy({
      submitting: params.submitting,
      modelProfilesLoading: params.modelProfilesLoading,
      runningDefaultPromptAction: params.runningDefaultPromptAction,
    })
  );
}

export interface AiSessionModelState {
  readonly modelProfileId?: string | undefined;
  readonly modelVendor?: string | undefined;
  readonly modelName?: string | undefined;
}

export function resolveAiSessionSelectedModelState(params: {
  readonly overviewModelState: AiSessionModelState | null;
  readonly detailModelState: AiSessionModelState | null;
}): AiSessionModelState {
  return {
    modelProfileId:
      params.overviewModelState?.modelProfileId ??
      params.detailModelState?.modelProfileId,
    modelVendor:
      params.overviewModelState?.modelVendor ??
      params.detailModelState?.modelVendor,
    modelName:
      params.overviewModelState?.modelName ??
      params.detailModelState?.modelName,
  };
}

export function resolveAiSessionSubmitModelProfileId(params: {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly selectedSessionModelProfileId?: string | undefined;
  readonly draftModelProfileId: string | null;
}): string | undefined {
  if (params.selectedQraftAiSessionId !== null) {
    return params.selectedSessionModelProfileId;
  }

  return params.draftModelProfileId ?? undefined;
}

export function parseAiSessionOverviewRouteState(
  locationSearch: string,
): AiSessionOverviewRouteState {
  const searchParams = new URLSearchParams(locationSearch);
  const rawSelectedSessionId = searchParams.get(SESSION_QUERY_KEY)?.trim();
  const draftComposerOpenParam = searchParams.get(SESSION_DRAFT_QUERY_KEY);
  const searchQuery = searchParams.get(SESSION_SEARCH_QUERY_KEY)?.trim() ?? "";
  const searchInTranscriptParam = searchParams.get(
    SESSION_SEARCH_TRANSCRIPT_KEY,
  );
  const selectedSessionId =
    typeof rawSelectedSessionId === "string" && rawSelectedSessionId.length > 0
      ? (rawSelectedSessionId as QraftAiSessionId)
      : null;
  const isDraftComposerOpen =
    selectedSessionId === null && draftComposerOpenParam === "true";

  return {
    selectedSessionId,
    isDraftComposerOpen,
    searchQuery,
    searchInTranscript:
      searchInTranscriptParam === null
        ? true
        : searchInTranscriptParam === "true",
  };
}

export function buildAiSessionOverviewRouteSearch(
  state: AiSessionOverviewRouteState,
): string {
  const searchParams = new URLSearchParams();
  const normalizedSearchQuery = state.searchQuery.trim();

  if (
    state.selectedSessionId !== null &&
    state.selectedSessionId.trim().length > 0
  ) {
    searchParams.set(SESSION_QUERY_KEY, state.selectedSessionId);
  } else if (state.isDraftComposerOpen) {
    searchParams.set(SESSION_DRAFT_QUERY_KEY, "true");
  }

  if (normalizedSearchQuery.length > 0) {
    searchParams.set(SESSION_SEARCH_QUERY_KEY, normalizedSearchQuery);
    searchParams.set(
      SESSION_SEARCH_TRANSCRIPT_KEY,
      state.searchInTranscript ? "true" : "false",
    );
  }

  const serialized = searchParams.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

export function buildAiSessionScreenHash(params: {
  readonly projectSlug: string | null;
  readonly overviewRouteState: AiSessionOverviewRouteState;
}): string {
  return `${buildScreenHash(params.projectSlug, "ai-session")}${buildAiSessionOverviewRouteSearch(
    params.overviewRouteState,
  )}`;
}

export function createAiSessionScopeResetState(
  locationSearch: string,
): AiSessionScopeResetState {
  const overviewRouteState = parseAiSessionOverviewRouteState(locationSearch);

  return {
    ...overviewRouteState,
    draftSessionId: generateQraftAiSessionId(),
    promptInput: "",
  };
}

export function createAiSessionScopeResetLoadingState(): AiSessionScopeLoadingState {
  return {
    historyLoading: false,
    activityLoading: false,
    modelProfilesLoading: false,
    selectedSessionLoading: false,
    selectedSessionLoadingMore: false,
    submitting: false,
  };
}

export function hasAiSessionActivityEntry(params: {
  readonly qraftAiSessionId: QraftAiSessionId;
  readonly activeSessions: readonly AISessionInfo[];
  readonly promptQueue: readonly PromptQueueItem[];
  readonly historicalSessions: readonly ExtendedSessionEntry[];
}): boolean {
  return (
    params.activeSessions.some(
      (activeSession) =>
        (activeSession.clientSessionId ?? activeSession.id) ===
        params.qraftAiSessionId,
    ) ||
    params.promptQueue.some(
      (promptQueueItem) =>
        promptQueueItem.qraft_ai_session_id === params.qraftAiSessionId,
    ) ||
    params.historicalSessions.some(
      (historicalSession) =>
        historicalSession.qraftAiSessionId === params.qraftAiSessionId,
    )
  );
}

export function resolveAiSessionRuntimeSession(params: {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly activeSessions: readonly AISessionInfo[];
}): AISessionInfo | null {
  if (params.selectedQraftAiSessionId === null) {
    return null;
  }

  return (
    params.activeSessions.find(
      (activeSession) =>
        activeSession.id === params.selectedQraftAiSessionId ||
        activeSession.clientSessionId === params.selectedQraftAiSessionId,
    ) ?? null
  );
}

export function resolveAiSessionStreamSessionId(params: {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly preferredRuntimeSessionId: QraftAiSessionId | null;
  readonly preferredRuntimeSessionOwnerQraftAiSessionId: QraftAiSessionId | null;
  readonly runtimeSession: AISessionInfo | null;
}): QraftAiSessionId | null {
  if (
    params.selectedQraftAiSessionId !== null &&
    params.preferredRuntimeSessionId !== null &&
    params.preferredRuntimeSessionOwnerQraftAiSessionId ===
      params.selectedQraftAiSessionId
  ) {
    return params.preferredRuntimeSessionId;
  }

  if (params.runtimeSession?.state === "running") {
    return params.runtimeSession.id as QraftAiSessionId;
  }

  return null;
}

export function shouldPreserveAiSessionLiveAssistantStateOnStreamOpen(params: {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly streamSessionId: QraftAiSessionId | null;
  readonly preferredRuntimeSessionId: QraftAiSessionId | null;
  readonly preferredRuntimeSessionOwnerQraftAiSessionId: QraftAiSessionId | null;
  readonly liveAssistantPhase: "idle" | "starting" | "thinking" | "streaming";
}): boolean {
  return (
    params.selectedQraftAiSessionId !== null &&
    params.streamSessionId !== null &&
    params.preferredRuntimeSessionId === params.streamSessionId &&
    params.preferredRuntimeSessionOwnerQraftAiSessionId ===
      params.selectedQraftAiSessionId &&
    (params.liveAssistantPhase === "starting" ||
      params.liveAssistantPhase === "thinking")
  );
}

export function normalizeAiSessionLiveAssistantStatusText(
  statusText: string | null,
): string | null {
  if (statusText === null) {
    return null;
  }

  const normalizedStatusText = statusText.replace(/\s+/g, " ").trim();
  if (normalizedStatusText.length === 0) {
    return null;
  }

  const normalizedStatusKey = normalizedStatusText.toLowerCase();
  if (
    normalizedStatusKey === "thinking" ||
    normalizedStatusKey === "thinking..." ||
    normalizedStatusKey === "starting session" ||
    normalizedStatusKey === "starting session..." ||
    normalizedStatusKey === "turnstarted" ||
    normalizedStatusKey === "turn started"
  ) {
    return "Thinking...";
  }

  if (
    !normalizedStatusText.includes(" ") &&
    /^[A-Za-z][A-Za-z0-9._:-]*$/.test(normalizedStatusText) &&
    /(Started|Starting|Created|Queued|Running|Updated)$/u.test(
      normalizedStatusText,
    )
  ) {
    return "Thinking...";
  }

  return normalizedStatusText;
}

export function shouldRetireAiSessionLiveAssistantFromTranscript(params: {
  readonly transcriptLines: readonly {
    readonly role: "assistant" | "user" | "system";
    readonly text: string;
  }[];
  readonly optimisticAnchorIndex: number | null;
  readonly liveAssistantPhase: "idle" | "starting" | "thinking" | "streaming";
  readonly liveAssistantText: string | null;
}): boolean {
  if (params.liveAssistantPhase === "idle") {
    return false;
  }

  const clampedAnchorIndex = Math.max(
    0,
    Math.min(
      params.optimisticAnchorIndex ?? params.transcriptLines.length,
      params.transcriptLines.length,
    ),
  );
  const transcriptTail =
    params.optimisticAnchorIndex === null
      ? params.transcriptLines
      : params.transcriptLines.slice(clampedAnchorIndex);
  const lastPersistedAssistantLine = [...transcriptTail]
    .reverse()
    .find((transcriptLine) => transcriptLine.role === "assistant");

  if (lastPersistedAssistantLine === undefined) {
    return false;
  }

  if (params.liveAssistantText !== null) {
    return lastPersistedAssistantLine.text === params.liveAssistantText;
  }

  return lastPersistedAssistantLine.text.trim().length > 0;
}

export interface AiSessionRequestToken {
  readonly requestId: number;
  readonly scopeKey: string;
}

export interface LatestAiSessionRequestGuard {
  issue(scopeKey: string): AiSessionRequestToken;
  isCurrent(token: AiSessionRequestToken): boolean;
  invalidate(): void;
}

export function resolveAiSessionRequestToken(params: {
  readonly requestGuard: LatestAiSessionRequestGuard;
  readonly scopeKey: string;
  readonly requestToken?: AiSessionRequestToken | undefined;
}): AiSessionRequestToken {
  return params.requestToken ?? params.requestGuard.issue(params.scopeKey);
}

export function canApplyAiSessionScopedRequestResult(params: {
  readonly requestGuard: LatestAiSessionRequestGuard;
  readonly requestToken: AiSessionRequestToken;
  readonly expectedScopeKey: string;
  readonly contextId: string | null;
  readonly projectPath: string;
}): boolean {
  return (
    params.requestGuard.isCurrent(params.requestToken) &&
    isAiSessionScopeCurrent({
      expectedScopeKey: params.expectedScopeKey,
      contextId: params.contextId,
      projectPath: params.projectPath,
    })
  );
}

export interface AiSessionTranscriptLineLike {
  readonly id: string;
}

export function mergeAiSessionTranscriptLines<
  TranscriptLine extends AiSessionTranscriptLineLike,
>(
  currentLines: readonly TranscriptLine[],
  nextLines: readonly TranscriptLine[],
  prependOlderLines: boolean,
): readonly TranscriptLine[] {
  if (!prependOlderLines) {
    return nextLines;
  }

  if (currentLines.length === 0) {
    return nextLines;
  }

  const mergedLines = [...nextLines];
  const existingTranscriptIds = new Set(
    nextLines.map((transcriptLine) => transcriptLine.id),
  );

  for (const transcriptLine of currentLines) {
    if (existingTranscriptIds.has(transcriptLine.id)) {
      continue;
    }

    existingTranscriptIds.add(transcriptLine.id);
    mergedLines.push(transcriptLine);
  }

  return mergedLines;
}

export function canLoadMoreAiSessionTranscript(params: {
  readonly loadedEventCount: number;
  readonly totalCount: number;
}): boolean {
  return params.loadedEventCount < params.totalCount;
}

export function canLoadMoreAiSessionHistory(params: {
  readonly loadedCount: number;
  readonly totalCount: number;
}): boolean {
  return params.loadedCount < params.totalCount;
}

export function resolveLatestAiSessionTranscriptOffset(params: {
  readonly totalCount: number;
  readonly pageSize: number;
}): number {
  return Math.max(0, params.totalCount - params.pageSize);
}

export function resolvePreviousAiSessionTranscriptOffset(params: {
  readonly currentOffset: number;
  readonly pageSize: number;
}): number {
  return Math.max(0, params.currentOffset - params.pageSize);
}

export function createAiSessionDetailRequestKey(params: {
  readonly contextId: string;
  readonly qraftAiSessionId: QraftAiSessionId;
}): string {
  return `${params.contextId}:${params.qraftAiSessionId}`;
}

export function createLatestAiSessionRequestGuard(): LatestAiSessionRequestGuard {
  let latestRequestId = 0;

  return {
    issue(scopeKey: string): AiSessionRequestToken {
      latestRequestId += 1;
      return {
        requestId: latestRequestId,
        scopeKey,
      };
    },
    isCurrent(token: AiSessionRequestToken): boolean {
      return token.requestId === latestRequestId;
    },
    invalidate(): void {
      latestRequestId += 1;
    },
  };
}
