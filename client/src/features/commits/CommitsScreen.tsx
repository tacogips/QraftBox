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
import {
  collectCommitDiffPreviewLines,
  formatCommitRelativeDate,
  formatCommitStatusLabel,
  getCommitHeadline,
  getCommitListSummary,
} from "./presentation";
import { applyCommitSearchDraft, buildAppliedCommitSearchQuery } from "./state";

export interface CommitsScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly isGitRepo: boolean;
}

const COMMIT_PAGE_SIZE = 50;

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
    <section class="flex min-h-0 flex-1 flex-col gap-4">
      <header class="grid gap-3 md:grid-cols-3">
        <div class="rounded-2xl border border-border-default bg-bg-secondary p-5 shadow-lg shadow-black/15 md:col-span-2">
          <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-fg">
            Commits
          </p>
          <h2 class="mt-2 text-2xl font-semibold text-text-primary">
            Commit History
          </h2>
          <p class="mt-2 text-sm leading-6 text-text-secondary">
            Browse recent history, inspect a commit’s changed files, and expand
            per-file previews from a card-based log instead of the migration
            placeholder list.
          </p>
        </div>
        <div class="rounded-2xl border border-border-default bg-bg-secondary p-5">
          <p class="text-xs uppercase tracking-[0.22em] text-text-tertiary">
            Summary
          </p>
          <p class="mt-3 text-lg font-semibold text-text-primary">
            {getCommitListSummary(commits(), hasMore())}
          </p>
          <p class="mt-2 text-sm text-text-secondary">
            {props.isGitRepo
              ? "Search and expand commits without leaving the workspace."
              : "Commit history is unavailable for non-Git workspaces."}
          </p>
        </div>
      </header>

      <Show
        when={props.isGitRepo}
        fallback={
          <div class="flex min-h-[420px] items-center justify-center rounded-2xl border border-border-default bg-bg-secondary px-6 text-center text-sm text-text-secondary">
            The active workspace is not a Git repository, so commit history is
            unavailable.
          </div>
        }
      >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-secondary">
          <div class="border-b border-border-default p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div class="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1">
                  {commits().length} loaded
                </span>
                <Show when={hasMore()}>
                  <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1">
                    more available
                  </span>
                </Show>
              </div>

              <div class="flex flex-col gap-3 sm:flex-row">
                <input
                  value={searchDraftQuery()}
                  class="min-w-[240px] rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-emphasis"
                  placeholder="Search commits..."
                  onInput={(event) =>
                    setSearchDraftQuery(event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSearch();
                    }
                  }}
                />
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="rounded-md bg-accent-emphasis px-4 py-2 text-sm font-semibold text-text-on-emphasis transition hover:bg-accent-fg"
                    onClick={() => void handleSearch()}
                  >
                    Search
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover"
                    onClick={() => void loadCommits(false)}
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <Show when={isLoading()}>
              <div class="flex min-h-[240px] items-center justify-center text-sm text-text-secondary">
                Loading commits...
              </div>
            </Show>

            <Show when={errorMessage() !== null}>
              <div class="mb-4 rounded-xl border border-danger-emphasis/30 bg-danger-muted/10 p-4 text-sm text-danger-fg">
                {errorMessage()}
              </div>
            </Show>

            <Show
              when={
                !isLoading() &&
                errorMessage() === null &&
                commits().length === 0
              }
            >
              <div class="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border-default bg-bg-primary/40 px-6 py-10 text-center text-sm text-text-secondary">
                {appliedSearchQuery().trim().length > 0
                  ? "No commits match the current search."
                  : "No commits found for this repository."}
              </div>
            </Show>

            <div class="space-y-3">
              <For each={commits()}>
                {(commit) => {
                  const isExpanded = () => expandedHash() === commit.hash;
                  return (
                    <article class="overflow-hidden rounded-xl border border-border-default bg-bg-primary">
                      <button
                        type="button"
                        class="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-bg-hover"
                        onClick={() => void toggleCommit(commit.hash)}
                      >
                        <span class="shrink-0 text-text-tertiary">
                          {isExpanded() ? "▾" : "▸"}
                        </span>
                        <span class="rounded bg-bg-tertiary px-2 py-1 font-mono text-[10px] font-bold text-accent-fg">
                          {commit.shortHash}
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium text-text-primary">
                            {getCommitHeadline(commit.message)}
                          </p>
                          <div class="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                            <span>{commit.author.name}</span>
                            <span>{formatCommitRelativeDate(commit.date)}</span>
                          </div>
                        </div>
                      </button>

                      <Show when={isExpanded()}>
                        <div class="border-t border-border-default bg-bg-secondary p-4">
                          <Show when={isDetailLoading()}>
                            <div class="rounded-xl border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-secondary">
                              Loading commit detail...
                            </div>
                          </Show>
                          <Show when={detailError() !== null}>
                            <div class="rounded-xl border border-danger-emphasis/30 bg-danger-muted/10 px-4 py-3 text-sm text-danger-fg">
                              {detailError()}
                            </div>
                          </Show>
                          <Show
                            when={
                              !isDetailLoading() &&
                              detailError() === null &&
                              commitDetail() !== null
                            }
                          >
                            <div class="space-y-4">
                              <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                                <div class="rounded-xl border border-border-default bg-bg-primary p-4">
                                  <p class="text-xs uppercase tracking-wide text-text-tertiary">
                                    Commit message
                                  </p>
                                  <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                                    {commitDetail()!.message}
                                  </p>
                                  <Show
                                    when={
                                      commitDetail()!.body.trim().length > 0
                                    }
                                  >
                                    <pre class="mt-4 whitespace-pre-wrap rounded-lg border border-border-default bg-bg-secondary p-3 text-xs leading-6 text-text-secondary">
                                      {commitDetail()!.body}
                                    </pre>
                                  </Show>
                                </div>
                                <div class="space-y-3">
                                  <div class="rounded-xl border border-border-default bg-bg-primary p-4">
                                    <p class="text-xs uppercase tracking-wide text-text-tertiary">
                                      Full hash
                                    </p>
                                    <p class="mt-2 break-all font-mono text-xs text-text-primary">
                                      {commitDetail()!.hash}
                                    </p>
                                  </div>
                                  <div class="rounded-xl border border-border-default bg-bg-primary p-4">
                                    <p class="text-xs uppercase tracking-wide text-text-tertiary">
                                      Stats
                                    </p>
                                    <div class="mt-3 flex flex-wrap gap-2 text-xs">
                                      <span class="rounded-full border border-border-default bg-bg-secondary px-2 py-1 text-text-secondary">
                                        {commitDetail()!.stats.filesChanged}{" "}
                                        files
                                      </span>
                                      <span class="rounded-full border border-success-emphasis/30 bg-success-muted/15 px-2 py-1 text-success-fg">
                                        +{commitDetail()!.stats.additions}
                                      </span>
                                      <span class="rounded-full border border-danger-emphasis/30 bg-danger-muted/15 px-2 py-1 text-danger-fg">
                                        -{commitDetail()!.stats.deletions}
                                      </span>
                                    </div>
                                  </div>
                                </div>
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
                                      const statusLabel =
                                        formatCommitStatusLabel(file.status);
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
                                              <Show
                                                when={
                                                  file.oldPath !== undefined
                                                }
                                              >
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
                                            when={
                                              expandedFilePath() === file.path
                                            }
                                          >
                                            <div class="border-t border-border-default bg-bg-secondary p-4">
                                              <Show when={isFileDiffLoading()}>
                                                <div class="rounded-lg border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-secondary">
                                                  Loading diff preview...
                                                </div>
                                              </Show>
                                              <Show
                                                when={fileDiffError() !== null}
                                              >
                                                <div class="rounded-lg border border-danger-emphasis/30 bg-danger-muted/10 px-4 py-3 text-sm text-danger-fg">
                                                  {fileDiffError()}
                                                </div>
                                              </Show>
                                              <Show
                                                when={
                                                  !isFileDiffLoading() &&
                                                  fileDiffError() === null &&
                                                  fileDiffPreviewLines()
                                                    .length > 0
                                                }
                                                fallback={
                                                  <div class="rounded-lg border border-dashed border-border-default bg-bg-primary/40 px-4 py-6 text-sm text-text-secondary">
                                                    No diff preview is available
                                                    for this file.
                                                  </div>
                                                }
                                              >
                                                <pre class="overflow-x-auto rounded-lg border border-border-default bg-[#020817] px-4 py-4 font-mono text-[12px] leading-6 text-slate-100">
                                                  {fileDiffPreviewLines().join(
                                                    "\n",
                                                  )}
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
                      </Show>
                    </article>
                  );
                }}
              </For>
            </div>

            <Show when={hasMore()}>
              <div class="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={isLoadingMore()}
                  class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void loadCommits(true)}
                >
                  {isLoadingMore() ? "Loading..." : "Load more"}
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </section>
  );
}
