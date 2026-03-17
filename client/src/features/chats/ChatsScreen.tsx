import {
  createEffect,
  createMemo,
  createSignal,
  For,
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
import type { QraftAiSessionId } from "../../../../src/types/ai";
import type { ExtendedSessionEntry } from "../../../../src/types/claude-session";
import type { ModelProfile } from "../../../../src/types/model-config";
import { ToolbarIconButton } from "../../components/ToolbarIconButton";
import { ChatSessionColumn } from "./ChatSessionColumn";
import {
  appendChatColumn,
  assignSessionToChatColumn,
  createChatColumnState,
  createResetChatColumnState,
  removeChatColumn,
  replaceChatColumn,
  resolveChatSelectionTargetColumnId,
  resolveFocusedChatColumnIdAfterRemoval,
  MAX_CHAT_COLUMNS,
  type ChatColumnState,
} from "./state";
import { buildAiSessionListEntries } from "../ai-session/presentation";
import {
  createAiSessionHistoryFilters,
  createAiSessionScopeKey,
  createLatestAiSessionRequestGuard,
  resolveAiSessionOverviewPollingMode,
} from "../ai-session/state";

const ACTIVE_SESSION_POLL_MS = 4000;
const IDLE_SESSION_POLL_MS = 20_000;
const SESSION_HISTORY_LIMIT = 60;

export interface ChatsScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly projectPath: string;
  readonly selectedPath: string | null;
  readonly fileContent: FileContent | null;
  readonly diffOverview: DiffOverviewState;
  readonly onOpenFilesScreen: (() => void) | undefined;
  readonly onOpenProjectScreen: (() => void) | undefined;
}

function renderAddColumnIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path d="M10 4.5v11" stroke-linecap="round" />
      <path d="M4.5 10h11" stroke-linecap="round" />
    </svg>
  );
}

function renderNewChatIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="M4.5 5.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4.5A1.5 1.5 0 0 1 3 13V7a1.5 1.5 0 0 1 1.5-1.5Z"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M10 8v4" stroke-linecap="round" />
      <path d="M8 10h4" stroke-linecap="round" />
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

