export type DiffStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored";

export type DiffChangeType = "add" | "delete" | "context";

export type DiffViewMode =
  | "side-by-side"
  | "inline"
  | "current-state"
  | "full-file";

export interface DiffChange {
  readonly type: DiffChangeType;
  readonly content: string;
  readonly oldLine?: number | undefined;
  readonly newLine?: number | undefined;
}

export interface DiffChunk {
  readonly header: string;
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly changes: readonly DiffChange[];
}

export interface DiffFile {
  readonly path: string;
  readonly status: DiffStatus;
  readonly oldPath?: string | undefined;
  readonly additions: number;
  readonly deletions: number;
  readonly chunks: readonly DiffChunk[];
  readonly isBinary: boolean;
  readonly fileSize?: number | undefined;
}

export interface DiffStats {
  readonly totalFiles: number;
  readonly additions: number;
  readonly deletions: number;
}

export interface DiffApiResponse {
  readonly files?: readonly DiffFile[] | undefined;
  readonly stats?: Partial<DiffStats> | undefined;
}

export interface DiffOverviewState {
  readonly files: readonly DiffFile[];
  readonly selectedPath: string | null;
  readonly selectedFile: DiffFile | null;
  readonly stats: DiffStats;
  readonly preferredViewMode: DiffViewMode;
  readonly isEmpty: boolean;
}

export function normalizeDiffResponse(response: DiffApiResponse): {
  readonly files: readonly DiffFile[];
  readonly stats: DiffStats;
} {
  const files = response.files ?? [];
  return {
    files,
    stats: {
      totalFiles: response.stats?.totalFiles ?? files.length,
      additions:
        response.stats?.additions ??
        files.reduce(
          (totalAdditions, diffFile) => totalAdditions + diffFile.additions,
          0,
        ),
      deletions:
        response.stats?.deletions ??
        files.reduce(
          (totalDeletions, diffFile) => totalDeletions + diffFile.deletions,
          0,
        ),
    },
  };
}

export function createDiffOverviewState(
  files: readonly DiffFile[],
  selectedPath: string | null,
  preferredViewMode: DiffViewMode = "side-by-side",
  stats: DiffStats | null = null,
): DiffOverviewState {
  const selectedFile =
    selectedPath !== null
      ? (files.find((diffFile) => diffFile.path === selectedPath) ??
        files[0] ??
        null)
      : (files[0] ?? null);

  const normalizedSelectedPath = selectedFile?.path ?? null;
  const normalizedStats =
    stats ??
    normalizeDiffResponse({
      files,
    }).stats;

  return {
    files,
    selectedPath: normalizedSelectedPath,
    selectedFile,
    stats: normalizedStats,
    preferredViewMode,
    isEmpty: files.length === 0,
  };
}
