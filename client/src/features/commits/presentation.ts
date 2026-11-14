import type {
  DiffChunk,
  DiffFile,
} from "../../../../client-shared/src/contracts/diff";
import type {
  CommitFileChange,
  CommitInfo,
} from "../../../../src/types/commit";

export function formatCommitRelativeDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1 ? "just now" : `${minutes} min ago`;
    }
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatCommitAbsoluteDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCommitStatusLabel(
  status: CommitFileChange["status"],
): string {
  switch (status) {
    case "A":
      return "Added";
    case "M":
      return "Modified";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
    case "C":
      return "Copied";
    default:
      return status;
  }
}

export function getCommitHeadline(message: string): string {
  return message.split("\n")[0] ?? message;
}

export function getCommitPreviewText(commit: CommitInfo): string {
  const trimmedBody = commit.body.trim();
  if (trimmedBody.length > 0) {
    return trimmedBody;
  }

  return `Authored by ${commit.author.name} on ${formatCommitAbsoluteDate(commit.date)}`;
}

export function getCommitListSummary(
  commits: readonly CommitInfo[],
  hasMore: boolean,
): string {
  if (commits.length === 0) {
    return "No commits loaded";
  }

  return `${commits.length} commit${commits.length === 1 ? "" : "s"}${
    hasMore ? " (more available)" : ""
  }`;
}

export function collectCommitDiffPreviewLines(
  diffFiles: readonly DiffFile[],
): readonly string[] {
  const previewLines: string[] = [];

  for (const diffFile of diffFiles) {
    previewLines.push(
      `${diffFile.path} | ${diffFile.status} | +${diffFile.additions} | -${diffFile.deletions}`,
    );

    if (diffFile.isBinary) {
      previewLines.push("Binary diff preview unavailable.");
      continue;
    }

    if (diffFile.chunks.length === 0) {
      previewLines.push("No diff preview available.");
      continue;
    }

    previewLines.push(...collectChunkPreviewLines(diffFile.chunks));
  }

  return previewLines;
}

function collectChunkPreviewLines(
  chunks: readonly DiffChunk[],
): readonly string[] {
  return chunks.flatMap((chunk) => [
    chunk.header,
    ...chunk.changes.map((change) => {
      const marker =
        change.type === "add" ? "+" : change.type === "delete" ? "-" : " ";
      const lineNumber = change.newLine ?? change.oldLine ?? 0;
      return `${marker}${lineNumber}: ${change.content}`;
    }),
  ]);
}
