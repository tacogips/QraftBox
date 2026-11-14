import { describe, expect, test } from "bun:test";
import {
  canRunPullRequestAction,
  extractPullRequestUrl,
  getPullRequestActionLabel,
  getPullRequestButtonLabel,
  resolvePullRequestBaseBranch,
  resolveSelectedPullRequestBaseBranch,
  shouldShowCancelGitActionButton,
  shouldShowGitActionsBar,
} from "./git-actions-state";

describe("diff git actions state helpers", () => {
  test("renders the git actions bar only for git workspaces with a project path", () => {
    expect(
      shouldShowGitActionsBar({
        isGitRepo: true,
        projectPath: "/repo",
      }),
    ).toBe(true);
    expect(
      shouldShowGitActionsBar({
        isGitRepo: false,
        projectPath: "/repo",
      }),
    ).toBe(false);
    expect(
      shouldShowGitActionsBar({
        isGitRepo: true,
        projectPath: "   ",
      }),
    ).toBe(false);
  });

  test("derives the correct pull request action label and availability", () => {
    expect(getPullRequestActionLabel(null)).toBe("Create PR");
    expect(getPullRequestActionLabel(42)).toBe("Update PR");
    expect(getPullRequestButtonLabel(null)).toBe("Create PR");
    expect(getPullRequestButtonLabel(42)).toBe("PR #42");
    expect(
      canRunPullRequestAction({
        operating: false,
        prLoading: false,
        prCanCreate: true,
        prNumber: null,
      }),
    ).toBe(true);
    expect(
      canRunPullRequestAction({
        operating: true,
        prLoading: false,
        prCanCreate: true,
        prNumber: null,
      }),
    ).toBe(false);
  });

  test("shows the cancel button only for cancellable ai actions", () => {
    expect(
      shouldShowCancelGitActionButton({
        operating: true,
        operationPhase: "committing",
        activeActionId: "action-1",
        cancellingOperation: false,
      }),
    ).toBe(true);
    expect(
      shouldShowCancelGitActionButton({
        operating: true,
        operationPhase: "pushing",
        activeActionId: "action-1",
        cancellingOperation: false,
      }),
    ).toBe(false);
  });

  test("resolves the pull request base branch and extracts github pr urls", () => {
    expect(
      resolvePullRequestBaseBranch({
        selectedBaseBranch: "develop",
        fallbackBaseBranch: "main",
      }),
    ).toBe("develop");
    expect(
      resolvePullRequestBaseBranch({
        selectedBaseBranch: "   ",
        fallbackBaseBranch: "release",
      }),
    ).toBe("release");
    expect(
      extractPullRequestUrl(
        "Created https://github.com/tacogips/QraftBox/pull/42 successfully",
      ),
    ).toBe("https://github.com/tacogips/QraftBox/pull/42");
  });

  test("preserves a selected pull request base branch when it remains valid", () => {
    expect(
      resolveSelectedPullRequestBaseBranch({
        selectedBaseBranch: "release",
        fallbackBaseBranch: "main",
        availableBaseBranches: ["main", "release", "develop"],
      }),
    ).toBe("release");
    expect(
      resolveSelectedPullRequestBaseBranch({
        selectedBaseBranch: "missing",
        fallbackBaseBranch: "develop",
        availableBaseBranches: ["main", "develop"],
      }),
    ).toBe("develop");
    expect(
      resolveSelectedPullRequestBaseBranch({
        selectedBaseBranch: "missing",
        fallbackBaseBranch: "unknown",
        availableBaseBranches: ["release", "develop"],
      }),
    ).toBe("release");
  });
});
