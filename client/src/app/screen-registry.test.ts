import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
  getImplementedSolidScreens,
  getInProgressSolidScreens,
  getNonImplementedSolidScreens,
  getSolidCutoverReadinessReport,
  getOutstandingSolidCutoverBlockers,
  getPlannedSolidScreens,
  getSolidScreenDefinition,
  SOLID_CUTOVER_CRITERIA,
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

  test("deduplicates shared cutover blockers across in-progress and implemented screens", () => {
    expect(getOutstandingSolidCutoverBlockers()).toEqual([
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
          "bun run check:frontend:migration has not yet been recorded as passing for the Solid migration.",
      },
      {
        id: "browser-verification-not-recorded",
        scope: "global",
        category: "verification",
        summary:
          "Browser verification for the Solid migration has not yet been recorded from this workspace.",
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
    expect(getOutstandingSolidCutoverBlockers()).toContainEqual(
      expect.objectContaining({
        id: "solid-dist-missing",
        scope: "global",
      }),
    );
  });

  test("can re-evaluate global blockers from environment status instead of hardcoded workspace assumptions", () => {
    expect(
      getOutstandingSolidCutoverBlockers({
        ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("solid-deps-missing");
    expect(
      getOutstandingSolidCutoverBlockers({
        ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("solid-dist-missing");
    expect(
      getOutstandingSolidCutoverBlockers({
        ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("agent-browser-missing");
    expect(
      getOutstandingSolidCutoverBlockers({
        ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("full-migration-check-pending");
    expect(
      getOutstandingSolidCutoverBlockers({
        ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }).map((blocker) => blocker.id),
    ).not.toContain("browser-verification-not-recorded");
  });

  test("builds a readiness summary that stays blocked until cutover gates pass", () => {
    expect(getSolidCutoverReadinessReport()).toEqual({
      implementedScreenCount: 9,
      totalScreenCount: 9,
      remainingScreens: [],
      outstandingBlockers: getOutstandingSolidCutoverBlockers(),
      criteria: [
        {
          id: "all-screens-implemented",
          summary:
            "All screen definitions are at implementationStatus=implemented.",
          isSatisfied: true,
        },
        {
          id: "full-migration-check-passes",
          summary:
            "bun run check:frontend:migration passes, including nested Solid typecheck.",
          isSatisfied: false,
        },
        {
          id: "solid-bundle-built",
          summary:
            "The Solid bundle is built at dist/client/index.html and served successfully by the backend.",
          isSatisfied: false,
        },
        {
          id: "browser-verification-recorded",
          summary:
            "Browser verification is recorded for Svelte and Solid against the same backend state for workspace and diff flows.",
          isSatisfied: false,
        },
        {
          id: "no-open-blockers",
          summary:
            "No explicit cutover blocker remains open in the screen registry or implementation plan.",
          isSatisfied: false,
        },
      ],
    });
  });

  test("documents the default-frontend cutover criteria", () => {
    expect(SOLID_CUTOVER_CRITERIA).toContain(
      "All screen definitions are at implementationStatus=implemented.",
    );
    expect(SOLID_CUTOVER_CRITERIA).toContain(
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
      getSolidCutoverReadinessReport({
        ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
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
      isSatisfied: false,
    });

    expect(
      getSolidCutoverReadinessReport({
        ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
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
      isSatisfied: true,
    });
  });

  test("keeps browser verification recording separate from browser-tool availability", () => {
    expect(
      getSolidCutoverReadinessReport({
        ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
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
      isSatisfied: false,
    });

    expect(
      getSolidCutoverReadinessReport({
        ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
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
      isSatisfied: true,
    });
  });

  test("clears the files-screen parity blocker once browser verification is recorded", () => {
    const blockerIds = getOutstandingSolidCutoverBlockers({
      ...DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
      hasRecordedBrowserVerification: true,
    }).map((blocker) => blocker.id);

    expect(blockerIds).not.toContain("files-parity-browser-verification-pending");
    expect(blockerIds).not.toContain("ai-session-browser-verification-pending");
    expect(blockerIds).not.toContain("commits-browser-verification-pending");
    expect(blockerIds).not.toContain("terminal-browser-verification-pending");
    expect(blockerIds).not.toContain("system-info-browser-verification-pending");
    expect(blockerIds).not.toContain("notifications-browser-verification-pending");
    expect(blockerIds).not.toContain("model-profiles-browser-verification-pending");
    expect(blockerIds).not.toContain("action-defaults-browser-verification-pending");
  });
});
