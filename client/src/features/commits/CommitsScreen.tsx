import { createEffect, createSignal, For, Show, untrack } from "solid-js";
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
import {
  applyCommitSearchDraft,
  buildAppliedCommitSearchQuery,
} from "./state";

export interface CommitsScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly isGitRepo: boolean;
}

const COMMIT_PAGE_SIZE = 50;

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
    <section>
      <h2>Commits</h2>
      <p>Browse recent commit history and inspect per-commit file changes.</p>
      <Show
        when={props.isGitRepo}
        fallback={
          <p>
            The active workspace is not a Git repository, so commit history is
            unavailable.
          </p>
        }
      >
        <div>
          <p>{getCommitListSummary(commits(), hasMore())}</p>
          <label>
            Search commits
            <input
              value={searchDraftQuery()}
              onInput={(event) =>
                setSearchDraftQuery(event.currentTarget.value)
              }
            />
          </label>
          <button type="button" onClick={() => void handleSearch()}>
            Search
          </button>
          <button type="button" onClick={() => void loadCommits(false)}>
            Refresh
          </button>
        </div>

        <Show when={isLoading()}>
          <p>Loading commits...</p>
        </Show>
        <Show when={errorMessage() !== null}>
          <p role="alert">{errorMessage()}</p>
        </Show>
        <Show
          when={
            !isLoading() && errorMessage() === null && commits().length === 0
          }
        >
          <p>
            {appliedSearchQuery().trim().length > 0
              ? "No commits match the current search."
              : "No commits found for this repository."}
          </p>
        </Show>

        <Show when={commits().length > 0}>
          <ul>
            <For each={commits()}>
              {(commit) => (
                <li>
                  <button
                    type="button"
                    onClick={() => void toggleCommit(commit.hash)}
                  >
                    <strong>{commit.shortHash}</strong>{" "}
                    {getCommitHeadline(commit.message)} | {commit.author.name} |{" "}
                    {formatCommitRelativeDate(commit.date)}
                  </button>

                  <Show when={expandedHash() === commit.hash}>
                    <section>
                      <Show when={isDetailLoading()}>
                        <p>Loading commit detail...</p>
                      </Show>
                      <Show when={detailError() !== null}>
                        <p role="alert">{detailError()}</p>
                      </Show>
                      <Show
                        when={
                          !isDetailLoading() &&
                          detailError() === null &&
                          commitDetail() !== null
                        }
                      >
                        <p>{commitDetail()!.hash}</p>
                        <p>{commitDetail()!.message}</p>
                        <Show when={commitDetail()!.body.trim().length > 0}>
                          <pre>{commitDetail()!.body}</pre>
                        </Show>
                        <p>
                          Files changed {commitDetail()!.stats.filesChanged} | +
                          {commitDetail()!.stats.additions} | -
                          {commitDetail()!.stats.deletions}
                        </p>
                        <Show
                          when={commitDetail()!.files.length > 0}
                          fallback={<p>No changed files are recorded.</p>}
                        >
                          <ul>
                            <For each={commitDetail()!.files}>
                              {(file) => (
                                <li>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void toggleFileDiff(file.path)
                                    }
                                  >
                                    {formatCommitStatusLabel(file.status)}{" "}
                                    {file.path} | +{file.additions} | -
                                    {file.deletions}
                                    <Show when={file.oldPath !== undefined}>
                                      <span>{` from ${file.oldPath}`}</span>
                                    </Show>
                                  </button>
                                  <Show when={expandedFilePath() === file.path}>
                                    <Show when={isFileDiffLoading()}>
                                      <p>Loading diff preview...</p>
                                    </Show>
                                    <Show when={fileDiffError() !== null}>
                                      <p role="alert">{fileDiffError()}</p>
                                    </Show>
                                    <Show
                                      when={
                                        !isFileDiffLoading() &&
                                        fileDiffError() === null &&
                                        fileDiffPreviewLines().length > 0
                                      }
                                      fallback={
                                        <p>
                                          No diff preview is available for this
                                          file.
                                        </p>
                                      }
                                    >
                                      <ul>
                                        <For each={fileDiffPreviewLines()}>
                                          {(line) => (
                                            <li>
                                              <code>{line}</code>
                                            </li>
                                          )}
                                        </For>
                                      </ul>
                                    </Show>
                                  </Show>
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      </Show>
                    </section>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={hasMore()}>
            <button
              type="button"
              disabled={isLoadingMore()}
              onClick={() => void loadCommits(true)}
            >
              {isLoadingMore() ? "Loading..." : "Load more"}
            </button>
          </Show>
        </Show>
      </Show>
    </section>
  );
}
