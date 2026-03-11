import type { AppScreen } from "../../../client-shared/src/contracts/navigation";
import type { SolidSupportStatus } from "../../../client-shared/src/contracts/frontend-status";
import { SOURCE_CHECKOUT_SOLID_SUPPORT_STATUS } from "./support-status";

export type SolidScreenImplementationStatus =
  | "implemented"
  | "in-progress"
  | "planned";

export interface SolidScreenParityGate {
  readonly summary: string;
  readonly checks: readonly string[];
}

export interface SolidSupportBlocker {
  readonly id: string;
  readonly scope: "global" | "screen";
  readonly category:
    | "build"
    | "verification"
    | "implementation"
    | "parity"
    | "environment";
  readonly summary: string;
}

export interface SolidScreenDefinition {
  readonly screen: AppScreen;
  readonly label: string;
  readonly implementationStatus: SolidScreenImplementationStatus;
  readonly implementationOrder: number;
  readonly parityGate: SolidScreenParityGate;
  readonly blockers: readonly SolidSupportBlocker[];
}

export interface SolidSupportCriterion {
  readonly id: string;
  readonly summary: string;
  readonly status: "pass" | "blocked" | "not-applicable";
}

export interface SolidSupportReport {
  readonly implementedScreenCount: number;
  readonly totalScreenCount: number;
  readonly remainingScreens: readonly AppScreen[];
  readonly outstandingBlockers: readonly SolidSupportBlocker[];
  readonly criteria: readonly SolidSupportCriterion[];
}

export const DEFAULT_SOLID_SUPPORT_STATUS = SOURCE_CHECKOUT_SOLID_SUPPORT_STATUS;

const NO_EXTRA_BLOCKERS: readonly SolidSupportBlocker[] = [];

export const SOLID_SCREEN_DEFINITIONS: readonly SolidScreenDefinition[] = [
  {
    screen: "project",
    label: "Project",
    implementationStatus: "implemented",
    implementationOrder: 1,
    parityGate: {
      summary: "Workspace shell parity",
      checks: [
        "Open, activate, and close project tabs against live workspace data.",
        "Keep route-to-workspace reconciliation aligned with shared navigation contracts.",
        "Preserve empty, populated, and restricted workspace states.",
      ],
    },
    blockers: NO_EXTRA_BLOCKERS,
  },
  {
    screen: "files",
    label: "Files",
    implementationStatus: "implemented",
    implementationOrder: 2,
    parityGate: {
      summary: "Diff browsing parity",
      checks: [
        "Keep the live file tree, viewer, and diff-centric actions usable end to end in Solid.",
        "Refresh the active diff through watcher-triggered and focus/visibility git-state updates without regressing non-Git behavior.",
        "Verify diff parity in the browser for populated, empty, error, and unsupported states.",
      ],
    },
    blockers: [
      {
        id: "files-parity-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The files screen still needs browser parity verification against the Svelte baseline for diff, empty, error, and non-Git states.",
      },
    ],
  },
  {
    screen: "ai-session",
    label: "AI Sessions",
    implementationStatus: "implemented",
    implementationOrder: 3,
    parityGate: {
      summary: "Session browsing parity",
      checks: [
        "Render active, queued, and recently completed sessions from live backend state.",
        "Preserve prompt submission, resume, and cancellation actions.",
        "Keep file-context navigation aligned with the shared workspace and files routing state.",
      ],
    },
    blockers: [
      {
        id: "ai-session-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The AI Sessions screen still needs browser parity verification for session browsing, prompt submission, resume, and cancellation flows.",
      },
    ],
  },
  {
    screen: "commits",
    label: "Commits",
    implementationStatus: "implemented",
    implementationOrder: 4,
    parityGate: {
      summary: "Commit history parity",
      checks: [
        "Render commit list pagination, search, and detail expansion from the existing API.",
        "Preserve inline commit diff inspection semantics.",
        "Verify non-Git workspaces remain explicitly unsupported.",
      ],
    },
    blockers: [
      {
        id: "commits-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Commits screen still needs browser parity verification for pagination, expanded detail, diff preview, and non-Git fallback states.",
      },
    ],
  },
  {
    screen: "terminal",
    label: "Terminal",
    implementationStatus: "implemented",
    implementationOrder: 5,
    parityGate: {
      summary: "Terminal session parity",
      checks: [
        "Reuse the current terminal session lifecycle and reconnect behavior.",
        "Preserve resize, reconnect, and session reuse semantics.",
        "Verify terminal interactions against the same backend terminal session state.",
      ],
    },
    blockers: [
      {
        id: "terminal-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Terminal screen still needs browser parity verification for reconnect, command input, disconnect, and terminal output flows.",
      },
    ],
  },
  {
    screen: "system-info",
    label: "System Info",
    implementationStatus: "implemented",
    implementationOrder: 6,
    parityGate: {
      summary: "System info parity",
      checks: [
        "Render tool versions, model bindings, and usage summaries from /api/system-info.",
        "Preserve loading, retry, and error states.",
      ],
    },
    blockers: [
      {
        id: "system-info-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The System Info screen still needs browser parity verification for loading, retry, and populated usage states.",
      },
    ],
  },
  {
    screen: "notifications",
    label: "Notifications",
    implementationStatus: "implemented",
    implementationOrder: 7,
    parityGate: {
      summary: "Notification preference parity",
      checks: [
        "Match browser-permission detection and request flows.",
        "Keep unsupported-browser messaging explicit.",
      ],
    },
    blockers: [
      {
        id: "notifications-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Notifications screen still needs browser parity verification for permission request, denied, and unsupported flows.",
      },
    ],
  },
  {
    screen: "model-profiles",
    label: "Model Profiles",
    implementationStatus: "implemented",
    implementationOrder: 8,
    parityGate: {
      summary: "Model profile parity",
      checks: [
        "Render profile list and editing flows from the existing configuration API.",
        "Preserve validation and active-profile semantics used by AI actions.",
      ],
    },
    blockers: [
      {
        id: "model-profiles-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Model Profiles screen still needs browser parity verification for create, edit, delete, and validation states.",
      },
    ],
  },
  {
    screen: "action-defaults",
    label: "Action Defaults",
    implementationStatus: "implemented",
    implementationOrder: 9,
    parityGate: {
      summary: "Action default parity",
      checks: [
        "Render per-context default bindings from the model configuration API.",
        "Preserve save, reset, and validation semantics while legacy fallback remains supported.",
      ],
    },
    blockers: [
      {
        id: "action-defaults-browser-verification-pending",
        scope: "screen",
        category: "parity",
        summary:
          "The Action Defaults screen still needs browser parity verification for model bindings, prompt defaults, and prompt editing flows.",
      },
    ],
  },
] as const;

