import { describe, expect, test } from "bun:test";
import {
  listBrowserVerificationScenarios,
  resolveBrowserVerificationScenario,
} from "./browser-verification";

describe("browser verification scenarios", () => {
  test("lists the shared workspace and diff browser scenarios", () => {
    expect(
      listBrowserVerificationScenarios().map((scenario) => scenario.id),
    ).toEqual([
      "workspace-shared-git-state",
      "diff-shared-git-state",
      "diff-shared-non-git-state",
      "ai-session-shared-git-state",
      "commits-shared-git-state",
      "terminal-shared-git-state",
      "system-info-shared-git-state",
      "notifications-shared-git-state",
      "model-profiles-shared-git-state",
      "action-defaults-shared-git-state",
    ]);
  });

  test("resolves the non-git diff scenario with request guards", () => {
    expect(
      resolveBrowserVerificationScenario("diff-shared-non-git-state"),
    ).toEqual(
      expect.objectContaining({
        routeHash: "#/files",
        workspaceKind: "non-git",
      }),
    );
  });
});
