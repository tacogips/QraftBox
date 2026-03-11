import {
  createEffect,
  createSignal,
  For,
  type JSX,
  Show,
  untrack,
} from "solid-js";
import { createCommitApiClient } from "../../../../client-shared/src/api/commits";
import type { DiffFile } from "../../../../client-shared/src/contracts/diff";
import type { CommitDetail, CommitInfo } from "../../../../src/types/commit";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SummaryCard } from "../../components/SummaryCard";
import { ToolbarIconButton } from "../../components/ToolbarIconButton";
import {
  collectCommitDiffPreviewLines,
  formatCommitAbsoluteDate,
  formatCommitRelativeDate,
  formatCommitStatusLabel,
  getCommitHeadline,
  getCommitListSummary,
  getCommitPreviewText,
} from "./presentation";
import { applyCommitSearchDraft, buildAppliedCommitSearchQuery } from "./state";

export interface CommitsScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly isGitRepo: boolean;
}

const COMMIT_PAGE_SIZE = 50;

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

function getCommitFileStatusClass(status: string): string {
  if (status === "Added") {
    return "border border-success-emphasis/30 bg-success-muted/15 text-success-fg";
  }

  if (status === "Deleted") {
    return "border border-danger-emphasis/30 bg-danger-muted/15 text-danger-fg";
  }

  if (status === "Modified") {
    return "border border-attention-emphasis/30 bg-attention-muted/15 text-attention-fg";
  }

  return "border border-accent-emphasis/30 bg-accent-muted/15 text-accent-fg";
}

