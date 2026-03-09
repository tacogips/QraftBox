import {
  transformToCurrentState,
  type CurrentStateLine,
} from "../../../../client-shared/src/contracts/current-state";
import type { FileContent } from "../../../../client-shared/src/contracts/files";
import type {
  DiffChange,
  DiffOverviewState,
  DiffViewMode,
} from "../../../../client-shared/src/contracts/diff";

export interface DiffViewerState {
  readonly selectedFilePath: string | null;
  readonly selectedFileStatus: string | null;
  readonly visibleMode: DiffViewMode;
  readonly availableModes: readonly DiffViewMode[];
  readonly canRenderDiff: boolean;
  readonly selectedFileSummaryText: string;
  readonly modeSummaryText: string;
  readonly previewLines: readonly string[];
}

export interface CreateDiffViewerStateOptions {
  readonly diffOverview: DiffOverviewState;
  readonly selectedPath: string | null;
  readonly fileContent: FileContent | null;
}

export function createDiffViewerState(
  options: CreateDiffViewerStateOptions,
): DiffViewerState {
  const selectedDiffFile =
    options.selectedPath !== null
      ? (options.diffOverview.files.find(
          (diffFile) => diffFile.path === options.selectedPath,
        ) ?? null)
      : options.diffOverview.selectedFile;

  if (
    options.fileContent !== null &&
    (options.diffOverview.preferredViewMode === "full-file" ||
      selectedDiffFile === null)
  ) {
    return {
      selectedFilePath: options.fileContent.path,
      selectedFileStatus: selectedDiffFile?.status ?? null,
      visibleMode: "full-file",
      availableModes:
        selectedDiffFile === null
          ? ["full-file"]
          : ["side-by-side", "inline", "current-state", "full-file"],
      canRenderDiff: false,
      selectedFileSummaryText: buildFileContentSummaryText(
        options.fileContent,
        selectedDiffFile?.status ?? null,
      ),
      modeSummaryText: "Preview mode: full-file",
      previewLines: collectFullFilePreviewLines(options.fileContent),
    };
  }

  if (
    options.diffOverview.preferredViewMode === "full-file" &&
    selectedDiffFile !== null
  ) {
    return {
      selectedFilePath: selectedDiffFile.path,
      selectedFileStatus: selectedDiffFile.status,
      visibleMode: "full-file",
      availableModes: ["side-by-side", "inline", "current-state", "full-file"],
      canRenderDiff: false,
      selectedFileSummaryText: buildSelectedFileSummaryText(selectedDiffFile),
      modeSummaryText: "Preview mode: full-file",
      previewLines: [],
    };
  }

  if (selectedDiffFile === null) {
    return {
      selectedFilePath: null,
      selectedFileStatus: null,
      visibleMode: options.diffOverview.preferredViewMode,
      availableModes: [],
      canRenderDiff: false,
      selectedFileSummaryText: "No file is selected for preview.",
      modeSummaryText: `Preview mode: ${options.diffOverview.preferredViewMode}`,
      previewLines: [],
    };
  }

  if (selectedDiffFile.isBinary) {
    return {
      selectedFilePath: selectedDiffFile.path,
      selectedFileStatus: selectedDiffFile.status,
      visibleMode: "full-file",
      availableModes: ["full-file"],
      canRenderDiff: false,
      selectedFileSummaryText: buildSelectedFileSummaryText(selectedDiffFile),
      modeSummaryText: "Preview mode: full-file",
      previewLines: ["Binary files are not previewed in the migration viewer."],
    };
  }

  const availableModes: readonly DiffViewMode[] = [
    "side-by-side",
    "inline",
    "current-state",
    "full-file",
  ];

  return {
    selectedFilePath: selectedDiffFile.path,
    selectedFileStatus: selectedDiffFile.status,
    visibleMode: options.diffOverview.preferredViewMode,
    availableModes,
    canRenderDiff: true,
    selectedFileSummaryText: buildSelectedFileSummaryText(selectedDiffFile),
    modeSummaryText: `Preview mode: ${options.diffOverview.preferredViewMode}`,
    previewLines:
      options.diffOverview.preferredViewMode === "current-state"
        ? collectCurrentStatePreviewLines(selectedDiffFile)
        : collectDiffPreviewLines(
            selectedDiffFile.chunks,
            options.diffOverview.preferredViewMode,
          ),
  };
}

function buildSelectedFileSummaryText(
  diffFile: NonNullable<DiffOverviewState["selectedFile"]>,
): string {
  return `${diffFile.path} | ${diffFile.status} | +${diffFile.additions} | -${diffFile.deletions}`;
}

function buildFileContentSummaryText(
  fileContent: FileContent,
  diffStatus: string | null,
): string {
  if (diffStatus === null) {
    return `${fileContent.path} | full file`;
  }

  return `${fileContent.path} | ${diffStatus} | full file`;
}

function collectCurrentStatePreviewLines(
  diffFile: NonNullable<DiffOverviewState["selectedFile"]>,
): readonly string[] {
  const currentStateLines = transformToCurrentState(diffFile);
  if (currentStateLines.length === 0) {
    return ["No renderable current-state lines are available yet."];
  }

  return currentStateLines.flatMap((currentStateLine) =>
    collectCurrentStateLinePreview(currentStateLine),
  );
}

function collectCurrentStateLinePreview(
  currentStateLine: CurrentStateLine,
): readonly string[] {
  const previewLines: string[] = [];
  if (currentStateLine.deletedBefore !== undefined) {
    previewLines.push(
      `deleted ${currentStateLine.deletedBefore.originalStart}-${currentStateLine.deletedBefore.originalEnd}: ${currentStateLine.deletedBefore.lines.join(" | ")}`,
    );
  }
  previewLines.push(
    `${currentStateLine.lineNumber}: [${currentStateLine.changeType}] ${currentStateLine.content}`,
  );
  return previewLines;
}

function collectDiffPreviewLines(
  diffChunks: NonNullable<DiffOverviewState["selectedFile"]>["chunks"],
  viewMode: DiffViewMode,
): readonly string[] {
  if (diffChunks.length === 0) {
    return ["No renderable diff chunks are available yet."];
  }

  return diffChunks.flatMap((diffChunk) => [
    `${viewMode} ${diffChunk.header}`,
    ...diffChunk.changes.map((diffChange) => formatDiffPreviewLine(diffChange)),
  ]);
}

function formatDiffPreviewLine(diffChange: DiffChange): string {
  const lineNumber = diffChange.newLine ?? diffChange.oldLine ?? 0;
  const marker =
    diffChange.type === "add" ? "+" : diffChange.type === "delete" ? "-" : " ";
  return `${marker}${lineNumber}: ${diffChange.content}`;
}

function collectFullFilePreviewLines(
  fileContent: FileContent,
): readonly string[] {
  if (fileContent.isBinary === true) {
    return ["Binary files are not previewed in the migration viewer."];
  }

  const previewLines = fileContent.content.split("\n").slice(0, 40);
  if (previewLines.length === 0) {
    return ["The selected file is empty."];
  }

  return previewLines.map(
    (lineContent, lineIndex) => `${lineIndex + 1}: ${lineContent}`,
  );
}
