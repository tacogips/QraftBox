import type { FileTreeMode } from "../../../../client-shared/src/contracts/files";

export interface FileTreeVisibilityOptions {
  readonly supportsDiff: boolean;
  readonly isFileTreeCollapsed: boolean;
  readonly fileTreeMode: FileTreeMode;
}

export function shouldShowFileTreeModeControls(supportsDiff: boolean): boolean {
  return supportsDiff;
}

export function shouldShowAllFilesFilters(
  options: FileTreeVisibilityOptions,
): boolean {
  return (
    shouldShowFileTreeModeControls(options.supportsDiff) &&
    !options.isFileTreeCollapsed &&
    options.fileTreeMode === "all"
  );
}

export function shouldShowDiffDirectoryControls(
  options: FileTreeVisibilityOptions,
): boolean {
  return (
    shouldShowFileTreeModeControls(options.supportsDiff) &&
    !options.isFileTreeCollapsed &&
    options.fileTreeMode === "diff"
  );
}