const SCREEN_DEFINITION_MAP: Readonly<
  Record<AppScreen, SolidScreenDefinition>
> = SOLID_SCREEN_DEFINITIONS.reduce(
  (definitionsByScreen, definition) => ({
    ...definitionsByScreen,
    [definition.screen]: definition,
  }),
  {} as Record<AppScreen, SolidScreenDefinition>,
);

export const SOLID_SUPPORT_CRITERIA: readonly string[] = [
  "All screen definitions are at implementationStatus=implemented.",
  "bun run check:frontend:migration passes, including nested Solid typecheck.",
  "The Solid bundle is built at dist/client/index.html and served successfully by the backend.",
  "Browser verification is recorded for Svelte and Solid against the same backend state for workspace and diff flows.",
  "No explicit legacy-support blocker remains open in the screen registry runtime status surface.",
];

export const SOLID_SUPPORT_CRITERION_DEFINITIONS: readonly Pick<
  SolidSupportCriterion,
  "id" | "summary"
>[] = [
  {
    id: "all-screens-implemented",
    summary: SOLID_SUPPORT_CRITERIA[0],
  },
  {
    id: "full-migration-check-passes",
    summary: SOLID_SUPPORT_CRITERIA[1],
  },
  {
    id: "solid-bundle-built",
    summary: SOLID_SUPPORT_CRITERIA[2],
  },
  {
    id: "browser-verification-recorded",
    summary: SOLID_SUPPORT_CRITERIA[3],
  },
  {
    id: "no-open-blockers",
    summary: SOLID_SUPPORT_CRITERIA[4],
  },
] as const;

export function getSolidScreenDefinition(
  screen: AppScreen,
): SolidScreenDefinition {
  return SCREEN_DEFINITION_MAP[screen];
}

export function getImplementedSolidScreens(): readonly AppScreen[] {
  return SOLID_SCREEN_DEFINITIONS.filter(
    (definition) => definition.implementationStatus === "implemented",
  ).map((definition) => definition.screen);
}

export function getInProgressSolidScreens(): readonly AppScreen[] {
  return SOLID_SCREEN_DEFINITIONS.filter(
    (definition) => definition.implementationStatus === "in-progress",
  ).map((definition) => definition.screen);
}

export function getPlannedSolidScreens(): readonly AppScreen[] {
  return SOLID_SCREEN_DEFINITIONS.filter(
    (definition) => definition.implementationStatus === "planned",
  ).map((definition) => definition.screen);
}

export function getNonImplementedSolidScreens(): readonly AppScreen[] {
  return SOLID_SCREEN_DEFINITIONS.filter(
    (definition) => definition.implementationStatus !== "implemented",
  ).map((definition) => definition.screen);
}

