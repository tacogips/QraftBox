import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";
import {
  createWorkersApiClient,
  type ProcessWorkerChannel,
  type ProcessWorkerDetail,
  type ProcessWorkerStatus,
  type ProcessWorkerSummary,
} from "../../../../client-shared/src/api/workers";
import { ScreenHeader } from "../../components/ScreenHeader";

export interface WorkersScreenProps {
  readonly apiBaseUrl: string;
  readonly projectPath: string;
}

function formatWorkerTimestamp(timestamp: string): string {
  const parsedTimestamp = Date.parse(timestamp);
  if (Number.isNaN(parsedTimestamp)) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedTimestamp);
}

function getWorkerStatusBadgeClass(status: ProcessWorkerStatus): string {
  if (status === "running") {
    return "bg-accent-muted text-accent-fg";
  }
  if (status === "completed") {
    return "bg-success-muted text-success-fg";
  }
  if (status === "cancelled") {
    return "bg-attention-emphasis/20 text-attention-fg";
  }
  return "bg-danger-subtle text-danger-fg";
}

function getWorkerLogCardClass(channel: ProcessWorkerChannel): string {
  if (channel === "stderr") {
    return "rounded-xl border border-danger-emphasis/30 bg-danger-subtle p-4";
  }
  if (channel === "system") {
    return "rounded-xl border border-border-default bg-bg-tertiary p-4";
  }
  return "rounded-xl border border-border-default bg-bg-primary p-4";
}

function getWorkerLogBadgeClass(channel: ProcessWorkerChannel): string {
  if (channel === "stderr") {
    return "bg-danger-subtle text-danger-fg";
  }
  if (channel === "system") {
    return "bg-bg-hover text-text-secondary";
  }
  return "bg-success-muted text-success-fg";
}

function getWorkerListCardClass(
  workerSummary: ProcessWorkerSummary,
  selectedWorkerId: string | null,
): string {
  return workerSummary.id === selectedWorkerId
    ? "rounded-2xl border border-accent-emphasis bg-accent-muted/10 p-4 text-left"
    : "rounded-2xl border border-border-default bg-bg-secondary p-4 text-left transition hover:bg-bg-hover";
}

