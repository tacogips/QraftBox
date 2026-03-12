import type { QraftAiSessionId } from "../../../../src/types/ai";
import type { AIAgent } from "../../../../src/types/ai-agent";
import type { SessionSource } from "../../../../src/types/claude-session";
import type {
  AISessionInfo,
  AiSessionTranscriptEvent,
  PromptQueueItem,
} from "../../../../client-shared/src/api/ai-sessions";
import type { ExtendedSessionEntry } from "../../../../src/types/claude-session";
import type { ModelProfile } from "../../../../src/types/model-config";
import {
  isInjectedSessionSystemPrompt,
  stripSystemTags,
} from "../../../../src/utils/strip-system-tags";
import type { AiSessionPromptContextState } from "./state";

export interface AiSessionListEntry {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly status: string | null;
  readonly qraftAiSessionId: QraftAiSessionId;
  readonly lifecycleState: "active" | "history" | "queued";
  readonly sessionSource?: SessionSource | undefined;
  readonly updatedAt: string;
  readonly queuedPromptCount: number;
  readonly queuedPromptId: string | null;
  readonly activeSessionId: string | null;
  readonly historySessionId: string | null;
  readonly latestPrompt: string;
  readonly aiAgent?: AIAgent | undefined;
  readonly modelProfileId?: string | undefined;
  readonly modelVendor?: string | undefined;
  readonly modelName?: string | undefined;
  readonly canCancel: boolean;
}

function getLatestPromptQueueItem(
  promptQueueItems: readonly PromptQueueItem[],
): PromptQueueItem | null {
  const [firstPromptQueueItem, ...remainingPromptQueueItems] = promptQueueItems;
  if (firstPromptQueueItem === undefined) {
    return null;
  }

  let latestPromptQueueItem = firstPromptQueueItem;

  for (const promptQueueItem of remainingPromptQueueItems) {
    if (
      Date.parse(promptQueueItem.created_at) >
      Date.parse(latestPromptQueueItem.created_at)
    ) {
      latestPromptQueueItem = promptQueueItem;
    }
  }

  return latestPromptQueueItem;
}

