import { ownsDiffAndFilesContext } from "./shared-screen-context";

export type DiffLoadDecision =
  | {
      readonly type: "reset";
      readonly unsupportedMessage: null;
    }
  | {
      readonly type: "unsupported";
      readonly unsupportedMessage: string;
    }
  | {
      readonly type: "load";
      readonly contextId: string;
      readonly unsupportedMessage: null;
    };

export function resolveDiffLoadDecision(options: {
  readonly screen: string;
  readonly activeContextId: string | null;
  readonly activeWorkspaceIsGitRepo: boolean;
}): DiffLoadDecision {
  if (!ownsDiffAndFilesContext(options.screen)) {
    return {
      type: "reset",
      unsupportedMessage: null,
    };
  }

  if (options.activeContextId === null) {
    return {
      type: "reset",
      unsupportedMessage: null,
    };
  }

  if (!options.activeWorkspaceIsGitRepo) {
    return {
      type: "unsupported",
      unsupportedMessage: "Diff view is unavailable for non-Git workspaces.",
    };
  }

  return {
    type: "load",
    contextId: options.activeContextId,
    unsupportedMessage: null,
  };
}