export function ChatsScreen(props: ChatsScreenProps): JSX.Element {
  const aiSessionsApi = createAiSessionsApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const modelConfigApi = createModelConfigApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });

  const [activeSessions, setActiveSessions] = createSignal<
    readonly AISessionInfo[]
  >([]);
  const [promptQueue, setPromptQueue] = createSignal<
    readonly PromptQueueItem[]
  >([]);
  const [historicalSessions, setHistoricalSessions] = createSignal<
    readonly ExtendedSessionEntry[]
  >([]);
  const [modelProfiles, setModelProfiles] = createSignal<
    readonly ModelProfile[]
  >([]);
  const [defaultModelProfileId, setDefaultModelProfileId] = createSignal<
    string | null
  >(null);
  const [columns, setColumns] = createSignal<readonly ChatColumnState[]>([
    createChatColumnState(),
  ]);
  const [focusedColumnId, setFocusedColumnId] = createSignal<string | null>(
    columns()[0]?.id ?? null,
  );
  const [activityLoading, setActivityLoading] = createSignal(false);
  const [modelProfilesLoading, setModelProfilesLoading] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let activeScopeKey: string | null = null;
  let activePollingConfigKey: string | null = null;
  const activityRequestGuard = createLatestAiSessionRequestGuard();
  const modelProfilesRequestGuard = createLatestAiSessionRequestGuard();

  const sessionEntries = createMemo(() =>
    buildAiSessionListEntries(
      activeSessions(),
      promptQueue(),
      historicalSessions(),
    ),
  );
  const liveSessionEntries = createMemo(() =>
    sessionEntries().filter(
      (sessionEntry) => sessionEntry.lifecycleState !== "history",
    ),
  );
  const recentSessionEntries = createMemo(() =>
    sessionEntries().filter(
      (sessionEntry) => sessionEntry.lifecycleState === "history",
    ),
  );

  async function refreshActivity(
    contextId: string,
    projectPath: string,
  ): Promise<void> {
    const scopeKey = createAiSessionScopeKey(contextId, projectPath);
    if (scopeKey === null) {
      return;
    }

    const requestToken = activityRequestGuard.issue(scopeKey);
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
          aiSessionsApi.fetchClaudeSessions(
            contextId,
            createAiSessionHistoryFilters({
              projectPath,
              rawSearchQuery: "",
              searchInTranscript: true,
            }),
            {
              offset: 0,
              limit: SESSION_HISTORY_LIMIT,
            },
          ),
        ]);

      if (!activityRequestGuard.isCurrent(requestToken)) {
        return;
      }

      setActiveSessions(nextActiveSessions);
      setPromptQueue(nextPromptQueue);
      setHistoricalSessions(nextHistory.sessions);
      setErrorMessage(null);
    } catch (error) {
      if (!activityRequestGuard.isCurrent(requestToken)) {
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load chats",
      );
    } finally {
      if (activityRequestGuard.isCurrent(requestToken)) {
        setActivityLoading(false);
      }
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
      setDefaultModelProfileId(
        modelConfigState.operationBindings.aiDefaultProfileId,
      );
    } catch (error) {
      if (!modelProfilesRequestGuard.isCurrent(requestToken)) {
        return;
      }

      setModelProfiles([]);
      setDefaultModelProfileId(null);
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

  function restartPolling(params: {
    readonly contextId: string;
    readonly projectPath: string;
    readonly pollingMode: "active" | "idle";
    readonly scopeKey: string;
  }): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }

    pollTimer = setInterval(
      () => {
        void refreshActivity(params.contextId, params.projectPath);
        if (params.pollingMode === "idle") {
          void refreshModelProfiles(params.scopeKey);
        }
      },
      params.pollingMode === "active"
        ? ACTIVE_SESSION_POLL_MS
        : IDLE_SESSION_POLL_MS,
    );
  }

  createEffect(() => {
    const contextId = props.contextId;
    const projectPath = props.projectPath;
    const scopeKey = createAiSessionScopeKey(contextId, projectPath);

    if (activeScopeKey !== scopeKey) {
      activeScopeKey = scopeKey;
      const initialColumn = createChatColumnState();
      setColumns([initialColumn]);
      setFocusedColumnId(initialColumn.id);
      setActiveSessions([]);
      setPromptQueue([]);
      setHistoricalSessions([]);
      setModelProfiles([]);
      setDefaultModelProfileId(null);
      setErrorMessage(null);
      activityRequestGuard.invalidate();
      modelProfilesRequestGuard.invalidate();
      activePollingConfigKey = null;
    }

    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (contextId === null || projectPath.length === 0 || scopeKey === null) {
      return;
    }

    void refreshActivity(contextId, projectPath);
    void refreshModelProfiles(scopeKey);
  });

  createEffect(() => {
    const contextId = props.contextId;
    const projectPath = props.projectPath;
    const scopeKey = createAiSessionScopeKey(contextId, projectPath);

    if (contextId === null || projectPath.length === 0 || scopeKey === null) {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      activePollingConfigKey = null;
      return;
    }

    const pollingMode = resolveAiSessionOverviewPollingMode({
      activeSessions: activeSessions(),
      promptQueue: promptQueue(),
    });
    const nextPollingConfigKey = `${scopeKey}:${pollingMode}`;
    if (nextPollingConfigKey === activePollingConfigKey) {
      return;
    }

    activePollingConfigKey = nextPollingConfigKey;
    restartPolling({
      contextId,
      projectPath,
      pollingMode,
      scopeKey,
    });
  });

  onCleanup(() => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }
  });

  function addColumn(selectedSessionId: QraftAiSessionId | null = null): void {
    const nextColumns = appendChatColumn(columns(), selectedSessionId);
    const nextColumn = nextColumns.at(-1);
    setColumns(nextColumns);
    if (nextColumn !== undefined) {
      setFocusedColumnId(nextColumn.id);
    }
  }

  function selectSession(sessionId: QraftAiSessionId): void {
    const targetColumnId = resolveChatSelectionTargetColumnId({
      columns: columns(),
      focusedColumnId: focusedColumnId(),
      sessionId,
    });

    if (targetColumnId === null) {
      addColumn(sessionId);
      return;
    }

    setColumns((currentColumns) =>
      assignSessionToChatColumn({
        columns: currentColumns,
        columnId: targetColumnId,
        sessionId,
      }),
    );
    setFocusedColumnId(targetColumnId);
  }

  function resetColumn(columnId: string): void {
    setColumns((currentColumns) =>
      replaceChatColumn(
        currentColumns,
        createResetChatColumnState(
          currentColumns.find((column) => column.id === columnId) ??
            createChatColumnState(),
        ),
      ),
    );
    setFocusedColumnId(columnId);
  }

  function closeColumn(columnId: string): void {
    const currentColumns = columns();
    const nextColumns = removeChatColumn(currentColumns, columnId);
    setFocusedColumnId(
      resolveFocusedChatColumnIdAfterRemoval({
        columns: currentColumns,
        removedColumnId: columnId,
        focusedColumnId: focusedColumnId(),
      }) ??
        nextColumns[0]?.id ??
        null,
    );
    setColumns(nextColumns);
  }

  return (
    <section class="mx-auto flex h-full max-w-[1800px] flex-col gap-6 px-4 py-6 sm:px-6">
      <div class="flex items-end justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold text-text-primary">Chats</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Queue is the safe default for same-directory work. Use run-now only
            when you know prompts will not conflict.
          </p>
        </div>
        <div class="flex items-center gap-2 text-xs text-text-secondary">
          <span class="rounded-full border border-border-default bg-bg-secondary px-3 py-2">
            {columns().length}/{MAX_CHAT_COLUMNS} columns
          </span>
          <span class="rounded-full border border-border-default bg-bg-secondary px-3 py-2">
            {liveSessionEntries().length} live sessions
          </span>
        </div>
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
                  Open a workspace before opening chats
                </h3>
                <p class="text-sm leading-6 text-text-secondary">
                  Chat columns are anchored to an active project and reuse the
                  same file context as the session screen. Open or activate a
                  project tab first, then return here to run multiple sessions
                  side by side.
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
        <div class="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border-default bg-bg-primary">
          <aside class="flex w-[320px] shrink-0 flex-col border-r border-border-default bg-bg-secondary/70">
            <div class="flex flex-col gap-3 border-b border-border-default px-4 py-4">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
                    Multi-chat
                  </p>
                  <p class="mt-1 text-sm text-text-secondary">
                    Pick a live session or open a fresh draft column.
                  </p>
                </div>
                <ToolbarIconButton
                  label="Add column"
                  disabled={columns().length >= MAX_CHAT_COLUMNS}
                  onClick={() => addColumn()}
                >
                  {renderAddColumnIcon()}
                </ToolbarIconButton>
              </div>
              <button
                type="button"
                class="flex items-center justify-center gap-2 rounded-md border border-dashed border-accent-emphasis/60 bg-accent-muted/10 px-3 py-3 text-sm font-medium text-accent-fg transition hover:bg-accent-muted/20 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={columns().length >= MAX_CHAT_COLUMNS}
                onClick={() => addColumn()}
              >
                <span class="h-4 w-4">{renderNewChatIcon()}</span>
                Add draft column
              </button>
              <Show when={errorMessage() !== null}>
                <p
                  role="alert"
                  class="rounded-md border border-danger-emphasis/40 bg-danger-subtle px-3 py-2 text-sm text-danger-fg"
                >
                  {errorMessage()}
                </p>
              </Show>
            </div>

            <div class="min-h-0 flex-1 overflow-auto px-3 py-3">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h3 class="text-sm font-semibold text-text-primary">
                  Running / queued
                </h3>
                <span class="text-xs text-text-tertiary">
                  {activityLoading()
                    ? "Refreshing..."
                    : modelProfilesLoading()
                      ? "Profiles loading..."
                      : `${liveSessionEntries().length} items`}
                </span>
              </div>
              <Show
                when={liveSessionEntries().length > 0}
                fallback={
                  <div class="rounded-xl border border-border-default bg-bg-primary px-3 py-4 text-sm text-text-secondary">
                    No live sessions right now.
                  </div>
                }
              >
                <div class="space-y-2">
                  <For each={liveSessionEntries()}>
                    {(sessionEntry) => (
                      <button
                        type="button"
                        class="w-full rounded-xl border border-border-default bg-bg-primary p-3 text-left transition hover:border-border-emphasis hover:bg-bg-hover"
                        onClick={() =>
                          selectSession(sessionEntry.qraftAiSessionId)
                        }
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
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
                              <Show when={sessionEntry.queuedPromptCount > 0}>
                                <span class="rounded bg-bg-tertiary px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                                  {sessionEntry.queuedPromptCount} queued
                                </span>
                              </Show>
                            </div>
                            <p class="mt-2 line-clamp-2 text-sm font-medium text-text-primary">
                              {sessionEntry.title}
                            </p>
                            <p class="mt-1 line-clamp-2 text-xs text-text-secondary">
                              {sessionEntry.detail}
                            </p>
                          </div>
                          <span class="shrink-0 text-[11px] text-text-tertiary">
                            {getRelativeSessionTime(sessionEntry.updatedAt)}
                          </span>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              <div class="mt-6 mb-3 flex items-center justify-between gap-2">
                <h3 class="text-sm font-semibold text-text-primary">Recent</h3>
                <span class="text-xs text-text-tertiary">
                  {recentSessionEntries().length} items
                </span>
              </div>
              <Show
                when={recentSessionEntries().length > 0}
                fallback={
                  <div class="rounded-xl border border-border-default bg-bg-primary px-3 py-4 text-sm text-text-secondary">
                    Recent chat history will appear here after sessions finish.
                  </div>
                }
              >
                <div class="space-y-2">
                  <For each={recentSessionEntries().slice(0, 12)}>
                    {(sessionEntry) => (
                      <button
                        type="button"
                        class="w-full rounded-xl border border-border-default bg-bg-primary p-3 text-left transition hover:border-border-emphasis hover:bg-bg-hover"
                        onClick={() =>
                          selectSession(sessionEntry.qraftAiSessionId)
                        }
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <p class="line-clamp-2 text-sm font-medium text-text-primary">
                              {sessionEntry.title}
                            </p>
                            <p class="mt-1 line-clamp-2 text-xs text-text-secondary">
                              {sessionEntry.detail}
                            </p>
                          </div>
                          <span class="shrink-0 text-[11px] text-text-tertiary">
                            {getRelativeSessionTime(sessionEntry.updatedAt)}
                          </span>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </aside>

          <div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-bg-primary">
            <div class="flex h-full min-h-0 gap-4 p-4">
              <For each={columns()}>
                {(column, columnIndex) => {
                  const selectedEntry = createMemo(
                    () =>
                      sessionEntries().find(
                        (sessionEntry) =>
                          sessionEntry.qraftAiSessionId ===
                          column.selectedQraftAiSessionId,
                      ) ?? null,
                  );
                  const isFocused = createMemo(
                    () => focusedColumnId() === column.id,
                  );

                  return (
                    <section
                      class={`flex h-full min-h-0 w-[min(38rem,88vw)] shrink-0 flex-col overflow-hidden rounded-2xl border bg-bg-secondary shadow-sm transition ${
                        isFocused()
                          ? "border-accent-emphasis shadow-accent-emphasis/10"
                          : "border-border-default"
                      }`}
                      onMouseDown={() => setFocusedColumnId(column.id)}
                    >
                      <div class="flex items-start justify-between gap-3 border-b border-border-default px-4 py-3">
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                              Column {columnIndex() + 1}
                            </span>
                            <Show when={isFocused()}>
                              <span class="rounded-full bg-accent-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
                                Focused
                              </span>
                            </Show>
                          </div>
                          <p class="mt-2 line-clamp-2 text-sm font-medium text-text-primary">
                            {selectedEntry()?.title ?? "New draft session"}
                          </p>
                          <p class="mt-1 line-clamp-2 text-xs text-text-secondary">
                            {selectedEntry()?.detail ??
                              "Queue prompts by default, or run immediately when the workspace is safe to share."}
                          </p>
                        </div>
                        <div class="flex items-center gap-2">
                          <ToolbarIconButton
                            label="Reset column to a new draft"
                            onClick={() => resetColumn(column.id)}
                          >
                            {renderNewChatIcon()}
                          </ToolbarIconButton>
                          <ToolbarIconButton
                            label="Close column"
                            onClick={() => closeColumn(column.id)}
                          >
                            {renderCloseIcon()}
                          </ToolbarIconButton>
                        </div>
                      </div>
                      <div class="min-h-0 flex-1 p-3">
                        <ChatSessionColumn
                          apiBaseUrl={props.apiBaseUrl}
                          contextId={props.contextId}
                          projectPath={props.projectPath}
                          selectedPath={props.selectedPath}
                          fileContent={props.fileContent}
                          diffOverview={props.diffOverview}
                          sessionEntries={sessionEntries()}
                          activeSessions={activeSessions()}
                          promptQueue={promptQueue()}
                          historicalSessions={historicalSessions()}
                          modelProfiles={modelProfiles()}
                          defaultModelProfileId={defaultModelProfileId()}
                          selectedQraftAiSessionId={
                            column.selectedQraftAiSessionId
                          }
                          draftSessionId={column.draftSessionId}
                          onSelectionChange={(nextState) => {
                            setColumns((currentColumns) =>
                              replaceChatColumn(currentColumns, {
                                ...(currentColumns.find(
                                  (currentColumn) =>
                                    currentColumn.id === column.id,
                                ) ?? column),
                                selectedQraftAiSessionId:
                                  nextState.selectedQraftAiSessionId,
                                draftSessionId:
                                  nextState.draftSessionId ??
                                  currentColumns.find(
                                    (currentColumn) =>
                                      currentColumn.id === column.id,
                                  )?.draftSessionId ??
                                  column.draftSessionId,
                              }),
                            );
                            setFocusedColumnId(column.id);
                          }}
                          onApplyActivitySnapshot={(nextState) => {
                            setActiveSessions(nextState.activeSessions);
                            setPromptQueue(nextState.promptQueue);
                          }}
                          onRequestActivityRefresh={async () => {
                            if (props.contextId === null) {
                              return;
                            }

                            await refreshActivity(
                              props.contextId,
                              props.projectPath,
                            );
                          }}
                        />
                      </div>
                    </section>
                  );
                }}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </section>
  );
}
