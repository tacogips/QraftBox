import { describe, expect, test } from "bun:test";
import { resolveDiffLoadDecision } from "./load-decision";

describe("resolveDiffLoadDecision", () => {
  test("resets diff state outside the shared files context screens", () => {
    expect(
      resolveDiffLoadDecision({
        screen: "project",
        activeContextId: "ctx-alpha",
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual({
      type: "reset",
      unsupportedMessage: null,
    });
  });

  test("allows diff loading for the ai-session screen because it shares files context", () => {
    expect(
      resolveDiffLoadDecision({
        screen: "ai-session",
        activeContextId: "ctx-ai",
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual({
      type: "load",
      contextId: "ctx-ai",
      unsupportedMessage: null,
    });
  });

  test("resets diff state when no workspace context is active", () => {
    expect(
      resolveDiffLoadDecision({
        screen: "files",
        activeContextId: null,
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual({
      type: "reset",
      unsupportedMessage: null,
    });
  });

  test("marks non-git workspaces as unsupported", () => {
    expect(
      resolveDiffLoadDecision({
        screen: "files",
        activeContextId: "ctx-beta",
        activeWorkspaceIsGitRepo: false,
      }),
    ).toEqual({
      type: "unsupported",
      unsupportedMessage: "Diff view is unavailable for non-Git workspaces.",
    });
  });

  test("allows diff loading for git workspaces on the files screen", () => {
    expect(
      resolveDiffLoadDecision({
        screen: "files",
        activeContextId: "ctx-alpha",
        activeWorkspaceIsGitRepo: true,
      }),
    ).toEqual({
      type: "load",
      contextId: "ctx-alpha",
      unsupportedMessage: null,
    });
  });
});
