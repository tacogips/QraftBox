import { For, Match, Show, Switch } from "solid-js";
import type {
  FileContent,
  FileTreeMode,
  FileTreeNode,
} from "../../../../client-shared/src/contracts/files";
import type {
  DiffOverviewState,
  DiffViewMode,
} from "../../../../client-shared/src/contracts/diff";
import { createDiffScreenPresentation } from "./presentation";
import {
  collectFileContentMetadata,
  collectVisibleFileTreeEntries,
  formatDiffStatusLabel,
  resolveDiffPathNavigation,
} from "./screen-state";

export interface DiffScreenProps {
  readonly diffOverview: DiffOverviewState;
  readonly selectedPath: string | null;
  readonly supportsDiff: boolean;
  readonly preferredViewMode: DiffViewMode;
  readonly fileTreeMode: FileTreeMode;
  readonly diffTree: FileTreeNode | null;
  readonly allFilesTree: FileTreeNode | null;
  readonly expandedPaths: ReadonlySet<string>;
  readonly isLoading: boolean;
  readonly isAllFilesLoading: boolean;
  readonly isFileContentLoading: boolean;
  readonly showIgnored: boolean;
  readonly showAllFiles: boolean;
  readonly unsupportedMessage: string | null;
  readonly errorMessage: string | null;
  readonly allFilesError: string | null;
  readonly fileContentError: string | null;
  readonly fileContent: FileContent | null;
  onChangeViewMode(mode: DiffViewMode): void;
  onSelectPath(path: string): void;
  onChangeFileTreeMode(mode: FileTreeMode): void;
  onToggleDirectory(path: string): void;
  onToggleShowIgnored(value: boolean): void;
  onToggleShowAllFiles(value: boolean): void;
  onReload(): void;
}

function resolveEmptyTreeText(
  fileTreeMode: FileTreeMode,
  showIgnored: boolean,
  showAllFiles: boolean,
): string {
  if (fileTreeMode === "diff") {
    return "No changed files are available for this workspace.";
  }

  if (showIgnored || showAllFiles) {
    return "No files match the current all-files filters.";
  }

  return "No files are available in the repository tree yet.";
}

