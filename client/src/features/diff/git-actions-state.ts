import type { GitOperationPhase } from "../../../../client-shared/src/api/git-actions";

export interface GitActionsBarVisibilityOptions {
  readonly isGitRepo: boolean;
  readonly projectPath: string;
}

export interface PullRequestActionAvailabilityOptions {
  readonly operating: boolean;
  readonly prLoading: boolean;
  readonly prCanCreate: boolean;
  readonly prNumber: number | null;
}

export interface GitActionCancelOptions {
  readonly operating: boolean;
  readonly operationPhase: GitOperationPhase;
  readonly activeActionId: string | null;
  readonly cancellingOperation: boolean;
}

export function shouldShowGitActionsBar(
  options: GitActionsBarVisibilityOptions,
): boolean {
  return options.isGitRepo && options.projectPath.trim().length > 0;
}

export function getPullRequestActionLabel(prNumber: number | null): string {
  return prNumber === null ? "Create PR" : "Update PR";
}

export function getPullRequestButtonLabel(prNumber: number | null): string {
  return prNumber === null ? "Create PR" : `PR #${prNumber.toString()}`;
}

export function canRunPullRequestAction(
  options: PullRequestActionAvailabilityOptions,
): boolean {
  return (
    !options.operating &&
    !options.prLoading &&
    (options.prCanCreate || options.prNumber !== null)
  );
}

export function shouldShowCancelGitActionButton(
  options: GitActionCancelOptions,
): boolean {
  return (
    options.operating &&
    (options.operationPhase === "committing" ||
      options.operationPhase === "creating-pr") &&
    options.activeActionId !== null &&
    !options.cancellingOperation
  );
}

export function resolvePullRequestBaseBranch(options: {
  readonly selectedBaseBranch: string;
  readonly fallbackBaseBranch: string;
}): string {
  const selectedBaseBranch = options.selectedBaseBranch.trim();
  if (selectedBaseBranch.length > 0) {
    return selectedBaseBranch;
  }

  const fallbackBaseBranch = options.fallbackBaseBranch.trim();
  return fallbackBaseBranch.length > 0 ? fallbackBaseBranch : "main";
}

export function resolveSelectedPullRequestBaseBranch(options: {
  readonly selectedBaseBranch: string;
  readonly fallbackBaseBranch: string;
  readonly availableBaseBranches: readonly string[];
}): string {
  const selectedBaseBranch = options.selectedBaseBranch.trim();
  if (
    selectedBaseBranch.length > 0 &&
    options.availableBaseBranches.includes(selectedBaseBranch)
  ) {
    return selectedBaseBranch;
  }

  const fallbackBaseBranch = options.fallbackBaseBranch.trim();
  if (
    fallbackBaseBranch.length > 0 &&
    options.availableBaseBranches.includes(fallbackBaseBranch)
  ) {
    return fallbackBaseBranch;
  }

  const firstAvailableBaseBranch = options.availableBaseBranches[0]?.trim();
  if (
    firstAvailableBaseBranch !== undefined &&
    firstAvailableBaseBranch.length > 0
  ) {
    return firstAvailableBaseBranch;
  }

  return fallbackBaseBranch.length > 0 ? fallbackBaseBranch : "main";
}

export function extractPullRequestUrl(output: string): string | null {
  const pullRequestUrlMatch = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/.exec(
    output,
  );
  return pullRequestUrlMatch?.[0] ?? null;
}
