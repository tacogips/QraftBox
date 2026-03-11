import {
  createEffect,
  onCleanup,
  createSignal,
  For,
  type JSX,
  Match,
  Show,
  Switch,
} from "solid-js";
import { createAiCommentsApiClient } from "../../../../client-shared/src/api/ai-comments";
import { createAiSessionsApiClient } from "../../../../client-shared/src/api/ai-sessions";
import {
  transformToCurrentState,
  type CurrentStateLine,
} from "../../../../client-shared/src/contracts/current-state";
import { CheckboxField } from "../../components/CheckboxField";
import type {
  DiffChange,
  DiffFile,
  DiffOverviewState,
  DiffViewMode,
} from "../../../../client-shared/src/contracts/diff";
import type {
  FileContent,
  FileTreeMode,
  FileTreeNode,
} from "../../../../client-shared/src/contracts/files";
import {
  collectFileContentMetadata,
  collectVisibleFileTreeEntries,
  formatDiffStatusLabel,
  resolveDiffPathNavigation,
} from "./screen-state";
import {
  highlightFullFileContent,
  type HighlightToken,
} from "./syntax-highlighting";
import {
  collectFullFileLineRangeNumbers,
  createFullFileCommentPlaceholder,
  createFullFilePromptContext,
  type FullFileLineRange,
  resolveFullFileLineRange,
} from "./full-file-ai";
import {
  shouldShowAllFilesFilters,
  shouldShowDiffDirectoryControls,
  shouldShowFileTreeModeControls,
} from "./file-tree-visibility";
import { generateQraftAiSessionId } from "../../../../src/types/ai";

export interface DiffScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly projectPath: string;
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
  readonly selectedLineNumber: number | null;
  onChangeViewMode(mode: DiffViewMode): void;
  onSelectPath(path: string): void;
  onSelectLine(lineNumber: number | null): void;
  onChangeFileTreeMode(mode: FileTreeMode): void;
  onToggleDirectory(path: string): void;
  onExpandAllDirectories(): void;
  onCollapseAllDirectories(): void;
  onToggleShowIgnored(value: boolean): void;
  onToggleShowAllFiles(value: boolean): void;
  onReload(): void;
  onOpenAiSession(sessionId: string): void;
}

interface SideBySideChangeRow {
  readonly kind: "change";
  readonly left: DiffChange | null;
  readonly right: DiffChange | null;
}

type SideBySideRow =
  | {
      readonly kind: "hunk";
      readonly header: string;
    }
  | SideBySideChangeRow;

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

function renderTreeModeIcon(mode: FileTreeMode): JSX.Element {
  if (mode === "diff") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M2 1.75C2 .784 2.784 0 3.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H3.75zM8 7.25a.75.75 0 01.75.75v1.25H10a.75.75 0 010 1.5H8.75V12a.75.75 0 01-1.5 0v-1.25H6a.75.75 0 010-1.5h1.25V8A.75.75 0 018 7.25zM6 4.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z" />
      </svg>
    );
  }

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 2.75A.75.75 0 012.75 2h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 2.75zm0 5A.75.75 0 012.75 7h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 7.75zM2.75 12h10.5a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5z" />
    </svg>
  );
}

function renderTreeChevronIcon(isExpanded: boolean): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      class={
        isExpanded ? "rotate-90 transition-transform" : "transition-transform"
      }
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function renderFolderIcon(isExpanded: boolean): JSX.Element {
  if (isExpanded) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M1.75 4.5A1.75 1.75 0 013.5 2.75h3.086c.32 0 .627.127.854.354l.792.792c.227.227.535.354.856.354h3.412A1.75 1.75 0 0114.25 6v5.5A1.75 1.75 0 0112.5 13.25h-9A1.75 1.75 0 011.75 11.5v-7z"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linejoin="round"
        />
        <path
          d="M2.5 6.25h11"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.75 4.5A1.75 1.75 0 013.5 2.75h3.086c.32 0 .627.127.854.354l.792.792c.227.227.535.354.856.354h3.412A1.75 1.75 0 0114.25 6v5.5A1.75 1.75 0 0112.5 13.25h-9A1.75 1.75 0 011.75 11.5v-7z"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function renderFileTreeLeadingIcon(treeEntry: {
  readonly isDirectory: boolean;
  readonly isExpandable: boolean;
  readonly isExpanded: boolean;
}): JSX.Element {
  if (treeEntry.isDirectory) {
    return (
      <span class="flex shrink-0 items-center gap-1 text-text-tertiary">
        <span
          class={
            treeEntry.isExpandable
              ? "flex h-3.5 w-3.5 items-center justify-center"
              : "flex h-3.5 w-3.5 items-center justify-center opacity-35"
          }
        >
          {renderTreeChevronIcon(treeEntry.isExpanded)}
        </span>
        <span class="text-text-secondary">
          {renderFolderIcon(treeEntry.isExpanded)}
        </span>
      </span>
    );
  }

  return <span class="shrink-0 text-text-tertiary">·</span>;
}

function renderViewModeIcon(viewMode: DiffViewMode): JSX.Element {
  if (viewMode === "side-by-side") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="1.75"
          y="2"
          width="12.5"
          height="12"
          rx="1.5"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <line
          x1="8"
          y1="2.5"
          x2="8"
          y2="13.5"
          stroke="currentColor"
          stroke-width="1.5"
        />
      </svg>
    );
  }

  if (viewMode === "inline") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="1"
          y="2"
          width="14"
          height="12"
          rx="1"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <line
          x1="4"
          y1="5.5"
          x2="12"
          y2="5.5"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <line
          x1="4"
          y1="8"
          x2="12"
          y2="8"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <line
          x1="4"
          y1="10.5"
          x2="10"
          y2="10.5"
          stroke="currentColor"
          stroke-width="1.2"
        />
      </svg>
    );
  }

  if (viewMode === "current-state") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V13.5A1.5 1.5 0 0112 15H4.5A1.5 1.5 0 013 13.5v-11z"
          stroke="currentColor"
          stroke-width="1.5"
        />
      </svg>
    );
  }

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="1.75"
        width="12"
        height="12.5"
        rx="1.5"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <line
        x1="5"
        y1="5"
        x2="11"
        y2="5"
        stroke="currentColor"
        stroke-width="1.2"
      />
      <line
        x1="5"
        y1="8"
        x2="11"
        y2="8"
        stroke="currentColor"
        stroke-width="1.2"
      />
      <line
        x1="5"
        y1="11"
        x2="9.5"
        y2="11"
        stroke="currentColor"
        stroke-width="1.2"
      />
    </svg>
  );
}

function renderNavigationIcon(direction: "previous" | "next"): JSX.Element {
  if (direction === "previous") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
      </svg>
    );
  }

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8.22 3.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.19 9H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.53a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function renderReloadIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8a5 5 0 1 0 1.5-3.6M3 3v3h3"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function encodeFilePathForUrl(filePath: string): string {
  return filePath
    .split("/")
    .map((pathSegment) => encodeURIComponent(pathSegment))
    .join("/");
}

function buildRawFileUrl(
  apiBaseUrl: string,
  contextId: string,
  filePath: string,
): string {
  return `${trimTrailingSlash(apiBaseUrl)}/ctx/${encodeURIComponent(
    contextId,
  )}/files/file-raw/${encodeFilePathForUrl(filePath)}`;
}