export function DiffScreen(props: DiffScreenProps): JSX.Element {
  const presentation = () =>
    createDiffScreenPresentation(
      props.diffOverview,
      props.selectedPath,
      props.fileContent,
    );
  const activeTree = () =>
    props.fileTreeMode === "diff" ? props.diffTree : props.allFilesTree;
  const visibleTreeEntries = () =>
    collectVisibleFileTreeEntries(activeTree(), props.expandedPaths);
  const diffPathNavigation = () =>
    resolveDiffPathNavigation(props.diffOverview, props.selectedPath);
  const fileContentMetadata = () => collectFileContentMetadata(props.fileContent);

  function renderViewModeLabel(viewMode: DiffViewMode): string {
    if (viewMode === "side-by-side") {
      return "Split";
    }

    if (viewMode === "current-state") {
      return "Current";
    }

    if (viewMode === "full-file") {
      return "Full file";
    }

    return "Inline";
  }

  return (
    <section>
      <h2>{presentation().heading}</h2>
      <Switch>
        <Match when={props.errorMessage !== null}>
          <p role="alert">Failed to load diff: {props.errorMessage}</p>
        </Match>
        <Match when={props.isLoading}>
          <p>Loading diff...</p>
        </Match>
        <Match when={true}>
          <Show when={props.unsupportedMessage !== null}>
            <p>{props.unsupportedMessage}</p>
          </Show>
          <div>
            <p>{presentation().summaryText}</p>
            <p>{presentation().selectionText}</p>
          </div>

          <section>
            <h3>File tree</h3>
            <div>
              <button
                type="button"
                disabled={!props.supportsDiff || props.fileTreeMode === "diff"}
                onClick={() => props.onChangeFileTreeMode("diff")}
              >
                Changed
              </button>
              <button
                type="button"
                disabled={props.fileTreeMode === "all"}
                onClick={() => props.onChangeFileTreeMode("all")}
              >
                All files
              </button>
              <button type="button" onClick={() => props.onReload()}>
                Reload
              </button>
            </div>
            <Show when={props.fileTreeMode === "all"}>
              <label>
                <input
                  type="checkbox"
                  checked={props.showIgnored}
                  onInput={(event) =>
                    props.onToggleShowIgnored(event.currentTarget.checked)
                  }
                />{" "}
                Show ignored
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={props.showAllFiles}
                  onInput={(event) =>
                    props.onToggleShowAllFiles(event.currentTarget.checked)
                  }
                />{" "}
                Show non-Git files
              </label>
            </Show>
            <Show when={props.allFilesError !== null}>
              <p role="alert">{props.allFilesError}</p>
            </Show>
            <Show when={props.isAllFilesLoading}>
              <p>Loading file tree...</p>
            </Show>
            <Show
              when={visibleTreeEntries().length > 0}
              fallback={
                <p>
                  {resolveEmptyTreeText(
                    props.fileTreeMode,
                    props.showIgnored,
                    props.showAllFiles,
                  )}
                </p>
              }
            >
              <ul>
                <For each={visibleTreeEntries()}>
                  {(treeEntry) => {
                    const statusLabel = () =>
                      formatDiffStatusLabel(treeEntry.status);
                    return (
                      <li>
                        <div
                          style={{
                            "padding-left": `${treeEntry.depth * 16}px`,
                            display: "flex",
                            gap: "0.5rem",
                            "align-items": "center",
                          }}
                        >
                          <Show
                            when={treeEntry.isDirectory}
                            fallback={
                              <button
                                type="button"
                                disabled={props.selectedPath === treeEntry.path}
                                onClick={() => props.onSelectPath(treeEntry.path)}
                              >
                                {treeEntry.name}
                              </button>
                            }
                          >
                            <button
                              type="button"
                              onClick={() =>
                                props.onToggleDirectory(treeEntry.path)
                              }
                            >
                              {treeEntry.isExpandable
                                ? treeEntry.isExpanded
                                  ? "▾"
                                  : "▸"
                                : "•"}{" "}
                              {treeEntry.name}
                            </button>
                          </Show>
                          <Show when={statusLabel() !== null}>
                            <span>{statusLabel()}</span>
                          </Show>
                          <Show
                            when={
                              props.selectedPath === treeEntry.path &&
                              !treeEntry.isDirectory
                            }
                          >
                            <strong>selected</strong>
                          </Show>
                        </div>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </section>

          <section>
            <h3>{presentation().viewerHeading}</h3>
            <p>{presentation().selectedFileSummaryText}</p>
            <p>{presentation().modeText}</p>
            <Show when={fileContentMetadata().length > 0}>
              <p>Loaded file metadata: {fileContentMetadata().join(" | ")}</p>
            </Show>
            <div>
              <For each={presentation().availableModes}>
                {(viewMode) => (
                  <button
                    type="button"
                    disabled={props.preferredViewMode === viewMode}
                    onClick={() =>
                      props.onChangeViewMode(viewMode as DiffViewMode)
                    }
                  >
                    {renderViewModeLabel(viewMode as DiffViewMode)}
                  </button>
                )}
              </For>
            </div>
            <div>
              <button
                type="button"
                disabled={diffPathNavigation().previousPath === null}
                onClick={() => {
                  const previousPath = diffPathNavigation().previousPath;
                  if (previousPath !== null) {
                    props.onSelectPath(previousPath);
                  }
                }}
              >
                Previous change
              </button>
              <button
                type="button"
                disabled={diffPathNavigation().nextPath === null}
                onClick={() => {
                  const nextPath = diffPathNavigation().nextPath;
                  if (nextPath !== null) {
                    props.onSelectPath(nextPath);
                  }
                }}
              >
                Next change
              </button>
            </div>
            <Show when={props.fileContentError !== null}>
              <p role="alert">{props.fileContentError}</p>
            </Show>
            <Show when={props.isFileContentLoading}>
              <p>Loading file preview...</p>
            </Show>
            <Show
              when={presentation().previewLines.length > 0}
              fallback={<p>{presentation().emptyPreviewText}</p>}
            >
              <ul>
                <For each={presentation().previewLines}>
                  {(previewLine) => (
                    <li>
                      <code>{previewLine}</code>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>

          <section>
            <h3>{presentation().fileListHeading}</h3>
            <Show
              when={props.supportsDiff}
              fallback={<p>{presentation().unsupportedText}</p>}
            >
              <Show
                when={!props.diffOverview.isEmpty}
                fallback={<p>{presentation().emptyStateText}</p>}
              >
                <ul>
                  <For each={props.diffOverview.files}>
                    {(diffFile) => (
                      <li>
                        <button
                          type="button"
                          disabled={props.selectedPath === diffFile.path}
                          onClick={() => props.onSelectPath(diffFile.path)}
                        >
                          {diffFile.path}
                        </button>{" "}
                        <span>{diffFile.status}</span>{" "}
                        <span>
                          +{diffFile.additions} / -{diffFile.deletions}
                        </span>
                        <Show when={diffFile.oldPath !== undefined}>
                          <span>{` from ${diffFile.oldPath}`}</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </section>
        </Match>
      </Switch>
    </section>
  );
}
