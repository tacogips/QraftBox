import type { WorktreeInfo } from "../../../../client-shared/src/api/worktree";

function getPathBasename(path: string): string {
  const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
  const pathSegments = normalizedPath.split("/");
  return pathSegments.at(-1) ?? normalizedPath;
}

export function suggestDefaultWorktreeName(
  worktrees: readonly WorktreeInfo[],
): string {
  const usedNames = new Set(
    worktrees
      .filter((worktreeInfo) => !worktreeInfo.isMain)
      .map((worktreeInfo) => getPathBasename(worktreeInfo.path)),
  );

  let candidateNumber = 1;
  while (usedNames.has(`wt-${candidateNumber}`)) {
    candidateNumber += 1;
  }

  return `wt-${candidateNumber}`;
}