function buildFileContentUrl(options: {
  readonly apiBaseUrl: string;
  readonly contextId: string;
  readonly filePath: string;
  readonly ref?: string | undefined;
  readonly full?: boolean | undefined;
}): string {
  const searchParams = new URLSearchParams();
  if (options.ref !== undefined) {
    searchParams.set("ref", options.ref);
  }
  if (options.full === true) {
    searchParams.set("full", "true");
  }

  const query = searchParams.toString();
  const baseUrl = `${trimTrailingSlash(options.apiBaseUrl)}/ctx/${encodeURIComponent(
    options.contextId,
  )}/files/file/${encodeFilePathForUrl(options.filePath)}`;

  return query.length > 0 ? `${baseUrl}?${query}` : baseUrl;
}

async function fetchFileContentForSyntax(options: {
  readonly apiBaseUrl: string;
  readonly contextId: string;
  readonly filePath: string;
  readonly ref?: string | undefined;
}): Promise<FileContent | null> {
  const response = await fetch(
    buildFileContentUrl({
      ...options,
      full: true,
    }),
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as FileContent;
}

function isRenderableBinaryFile(fileContent: FileContent | null): boolean {
  if (fileContent === null || fileContent.isBinary !== true) {
    return false;
  }

  return (
    fileContent.isImage === true ||
    fileContent.isVideo === true ||
    fileContent.isPdf === true
  );
}

function renderBinaryFilePreview(props: {
  readonly fileContent: FileContent;
  readonly rawFileUrl: string | null;
}): JSX.Element {
  if (props.fileContent.isImage === true) {
    const mimeType = props.fileContent.mimeType ?? "application/octet-stream";
    return (
      <div class="flex justify-center px-6 py-6">
        <img
          src={`data:${mimeType};base64,${props.fileContent.content}`}
          alt={props.fileContent.path}
          class="max-h-[70vh] max-w-full rounded-xl border border-border-default bg-bg-primary object-contain shadow-lg shadow-black/10"
        />
      </div>
    );
  }

  if (props.rawFileUrl === null) {
    return (
      <div class="px-6 py-12 text-sm text-text-secondary">
        Raw preview is unavailable because the workspace context is missing.
      </div>
    );
  }

  if (props.fileContent.isVideo === true) {
    return (
      <div class="px-6 py-6">
        <video
          src={props.rawFileUrl}
          controls
          preload="metadata"
          class="max-h-[70vh] w-full rounded-xl border border-border-default bg-black shadow-lg shadow-black/15"
        >
          Your browser could not play this video preview.
        </video>
      </div>
    );
  }

  if (props.fileContent.isPdf === true) {
    return (
      <div class="px-6 py-6">
        <iframe
          src={props.rawFileUrl}
          title={props.fileContent.path}
          class="h-[70vh] w-full rounded-xl border border-border-default bg-bg-primary"
        />
      </div>
    );
  }

  return (
    <div class="px-6 py-12 text-sm text-text-secondary">
      Binary files are not previewed in the full-file viewer.
    </div>
  );
}

function renderExpandAllIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 4.5l4 4 4-4"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M4 8.5l4 4 4-4"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function renderCollapseAllIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 7.5l4-4 4 4"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M4 11.5l4-4 4 4"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function getStatusBadgeClass(status: string | undefined): string {
  if (status === "added" || status === "untracked") {
    return "border border-success-emphasis/40 bg-success-muted/20 text-success-fg";
  }

  if (status === "modified" || status === "renamed" || status === "copied") {
    return "border border-accent-emphasis/40 bg-accent-muted/20 text-accent-fg";
  }

  if (status === "deleted") {
    return "border border-danger-emphasis/40 bg-danger-muted/20 text-danger-fg";
  }

  if (status === "ignored") {
    return "border border-border-default bg-bg-primary text-text-tertiary";
  }

  return "border border-border-default bg-bg-primary text-text-secondary";
}

function getTreeItemClass(options: {
  readonly isSelected: boolean;
  readonly isDirectory: boolean;
}): string {
  if (options.isSelected) {
    return "border-accent-emphasis/70 bg-accent-muted/20 text-text-primary shadow-lg shadow-black/15";
  }

  if (options.isDirectory) {
    return "border-transparent bg-transparent text-text-secondary hover:border-border-default hover:bg-bg-hover hover:text-text-primary";
  }

  return "border-transparent bg-transparent text-text-secondary hover:border-border-default hover:bg-bg-hover hover:text-text-primary";
}

function getChangeRowClass(changeType: DiffChange["type"] | "blank"): string {
  if (changeType === "add") {
    return "bg-diff-add-bg";
  }

  if (changeType === "delete") {
    return "bg-diff-del-bg";
  }

  if (changeType === "blank") {
    return "bg-bg-secondary/40";
  }

  return "bg-transparent";
}

function getInlineRowAccentClass(changeType: DiffChange["type"]): string {
  if (changeType === "add") {
    return "border-success-emphasis/60 bg-diff-add-bg";
  }

  if (changeType === "delete") {
    return "border-danger-emphasis/60 bg-diff-del-bg";
  }

  return "border-border-default/60 bg-transparent";
}

function getCurrentStateLineClass(
  changeType: CurrentStateLine["changeType"],
): string {
  if (changeType === "added") {
    return "border-success-emphasis/50 bg-diff-add-bg";
  }

  if (changeType === "modified") {
    return "border-accent-emphasis/50 bg-accent-muted/10";
  }

  return "border-border-default/50 bg-bg-primary";
}

function getSelectedLineClass(isSelected: boolean): string {
  return isSelected
    ? "ring-1 ring-inset ring-accent-emphasis bg-accent-muted/15"
    : "";
}

function resolveDisplayedLineNumber(diffChange: DiffChange): number | null {
  return diffChange.newLine ?? diffChange.oldLine ?? null;
}

function getDeletedBlockIndicatorText(
  currentStateLine: CurrentStateLine,
): string {
  const deletedBlock = currentStateLine.deletedBefore;
  if (deletedBlock === undefined) {
    return "";
  }

  const deletedLineCount = deletedBlock.lines.length;
  const lineLabel = deletedLineCount === 1 ? "line" : "lines";
  const lineNumberText =
    deletedBlock.originalStart === deletedBlock.originalEnd
      ? `${deletedBlock.originalStart}`
      : `${deletedBlock.originalStart}-${deletedBlock.originalEnd}`;

  return `${lineNumberText} ${deletedLineCount} deleted ${lineLabel} folded`;
}

function shouldRenderCurrentStateLine(
  currentStateLine: CurrentStateLine,
): boolean {
  return (
    currentStateLine.content !== "" ||
    currentStateLine.changeType !== "unchanged"
  );
}

function buildSideBySideRows(diffFile: DiffFile): readonly SideBySideRow[] {
  const rows: SideBySideRow[] = [];

  for (const diffChunk of diffFile.chunks) {
    rows.push({
      kind: "hunk",
      header: diffChunk.header,
    });

    let pendingDeletes: DiffChange[] = [];

    const flushDeletes = (): void => {
      for (const pendingDelete of pendingDeletes) {
        rows.push({
          kind: "change",
          left: pendingDelete,
          right: null,
        });
      }
      pendingDeletes = [];
    };

    for (const diffChange of diffChunk.changes) {
      if (diffChange.type === "delete") {
        pendingDeletes.push(diffChange);
        continue;
      }

      if (diffChange.type === "add") {
        const pairedDelete = pendingDeletes.shift() ?? null;
        rows.push({
          kind: "change",
          left: pairedDelete,
          right: diffChange,
        });
        continue;
      }

      flushDeletes();
      rows.push({
        kind: "change",
        left: diffChange,
        right: diffChange,
      });
    }

    flushDeletes();
  }

  return rows;
}

function splitFileContentLines(
  fileContent: FileContent | null,
): readonly string[] {
  if (fileContent === null || fileContent.isBinary === true) {
    return [];
  }

  return fileContent.content.split("\n");
}

function createPlainHighlightedLines(
  fileContent: FileContent | null,
): readonly (readonly HighlightToken[])[] {
  return splitFileContentLines(fileContent).map((line) => [
    {
      text: line,
      className: "text-text-primary",
    },
  ]);
}

function createPlainHighlightedLinesFromText(
  content: string,
): readonly (readonly HighlightToken[])[] {
  return content.split("\n").map((line) => [
    {
      text: line,
      className: "text-text-primary",
    },
  ]);
}

function renderHighlightedTextLine(props: {
  readonly tokens: readonly HighlightToken[] | null;
  readonly fallbackText: string;
}): JSX.Element {
  if (props.tokens === null) {
    return <>{props.fallbackText.length > 0 ? props.fallbackText : " "}</>;
  }

  return (
    <For each={props.tokens}>
      {(lineToken) => (
        <span
          class={lineToken.className}
          style={
            lineToken.color !== undefined
              ? { color: lineToken.color }
              : undefined
          }
        >
          {lineToken.text.length > 0 ? lineToken.text : " "}
        </span>
      )}
    </For>
  );
}

export function DiffScreen(props: DiffScreenProps): JSX.Element {
  const aiCommentsApi = createAiCommentsApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const aiSessionsApi = createAiSessionsApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = createSignal(false);
  const [highlightedFullFileLines, setHighlightedFullFileLines] = createSignal<
    readonly (readonly HighlightToken[])[]
  >([]);
  const [beforeHighlightedLines, setBeforeHighlightedLines] = createSignal<
    readonly (readonly HighlightToken[])[]
  >([]);
  const [afterHighlightedLines, setAfterHighlightedLines] = createSignal<
    readonly (readonly HighlightToken[])[]
  >([]);
  const [activeFullFileRange, setActiveFullFileRange] =
    createSignal<FullFileLineRange | null>(null);
  const [fullFilePromptInput, setFullFilePromptInput] = createSignal("");
  const [fullFileQueuedNoticeOpen, setFullFileQueuedNoticeOpen] =
    createSignal(false);
  const [fullFileSubmitNoticeSessionId, setFullFileSubmitNoticeSessionId] =
    createSignal<string | null>(null);
  const [fullFileInlineError, setFullFileInlineError] = createSignal<
    string | null
  >(null);
  const [fullFileMutationPending, setFullFileMutationPending] =
    createSignal(false);
  let previewContainerElement: HTMLDivElement | undefined;
  const activeTree = () =>
    props.fileTreeMode === "diff" ? props.diffTree : props.allFilesTree;
  const visibleTreeEntries = () =>
    collectVisibleFileTreeEntries(activeTree(), props.expandedPaths);
  const diffPathNavigation = () =>
    resolveDiffPathNavigation(props.diffOverview, props.selectedPath);
  const fileContentMetadata = () =>
    collectFileContentMetadata(props.fileContent);
  const selectedDiffFile = () =>
    props.selectedPath !== null
      ? (props.diffOverview.files.find(
          (diffFile) => diffFile.path === props.selectedPath,
        ) ?? props.diffOverview.selectedFile)
      : props.diffOverview.selectedFile;
  const selectedPreviewPath = () =>
    props.fileContent?.path ?? selectedDiffFile()?.path ?? null;
  const selectedStatus = () =>
    props.fileContent !== null && selectedDiffFile() === null
      ? null
      : (selectedDiffFile()?.status ?? null);
  const shouldShowDiffTreeControls = () =>
    shouldShowFileTreeModeControls(props.supportsDiff);
  const availableModes = (): readonly DiffViewMode[] => {
    if (selectedDiffFile()?.isBinary === true) {
      return ["full-file"];
    }

    if (selectedDiffFile() !== null) {
      return ["side-by-side", "inline", "current-state", "full-file"];
    }

    if (props.fileContent !== null) {
      return ["full-file"];
    }

    return [];
  };
  const effectiveViewMode = (): DiffViewMode => {
    const modes = availableModes();
    if (modes.includes(props.preferredViewMode)) {
      return props.preferredViewMode;
    }
    return modes[0] ?? "full-file";
  };
  const sideBySideRows = () => {
    const diffFile = selectedDiffFile();
    if (diffFile === null || diffFile.isBinary) {
      return [] as readonly SideBySideRow[];
    }
    return buildSideBySideRows(diffFile);
  };
  const currentStateLines = () => {
    const diffFile = selectedDiffFile();
    if (diffFile === null || diffFile.isBinary) {
      return [] as readonly CurrentStateLine[];
    }
    return transformToCurrentState(diffFile);
  };
  const fullFileLines = () => splitFileContentLines(props.fileContent);
  const fullFileRangeLineNumbers = () =>
    collectFullFileLineRangeNumbers(activeFullFileRange());
  const fullFileCommentPlaceholder = () =>
    createFullFileCommentPlaceholder(
      props.fileContent?.path ?? selectedPreviewPath() ?? "",
      activeFullFileRange(),
    );
  const canUseFullFileInlineActions = () =>
    props.projectPath.trim().length > 0 &&
    props.fileContent !== null &&
    props.fileContent.isBinary !== true &&
    effectiveViewMode() === "full-file";
  const highlightedBeforeLine = (lineNumber: number | undefined) =>
    lineNumber !== undefined
      ? (beforeHighlightedLines()[lineNumber - 1] ?? null)
      : null;
  const highlightedAfterLine = (lineNumber: number | undefined) =>
    lineNumber !== undefined
      ? (afterHighlightedLines()[lineNumber - 1] ?? null)
      : null;
  const rawFileUrl = () =>
    props.contextId !== null && props.fileContent !== null
      ? buildRawFileUrl(
          props.apiBaseUrl,
          props.contextId,
          props.fileContent.path,
        )
      : null;

  function resetFullFileInlineUi(clearSelectedLine: boolean): void {
    setActiveFullFileRange(null);
    setFullFilePromptInput("");
    setFullFileQueuedNoticeOpen(false);
    setFullFileSubmitNoticeSessionId(null);
    setFullFileInlineError(null);
    if (clearSelectedLine) {
      props.onSelectLine(null);
    }
  }

  function handleFullFileRangeSelection(
    lineNumber: number,
    extendRange: boolean,
  ): void {
    const nextRange = resolveFullFileLineRange({
      currentRange: activeFullFileRange(),
      lineNumber,
      extendRange,
    });
    setActiveFullFileRange(nextRange);
    setFullFileQueuedNoticeOpen(false);
    setFullFileSubmitNoticeSessionId(null);
    setFullFileInlineError(null);
    props.onSelectLine(nextRange.endLine);
  }

  async function submitFullFileComment(immediate: boolean): Promise<void> {
    const fileContent = props.fileContent;
    const activeRange = activeFullFileRange();
    const prompt = fullFilePromptInput().trim();

    if (
      fileContent === null ||
      fileContent.isBinary === true ||
      activeRange === null ||
      props.projectPath.trim().length === 0
    ) {
      return;
    }

    if (prompt.length === 0) {
      setFullFileInlineError("Prompt text is required.");
      return;
    }

    setFullFileMutationPending(true);
    setFullFileInlineError(null);

    try {
      if (immediate) {
        const submitResult = await aiSessionsApi.submitPrompt({
          runImmediately: true,
          message: prompt,
          projectPath: props.projectPath,
          qraftAiSessionId: generateQraftAiSessionId(),
          forceNewSession: true,
          context: createFullFilePromptContext({
            fileContent,
            range: activeRange,
          }),
        });
        setFullFileSubmitNoticeSessionId(submitResult.sessionId);
        setFullFileQueuedNoticeOpen(false);
      } else {
        await aiCommentsApi.addComment({
          projectPath: props.projectPath,
          filePath: fileContent.path,
          startLine: activeRange.startLine,
          endLine: activeRange.endLine,
          side: "new",
          source: "full-file",
          prompt,
        });
        setFullFileQueuedNoticeOpen(true);
        setFullFileSubmitNoticeSessionId(null);
      }

      setFullFilePromptInput("");
    } catch (error) {
      setFullFileInlineError(
        error instanceof Error
          ? error.message
          : "Failed to submit the inline action.",
      );
    } finally {
      setFullFileMutationPending(false);
    }
  }

  createEffect(() => {
    const fileContent = props.fileContent;
    if (
      effectiveViewMode() !== "full-file" ||
      fileContent === null ||
      fileContent.isBinary === true
    ) {
      setHighlightedFullFileLines([]);
      return;
    }

    let isDisposed = false;
    setHighlightedFullFileLines(createPlainHighlightedLines(fileContent));

    void highlightFullFileContent(
      {
        language: fileContent.language,
        filePath: fileContent.path,
      },
      fileContent.content,
    ).then((nextHighlightedLines) => {
      if (!isDisposed) {
        setHighlightedFullFileLines(nextHighlightedLines);
      }
    });

    onCleanup(() => {
      isDisposed = true;
    });
  });

  createEffect(() => {
    const diffFile = selectedDiffFile();
    const activeViewMode = effectiveViewMode();
    const contextId = props.contextId;

    if (
      diffFile === null ||
      diffFile.isBinary ||
      contextId === null ||
      activeViewMode === "full-file"
    ) {
      setBeforeHighlightedLines([]);
      setAfterHighlightedLines([]);
      return;
    }

    let isDisposed = false;
    setBeforeHighlightedLines([]);
    setAfterHighlightedLines([]);
    const activeDiffFile = diffFile;
    const activeContextId = contextId;

    async function loadDiffSyntax(): Promise<void> {
      const shouldLoadBefore =
        activeViewMode === "side-by-side" || activeViewMode === "inline";
      const shouldLoadAfter =
        activeViewMode === "side-by-side" ||
        activeViewMode === "inline" ||
        activeViewMode === "current-state";

      const beforePath = activeDiffFile.oldPath ?? activeDiffFile.path;

      const [beforeContent, afterContent] = await Promise.all([
        shouldLoadBefore
          ? fetchFileContentForSyntax({
              apiBaseUrl: props.apiBaseUrl,
              contextId: activeContextId,
              filePath: beforePath,
              ref: "HEAD",
            }).catch(() => null)
          : Promise.resolve(null),
        shouldLoadAfter
          ? fetchFileContentForSyntax({
              apiBaseUrl: props.apiBaseUrl,
              contextId: activeContextId,
              filePath: activeDiffFile.path,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (isDisposed) {
        return;
      }

      if (beforeContent !== null) {
        setBeforeHighlightedLines(
          createPlainHighlightedLinesFromText(beforeContent.content),
        );
      }
      if (afterContent !== null) {
        setAfterHighlightedLines(
          createPlainHighlightedLinesFromText(afterContent.content),
        );
      }

      const [beforeTokens, afterTokens] = await Promise.all([
        beforeContent !== null
          ? highlightFullFileContent(
              {
                language: beforeContent.language,
                filePath: beforeContent.path,
              },
              beforeContent.content,
            ).catch(() =>
              createPlainHighlightedLinesFromText(beforeContent.content),
            )
          : Promise.resolve<readonly (readonly HighlightToken[])[]>([]),
        afterContent !== null
          ? highlightFullFileContent(
              {
                language: afterContent.language,
                filePath: afterContent.path,
              },
              afterContent.content,
            ).catch(() =>
              createPlainHighlightedLinesFromText(afterContent.content),
            )
          : Promise.resolve<readonly (readonly HighlightToken[])[]>([]),
      ]);

      if (isDisposed) {
        return;
      }

      if (beforeContent !== null) {
        setBeforeHighlightedLines(beforeTokens);
      }
      if (afterContent !== null) {
        setAfterHighlightedLines(afterTokens);
      }
    }

    void loadDiffSyntax();

    onCleanup(() => {
      isDisposed = true;
    });
  });

  createEffect(() => {
    effectiveViewMode();
    props.fileContent?.path;
    resetFullFileInlineUi(false);
  });

  createEffect(() => {
    const selectedLineNumber = props.selectedLineNumber;
    const targetLineNumber =
      activeFullFileRange()?.endLine ?? selectedLineNumber;
    if (targetLineNumber === null) {
      return;
    }

    const selectedLineElement =
      previewContainerElement?.querySelector<HTMLElement>(
        `[data-qraftbox-line="${targetLineNumber}"]`,
      );
    selectedLineElement?.scrollIntoView({
      block: "center",
    });
  });

  return (
    <section class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Switch>
        <Match when={props.errorMessage !== null}>
          <div class="rounded-2xl border border-danger-emphasis/40 bg-danger-muted/10 p-6 text-sm text-danger-fg">
            Failed to load diff: {props.errorMessage}
          </div>
        </Match>
        <Match when={props.isLoading}>
          <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-border-default bg-bg-secondary text-text-secondary">
            <div class="flex gap-2">
              <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis" />
              <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis [animation-delay:120ms]" />
              <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis [animation-delay:240ms]" />
            </div>
            <p class="text-sm">Loading repository diff...</p>
          </div>
        </Match>
        <Match when={true}>
          <div class="flex h-full min-h-0 flex-1 flex-col gap-4">
            <div
              class={`grid min-h-0 flex-1 gap-4 ${isFileTreeCollapsed() ? "xl:grid-cols-[56px_minmax(0,1fr)]" : "xl:grid-cols-[280px_minmax(0,1fr)]"}`}
            >
              <aside
                class={`flex min-h-0 h-full flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-secondary ${isFileTreeCollapsed() ? "items-center" : ""}`}
              >
                <div class="border-b border-border-default p-4">
                  <div
                    class={`flex items-center gap-2 ${isFileTreeCollapsed() ? "justify-center" : "justify-between"}`}
                  >
                    <button
                      type="button"
                      class="rounded-md border border-border-default bg-bg-primary p-2 text-text-primary transition hover:bg-bg-hover"
                      aria-label={
                        isFileTreeCollapsed()
                          ? "Expand file tree"
                          : "Collapse file tree"
                      }
                      title={
                        isFileTreeCollapsed()
                          ? "Expand file tree"
                          : "Collapse file tree"
                      }
                      onClick={() =>
                        setIsFileTreeCollapsed((currentValue) => !currentValue)
                      }
                    >
                      {isFileTreeCollapsed()
                        ? renderNavigationIcon("next")
                        : renderNavigationIcon("previous")}
                    </button>
                    <Show when={!isFileTreeCollapsed()}>
                      <Show when={shouldShowDiffTreeControls()}>
                        <div
                          class="inline-flex rounded-lg border border-border-default bg-bg-primary p-1"
                          role="group"
                          aria-label="File tree mode"
                        >
                          <button
                            type="button"
                            class={
                              props.fileTreeMode === "diff"
                                ? "rounded-md bg-accent-emphasis p-2 text-text-on-emphasis"
                                : "rounded-md p-2 text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
                            }
                            disabled={props.fileTreeMode === "diff"}
                            aria-label="Show only files with changes"
                            title={`Diff (${props.diffOverview.stats.totalFiles})`}
                            onClick={() => props.onChangeFileTreeMode("diff")}
                          >
                            <span class="flex items-center gap-1.5">
                              {renderTreeModeIcon("diff")}
                              <span class="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] font-semibold">
                                {props.diffOverview.stats.totalFiles}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            class={
                              props.fileTreeMode === "all"
                                ? "rounded-md bg-accent-emphasis p-2 text-text-on-emphasis"
                                : "rounded-md p-2 text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
                            }
                            disabled={props.fileTreeMode === "all"}
                            aria-label="Show all files"
                            title="All files"
                            onClick={() => props.onChangeFileTreeMode("all")}
                          >
                            {renderTreeModeIcon("all")}
                          </button>
                        </div>
                      </Show>
                      <button
                        type="button"
                        class="rounded-md border border-border-default bg-bg-primary p-2 text-text-primary transition hover:bg-bg-hover"
                        aria-label="Reload file tree"
                        title="Reload file tree"
                        onClick={() => props.onReload()}
                      >
                        {renderReloadIcon()}
                      </button>
                    </Show>
                  </div>

                  <Show
                    when={shouldShowAllFilesFilters({
                      supportsDiff: props.supportsDiff,
                      isFileTreeCollapsed: isFileTreeCollapsed(),
                      fileTreeMode: props.fileTreeMode,
                    })}
                  >
                    <div class="mt-4 grid gap-2 text-xs text-text-secondary">
                      <CheckboxField
                        checked={props.showIgnored}
                        label="Show ignored"
                        labelClass="text-xs text-text-secondary"
                        onInput={(event) =>
                          props.onToggleShowIgnored(event.currentTarget.checked)
                        }
                      />
                      <CheckboxField
                        checked={props.showAllFiles}
                        label="Show non-Git files"
                        labelClass="text-xs text-text-secondary"
                        onInput={(event) =>
                          props.onToggleShowAllFiles(
                            event.currentTarget.checked,
                          )
                        }
                      />
                    </div>
                  </Show>

                  <Show
                    when={shouldShowDiffDirectoryControls({
                      supportsDiff: props.supportsDiff,
                      isFileTreeCollapsed: isFileTreeCollapsed(),
                      fileTreeMode: props.fileTreeMode,
                    })}
                  >
                    <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <div class="flex flex-wrap items-center gap-2 text-[10px] text-text-secondary">
                        <span class="rounded-full border border-success-emphasis/30 bg-success-muted/15 px-2 py-0.5 font-semibold text-success-fg">
                          +{props.diffOverview.stats.additions}
                        </span>
                        <span class="rounded-full border border-danger-emphasis/30 bg-danger-muted/15 px-2 py-0.5 font-semibold text-danger-fg">
                          -{props.diffOverview.stats.deletions}
                        </span>
                      </div>
                      <div
                        class="inline-flex rounded-lg border border-border-default bg-bg-primary p-1"
                        role="group"
                        aria-label="Folder expansion controls"
                      >
                        <button
                          type="button"
                          class="rounded-md p-2 text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
                          aria-label="Expand all folders"
                          title="Expand all folders"
                          onClick={() => props.onExpandAllDirectories()}
                        >
                          {renderExpandAllIcon()}
                        </button>
                        <button
                          type="button"
                          class="rounded-md p-2 text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
                          aria-label="Collapse all folders"
                          title="Collapse all folders"
                          onClick={() => props.onCollapseAllDirectories()}
                        >
                          {renderCollapseAllIcon()}
                        </button>
                      </div>
                    </div>
                  </Show>
                </div>

                <Show
                  when={!isFileTreeCollapsed()}
                  fallback={
                    <div class="flex min-h-0 flex-1 items-start justify-center p-2">
                      <button
                        type="button"
                        class="rounded-md border border-border-default bg-bg-primary p-2 text-text-primary transition hover:bg-bg-hover"
                        aria-label="Expand file tree"
                        title="Expand file tree"
                        onClick={() => setIsFileTreeCollapsed(false)}
                      >
                        {renderTreeModeIcon(props.fileTreeMode)}
                      </button>
                    </div>
                  }
                >
                  <div class="min-h-0 flex-1 overflow-y-auto p-3">
                    <Show when={props.allFilesError !== null}>
                      <div class="mb-3 rounded-xl border border-danger-emphasis/30 bg-danger-muted/10 px-3 py-2 text-xs text-danger-fg">
                        {props.allFilesError}
                      </div>
                    </Show>
                    <Show when={props.isAllFilesLoading}>
                      <div class="mb-3 rounded-xl border border-border-default bg-bg-primary px-3 py-2 text-xs text-text-secondary">
                        Loading file tree...
                      </div>
                    </Show>
                    <Show
                      when={visibleTreeEntries().length > 0}
                      fallback={
                        <div class="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border-default bg-bg-primary/40 px-6 py-10 text-center text-sm text-text-secondary">
                          {resolveEmptyTreeText(
                            props.fileTreeMode,
                            props.showIgnored,
                            props.showAllFiles,
                          )}
                        </div>
                      }
                    >
                      <ul class="space-y-1">
                        <For each={visibleTreeEntries()}>
                          {(treeEntry) => {
                            const statusLabel = () =>
                              formatDiffStatusLabel(treeEntry.status);
                            return (
                              <li>
                                <div
                                  class="flex items-center gap-2"
                                  style={{
                                    "padding-left": `${treeEntry.depth * 14}px`,
                                  }}
                                >
                                  <button
                                    type="button"
                                    class={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${getTreeItemClass(
                                      {
                                        isSelected:
                                          !treeEntry.isDirectory &&
                                          props.selectedPath === treeEntry.path,
                                        isDirectory: treeEntry.isDirectory,
                                      },
                                    )}`}
                                    onClick={() =>
                                      treeEntry.isDirectory
                                        ? props.onToggleDirectory(
                                            treeEntry.path,
                                          )
                                        : props.onSelectPath(treeEntry.path)
                                    }
                                  >
                                    {renderFileTreeLeadingIcon(treeEntry)}
                                    <span class="truncate leading-5">
                                      {treeEntry.name}
                                    </span>
                                  </button>
                                  <Show when={statusLabel() !== null}>
                                    <span
                                      class={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(
                                        treeEntry.status,
                                      )}`}
                                    >
                                      {statusLabel()}
                                    </span>
                                  </Show>
                                </div>
                              </li>
                            );
                          }}
                        </For>
                      </ul>
                    </Show>
                  </div>
                </Show>
              </aside>

              <main class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-secondary">
                <div class="sticky top-0 z-10 border-b border-border-default bg-bg-secondary/95 px-4 py-3 backdrop-blur">
                  <div class="flex min-w-0 flex-col gap-2">
                    <div class="min-w-0">
                      <div class="flex min-w-0 flex-wrap items-center gap-2">
                        <p class="break-all text-base font-semibold text-text-primary">
                          {selectedPreviewPath() ?? "Select a file"}
                        </p>
                        <Show when={selectedStatus() !== null}>
                          <span
                            class={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(
                              selectedStatus() ?? undefined,
                            )}`}
                          >
                            {selectedStatus()}
                          </span>
                        </Show>
                      </div>
                    </div>

                    <div class="flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-text-secondary">
                      <div class="flex shrink-0 flex-wrap items-center gap-2">
                        <For each={availableModes()}>
                          {(viewMode) => (
                            <button
                              type="button"
                              class={
                                effectiveViewMode() === viewMode
                                  ? "rounded-md bg-accent-emphasis p-2 text-text-on-emphasis"
                                  : "rounded-md border border-border-default bg-bg-primary p-2 text-text-primary transition hover:bg-bg-hover"
                              }
                              disabled={effectiveViewMode() === viewMode}
                              aria-label={`${renderViewModeLabel(viewMode)} view`}
                              title={renderViewModeLabel(viewMode)}
                              onClick={() => props.onChangeViewMode(viewMode)}
                            >
                              {renderViewModeIcon(viewMode)}
                            </button>
                          )}
                        </For>
                        <button
                          type="button"
                          class="rounded-md border border-border-default bg-bg-primary p-2 text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={diffPathNavigation().previousPath === null}
                          aria-label="Previous file"
                          title="Previous file"
                          onClick={() => {
                            const previousPath =
                              diffPathNavigation().previousPath;
                            if (previousPath !== null) {
                              props.onSelectPath(previousPath);
                            }
                          }}
                        >
                          {renderNavigationIcon("previous")}
                        </button>
                        <button
                          type="button"
                          class="rounded-md border border-border-default bg-bg-primary p-2 text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={diffPathNavigation().nextPath === null}
                          aria-label="Next file"
                          title="Next file"
                          onClick={() => {
                            const nextPath = diffPathNavigation().nextPath;
                            if (nextPath !== null) {
                              props.onSelectPath(nextPath);
                            }
                          }}
                        >
                          {renderNavigationIcon("next")}
                        </button>
                        <button
                          type="button"
                          class="rounded-md border border-border-default bg-bg-primary p-2 text-text-primary transition hover:bg-bg-hover"
                          aria-label="Refresh preview"
                          title="Refresh preview"
                          onClick={() => props.onReload()}
                        >
                          {renderReloadIcon()}
                        </button>
                      </div>

                      <Show when={selectedDiffFile() !== null}>
                        <span class="rounded-full border border-success-emphasis/30 bg-success-muted/15 px-2 py-0.5 text-success-fg">
                          +{selectedDiffFile()?.additions}
                        </span>
                        <span class="rounded-full border border-danger-emphasis/30 bg-danger-muted/15 px-2 py-0.5 text-danger-fg">
                          -{selectedDiffFile()?.deletions}
                        </span>
                      </Show>
                      <For each={fileContentMetadata()}>
                        {(metadataItem) => (
                          <span class="rounded-full border border-border-default bg-bg-primary px-2 py-0.5">
                            {metadataItem}
                          </span>
                        )}
                      </For>
                    </div>

                    <Show when={selectedDiffFile()?.oldPath !== undefined}>
                      <p class="text-xs text-text-secondary">
                        Renamed from {selectedDiffFile()?.oldPath}
                      </p>
                    </Show>
                  </div>
                </div>

                <Show when={props.fileContentError !== null}>
                  <div class="border-b border-danger-emphasis/30 bg-danger-muted/10 px-4 py-3 text-sm text-danger-fg">
                    {props.fileContentError}
                  </div>
                </Show>

                <div
                  ref={previewContainerElement}
                  class="min-h-0 flex-1 overflow-auto bg-bg-primary"
                >
                  <Show when={props.isFileContentLoading}>
                    <div class="border-b border-border-default px-4 py-3 text-sm text-text-secondary">
                      Loading file preview...
                    </div>
                  </Show>

                  <Show
                    when={selectedPreviewPath() !== null}
                    fallback={
                      <div class="flex min-h-full items-center justify-center px-6 py-16 text-center text-sm text-text-secondary">
                        Select a changed file or repository file to inspect its
                        contents here.
                      </div>
                    }
                  >
                    <Switch>
                      <Match when={selectedDiffFile()?.isBinary === true}>
                        <div class="m-4 rounded-2xl border border-border-default bg-bg-secondary p-6 text-sm text-text-secondary">
                          Binary files are not previewed in the browser diff
                          viewer.
                        </div>
                      </Match>

                      <Match when={effectiveViewMode() === "side-by-side"}>
                        <div class="min-w-[840px]">
                          <div>
                            <For each={sideBySideRows()}>
                              {(row) => (
                                <Show
                                  when={row.kind === "change"}
                                  fallback={
                                    <div class="border-y border-accent-emphasis/20 bg-diff-hunk-bg/30 px-4 py-2 font-mono text-xs text-accent-fg">
                                      {row.kind === "hunk"
                                        ? row.header
                                        : undefined}
                                    </div>
                                  }
                                >
                                  <div class="grid grid-cols-[84px_minmax(0,1fr)_84px_minmax(0,1fr)] border-b border-border-default/60 font-mono text-[13px] leading-6">
                                    <div
                                      data-qraftbox-line={
                                        row.kind === "change"
                                          ? (row.left?.oldLine ?? undefined)
                                          : undefined
                                      }
                                      class={`border-r border-border-default/50 px-4 py-1 text-right text-text-tertiary ${getChangeRowClass(
                                        row.kind === "change" &&
                                          row.left !== null
                                          ? row.left.type
                                          : "blank",
                                      )} ${getSelectedLineClass(
                                        row.kind === "change" &&
                                          row.left?.oldLine ===
                                            props.selectedLineNumber,
                                      )}`}
                                      onClick={() => {
                                        if (
                                          row.kind === "change" &&
                                          row.left?.oldLine !== undefined
                                        ) {
                                          props.onSelectLine(row.left.oldLine);
                                        }
                                      }}
                                    >
                                      {row.kind === "change" &&
                                      row.left?.oldLine !== undefined
                                        ? row.left.oldLine
                                        : ""}
                                    </div>
                                    <div
                                      class={`border-r border-border-default/50 px-4 py-1 whitespace-pre-wrap break-words text-text-primary ${getChangeRowClass(
                                        row.kind === "change" &&
                                          row.left !== null
                                          ? row.left.type
                                          : "blank",
                                      )}`}
                                    >
                                      {row.kind === "change"
                                        ? renderHighlightedTextLine({
                                            tokens: highlightedBeforeLine(
                                              row.left?.oldLine,
                                            ),
                                            fallbackText:
                                              row.left?.content ?? "",
                                          })
                                        : ""}
                                    </div>
                                    <div
                                      data-qraftbox-line={
                                        row.kind === "change"
                                          ? (row.right?.newLine ?? undefined)
                                          : undefined
                                      }
                                      class={`border-r border-border-default/50 px-4 py-1 text-right text-text-tertiary ${getChangeRowClass(
                                        row.kind === "change" &&
                                          row.right !== null
                                          ? row.right.type
                                          : "blank",
                                      )} ${getSelectedLineClass(
                                        row.kind === "change" &&
                                          row.right?.newLine ===
                                            props.selectedLineNumber,
                                      )}`}
                                      onClick={() => {
                                        if (
                                          row.kind === "change" &&
                                          row.right?.newLine !== undefined
                                        ) {
                                          props.onSelectLine(row.right.newLine);
                                        }
                                      }}
                                    >
                                      {row.kind === "change" &&
                                      row.right?.newLine !== undefined
                                        ? row.right.newLine
                                        : ""}
                                    </div>
                                    <div
                                      class={`px-4 py-1 whitespace-pre-wrap break-words text-text-primary ${getChangeRowClass(
                                        row.kind === "change" &&
                                          row.right !== null
                                          ? row.right.type
                                          : "blank",
                                      )}`}
                                    >
                                      {row.kind === "change"
                                        ? renderHighlightedTextLine({
                                            tokens: highlightedAfterLine(
                                              row.right?.newLine,
                                            ),
                                            fallbackText:
                                              row.right?.content ?? "",
                                          })
                                        : ""}
                                    </div>
                                  </div>
                                </Show>
                              )}
                            </For>
                          </div>
                        </div>
                      </Match>

                      <Match when={effectiveViewMode() === "inline"}>
                        <div class="min-w-[720px]">
                          <For each={selectedDiffFile()?.chunks ?? []}>
                            {(diffChunk) => (
                              <div>
                                <div class="border-y border-accent-emphasis/20 bg-diff-hunk-bg/30 px-4 py-2 font-mono text-xs text-accent-fg">
                                  {diffChunk.header}
                                </div>
                                <For each={diffChunk.changes}>
                                  {(diffChange) => (
                                    <div
                                      data-qraftbox-line={
                                        resolveDisplayedLineNumber(
                                          diffChange,
                                        ) ?? undefined
                                      }
                                      class={`grid grid-cols-[72px_72px_44px_minmax(0,1fr)] border-b border-border-default/60 font-mono text-[13px] leading-6 ${getInlineRowAccentClass(
                                        diffChange.type,
                                      )} ${getSelectedLineClass(
                                        resolveDisplayedLineNumber(
                                          diffChange,
                                        ) === props.selectedLineNumber,
                                      )}`}
                                      onClick={() => {
                                        const selectedLineNumber =
                                          resolveDisplayedLineNumber(
                                            diffChange,
                                          );
                                        if (selectedLineNumber !== null) {
                                          props.onSelectLine(
                                            selectedLineNumber,
                                          );
                                        }
                                      }}
                                    >
                                      <div class="px-4 py-1 text-right text-text-tertiary">
                                        {diffChange.oldLine ?? ""}
                                      </div>
                                      <div class="px-4 py-1 text-right text-text-tertiary">
                                        {diffChange.newLine ?? ""}
                                      </div>
                                      <div class="px-4 py-1 text-text-tertiary">
                                        {diffChange.type === "context"
                                          ? "·"
                                          : diffChange.type === "add"
                                            ? "+"
                                            : "-"}
                                      </div>
                                      <div class="px-4 py-1 whitespace-pre-wrap break-words text-text-primary">
                                        {renderHighlightedTextLine({
                                          tokens:
                                            diffChange.type === "delete"
                                              ? highlightedBeforeLine(
                                                  diffChange.oldLine,
                                                )
                                              : highlightedAfterLine(
                                                  diffChange.newLine,
                                                ),
                                          fallbackText: diffChange.content,
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </For>
                              </div>
                            )}
                          </For>
                        </div>
                      </Match>

                      <Match when={effectiveViewMode() === "current-state"}>
                        <div class="min-w-[720px]">
                          <Show
                            when={currentStateLines().length > 0}
                            fallback={
                              <div class="px-6 py-12 text-sm text-text-secondary">
                                No current-state preview is available for this
                                file.
                              </div>
                            }
                          >
                            <For each={currentStateLines()}>
                              {(currentStateLine) => (
                                <div>
                                  <Show
                                    when={
                                      currentStateLine.deletedBefore !==
                                      undefined
                                    }
                                  >
                                    <div class="border-b border-border-default/40 pl-[84px] font-mono">
                                      <div class="px-4 py-0">
                                        <div class="relative">
                                          <div class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-danger-emphasis/80" />
                                          <div class="relative flex justify-end">
                                            <span class="bg-bg-primary px-2 text-[11px] tracking-[0.08em] text-danger-fg/35">
                                              {getDeletedBlockIndicatorText(
                                                currentStateLine,
                                              )}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </Show>
                                  <Show
                                    when={shouldRenderCurrentStateLine(
                                      currentStateLine,
                                    )}
                                  >
                                    <div
                                      data-qraftbox-line={
                                        currentStateLine.lineNumber
                                      }
                                      class={`grid grid-cols-[84px_minmax(0,1fr)] border-b border-border-default/60 font-mono text-[13px] leading-6 ${getCurrentStateLineClass(
                                        currentStateLine.changeType,
                                      )} ${getSelectedLineClass(
                                        currentStateLine.lineNumber ===
                                          props.selectedLineNumber,
                                      )}`}
                                      onClick={() =>
                                        props.onSelectLine(
                                          currentStateLine.lineNumber,
                                        )
                                      }
                                    >
                                      <div class="px-4 py-1 text-right text-text-tertiary">
                                        {currentStateLine.lineNumber}
                                      </div>
                                      <div class="px-4 py-1 whitespace-pre-wrap break-words text-text-primary">
                                        {renderHighlightedTextLine({
                                          tokens: highlightedAfterLine(
                                            currentStateLine.lineNumber,
                                          ),
                                          fallbackText:
                                            currentStateLine.content,
                                        })}
                                      </div>
                                    </div>
                                  </Show>
                                </div>
                              )}
                            </For>
                          </Show>
                        </div>
                      </Match>

                      <Match when={effectiveViewMode() === "full-file"}>
                        <div class="min-w-[720px]">
                          <Show
                            when={!isRenderableBinaryFile(props.fileContent)}
                            fallback={renderBinaryFilePreview({
                              fileContent: props.fileContent as FileContent,
                              rawFileUrl: rawFileUrl(),
                            })}
                          >
                            <Show
                              when={props.fileContent?.isBinary !== true}
                              fallback={
                                <div class="px-6 py-12 text-sm text-text-secondary">
                                  Binary files are not previewed in the
                                  full-file viewer.
                                </div>
                              }
                            >
                              <Show
                                when={fullFileLines().length > 0}
                                fallback={
                                  <div class="px-6 py-12 text-sm text-text-secondary">
                                    The selected file is empty.
                                  </div>
                                }
                              >
                                <For each={highlightedFullFileLines()}>
                                  {(lineTokens, lineIndex) => (
                                    <>
                                      <div
                                        data-qraftbox-line={lineIndex() + 1}
                                        class={`group/line grid grid-cols-[84px_minmax(0,1fr)] border-b border-border-default/60 font-mono text-[13px] leading-6 ${getSelectedLineClass(
                                          lineIndex() + 1 ===
                                            props.selectedLineNumber,
                                        )} ${
                                          fullFileRangeLineNumbers().includes(
                                            lineIndex() + 1,
                                          )
                                            ? "bg-accent-muted/10"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          props.onSelectLine(lineIndex() + 1)
                                        }
                                      >
                                        <div class="relative px-4 py-1 text-right text-text-tertiary">
                                          <Show
                                            when={canUseFullFileInlineActions()}
                                          >
                                            <button
                                              type="button"
                                              class="absolute left-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded bg-accent-emphasis text-[11px] font-semibold text-text-on-emphasis opacity-0 transition group-hover/line:opacity-100 hover:brightness-110"
                                              aria-label={`Add comment on line ${
                                                lineIndex() + 1
                                              }`}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                handleFullFileRangeSelection(
                                                  lineIndex() + 1,
                                                  event.shiftKey,
                                                );
                                              }}
                                            >
                                              +
                                            </button>
                                          </Show>
                                          <button
                                            type="button"
                                            class="rounded px-1 transition hover:bg-bg-hover"
                                            aria-label={`Select line ${
                                              lineIndex() + 1
                                            } for AI prompt`}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleFullFileRangeSelection(
                                                lineIndex() + 1,
                                                event.shiftKey,
                                              );
                                            }}
                                          >
                                            {lineIndex() + 1}
                                          </button>
                                        </div>
                                        <div class="px-4 py-1 whitespace-pre-wrap break-words text-text-primary">
                                          <Show
                                            when={lineTokens.length > 0}
                                            fallback={" "}
                                          >
                                            <For each={lineTokens}>
                                              {(lineToken) => (
                                                <span
                                                  class={lineToken.className}
                                                  style={
                                                    lineToken.color !==
                                                    undefined
                                                      ? {
                                                          color:
                                                            lineToken.color,
                                                        }
                                                      : undefined
                                                  }
                                                >
                                                  {lineToken.text.length > 0
                                                    ? lineToken.text
                                                    : " "}
                                                </span>
                                              )}
                                            </For>
                                          </Show>
                                        </div>
                                      </div>
                                      <Show
                                        when={
                                          activeFullFileRange()?.endLine ===
                                          lineIndex() + 1
                                        }
                                      >
                                        <div class="border-y-2 border-accent-emphasis/60 bg-bg-secondary px-4 py-3">
                                          <textarea
                                            class="min-h-28 w-full resize-y rounded-xl border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-emphasis"
                                            placeholder={fullFileCommentPlaceholder()}
                                            value={fullFilePromptInput()}
                                            onInput={(event) => {
                                              setFullFilePromptInput(
                                                event.currentTarget.value,
                                              );
                                              if (
                                                fullFileInlineError() !== null
                                              ) {
                                                setFullFileInlineError(null);
                                              }
                                            }}
                                            onKeyDown={(event) => {
                                              if (
                                                event.key === "Enter" &&
                                                (event.ctrlKey || event.metaKey)
                                              ) {
                                                event.preventDefault();
                                                void submitFullFileComment(
                                                  false,
                                                );
                                              }

                                              if (event.key === "Escape") {
                                                event.preventDefault();
                                                resetFullFileInlineUi(true);
                                              }
                                            }}
                                          />
                                          <div class="mt-3 flex flex-wrap items-center gap-2">
                                            <button
                                              type="button"
                                              class="rounded-md bg-success-emphasis px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                                              disabled={
                                                fullFilePromptInput().trim()
                                                  .length === 0 ||
                                                fullFileMutationPending()
                                              }
                                              onClick={() =>
                                                void submitFullFileComment(
                                                  false,
                                                )
                                              }
                                            >
                                              Add comment
                                            </button>
                                            <button
                                              type="button"
                                              class="rounded-md border border-accent-emphasis/40 bg-accent-muted/20 px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:bg-accent-muted/35 disabled:cursor-not-allowed disabled:opacity-50"
                                              disabled={
                                                fullFilePromptInput().trim()
                                                  .length === 0 ||
                                                fullFileMutationPending()
                                              }
                                              onClick={() =>
                                                void submitFullFileComment(true)
                                              }
                                            >
                                              Start AI session
                                            </button>
                                            <button
                                              type="button"
                                              class="px-2 py-1 text-xs text-text-secondary transition hover:text-text-primary"
                                              disabled={fullFileMutationPending()}
                                              onClick={() =>
                                                resetFullFileInlineUi(true)
                                              }
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                          <Show
                                            when={
                                              fullFileInlineError() !== null
                                            }
                                          >
                                            <div class="mt-3 rounded-lg border border-danger-emphasis/40 bg-danger-muted/10 px-3 py-2 text-xs text-danger-fg">
                                              {fullFileInlineError()}
                                            </div>
                                          </Show>
                                          <Show
                                            when={
                                              fullFileSubmitNoticeSessionId() !==
                                              null
                                            }
                                          >
                                            <div class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent-emphasis/40 bg-accent-muted/10 px-3 py-2 text-xs text-text-secondary">
                                              <span>AI session submitted.</span>
                                              <div class="flex items-center gap-2">
                                                <button
                                                  type="button"
                                                  class="text-accent-fg underline underline-offset-2 transition hover:opacity-80"
                                                  onClick={() =>
                                                    props.onOpenAiSession(
                                                      fullFileSubmitNoticeSessionId()!,
                                                    )
                                                  }
                                                >
                                                  Open session
                                                </button>
                                                <button
                                                  type="button"
                                                  class="text-text-secondary transition hover:text-text-primary"
                                                  onClick={() =>
                                                    resetFullFileInlineUi(true)
                                                  }
                                                >
                                                  Close
                                                </button>
                                              </div>
                                            </div>
                                          </Show>
                                          <Show
                                            when={fullFileQueuedNoticeOpen()}
                                          >
                                            <div class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success-emphasis/40 bg-success-muted/10 px-3 py-2 text-xs text-success-fg">
                                              <span>
                                                Comment added to queue.
                                              </span>
                                              <button
                                                type="button"
                                                class="text-text-secondary transition hover:text-text-primary"
                                                onClick={() =>
                                                  setFullFileQueuedNoticeOpen(
                                                    false,
                                                  )
                                                }
                                              >
                                                Close
                                              </button>
                                            </div>
                                          </Show>
                                        </div>
                                      </Show>
                                    </>
                                  )}
                                </For>
                              </Show>
                            </Show>
                          </Show>
                        </div>
                      </Match>
                    </Switch>
                  </Show>
                </div>
              </main>
            </div>
          </div>
        </Match>
      </Switch>
    </section>
  );
}