function getGlobalSolidSupportBlockers(
  supportStatus: SolidSupportStatus,
): readonly SolidSupportBlocker[] {
  const blockers: SolidSupportBlocker[] = [];

  if (supportStatus.hasSourceCheckout && !supportStatus.hasClientSolidDependencies) {
    blockers.push({
      id: "solid-deps-missing",
      scope: "global",
      category: "build",
      summary:
        "client dependencies are not installed in this workspace, so nested Solid typecheck/build cannot run yet.",
    });
  }

  if (!supportStatus.hasBuiltSolidBundle) {
    blockers.push({
      id: "solid-dist-missing",
      scope: "global",
      category: "build",
      summary:
        "dist/client/index.html is not built yet, so the Solid bundle cannot be served for browser parity checks.",
    });
  }

  if (
    supportStatus.hasSourceCheckout &&
    !supportStatus.hasAgentBrowser &&
    !supportStatus.hasRecordedBrowserVerification
  ) {
    blockers.push({
      id: "agent-browser-missing",
      scope: "global",
      category: "verification",
      summary:
        "agent-browser is not installed here, so the required browser verification loop is blocked.",
    });
  }

  if (
    supportStatus.hasSourceCheckout &&
    !supportStatus.hasRecordedFullMigrationCheck
  ) {
    blockers.push({
      id: "full-migration-check-pending",
      scope: "global",
      category: "verification",
      summary:
        "bun run check:frontend:migration has not yet been recorded as passing for the current Solid support baseline.",
    });
  }

  if (
    supportStatus.hasSourceCheckout &&
    !supportStatus.hasRecordedBrowserVerification
  ) {
    blockers.push({
      id: "browser-verification-not-recorded",
      scope: "global",
      category: "verification",
      summary:
        "Browser verification for the Solid and legacy Svelte support baseline has not yet been recorded from this workspace.",
    });
  }

  return blockers;
}

function getScreenSpecificSolidSupportBlockers(
  definition: SolidScreenDefinition,
  supportStatus: SolidSupportStatus,
): readonly SolidSupportBlocker[] {
  if (
    supportStatus.hasSourceCheckout &&
    supportStatus.hasRecordedBrowserVerification
  ) {
    const browserVerifiedBlockerIds = new Set([
      "files-parity-browser-verification-pending",
    ]);

    return definition.blockers.filter(
      (blocker) => browserVerifiedBlockerIds.has(blocker.id) === false,
    );
  }

  return definition.blockers;
}

export function getOutstandingSolidSupportBlockers(
  supportStatus: SolidSupportStatus = DEFAULT_SOLID_SUPPORT_STATUS,
): readonly SolidSupportBlocker[] {
  const blockersById = new Map<string, SolidSupportBlocker>();

  for (const blocker of getGlobalSolidSupportBlockers(supportStatus)) {
    blockersById.set(blocker.id, blocker);
  }

  for (const definition of SOLID_SCREEN_DEFINITIONS) {
    for (const blocker of getScreenSpecificSolidSupportBlockers(
      definition,
      supportStatus,
    )) {
      blockersById.set(blocker.id, blocker);
    }
  }

  if (blockersById.size === 0) {
    return NO_EXTRA_BLOCKERS;
  }

  return Array.from(blockersById.values());
}

export function getSolidSupportReport(
  supportStatus: SolidSupportStatus = DEFAULT_SOLID_SUPPORT_STATUS,
): SolidSupportReport {
  const remainingScreens = getNonImplementedSolidScreens();
  const outstandingBlockers = getOutstandingSolidSupportBlockers(supportStatus);

  return {
    implementedScreenCount:
      SOLID_SCREEN_DEFINITIONS.length - remainingScreens.length,
    totalScreenCount: SOLID_SCREEN_DEFINITIONS.length,
    remainingScreens,
    outstandingBlockers,
    criteria: SOLID_SUPPORT_CRITERION_DEFINITIONS.map((criterion) => ({
      ...criterion,
      status:
        criterion.id === "all-screens-implemented"
          ? remainingScreens.length === 0
            ? "pass"
            : "blocked"
          : criterion.id === "full-migration-check-passes"
            ? supportStatus.hasSourceCheckout
              ? supportStatus.hasRecordedFullMigrationCheck
                ? "pass"
                : "blocked"
              : "not-applicable"
            : criterion.id === "solid-bundle-built"
              ? supportStatus.hasBuiltSolidBundle
                ? "pass"
                : "blocked"
              : criterion.id === "browser-verification-recorded"
                ? supportStatus.hasSourceCheckout
                  ? supportStatus.hasRecordedBrowserVerification
                    ? "pass"
                    : "blocked"
                  : "not-applicable"
                : criterion.id === "no-open-blockers"
                  ? outstandingBlockers.length === 0
                    ? "pass"
                    : "blocked"
                  : "blocked",
    })),
  };
}
