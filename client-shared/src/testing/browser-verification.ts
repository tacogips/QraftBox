export type BrowserVerificationScenarioId =
  | "workspace-shared-git-state"
  | "diff-shared-git-state"
  | "diff-shared-non-git-state"
  | "ai-session-shared-git-state"
  | "commits-shared-git-state"
  | "terminal-shared-git-state"
  | "system-info-shared-git-state"
  | "notifications-shared-git-state"
  | "model-profiles-shared-git-state"
  | "action-defaults-shared-git-state";

export interface BrowserVerificationScenarioDefinition {
  readonly id: BrowserVerificationScenarioId;
  readonly routeHash:
    | "#/project"
    | "#/files"
    | "#/ai-session"
    | "#/commits"
    | "#/terminal"
    | "#/system-info"
    | "#/notifications"
    | "#/model-profiles"
    | "#/action-defaults";
  readonly workspaceKind: "git" | "non-git";
  readonly checklist: readonly string[];
  readonly requiredTextSubstrings: readonly string[];
  readonly requiredApiPathSubstrings: readonly string[];
  readonly forbiddenApiPathSubstrings?: readonly string[] | undefined;
}

export const BROWSER_VERIFICATION_SCENARIOS: readonly BrowserVerificationScenarioDefinition[] =
  [
    {
      id: "workspace-shared-git-state",
      routeHash: "#/project",
      workspaceKind: "git",
      checklist: [
        "Serve the Svelte and Solid frontends from the same live workspace state.",
        "Load the project screen and confirm workspace bootstrap requests succeed.",
        "Keep the active project identity visible in both frontends.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
    {
      id: "diff-shared-git-state",
      routeHash: "#/files",
      workspaceKind: "git",
      checklist: [
        "Load the files screen against one shared Git-backed workspace state.",
        "Verify both frontends bootstrap the diff endpoint for the active context.",
        "Keep changed-file identity visible for the shared modified-file set.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
    {
      id: "diff-shared-non-git-state",
      routeHash: "#/files",
      workspaceKind: "non-git",
      checklist: [
        "Load the files screen against one shared non-Git workspace state.",
        "Confirm the route remains usable without issuing a diff bootstrap request.",
        "Keep the active non-Git project identity visible while the unsupported diff state is shown.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
    {
      id: "ai-session-shared-git-state",
      routeHash: "#/ai-session",
      workspaceKind: "git",
      checklist: [
        "Load the AI Sessions route in both frontends against the same Git workspace state.",
        "Confirm the history/composer overview renders without route-level errors.",
        "Keep the selected workspace context shared with the files workflow.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
    {
      id: "commits-shared-git-state",
      routeHash: "#/commits",
      workspaceKind: "git",
      checklist: [
        "Load the commits route in both frontends against the same Git workspace state.",
        "Confirm commit-history browsing is reachable without route-level errors.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
    {
      id: "terminal-shared-git-state",
      routeHash: "#/terminal",
      workspaceKind: "git",
      checklist: [
        "Load the terminal route in both frontends against the same Git workspace state.",
        "Confirm the terminal screen renders its interactive shell chrome.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
    {
      id: "system-info-shared-git-state",
      routeHash: "#/system-info",
      workspaceKind: "git",
      checklist: [
        "Load the system-info route in both frontends against the same backend state.",
        "Confirm the system-info summary renders its top-level heading.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
    {
      id: "notifications-shared-git-state",
      routeHash: "#/notifications",
      workspaceKind: "git",
      checklist: [
        "Load the notifications route in both frontends.",
        "Confirm notification-permission controls render without route-level errors.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
    {
      id: "model-profiles-shared-git-state",
      routeHash: "#/model-profiles",
      workspaceKind: "git",
      checklist: [
        "Load the model-profiles route in both frontends against the same backend state.",
        "Confirm profile-management UI renders without route-level errors.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
    {
      id: "action-defaults-shared-git-state",
      routeHash: "#/action-defaults",
      workspaceKind: "git",
      checklist: [
        "Load the action-defaults route in both frontends against the same backend state.",
        "Confirm default profile/prompt configuration UI renders without route-level errors.",
      ],
      requiredTextSubstrings: [],
      requiredApiPathSubstrings: [],
    },
  ] as const;

const browserVerificationScenarioMap: ReadonlyMap<
  BrowserVerificationScenarioId,
  BrowserVerificationScenarioDefinition
> = new Map(
  BROWSER_VERIFICATION_SCENARIOS.map((scenario) => [scenario.id, scenario]),
);

export function listBrowserVerificationScenarios(): readonly BrowserVerificationScenarioDefinition[] {
  return BROWSER_VERIFICATION_SCENARIOS;
}

export function resolveBrowserVerificationScenario(
  scenarioId: BrowserVerificationScenarioId,
): BrowserVerificationScenarioDefinition {
  const scenario = browserVerificationScenarioMap.get(scenarioId);
  if (scenario === undefined) {
    throw new Error(`Unknown browser verification scenario: ${scenarioId}`);
  }
  return scenario;
}