export function WorkersScreen(props: WorkersScreenProps): JSX.Element {
  const workersApi = createWorkersApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });

  const [workers, setWorkers] = createSignal<readonly ProcessWorkerSummary[]>(
    [],
  );
  const [selectedWorkerId, setSelectedWorkerId] = createSignal<string | null>(
    null,
  );
  const [selectedWorkerDetail, setSelectedWorkerDetail] =
    createSignal<ProcessWorkerDetail | null>(null);
  const [loadingWorkers, setLoadingWorkers] = createSignal(false);
  const [loadingWorkerDetail, setLoadingWorkerDetail] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [cancellingWorkerId, setCancellingWorkerId] = createSignal<
    string | null
  >(null);

  let listRequestToken = 0;
  let detailRequestToken = 0;

  const effectiveProjectPath = () => {
    const trimmedProjectPath = props.projectPath.trim();
    return trimmedProjectPath.length > 0 ? trimmedProjectPath : undefined;
  };

  async function refreshWorkerDetail(
    workerId: string,
    suppressSpinner = false,
  ): Promise<void> {
    const requestToken = ++detailRequestToken;
    if (!suppressSpinner) {
      setLoadingWorkerDetail(true);
    }
    try {
      const workerDetail = await workersApi.fetchWorker(workerId);
      if (detailRequestToken !== requestToken) {
        return;
      }
      setSelectedWorkerDetail(workerDetail);
      setErrorMessage(null);
    } catch (error) {
      if (detailRequestToken !== requestToken) {
        return;
      }
      setSelectedWorkerDetail(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load worker details.",
      );
    } finally {
      if (detailRequestToken === requestToken) {
        setLoadingWorkerDetail(false);
      }
    }
  }

  async function refreshWorkers(suppressSpinner = false): Promise<void> {
    const requestToken = ++listRequestToken;
    if (!suppressSpinner) {
      setLoadingWorkers(true);
    }

    try {
      const nextWorkers = await workersApi.listWorkers(effectiveProjectPath());
      if (listRequestToken !== requestToken) {
        return;
      }

      setWorkers(nextWorkers);
      const currentSelectedWorkerId = selectedWorkerId();
      const preservedSelectedWorker = nextWorkers.find(
        (workerSummary) => workerSummary.id === currentSelectedWorkerId,
      );
      const nextSelectedWorkerId =
        preservedSelectedWorker?.id ?? nextWorkers[0]?.id ?? null;
      setSelectedWorkerId(nextSelectedWorkerId);
      setErrorMessage(null);

      if (nextSelectedWorkerId !== null) {
        const shouldRefreshDetail =
          selectedWorkerDetail()?.id !== nextSelectedWorkerId ||
          nextWorkers.some(
            (workerSummary) =>
              workerSummary.id === nextSelectedWorkerId &&
              workerSummary.updatedAt !== selectedWorkerDetail()?.updatedAt,
          );
        if (shouldRefreshDetail) {
          await refreshWorkerDetail(nextSelectedWorkerId, true);
        }
      } else {
        setSelectedWorkerDetail(null);
      }
    } catch (error) {
      if (listRequestToken !== requestToken) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load workers.",
      );
    } finally {
      if (listRequestToken === requestToken) {
        setLoadingWorkers(false);
      }
    }
  }

  async function handleCancelWorker(workerId: string): Promise<void> {
    setCancellingWorkerId(workerId);
    try {
      await workersApi.cancelWorker(workerId);
      await refreshWorkers(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to cancel worker.",
      );
    } finally {
      setCancellingWorkerId(null);
    }
  }

  createEffect(() => {
    effectiveProjectPath();
    void refreshWorkers();

    const intervalId = window.setInterval(() => {
      void refreshWorkers(true);
    }, 2000);

    onCleanup(() => {
      window.clearInterval(intervalId);
    });
  });

  const selectedWorkerSummary = () =>
    workers().find(
      (workerSummary) => workerSummary.id === selectedWorkerId(),
    ) ?? null;

  return (
    <section class="flex h-full min-h-0 flex-col gap-6 px-6 py-6">
      <ScreenHeader
        title="Workers"
        subtitle={
          effectiveProjectPath() === undefined
            ? "Inspect recent git and AI-backed worker processes across the current QraftBox session."
            : `Inspect git and AI-backed worker output for ${effectiveProjectPath()}.`
        }
      />

      <Show when={errorMessage() !== null}>
        <div
          role="alert"
          class="rounded-xl border border-danger-emphasis/30 bg-danger-subtle px-4 py-3 text-sm text-danger-fg"
        >
          {errorMessage()}
        </div>
      </Show>

      <div class="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <div class="min-h-0 overflow-auto rounded-2xl border border-border-default bg-bg-primary p-4">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold text-text-primary">
                Recent workers
              </h3>
              <p class="text-sm text-text-secondary">
                {loadingWorkers()
                  ? "Refreshing worker list..."
                  : `${workers().length} worker${workers().length === 1 ? "" : "s"}`}
              </p>
            </div>
            <button
              type="button"
              class="rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover"
              onClick={() => void refreshWorkers()}
            >
              Refresh
            </button>
          </div>

          <div class="space-y-3">
            <For each={workers()}>
              {(workerSummary) => (
                <button
                  type="button"
                  class={getWorkerListCardClass(
                    workerSummary,
                    selectedWorkerId(),
                  )}
                  onClick={() => {
                    setSelectedWorkerId(workerSummary.id);
                    void refreshWorkerDetail(workerSummary.id);
                  }}
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-text-primary">
                        {workerSummary.title}
                      </p>
                      <p class="mt-1 truncate text-xs text-text-secondary">
                        {workerSummary.commandSummary}
                      </p>
                    </div>
                    <span
                      class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getWorkerStatusBadgeClass(
                        workerSummary.status,
                      )}`}
                    >
                      {workerSummary.status}
                    </span>
                  </div>
                  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    <span>{workerSummary.source}</span>
                    <span>•</span>
                    <span>{workerSummary.phase}</span>
                    <span>•</span>
                    <span>
                      {formatWorkerTimestamp(workerSummary.updatedAt)}
                    </span>
                  </div>
                  <Show when={workerSummary.outputPreview.length > 0}>
                    <p class="mt-3 line-clamp-3 whitespace-pre-wrap text-xs text-text-secondary">
                      {workerSummary.outputPreview}
                    </p>
                  </Show>
                </button>
              )}
            </For>
            <Show when={!loadingWorkers() && workers().length === 0}>
              <div class="rounded-2xl border border-dashed border-border-default px-4 py-6 text-sm text-text-secondary">
                No worker processes have been recorded yet.
              </div>
            </Show>
          </div>
        </div>

        <div class="min-h-0 overflow-hidden rounded-2xl border border-border-default bg-bg-primary">
          <Show
            when={selectedWorkerSummary() !== null}
            fallback={
              <div class="flex h-full items-center justify-center px-6 text-sm text-text-secondary">
                Select a worker to inspect its command history and
                stdout/stderr.
              </div>
            }
          >
            <div class="flex h-full min-h-0 flex-col">
              <div class="border-b border-border-default px-5 py-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate text-lg font-semibold text-text-primary">
                      {selectedWorkerSummary()?.title}
                    </h3>
                    <p class="mt-1 text-sm text-text-secondary">
                      {selectedWorkerSummary()?.commandSummary}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span
                      class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getWorkerStatusBadgeClass(
                        selectedWorkerSummary()?.status ?? "failed",
                      )}`}
                    >
                      {selectedWorkerSummary()?.status}
                    </span>
                    <Show when={selectedWorkerSummary()?.canCancel}>
                      <button
                        type="button"
                        class="rounded-md border border-danger-emphasis/40 bg-danger-subtle px-3 py-2 text-sm font-medium text-danger-fg transition hover:bg-danger-emphasis/15 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={cancellingWorkerId() === selectedWorkerId()}
                        onClick={() => {
                          const workerId = selectedWorkerId();
                          if (workerId === null) {
                            return;
                          }
                          void handleCancelWorker(workerId);
                        }}
                      >
                        {cancellingWorkerId() === selectedWorkerId()
                          ? "Cancelling..."
                          : "Cancel"}
                      </button>
                    </Show>
                  </div>
                </div>
                <div class="mt-4 grid gap-3 sm:grid-cols-3">
                  <div class="rounded-lg border border-border-default bg-bg-secondary p-3 text-xs text-text-secondary">
                    <p class="uppercase tracking-wide text-text-tertiary">
                      Source
                    </p>
                    <p class="mt-1 text-sm text-text-primary">
                      {selectedWorkerSummary()?.source}
                    </p>
                  </div>
                  <div class="rounded-lg border border-border-default bg-bg-secondary p-3 text-xs text-text-secondary">
                    <p class="uppercase tracking-wide text-text-tertiary">
                      Project
                    </p>
                    <p class="mt-1 break-all text-sm text-text-primary">
                      {selectedWorkerSummary()?.projectPath}
                    </p>
                  </div>
                  <div class="rounded-lg border border-border-default bg-bg-secondary p-3 text-xs text-text-secondary">
                    <p class="uppercase tracking-wide text-text-tertiary">
                      Updated
                    </p>
                    <p class="mt-1 text-sm text-text-primary">
                      {selectedWorkerSummary() === null
                        ? ""
                        : formatWorkerTimestamp(
                            selectedWorkerSummary()!.updatedAt,
                          )}
                    </p>
                  </div>
                </div>
              </div>

              <div class="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
                <div class="min-h-0 overflow-auto border-b border-border-default p-4 lg:border-b-0 lg:border-r">
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <h4 class="text-sm font-semibold text-text-primary">
                      Commands
                    </h4>
                    <span class="text-xs text-text-secondary">
                      {loadingWorkerDetail() ? "Refreshing..." : ""}
                    </span>
                  </div>
                  <div class="space-y-3">
                    <For each={selectedWorkerDetail()?.commands ?? []}>
                      {(workerCommand) => (
                        <div class="rounded-xl border border-border-default bg-bg-secondary p-3">
                          <div class="flex items-center justify-between gap-3">
                            <span class="truncate text-xs font-semibold text-text-primary">
                              {workerCommand.commandText}
                            </span>
                            <span
                              class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getWorkerStatusBadgeClass(
                                workerCommand.status,
                              )}`}
                            >
                              {workerCommand.status}
                            </span>
                          </div>
                          <p class="mt-2 break-all text-[11px] text-text-secondary">
                            {workerCommand.cwd}
                          </p>
                          <p class="mt-2 text-[11px] text-text-tertiary">
                            Started{" "}
                            {formatWorkerTimestamp(workerCommand.startedAt)}
                            <Show
                              when={workerCommand.completedAt !== undefined}
                            >
                              {` • Finished ${formatWorkerTimestamp(
                                workerCommand.completedAt!,
                              )}`}
                            </Show>
                            <Show when={workerCommand.exitCode !== undefined}>
                              {` • exit ${workerCommand.exitCode}`}
                            </Show>
                          </p>
                        </div>
                      )}
                    </For>
                    <Show
                      when={
                        (selectedWorkerDetail()?.commands.length ?? 0) === 0
                      }
                    >
                      <div class="rounded-xl border border-dashed border-border-default px-4 py-6 text-sm text-text-secondary">
                        No subprocess commands have been recorded for this
                        worker yet.
                      </div>
                    </Show>
                  </div>
                </div>

                <div class="min-h-0 overflow-auto p-4">
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <h4 class="text-sm font-semibold text-text-primary">
                      stdout / stderr
                    </h4>
                    <button
                      type="button"
                      class="rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover"
                      onClick={() => {
                        const workerId = selectedWorkerId();
                        if (workerId === null) {
                          return;
                        }
                        void refreshWorkerDetail(workerId);
                      }}
                    >
                      Reload logs
                    </button>
                  </div>
                  <div class="space-y-3">
                    <For each={selectedWorkerDetail()?.logs ?? []}>
                      {(workerLog) => (
                        <article
                          class={getWorkerLogCardClass(workerLog.channel)}
                        >
                          <div class="mb-2 flex items-center justify-between gap-3">
                            <span
                              class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getWorkerLogBadgeClass(
                                workerLog.channel,
                              )}`}
                            >
                              {workerLog.channel}
                            </span>
                            <span class="text-[11px] text-text-tertiary">
                              {formatWorkerTimestamp(workerLog.timestamp)}
                            </span>
                          </div>
                          <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-text-primary">
                            {workerLog.text}
                          </pre>
                        </article>
                      )}
                    </For>
                    <Show when={loadingWorkerDetail()}>
                      <div class="rounded-xl border border-border-default bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
                        Loading worker detail...
                      </div>
                    </Show>
                    <Show
                      when={(selectedWorkerDetail()?.logs.length ?? 0) === 0}
                    >
                      <div class="rounded-xl border border-dashed border-border-default px-4 py-6 text-sm text-text-secondary">
                        No stdout or stderr has been recorded for this worker
                        yet.
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}
