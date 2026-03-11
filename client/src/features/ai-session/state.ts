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

export function replaceAiSessionOverviewRouteSearchInHash(
  hash: string,
  nextSearch: string,
): string {
  const hashQueryStart = hash.indexOf("?");
  const hashPath = hashQueryStart < 0 ? hash : hash.slice(0, hashQueryStart);
  return `${hashPath}${nextSearch}`;
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
  readonly runningDefaultPromptAction: string | null;
}

const SESSION_QUERY_KEY = "ai_session_id";
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

export function createAiSessionDefaultPromptMessage(
  action: AiSessionDefaultPromptAction,
  promptContent: string,
): string {
  return wrapQraftboxInternalPrompt(action, promptContent, "session-action-v1");
}

export function parseAiSessionOverviewRouteState(
  locationSearch: string,
): AiSessionOverviewRouteState {
  const searchParams = new URLSearchParams(locationSearch);
  const selectedSessionId = searchParams.get(SESSION_QUERY_KEY)?.trim();
  const searchQuery = searchParams.get(SESSION_SEARCH_QUERY_KEY)?.trim() ?? "";
  const searchInTranscriptParam = searchParams.get(
    SESSION_SEARCH_TRANSCRIPT_KEY,
  );

  return {
    selectedSessionId:
      typeof selectedSessionId === "string" && selectedSessionId.length > 0
        ? (selectedSessionId as QraftAiSessionId)
        : null,
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
    runningDefaultPromptAction: null,
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
  append: boolean,
): readonly TranscriptLine[] {
  if (!append) {
    return nextLines;
  }

  if (currentLines.length === 0) {
    return nextLines;
  }

  const mergedLines = [...currentLines];
  const existingTranscriptIds = new Set(
    currentLines.map((transcriptLine) => transcriptLine.id),
  );

  for (const transcriptLine of nextLines) {
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

export function resolveNextAiSessionTranscriptOffset(params: {
  readonly append: boolean;
  readonly loadedEventCount: number;
}): number {
  return params.append ? params.loadedEventCount : 0;
}

export function resolveLoadedAiSessionTranscriptEventCount(params: {
  readonly append: boolean;
  readonly currentLoadedEventCount: number;
  readonly responseOffset: number;
  readonly responseEventCount: number;
}): number {
  const nextLoadedEventCount =
    params.responseOffset + params.responseEventCount;

  if (!params.append) {
    return nextLoadedEventCount;
  }

  return Math.max(params.currentLoadedEventCount, nextLoadedEventCount);
}

export function createAiSessionDetailRequestKey(params: {
  readonly contextId: string;
  readonly qraftAiSessionId: QraftAiSessionId;
  readonly hasHistoricalSession: boolean;
}): string {
  return `${params.contextId}:${params.qraftAiSessionId}:${params.hasHistoricalSession ? "history" : "live"}`;
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