export function buildAiSessionListEntries(
  activeSessions: readonly AISessionInfo[],
  promptQueue: readonly PromptQueueItem[],
  historicalSessions: readonly ExtendedSessionEntry[],
): readonly AiSessionListEntry[] {
  const historyByQraftId = new Map<QraftAiSessionId, ExtendedSessionEntry>();
  const promptQueueByQraftId = new Map<QraftAiSessionId, PromptQueueItem[]>();

  for (const historicalSession of historicalSessions) {
    historyByQraftId.set(historicalSession.qraftAiSessionId, historicalSession);
  }

  for (const promptQueueItem of promptQueue) {
    if (promptQueueItem.qraft_ai_session_id === undefined) {
      continue;
    }

    const existingPromptQueueItems = promptQueueByQraftId.get(
      promptQueueItem.qraft_ai_session_id,
    );
    if (existingPromptQueueItems === undefined) {
      promptQueueByQraftId.set(promptQueueItem.qraft_ai_session_id, [
        promptQueueItem,
      ]);
      continue;
    }

    existingPromptQueueItems.push(promptQueueItem);
  }

  const entries = new Map<QraftAiSessionId, AiSessionListEntry>();

  for (const activeSession of activeSessions) {
    const qraftAiSessionId = (activeSession.clientSessionId ??
      activeSession.id) as QraftAiSessionId;
    const historicalSession = historyByQraftId.get(qraftAiSessionId);
    const queuedPromptItems = promptQueueByQraftId.get(qraftAiSessionId) ?? [];
    const latestQueuedPromptItem = getLatestPromptQueueItem(queuedPromptItems);
    const latestPrompt =
      activeSession.prompt.trim().length > 0
        ? activeSession.prompt
        : (historicalSession?.firstPrompt?.trim() ?? "");

    const titleCandidate =
      activeSession.prompt.trim() ||
      historicalSession?.summary.trim() ||
      historicalSession?.firstPrompt.trim() ||
      "Active session";

    const detailCandidate =
      activeSession.currentActivity?.trim() ||
      activeSession.lastAssistantMessage?.trim() ||
      historicalSession?.summary.trim() ||
      activeSession.state;

    entries.set(qraftAiSessionId, {
      id: `active:${activeSession.id}`,
      title: titleCandidate,
      detail: detailCandidate,
      status: activeSession.state,
      qraftAiSessionId,
      lifecycleState: "active",
      sessionSource: historicalSession?.source ?? "qraftbox",
      updatedAt:
        activeSession.completedAt ??
        activeSession.startedAt ??
        activeSession.createdAt,
      queuedPromptCount: queuedPromptItems.length,
      queuedPromptId: latestQueuedPromptItem?.id ?? null,
      activeSessionId: activeSession.id,
      historySessionId: historicalSession?.sessionId ?? null,
      latestPrompt,
      aiAgent: activeSession.aiAgent ?? historicalSession?.aiAgent,
      modelProfileId:
        activeSession.modelProfileId ?? historicalSession?.modelProfileId,
      modelVendor: activeSession.modelVendor ?? historicalSession?.modelVendor,
      modelName: activeSession.modelName ?? historicalSession?.modelName,
      canCancel:
        activeSession.state === "running" || activeSession.state === "queued",
    });
  }

  for (const historicalSession of historicalSessions) {
    const queuedPromptItems =
      promptQueueByQraftId.get(historicalSession.qraftAiSessionId) ?? [];
    const latestQueuedPromptItem = getLatestPromptQueueItem(queuedPromptItems);
    if (entries.has(historicalSession.qraftAiSessionId)) {
      continue;
    }

    const latestPrompt =
      latestQueuedPromptItem?.message.trim() ||
      historicalSession.firstPrompt.trim() ||
      historicalSession.summary.trim();
    entries.set(historicalSession.qraftAiSessionId, {
      id: `history:${historicalSession.sessionId}`,
      title:
        historicalSession.summary.trim().length > 0
          ? historicalSession.summary
          : historicalSession.firstPrompt,
      detail:
        latestQueuedPromptItem?.message.trim() ||
        `${historicalSession.source} | ${historicalSession.gitBranch}`,
      status: latestQueuedPromptItem?.status ?? null,
      qraftAiSessionId: historicalSession.qraftAiSessionId,
      lifecycleState: latestQueuedPromptItem === null ? "history" : "queued",
      sessionSource: historicalSession.source,
      updatedAt:
        latestQueuedPromptItem?.created_at ?? historicalSession.modified,
      queuedPromptCount: queuedPromptItems.length,
      queuedPromptId: latestQueuedPromptItem?.id ?? null,
      activeSessionId: null,
      historySessionId: historicalSession.sessionId,
      latestPrompt,
      aiAgent: historicalSession.aiAgent,
      modelProfileId: historicalSession.modelProfileId,
      modelVendor: historicalSession.modelVendor,
      modelName: historicalSession.modelName,
      canCancel:
        latestQueuedPromptItem?.status === "queued" ||
        latestQueuedPromptItem?.status === "running",
    });
  }

  for (const [qraftAiSessionId, queuedPromptItems] of promptQueueByQraftId) {
    if (entries.has(qraftAiSessionId)) {
      continue;
    }

    const latestPromptQueueItem = getLatestPromptQueueItem(queuedPromptItems);
    if (latestPromptQueueItem === null) {
      continue;
    }

    entries.set(qraftAiSessionId, {
      id: `queued:${latestPromptQueueItem.id}`,
      title: latestPromptQueueItem.message.trim() || "Queued prompt",
      detail: `Queued prompt for ${qraftAiSessionId}`,
      status: latestPromptQueueItem.status,
      qraftAiSessionId,
      lifecycleState: "queued",
      sessionSource: "qraftbox",
      updatedAt: latestPromptQueueItem.created_at,
      queuedPromptCount: queuedPromptItems.length,
      queuedPromptId: latestPromptQueueItem.id,
      activeSessionId: null,
      historySessionId: null,
      latestPrompt: latestPromptQueueItem.message,
      aiAgent: undefined,
      modelProfileId: undefined,
      modelVendor: undefined,
      modelName: undefined,
      canCancel:
        latestPromptQueueItem.status === "queued" ||
        latestPromptQueueItem.status === "running",
    });
  }

  return [...entries.values()].sort((left, right) => {
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export interface AiSessionCancelAction {
  readonly kind: "active-session" | "queued-prompt";
  readonly targetId: string;
  readonly label: string;
}

export function resolveAiSessionCancelAction(
  sessionEntry: Pick<
    AiSessionListEntry,
    "activeSessionId" | "queuedPromptId" | "canCancel"
  >,
): AiSessionCancelAction | null {
  if (!sessionEntry.canCancel) {
    return null;
  }

  if (
    typeof sessionEntry.activeSessionId === "string" &&
    sessionEntry.activeSessionId.length > 0
  ) {
    return {
      kind: "active-session",
      targetId: sessionEntry.activeSessionId,
      label: "Cancel selected session",
    };
  }

  if (
    typeof sessionEntry.queuedPromptId === "string" &&
    sessionEntry.queuedPromptId.length > 0
  ) {
    return {
      kind: "queued-prompt",
      targetId: sessionEntry.queuedPromptId,
      label: "Cancel selected queued prompt",
    };
  }

  return null;
}

export interface AiSessionTranscriptLine {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly text: string;
  readonly timestamp: string | null;
  readonly isInjectedSystemPrompt: boolean;
  readonly isLive: boolean;
  readonly isThinking: boolean;
}

const LIVE_ASSISTANT_TRANSCRIPT_LINE_ID = "live-assistant";
const OPTIMISTIC_USER_TRANSCRIPT_LINE_ID = "optimistic-user";

export type AiSessionLiveAssistantPhase =
  | "idle"
  | "starting"
  | "thinking"
  | "streaming";

export interface BuildAiSessionTranscriptLinesOptions {
  readonly offset?: number | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function extractMessageContent(raw: Record<string, unknown>): unknown {
  const message = asRecord(raw["message"]);
  if (message?.["content"] !== undefined) {
    return message["content"];
  }

  const payload = asRecord(raw["payload"]);
  if (payload?.["content"] !== undefined) {
    return payload["content"];
  }

  return undefined;
}

function extractTranscriptTextFromBlocks(blocks: readonly unknown[]): string {
  const textParts: string[] = [];

  for (const blockValue of blocks) {
    if (typeof blockValue === "string") {
      textParts.push(blockValue);
      continue;
    }

    const block = asRecord(blockValue);
    if (block === null) {
      continue;
    }

    if (
      (block["type"] === "text" ||
        block["type"] === "input_text" ||
        block["type"] === "output_text") &&
      typeof block["text"] === "string"
    ) {
      const textValue = block["text"].trim();
      if (textValue.startsWith("<image") || textValue === "</image>") {
        continue;
      }
      textParts.push(block["text"]);
      continue;
    }

    if (block["type"] === "tool_use" && typeof block["name"] === "string") {
      textParts.push(`[Tool: ${block["name"]}]`);
      continue;
    }

    if (
      block["type"] === "tool_result" &&
      typeof block["content"] === "string"
    ) {
      textParts.push(block["content"]);
    }
  }

  return textParts.join("\n\n");
}

export function extractAiSessionTranscriptText(
  event: AiSessionTranscriptEvent,
): string {
  const raw = event.raw;

  if (event.type === "user" || event.type === "assistant") {
    const messageContent = extractMessageContent(raw);
    if (typeof messageContent === "string") {
      return stripSystemTags(messageContent);
    }
    if (Array.isArray(messageContent)) {
      return stripSystemTags(extractTranscriptTextFromBlocks(messageContent));
    }
  }

  if (event.type === "tool_use") {
    const toolName =
      typeof raw["name"] === "string" ? raw["name"] : "unknown-tool";
    return `[Tool: ${toolName}]`;
  }

  if (event.type === "tool_result" && raw["content"] !== undefined) {
    return typeof raw["content"] === "string"
      ? raw["content"]
      : JSON.stringify(raw["content"], null, 2);
  }

  if (typeof event.content === "string") {
    return stripSystemTags(event.content);
  }

  return "";
}

function isInjectedTranscriptSystemPrompt(
  event: AiSessionTranscriptEvent,
): boolean {
  if (event.type === "tool_use" || event.type === "tool_result") {
    return false;
  }

  const messageContent = extractMessageContent(event.raw);
  if (typeof messageContent === "string") {
    return isInjectedSessionSystemPrompt(messageContent);
  }

  if (Array.isArray(messageContent)) {
    return isInjectedSessionSystemPrompt(
      extractTranscriptTextFromBlocks(messageContent),
    );
  }

  if (typeof event.content === "string") {
    return isInjectedSessionSystemPrompt(event.content);
  }

  return false;
}

export function buildAiSessionTranscriptLines(
  events: readonly AiSessionTranscriptEvent[],
  options: BuildAiSessionTranscriptLinesOptions = {},
): readonly AiSessionTranscriptLine[] {
  return events
    .map((event, eventIndex) => {
      const text = extractAiSessionTranscriptText(event).trim();
      if (text.length === 0) {
        return null;
      }

      return {
        id: event.uuid ?? `${event.type}:${(options.offset ?? 0) + eventIndex}`,
        role:
          event.type === "user"
            ? "user"
            : event.type === "assistant"
              ? "assistant"
              : "system",
        text,
        isInjectedSystemPrompt: isInjectedTranscriptSystemPrompt(event),
        timestamp:
          typeof event.timestamp === "string" && event.timestamp.length > 0
            ? event.timestamp
            : null,
        isLive: false,
        isThinking: false,
      } satisfies AiSessionTranscriptLine;
    })
    .filter(
      (transcriptLine): transcriptLine is AiSessionTranscriptLine =>
        transcriptLine !== null,
    );
}

export function mergeLiveAiSessionTranscriptLine(params: {
  readonly transcriptLines: readonly AiSessionTranscriptLine[];
  readonly liveAssistantPhase: AiSessionLiveAssistantPhase;
  readonly liveAssistantText: string | null;
  readonly liveAssistantTimestamp: string | null;
  readonly liveAssistantStatusText: string | null;
}): readonly AiSessionTranscriptLine[] {
  const persistedTranscriptLines = params.transcriptLines.filter(
    (transcriptLine) => transcriptLine.id !== LIVE_ASSISTANT_TRANSCRIPT_LINE_ID,
  );
  const liveAssistantText = params.liveAssistantText;
  const liveAssistantPhase = params.liveAssistantPhase;
  const liveAssistantDisplayText =
    liveAssistantText !== null && liveAssistantText.trim().length > 0
      ? liveAssistantText
      : liveAssistantPhase === "idle"
        ? null
        : (params.liveAssistantStatusText ?? "Thinking...");

  if (liveAssistantDisplayText === null) {
    return persistedTranscriptLines;
  }

  const lastPersistedTranscriptLine =
    persistedTranscriptLines[persistedTranscriptLines.length - 1];
  if (
    lastPersistedTranscriptLine?.role === "assistant" &&
    lastPersistedTranscriptLine.text === liveAssistantDisplayText &&
    liveAssistantPhase !== "starting" &&
    liveAssistantPhase !== "thinking"
  ) {
    return persistedTranscriptLines;
  }

  return [
    ...persistedTranscriptLines,
    {
      id: LIVE_ASSISTANT_TRANSCRIPT_LINE_ID,
      role: "assistant",
      text: liveAssistantDisplayText,
      timestamp: params.liveAssistantTimestamp,
      isInjectedSystemPrompt: false,
      isLive: true,
      isThinking:
        liveAssistantPhase === "starting" || liveAssistantPhase === "thinking",
    },
  ];
}

export function mergeOptimisticUserTranscriptLine(params: {
  readonly transcriptLines: readonly AiSessionTranscriptLine[];
  readonly optimisticUserText: string | null;
  readonly optimisticUserTimestamp: string | null;
}): readonly AiSessionTranscriptLine[] {
  const persistedTranscriptLines = params.transcriptLines.filter(
    (transcriptLine) =>
      transcriptLine.id !== OPTIMISTIC_USER_TRANSCRIPT_LINE_ID,
  );
  const optimisticUserText = params.optimisticUserText;

  if (optimisticUserText === null || optimisticUserText.trim().length === 0) {
    return persistedTranscriptLines;
  }

  const lastPersistedTranscriptLine =
    persistedTranscriptLines[persistedTranscriptLines.length - 1];
  if (
    lastPersistedTranscriptLine?.role === "user" &&
    lastPersistedTranscriptLine.text === optimisticUserText
  ) {
    return persistedTranscriptLines;
  }

  return [
    ...persistedTranscriptLines,
    {
      id: OPTIMISTIC_USER_TRANSCRIPT_LINE_ID,
      role: "user",
      text: optimisticUserText,
      timestamp: params.optimisticUserTimestamp,
      isInjectedSystemPrompt: false,
      isLive: false,
      isThinking: false,
    },
  ];
}

export function mergePendingAiSessionTranscriptLines(params: {
  readonly transcriptLines: readonly AiSessionTranscriptLine[];
  readonly optimisticUserText: string | null;
  readonly optimisticUserTimestamp: string | null;
  readonly optimisticAnchorIndex: number | null;
  readonly liveAssistantPhase: AiSessionLiveAssistantPhase;
  readonly liveAssistantText: string | null;
  readonly liveAssistantTimestamp: string | null;
  readonly liveAssistantStatusText: string | null;
}): readonly AiSessionTranscriptLine[] {
  const persistedTranscriptLines = params.transcriptLines.filter(
    (transcriptLine) =>
      transcriptLine.id !== OPTIMISTIC_USER_TRANSCRIPT_LINE_ID &&
      transcriptLine.id !== LIVE_ASSISTANT_TRANSCRIPT_LINE_ID,
  );
  const anchorIndex = Math.max(
    0,
    Math.min(
      params.optimisticAnchorIndex ?? persistedTranscriptLines.length,
      persistedTranscriptLines.length,
    ),
  );
  const transcriptTail = persistedTranscriptLines.slice(anchorIndex);
  const normalizedOptimisticText = params.optimisticUserText?.trim().length
    ? params.optimisticUserText.replace(/\s+/g, " ").trim()
    : null;
  const persistedOptimisticUserIndex =
    normalizedOptimisticText === null
      ? -1
      : transcriptTail.findIndex(
          (transcriptLine) =>
            transcriptLine.role === "user" &&
            transcriptLine.text.replace(/\s+/g, " ").trim() ===
              normalizedOptimisticText,
        );
  const shouldRenderOptimisticUser =
    normalizedOptimisticText !== null && persistedOptimisticUserIndex === -1;
  const liveAssistantDisplayText =
    params.liveAssistantText !== null && params.liveAssistantText.trim().length > 0
      ? params.liveAssistantText
      : params.liveAssistantPhase === "idle"
        ? null
        : (params.liveAssistantStatusText ?? "Thinking...");
  const shouldRenderLiveAssistant =
    liveAssistantDisplayText !== null &&
    !transcriptTail.some((transcriptLine) => transcriptLine.role === "assistant");

  return [
    ...persistedTranscriptLines,
    ...(shouldRenderOptimisticUser
      ? [
          {
            id: OPTIMISTIC_USER_TRANSCRIPT_LINE_ID,
            role: "user",
            text: params.optimisticUserText!,
            timestamp: params.optimisticUserTimestamp,
            isInjectedSystemPrompt: false,
            isLive: false,
            isThinking: false,
          } satisfies AiSessionTranscriptLine,
        ]
      : []),
    ...(shouldRenderLiveAssistant
      ? [
          {
            id: LIVE_ASSISTANT_TRANSCRIPT_LINE_ID,
            role: "assistant",
            text: liveAssistantDisplayText!,
            timestamp: params.liveAssistantTimestamp,
            isInjectedSystemPrompt: false,
            isLive: true,
            isThinking:
              params.liveAssistantPhase === "starting" ||
              params.liveAssistantPhase === "thinking",
          } satisfies AiSessionTranscriptLine,
        ]
      : []),
  ];
}

export function reconcileAiSessionTranscriptLines(
  currentLines: readonly AiSessionTranscriptLine[],
  nextLines: readonly AiSessionTranscriptLine[],
): readonly AiSessionTranscriptLine[] {
  if (currentLines.length === 0) {
    return nextLines;
  }

  const currentById = new Map(
    currentLines.map((transcriptLine) => [transcriptLine.id, transcriptLine]),
  );

  return nextLines.map((nextLine) => {
    const currentLine = currentById.get(nextLine.id);
    if (currentLine === undefined) {
      return nextLine;
    }

    if (
      currentLine.role === nextLine.role &&
      currentLine.text === nextLine.text &&
      currentLine.timestamp === nextLine.timestamp &&
      currentLine.isInjectedSystemPrompt === nextLine.isInjectedSystemPrompt &&
      currentLine.isLive === nextLine.isLive &&
      currentLine.isThinking === nextLine.isThinking
    ) {
      return currentLine;
    }

    return nextLine;
  });
}

export function getQueuedPromptSummary(
  promptQueue: readonly PromptQueueItem[],
): string {
  const queuedPromptCount = promptQueue.filter(
    (promptQueueItem) => promptQueueItem.status === "queued",
  ).length;
  const runningPromptCount = promptQueue.filter(
    (promptQueueItem) => promptQueueItem.status === "running",
  ).length;

  if (queuedPromptCount === 0 && runningPromptCount === 0) {
    return "No queued prompts";
  }

  return `${runningPromptCount} running, ${queuedPromptCount} queued`;
}

export function formatAiSessionTimestamp(timestamp: string): string {
  const parsedTimestamp = new Date(timestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return "Unknown time";
  }

  return parsedTimestamp.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function describeAiSessionTarget(params: {
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly draftSessionId: QraftAiSessionId;
}): string {
  if (params.selectedQraftAiSessionId !== null) {
    return `Continuing session ${params.selectedQraftAiSessionId}`;
  }

  return `New session draft ${params.draftSessionId}`;
}

export function describeAiSessionModelProfile(
  selectedProfileId: string | null,
  profiles: readonly ModelProfile[],
): string {
  if (selectedProfileId === null) {
    return "Using the server default AI profile.";
  }

  const selectedProfile = profiles.find(
    (profile) => profile.id === selectedProfileId,
  );
  if (selectedProfile === undefined) {
    return "Using a custom AI profile selection.";
  }

  return `Using profile ${selectedProfile.name} (${selectedProfile.vendor}/${selectedProfile.model}).`;
}

export function describeAiSessionEntryModel(
  entry: Pick<
    AiSessionListEntry,
    "modelProfileId" | "modelVendor" | "modelName"
  >,
  profiles: readonly ModelProfile[],
): string {
  if (entry.modelProfileId !== undefined) {
    const matchingProfile = profiles.find(
      (profile) => profile.id === entry.modelProfileId,
    );
    if (matchingProfile !== undefined) {
      return `${matchingProfile.name} (${matchingProfile.vendor}/${matchingProfile.model})`;
    }

    return entry.modelProfileId;
  }

  if (
    typeof entry.modelVendor === "string" &&
    typeof entry.modelName === "string"
  ) {
    return `${entry.modelVendor}/${entry.modelName}`;
  }

  return "Server default";
}

export function describeAiSessionEntryOrigin(
  entry: Pick<AiSessionListEntry, "sessionSource">,
): string | null {
  if (entry.sessionSource === "qraftbox") {
    return "QRAFTBOX";
  }

  if (
    entry.sessionSource === "claude-cli" ||
    entry.sessionSource === "codex-cli"
  ) {
    return "CLIENT";
  }

  return null;
}

export function describeAiSessionEntryAgent(
  entry: Pick<AiSessionListEntry, "aiAgent" | "sessionSource" | "modelVendor">,
): string | null {
  if (entry.aiAgent === "codex" || entry.sessionSource === "codex-cli") {
    return "CODEX";
  }

  if (entry.aiAgent === "claude" || entry.sessionSource === "claude-cli") {
    return "CLAUDE-CODE";
  }

  if (entry.modelVendor === "openai") {
    return "CODEX";
  }

  if (entry.modelVendor === "anthropics") {
    return "CLAUDE-CODE";
  }

  return null;
}

export function describeAiSessionPromptContext(
  promptContextState: AiSessionPromptContextState,
): string {
  if (promptContextState.selectedReferencePath === null) {
    return promptContextState.changedFileCount > 0
      ? `No file is selected. Prompts will use workspace-level context only while ${promptContextState.changedFileCount} changed files remain available in the current diff.`
      : "No file is selected. Prompts will use workspace-level context only.";
  }

  return promptContextState.changedFileCount > 0
    ? `Prompts will include ${promptContextState.selectedReferencePath} and stay aligned with the current diff (${promptContextState.changedFileCount} changed files).`
    : `Prompts will include ${promptContextState.selectedReferencePath}.`;
}
