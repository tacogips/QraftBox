import type { DiffOverviewState } from "../../../../client-shared/src/contracts/diff";
import type { FileContent } from "../../../../client-shared/src/contracts/files";
import { createDiffViewerState } from "./viewer-state";

export interface DiffScreenPresentation {
  readonly heading: string;
  readonly loadingText: string;
  readonly unsupportedText: string;
  readonly summaryText: string;
  readonly selectionText: string;
  readonly emptyStateText: string;
  readonly fileListHeading: string;
  readonly viewerHeading: string;
  readonly selectedFileSummaryText: string;
  readonly modeText: string;
  readonly availableModes: readonly string[];
  readonly previewLines: readonly string[];
  readonly emptyPreviewText: string;
}

export interface DiffScreenViewState {
  readonly diffOverview: DiffOverviewState;
  readonly selectedPath: string | null;
  readonly fileContent: FileContent | null;
  readonly isLoading: boolean;
  readonly unsupportedMessage: string | null;
  readonly errorMessage: string | null;
}

export function createDiffScreenPresentation(
  diffOverview: DiffOverviewState,
  selectedPath: string | null,
  fileContent: FileContent | null,
): DiffScreenPresentation {
  const viewerState = createDiffViewerState({
    diffOverview,
    selectedPath,
    fileContent,
  });

  return {
    heading: "Diff screen",
    loadingText: "Loading diff...",
    unsupportedText: "Diff view is unavailable for non-Git workspaces.",
    summaryText: `Changed files: ${diffOverview.stats.totalFiles} | +${diffOverview.stats.additions} | -${diffOverview.stats.deletions}`,
    selectionText:
      viewerState.selectedFilePath !== null
        ? `Selected file: ${viewerState.selectedFilePath}${viewerState.selectedFileStatus !== null ? ` (${viewerState.selectedFileStatus})` : ""}`
        : "Selected file: none",
    emptyStateText: "No changed files are available for this workspace.",
    fileListHeading: "Changed file list",
    viewerHeading: "Selected file preview",
    selectedFileSummaryText: viewerState.selectedFileSummaryText,
    modeText: viewerState.modeSummaryText,
    availableModes: viewerState.availableModes,
    previewLines: viewerState.previewLines,
    emptyPreviewText:
      "No preview lines are available for the current selection.",
  };
}

export function collectDiffScreenText(
  viewState: DiffScreenViewState,
): readonly string[] {
  const viewerPresentation = createDiffScreenPresentation(
    viewState.diffOverview,
    viewState.selectedPath,
    viewState.fileContent,
  );

  if (viewState.errorMessage !== null) {
    return [
      viewerPresentation.heading,
      `Failed to load diff: ${viewState.errorMessage}`,
    ];
  }

  if (viewState.unsupportedMessage !== null) {
    return [viewerPresentation.heading, viewState.unsupportedMessage];
  }

  if (viewState.isLoading) {
    return [viewerPresentation.heading, viewerPresentation.loadingText];
  }

  const text = [
    viewerPresentation.heading,
    viewerPresentation.summaryText,
    viewerPresentation.selectionText,
    viewerPresentation.viewerHeading,
    viewerPresentation.selectedFileSummaryText,
    viewerPresentation.modeText,
    viewerPresentation.fileListHeading,
  ];

  text.push(...viewerPresentation.previewLines);

  if (viewState.diffOverview.isEmpty) {
    text.push(viewerPresentation.emptyStateText);
    return text;
  }

  for (const diffFile of viewState.diffOverview.files) {
    text.push(diffFile.path, diffFile.status);
  }

  return text;
}
