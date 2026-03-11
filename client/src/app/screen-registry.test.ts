import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SOLID_SUPPORT_STATUS,
  getImplementedSolidScreens,
  getInProgressSolidScreens,
  getNonImplementedSolidScreens,
  getOutstandingSolidSupportBlockers,
  getPlannedSolidScreens,
  getSolidScreenDefinition,
  getSolidSupportReport,
  SOLID_SUPPORT_CRITERIA,
} from "./screen-registry";

describe("screen registry", () => {
  test("tracks files as an implemented screen with parity blockers still open", () => {
    expect(getSolidScreenDefinition("files")).toMatchObject({
      implementationStatus: "implemented",
      implementationOrder: 2,
    });
  });

  test("separates implemented screens from still-in-progress screens", () => {
    expect(getInProgressSolidScreens()).toEqual([]);
    expect(getPlannedSolidScreens()).toEqual([]);
    expect(getNonImplementedSolidScreens()).toEqual([]);
  });

  test("deduplicates shared support blockers across in-progress and implemented screens", () => {
    expect(getOutstandingSolidSupportBlockers()).toEqual([
      {
        id: "solid-deps-missing",
        scope: "global",
        category: "build",
        summary:
          "client dependencies are not installed in this workspace, so nested Solid typecheck/build cannot run yet.",
      },
      {
        id: "solid-dist-missing",
        scope: "global",
        category: "build",
        summary:
          "dist/client/index.html is not built yet, so the Solid bundle cannot be served for browser parity checks.",
      },
      {
        id: "agent-browser-missing",
        scope: "global",
        category: "verification",
        summary:
          "agent-browser is not installed here, so the required browser verification loop is blocked.",
      },
      {
        id: "full-migration-check-pending",
        scope: "global",
        category: "verification",
        summary:
          "bun run check:frontend:migration has not yet been recorded as passing for the current Solid support baseline.",
      },
      {
        id: "browser-verification-not-recorded",
        scope: "global",
        category: "verification",
        summary:
          "Browser verification for the Solid and legacy Svelte support baseline has not yet been recorded from this workspace.",
      },
      {
        id: "files-parity-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The files screen still needs browser parity verification against the Svelte baseline for diff, empty, error, and non-Git states.",
      },
      {
        id: "ai-session-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The AI Sessions screen still needs browser parity verification for session browsing, prompt submission, resume, and cancellation flows.",
      },
      {
        id: "commits-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Commits screen still needs browser parity verification for pagination, expanded detail, diff preview, and non-Git fallback states.",
      },
      {
        id: "terminal-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Terminal screen still needs browser parity verification for reconnect, command input, disconnect, and terminal output flows.",
      },
      {
        id: "system-info-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The System Info screen still needs browser parity verification for loading, retry, and populated usage states.",
      },
      {
        id: "notifications-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Notifications screen still needs browser parity verification for permission request, denied, and unsupported flows.",
      },
      {
        id: "model-profiles-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Model Profiles screen still needs browser parity verification for create, edit, delete, and validation states.",
      },
      {
        id: "action-defaults-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Action Defaults screen still needs browser parity verification for model bindings, prompt defaults, and prompt editing flows.",
      },
    ]);
  });

  test("keeps global blockers visible even for implemented screens", () => {
    expect(getImplementedSolidScreens()).toContain("project");
    expect(getSolidScreenDefinition("project").blockers).toHaveLength(0);
    expect(getOutstandingSolidSupportBlockers()).toContainEqual(
      expect.objectContaining({
        id: "solid-dist-missing",
        scope: "global",
      }),
    );
  });

  test("can re-evaluate global blockers from environment status instead of hardcoded workspace assumptions", () => {
    expect(
      getOutstandingSolidSupportBlockers({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("solid-deps-missing");
    expect(
      getOutstandingSolidSupportBlockers({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("solid-dist-missing");
    expect(
      getOutstandingSolidSupportBlockers({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("agent-browser-missing");
    expect(
      getOutstandingSolidSupportBlockers({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("full-migration-check-pending");
    expect(
      getOutstandingSolidSupportBlockers({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("browser-verification-not-recorded");
  });

  test("builds a support summary that stays blocked until legacy-support gates pass", () => {
    expect(getSolidSupportReport()).toEqual({
      implementedScreenCount: 9,
      totalScreenCount: 9,
      remainingScreens: [],
      outstandingBlockers: getOutstandingSolidSupportBlockers(),
      criteria: [
        {
          id: "all-screens-implemented",
          summary:
            "All screen definitions are at implementationStatus=implemented.",
          status: "pass",
        },
        {
          id: "full-migration-check-passes",
          summary:
            "bun run check:frontend:migration passes, including nested Solid typecheck.",
          status: "blocked",
        },
        {
          id: "solid-bundle-built",
          summary:
            "The Solid bundle is built at dist/client/index.html and served successfully by the backend.",
          status: "blocked",
        },
        {
          id: "browser-verification-recorded",
          summary:
            "Browser verification is recorded for Svelte and Solid against the same backend state for workspace and diff flows.",
          status: "blocked",
        },
        {
          id: "no-open-blockers",
          summary:
            "No explicit legacy-support blocker remains open in the screen registry runtime status surface.",
          status: "blocked",
        },
      ],
    });
  });

  test("documents the post-cutover support criteria", () => {
    expect(SOLID_SUPPORT_CRITERIA).toContain(
      "All screen definitions are at implementationStatus=implemented.",
    );
    expect(SOLID_SUPPORT_CRITERIA).toContain(
      "bun run check:frontend:migration passes, including nested Solid typecheck.",
    );
  });

  test("marks the lower-complexity configuration screens as implemented", () => {
    expect(getImplementedSolidScreens()).toEqual([
      "project",
      "files",
      "ai-session",
      "commits",
      "terminal",
      "system-info",
      "notifications",
      "model-profiles",
      "action-defaults",
    ]);
  });

  test("keeps the full migration check criterion separate from bundle and dependency prerequisites", () => {
    expect(
      getSolidSupportReport({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: false,
        hasRecordedFullMigrationCheck: false,
        hasRecordedBrowserVerification: false,
      }).criteria.find(
        (criterion) => criterion.id === "full-migration-check-passes",
      ),
    ).toEqual({
      id: "full-migration-check-passes",
      summary:
        "bun run check:frontend:migration passes, including nested Solid typecheck.",
      status: "blocked",
    });

    expect(
      getSolidSupportReport({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: false,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: false,
      }).criteria.find(
        (criterion) => criterion.id === "full-migration-check-passes",
      ),
    ).toEqual({
      id: "full-migration-check-passes",
      summary:
        "bun run check:frontend:migration passes, including nested Solid typecheck.",
      status: "pass",
    });
  });

  test("keeps browser verification recording separate from browser-tool availability", () => {
    expect(
      getSolidSupportReport({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: false,
      }).criteria.find(
        (criterion) => criterion.id === "browser-verification-recorded",
      ),
    ).toEqual({
      id: "browser-verification-recorded",
      summary:
        "Browser verification is recorded for Svelte and Solid against the same backend state for workspace and diff flows.",
      status: "blocked",
    });

    expect(
      getSolidSupportReport({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).criteria.find(
        (criterion) => criterion.id === "browser-verification-recorded",
      ),
    ).toEqual({
      id: "browser-verification-recorded",
      summary:
        "Browser verification is recorded for Svelte and Solid against the same backend state for workspace and diff flows.",
      status: "pass",
    });
  });

  test("does not keep the browser-tool blocker once browser verification is already recorded", () => {
    expect(
      getOutstandingSolidSupportBlockers({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasAgentBrowser: false,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("agent-browser-missing");
  });

  test("marks repo-only verification criteria as not applicable outside a source checkout", () => {
    const supportReport = getSolidSupportReport({
      ...DEFAULT_SOLID_SUPPORT_STATUS,
      hasSourceCheckout: false,
      hasBuiltSolidBundle: true,
    });

    expect(
      supportReport.criteria.find(
        (criterion) => criterion.id === "full-migration-check-passes",
      ),
    ).toEqual({
      id: "full-migration-check-passes",
      summary:
        "bun run check:frontend:migration passes, including nested Solid typecheck.",
      status: "not-applicable",
    });
    expect(
      supportReport.criteria.find(
        (criterion) => criterion.id === "browser-verification-recorded",
      ),
    ).toEqual({
      id: "browser-verification-recorded",
      summary:
        "Browser verification is recorded for Svelte and Solid against the same backend state for workspace and diff flows.",
      status: "not-applicable",
    });
    expect(
      getOutstandingSolidSupportBlockers({
        ...DEFAULT_SOLID_SUPPORT_STATUS,
        hasSourceCheckout: false,
        hasBuiltSolidBundle: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("solid-deps-missing");
  });

  test("clears only the files-screen parity blocker once browser verification is recorded", () => {
    const blockerIds = getOutstandingSolidSupportBlockers({
      ...DEFAULT_SOLID_SUPPORT_STATUS,
      hasRecordedBrowserVerification: true,
    }).map((blocker) => blocker.id);

    expect(blockerIds).not.toContain("files-parity-browser-verification-pending");
    expect(blockerIds).toContain("ai-session-browser-verification-pending");
    expect(blockerIds).toContain("commits-browser-verification-pending");
    expect(blockerIds).toContain("terminal-browser-verification-pending");
    expect(blockerIds).toContain("system-info-browser-verification-pending");
    expect(blockerIds).toContain("notifications-browser-verification-pending");
    expect(blockerIds).toContain("model-profiles-browser-verification-pending");
    expect(blockerIds).toContain("action-defaults-browser-verification-pending");
  });

  test("keeps files parity blockers visible when browser markers are not applicable", () => {
    const blockerIds = getOutstandingSolidSupportBlockers({
      ...DEFAULT_SOLID_SUPPORT_STATUS,
      hasSourceCheckout: false,
      hasBuiltSolidBundle: true,
      hasRecordedBrowserVerification: true,
    }).map((blocker) => blocker.id);

    expect(blockerIds).toContain("files-parity-browser-verification-pending");
  });
});