export function CommitsScreen(props: CommitsScreenProps): JSX.Element {
  const commitApi = createCommitApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });

  const [commits, setCommits] = createSignal<readonly CommitInfo[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [hasMore, setHasMore] = createSignal(false);
  const [offset, setOffset] = createSignal(0);
  const [searchDraftQuery, setSearchDraftQuery] = createSignal("");
  const [appliedSearchQuery, setAppliedSearchQuery] = createSignal("");

  const [expandedHash, setExpandedHash] = createSignal<string | null>(null);
  const [commitDetail, setCommitDetail] = createSignal<CommitDetail | null>(
    null,
  );
  const [isDetailLoading, setIsDetailLoading] = createSignal(false);
  const [detailError, setDetailError] = createSignal<string | null>(null);

  const [expandedFilePath, setExpandedFilePath] = createSignal<string | null>(
    null,
  );
  const [fileDiffPreviewLines, setFileDiffPreviewLines] = createSignal<
    readonly string[]
  >([]);
  const [isFileDiffLoading, setIsFileDiffLoading] = createSignal(false);
  const [fileDiffError, setFileDiffError] = createSignal<string | null>(null);

  let activeContextId: string | null = null;
  let diffCache = new Map<string, readonly DiffFile[]>();
  let lastDetailRequestId = 0;
  let lastDiffRequestId = 0;

  const selectedCommit = (): CommitInfo | null => {
    const selectedHash = expandedHash();
    if (selectedHash === null) {
      return null;
    }

    return (
      commits().find((commitEntry) => commitEntry.hash === selectedHash) ?? null
    );
  };

  async function loadCommits(append: boolean): Promise<void> {
    const contextId = props.contextId;
    if (contextId === null || !props.isGitRepo) {
      setCommits([]);
      setHasMore(false);
      setOffset(0);
      return;
    }

    activeContextId = contextId;
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const response = await commitApi.fetchCommitLog(contextId, {
        limit: COMMIT_PAGE_SIZE,
        offset: append ? offset() : 0,
        search: untrack(() =>
          buildAppliedCommitSearchQuery(appliedSearchQuery()),
        ),
      });
      if (activeContextId !== contextId) {
        return;
      }

      setCommits((currentCommits) =>
        append ? [...currentCommits, ...response.commits] : response.commits,
      );
      setHasMore(response.pagination.hasMore);
      setOffset(response.pagination.offset + response.pagination.limit);
    } catch (error) {
      if (activeContextId !== contextId) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load commits",
      );
    } finally {
      if (activeContextId === contextId) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }

  function resetExpandedState(): void {
    setExpandedHash(null);
    setCommitDetail(null);
    setDetailError(null);
    setIsDetailLoading(false);
    setExpandedFilePath(null);
    setFileDiffPreviewLines([]);
    setFileDiffError(null);
    setIsFileDiffLoading(false);
  }

  function dismissCommitDetail(): void {
    resetExpandedState();
  }

  createEffect(() => {
    const contextId = props.contextId;
    const isGitRepo = props.isGitRepo;

    activeContextId = contextId;
    diffCache = new Map();
    lastDetailRequestId += 1;
    lastDiffRequestId += 1;
    setCommits([]);
    setHasMore(false);
    setOffset(0);
    resetExpandedState();

    if (contextId === null || !isGitRepo) {
      setIsLoading(false);
      setIsLoadingMore(false);
      setErrorMessage(null);
      return;
    }

    void loadCommits(false);
  });

  async function handleSearch(): Promise<void> {
    setAppliedSearchQuery(applyCommitSearchDraft(searchDraftQuery()));
    setOffset(0);
    resetExpandedState();
    await loadCommits(false);
  }

  async function clearSearch(): Promise<void> {
    setSearchDraftQuery("");
    setAppliedSearchQuery("");
    setOffset(0);
    resetExpandedState();
    await loadCommits(false);
  }

  async function toggleCommit(hash: string): Promise<void> {
    if (props.contextId === null) {
      return;
    }

    if (expandedHash() === hash) {
      resetExpandedState();
      return;
    }

    setExpandedHash(hash);
    setCommitDetail(null);
    setDetailError(null);
    setExpandedFilePath(null);
    setFileDiffPreviewLines([]);
    setFileDiffError(null);
    setIsDetailLoading(true);
    const requestId = lastDetailRequestId + 1;
    lastDetailRequestId = requestId;
    const contextId = props.contextId;

    try {
      const detail = await commitApi.fetchCommitDetail(contextId, hash);
      if (
        requestId !== lastDetailRequestId ||
        props.contextId !== contextId ||
        expandedHash() !== hash
      ) {
        return;
      }
      setCommitDetail(detail);
    } catch (error) {
      if (requestId !== lastDetailRequestId || props.contextId !== contextId) {
        return;
      }
      setDetailError(
        error instanceof Error ? error.message : "Failed to load commit detail",
      );
    } finally {
      if (requestId === lastDetailRequestId && props.contextId === contextId) {
        setIsDetailLoading(false);
      }
    }
  }

  async function toggleFileDiff(filePath: string): Promise<void> {
    if (props.contextId === null) {
      return;
    }

    if (expandedFilePath() === filePath) {
      setExpandedFilePath(null);
      setFileDiffPreviewLines([]);
      setFileDiffError(null);
      return;
    }

    setExpandedFilePath(filePath);
    setFileDiffPreviewLines([]);
    setFileDiffError(null);

    const currentHash = expandedHash();
    if (currentHash === null) {
      return;
    }

    const cachedDiffFiles = diffCache.get(currentHash);
    if (cachedDiffFiles !== undefined) {
      setFileDiffPreviewLines(
        collectCommitDiffPreviewLines(
          cachedDiffFiles.filter((diffFile) => diffFile.path === filePath),
        ),
      );
      return;
    }

    setIsFileDiffLoading(true);
    const requestId = lastDiffRequestId + 1;
    lastDiffRequestId = requestId;
    const contextId = props.contextId;
    try {
      const diffFiles = await commitApi.fetchCommitDiff(contextId, currentHash);
      if (
        requestId !== lastDiffRequestId ||
        props.contextId !== contextId ||
        expandedHash() !== currentHash ||
        expandedFilePath() !== filePath
      ) {
        return;
      }
      diffCache.set(currentHash, diffFiles);
      setFileDiffPreviewLines(
        collectCommitDiffPreviewLines(
          diffFiles.filter((diffFile) => diffFile.path === filePath),
        ),
      );
    } catch (error) {
      if (requestId !== lastDiffRequestId || props.contextId !== contextId) {
        return;
      }
      setFileDiffError(
        error instanceof Error ? error.message : "Failed to load file diff",
      );
    } finally {
      if (requestId === lastDiffRequestId && props.contextId === contextId) {
        setIsFileDiffLoading(false);
      }
    }
  }

  return (
    <section class="mx-auto flex h-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ScreenHeader title="Commits" />

      <Show
        when={props.isGitRepo}
        fallback={
          <div class="flex flex-1 items-center justify-center">
            <div class="flex max-w-xl flex-col gap-4 rounded-2xl border border-border-default bg-bg-secondary p-6 shadow-lg shadow-black/20">
              <div class="flex flex-col gap-2">
                <p class="text-sm font-medium text-accent-fg">
                  Git repository required
                </p>
                <h3 class="text-2xl font-semibold text-text-primary">
                  Open a Git workspace before browsing commits
                </h3>
                <p class="text-sm leading-6 text-text-secondary">
                  Commit history is only available when the active workspace is
                  backed by Git.
                </p>
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
              void handleSearch();
            }}
          >
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <input
                value={searchDraftQuery()}
                class="min-w-0 flex-1 rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-emphasis"
                placeholder="Search commit message, author, or hash"
                onInput={(event) =>
                  setSearchDraftQuery(event.currentTarget.value)
                }
              />
              <ToolbarIconButton
                type="submit"
                label={isLoading() ? "Searching commits" : "Search commits"}
                disabled={isLoading()}
              >
                {renderSearchIcon()}
              </ToolbarIconButton>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span class="rounded-full border border-border-default bg-bg-secondary px-3 py-2">
                {getCommitListSummary(commits(), hasMore())}
              </span>
              <ToolbarIconButton
                label="Clear commit search"
                disabled={isLoading()}
                onClick={() => void clearSearch()}
              >
                {renderClearIcon()}
              </ToolbarIconButton>
              <ToolbarIconButton
                label={isLoading() ? "Refreshing commits" : "Refresh commits"}
                disabled={isLoading()}
                onClick={() => void loadCommits(false)}
              >
                {renderRefreshIcon()}
              </ToolbarIconButton>
            </div>
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
            <Show when={isLoading() && commits().length === 0}>
              <div class="flex flex-col items-center justify-center gap-3 py-16 text-text-tertiary">
                <div class="flex items-center gap-2">
                  <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis" />
                  <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis [animation-delay:120ms]" />
                  <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis [animation-delay:240ms]" />
                </div>
                <p class="text-xs">
                  {appliedSearchQuery().trim().length > 0
                    ? "Searching commits..."
                    : "Loading commits..."}
                </p>
              </div>
            </Show>

            <Show when={!(isLoading() && commits().length === 0)}>
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                <For each={commits()}>
                  {(commit) => (
                    <SummaryCard
                      selected={expandedHash() === commit.hash}
                      ariaLabel={`Open commit ${commit.shortHash}`}
                      onActivate={() => void toggleCommit(commit.hash)}
                      topSlot={
                        <div class="flex items-start justify-between gap-3">
                          <div class="flex flex-wrap items-center gap-2">
                            <span class="rounded bg-bg-tertiary px-2 py-1 font-mono text-[10px] font-bold text-accent-fg">
                              {commit.shortHash}
                            </span>
                            <Show when={commit.parentHashes.length > 1}>
                              <span class="rounded bg-attention-emphasis/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-attention-fg">
                                Merge
                              </span>
                            </Show>
                          </div>
                          <span class="text-[11px] text-text-tertiary">
                            {formatCommitRelativeDate(commit.date)}
                          </span>
                        </div>
                      }
                      titleLabel="Message"
                      title={getCommitHeadline(commit.message)}
                      bodyLabel="Latest activity"
                      body={getCommitPreviewText(commit)}
                      footerSlot={
                        <>
                          <span>{commit.author.name}</span>
                          <span>{commit.author.email}</span>
                        </>
                      }
                    />
                  )}
                </For>
              </div>
            </Show>

            <Show
              when={
                !isLoading() &&
                errorMessage() === null &&
                commits().length === 0
              }
            >
              <div class="py-12 text-center text-sm text-text-secondary">
                {appliedSearchQuery().trim().length > 0
                  ? "No commits matched your search."
                  : "No commits found for this repository."}
              </div>
            </Show>

            <Show when={hasMore()}>
              <div class="flex justify-center pt-4">
                <button
                  type="button"
                  disabled={isLoadingMore() || isLoading()}
                  class="rounded-md border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void loadCommits(true)}
                >
                  {isLoadingMore()
                    ? "Loading more..."
                    : `Load ${COMMIT_PAGE_SIZE} more`}
                </button>
              </div>
            </Show>
          </div>

          <Show when={expandedHash() !== null}>
            <div class="absolute inset-0 z-40 flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div class="flex h-[min(88vh,920px)] w-full max-w-7xl overflow-hidden rounded-2xl border border-border-default bg-bg-secondary shadow-2xl shadow-black/40">
                <div class="flex min-w-0 flex-1 flex-col border-r border-border-default">
                  <div class="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="rounded bg-bg-tertiary px-2 py-1 font-mono text-[10px] font-bold text-accent-fg">
                          {selectedCommit()?.shortHash}
                        </span>
                        <Show
                          when={
                            (selectedCommit()?.parentHashes.length ?? 0) > 1
                          }
                        >
                          <span class="rounded bg-attention-emphasis/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-attention-fg">
                            Merge
                          </span>
                        </Show>
                      </div>
                      <h3 class="mt-2 truncate text-lg font-semibold text-text-primary">
                        {getCommitHeadline(selectedCommit()?.message ?? "")}
                      </h3>
                      <p class="mt-1 text-xs text-text-secondary">
                        {selectedCommit()?.author.name} •{" "}
                        {formatCommitRelativeDate(selectedCommit()?.date ?? 0)}
                      </p>
                    </div>
                    <button
                      type="button"
                      class="rounded-md border border-danger-emphasis bg-danger-emphasis p-2 text-danger-fg shadow-sm shadow-danger-emphasis/20 transition hover:border-danger-fg hover:bg-danger-fg hover:text-text-on-emphasis"
                      aria-label="Close"
                      title="Close"
                      onClick={dismissCommitDetail}
                    >
                      <span class="block h-5 w-5">{renderCloseIcon()}</span>
                    </button>
                  </div>

                  <div class="min-h-0 flex-1 overflow-auto px-4 py-4">
                    <Show when={isDetailLoading()}>
                      <p class="text-sm text-text-secondary">
                        Loading selected commit...
                      </p>
                    </Show>
                    <Show when={detailError() !== null}>
                      <p
                        role="alert"
                        class="rounded-md border border-danger-emphasis/40 bg-danger-subtle px-3 py-2 text-sm text-danger-fg"
                      >
                        {detailError()}
                      </p>
                    </Show>
                    <Show
                      when={
                        !isDetailLoading() &&
                        detailError() === null &&
                        commitDetail() !== null
                      }
                    >
                      <div class="space-y-4">
                        <div class="rounded-xl border border-border-default bg-bg-primary p-4">
                          <p class="text-xs uppercase tracking-wide text-text-tertiary">
                            Commit message
                          </p>
                          <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                            {commitDetail()!.message}
                          </p>
                          <Show when={commitDetail()!.body.trim().length > 0}>
                            <pre class="mt-4 whitespace-pre-wrap rounded-lg border border-border-default bg-bg-secondary p-3 text-xs leading-6 text-text-secondary">
                              {commitDetail()!.body}
                            </pre>
                          </Show>
                        </div>

                        <Show
                          when={commitDetail()!.files.length > 0}
                          fallback={
                            <div class="rounded-xl border border-dashed border-border-default bg-bg-primary/40 px-4 py-6 text-sm text-text-secondary">
                              No changed files are recorded.
                            </div>
                          }
                        >
                          <div class="space-y-3">
                            <For each={commitDetail()!.files}>
                              {(file) => {
                                const statusLabel = formatCommitStatusLabel(
                                  file.status,
                                );
                                return (
                                  <article class="overflow-hidden rounded-xl border border-border-default bg-bg-primary">
                                    <button
                                      type="button"
                                      class="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-bg-hover"
                                      onClick={() =>
                                        void toggleFileDiff(file.path)
                                      }
                                    >
                                      <span class="shrink-0 text-text-tertiary">
                                        {expandedFilePath() === file.path
                                          ? "▾"
                                          : "▸"}
                                      </span>
                                      <div class="min-w-0 flex-1">
                                        <div class="flex flex-wrap items-center gap-2">
                                          <p class="truncate text-sm font-medium text-text-primary">
                                            {file.path}
                                          </p>
                                          <span
                                            class={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getCommitFileStatusClass(
                                              statusLabel,
                                            )}`}
                                          >
                                            {statusLabel}
                                          </span>
                                        </div>
                                        <Show when={file.oldPath !== undefined}>
                                          <p class="mt-1 text-xs text-text-secondary">
                                            from {file.oldPath}
                                          </p>
                                        </Show>
                                        <div class="mt-2 flex gap-2 text-xs">
                                          <span class="rounded-full border border-success-emphasis/30 bg-success-muted/15 px-2 py-1 text-success-fg">
                                            +{file.additions}
                                          </span>
                                          <span class="rounded-full border border-danger-emphasis/30 bg-danger-muted/15 px-2 py-1 text-danger-fg">
                                            -{file.deletions}
                                          </span>
                                        </div>
                                      </div>
                                    </button>

                                    <Show
                                      when={expandedFilePath() === file.path}
                                    >
                                      <div class="border-t border-border-default bg-bg-secondary p-4">
                                        <Show when={isFileDiffLoading()}>
                                          <div class="rounded-lg border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-secondary">
                                            Loading diff preview...
                                          </div>
                                        </Show>
                                        <Show when={fileDiffError() !== null}>
                                          <div class="rounded-lg border border-danger-emphasis/30 bg-danger-muted/10 px-4 py-3 text-sm text-danger-fg">
                                            {fileDiffError()}
                                          </div>
                                        </Show>
                                        <Show
                                          when={
                                            !isFileDiffLoading() &&
                                            fileDiffError() === null &&
                                            fileDiffPreviewLines().length > 0
                                          }
                                          fallback={
                                            <div class="rounded-lg border border-dashed border-border-default bg-bg-primary/40 px-4 py-6 text-sm text-text-secondary">
                                              No diff preview is available for
                                              this file.
                                            </div>
                                          }
                                        >
                                          <pre class="overflow-x-auto rounded-lg border border-border-default bg-[#020817] px-4 py-4 font-mono text-[12px] leading-6 text-slate-100">
                                            {fileDiffPreviewLines().join("\n")}
                                          </pre>
                                        </Show>
                                      </div>
                                    </Show>
                                  </article>
                                );
                              }}
                            </For>
                          </div>
                        </Show>
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
                      {selectedCommit()?.author.name}
                    </p>
                    <p class="mt-1 text-xs text-text-secondary">
                      {selectedCommit()?.author.email}
                    </p>
                  </div>

                  <div class="flex flex-1 flex-col gap-3 overflow-auto px-4 py-4">
                    <div class="rounded-lg border border-border-default bg-bg-secondary p-3 text-xs text-text-secondary">
                      <p class="uppercase tracking-wide text-text-tertiary">
                        Full hash
                      </p>
                      <p class="mt-1 break-all font-mono text-sm text-text-primary">
                        {commitDetail()?.hash ?? selectedCommit()?.hash}
                      </p>
                    </div>
                    <div class="rounded-lg border border-border-default bg-bg-secondary p-3 text-xs text-text-secondary">
                      <p class="uppercase tracking-wide text-text-tertiary">
                        Authored
                      </p>
                      <p class="mt-1 text-sm text-text-primary">
                        {formatCommitAbsoluteDate(selectedCommit()?.date ?? 0)}
                      </p>
                    </div>
                    <Show when={commitDetail() !== null}>
                      <div class="rounded-lg border border-border-default bg-bg-secondary p-3 text-xs text-text-secondary">
                        <p class="uppercase tracking-wide text-text-tertiary">
                          Stats
                        </p>
                        <div class="mt-3 flex flex-wrap gap-2 text-xs">
                          <span class="rounded-full border border-border-default bg-bg-primary px-2 py-1 text-text-secondary">
                            {commitDetail()!.stats.filesChanged} files
                          </span>
                          <span class="rounded-full border border-success-emphasis/30 bg-success-muted/15 px-2 py-1 text-success-fg">
                            +{commitDetail()!.stats.additions}
                          </span>
                          <span class="rounded-full border border-danger-emphasis/30 bg-danger-muted/15 px-2 py-1 text-danger-fg">
                            -{commitDetail()!.stats.deletions}
                          </span>
                        </div>
                      </div>
                    </Show>
                    <div class="rounded-lg border border-border-default bg-bg-secondary p-3 text-xs text-text-secondary">
                      <p class="uppercase tracking-wide text-text-tertiary">
                        Search filter
                      </p>
                      <p class="mt-1 text-sm text-text-primary">
                        {appliedSearchQuery().trim().length > 0
                          ? appliedSearchQuery()
                          : "All commits"}
                      </p>
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
