import type { RecentProjectsApiResponse } from "../api/workspace";
import type { WorkspaceApiResponse } from "../contracts/workspace";
import { createFixtureRegistry, resolveScenarioFixtures } from "./fixtures";
import type { FrontendParityScenario } from "./parity";

export interface WorkspaceParityFixturePayload {
  readonly endpoint: "/api/workspace" | "/api/workspace/recent";
  readonly response: WorkspaceApiResponse | RecentProjectsApiResponse;
}

export interface WorkspaceParityFixture {
  readonly id: string;
  readonly payload: WorkspaceParityFixturePayload;
  readonly description?: string | undefined;
}

export const WORKSPACE_PARITY_FIXTURES: readonly WorkspaceParityFixture[] = [
  {
    id: "workspace-empty",
    description: "No open tabs and default management settings.",
    payload: {
      endpoint: "/api/workspace",
      response: {
        workspace: {
          tabs: [],
          activeTabId: null,
        },
      },
    },
  },
  {
    id: "recent-empty",
    description: "No recent projects available.",
    payload: {
      endpoint: "/api/workspace/recent",
      response: {
        recent: [],
      },
    },
  },
  {
    id: "workspace-populated",
    description: "Two open tabs with the first tab active.",
    payload: {
      endpoint: "/api/workspace",
      response: {
        workspace: {
          tabs: [
            {
              id: "ctx-alpha",
              path: "/repos/alpha",
              name: "alpha",
              isGitRepo: true,
              projectSlug: "alpha",
            },
            {
              id: "ctx-beta",
              path: "/repos/beta",
              name: "beta",
              isGitRepo: true,
              projectSlug: "beta",
            },
          ],
          activeTabId: "ctx-alpha",
        },
      },
    },
  },
  {
    id: "recent-gamma",
    description: "One recent project remains available for reopening.",
    payload: {
      endpoint: "/api/workspace/recent",
      response: {
        recent: [
          {
            path: "/repos/gamma",
            name: "gamma",
            isGitRepo: true,
          },
        ],
      },
    },
  },
  {
    id: "workspace-restricted",
    description: "Temporary project mode with project management disabled.",
    payload: {
      endpoint: "/api/workspace",
      response: {
        workspace: {
          tabs: [
            {
              id: "ctx-tmp",
              path: "/tmp/session",
              name: "session",
              isGitRepo: false,
              projectSlug: "session",
            },
          ],
          activeTabId: "ctx-tmp",
        },
        metadata: {
          temporaryProjectMode: true,
          canManageProjects: false,
        },
      },
    },
  },
] as const;

export const WORKSPACE_PARITY_SCENARIOS: readonly FrontendParityScenario[] = [
  {
    id: "workspace-empty-state",
    screen: "project",
    apiFixtures: ["workspace-empty", "recent-empty"],
    expectedText: [
      "Workspace shell",
      "No open workspace tabs.",
      "No recent projects recorded by the server.",
    ],
    forbiddenText: ["Temporary project mode is active."],
  },
  {
    id: "workspace-populated-state",
    screen: "project",
    apiFixtures: ["workspace-populated", "recent-gamma"],
    expectedText: [
      "Workspace shell",
      "Open tabs",
      "Active project: /repos/alpha",
    ],
    forbiddenText: ["No tabs are open yet."],
  },
  {
    id: "workspace-restricted-state",
    screen: "project",
    apiFixtures: ["workspace-restricted", "recent-empty"],
    expectedText: [
      "Workspace shell",
      "Management mode: restricted",
      "Temporary project mode is active.",
    ],
    forbiddenText: ["Open project"],
  },
] as const;

const workspaceFixtureRegistry = createFixtureRegistry(
  WORKSPACE_PARITY_FIXTURES,
);
const workspaceScenarioRegistry = createFixtureRegistry(
  WORKSPACE_PARITY_SCENARIOS,
);

export function listWorkspaceParityScenarios(): readonly FrontendParityScenario[] {
  return WORKSPACE_PARITY_SCENARIOS;
}

export function resolveWorkspaceParityScenario(
  scenarioId: string,
): FrontendParityScenario {
  const scenario = workspaceScenarioRegistry.get(scenarioId);
  if (scenario === undefined) {
    throw new Error(`Unknown workspace parity scenario: ${scenarioId}`);
  }
  return scenario;
}

export function resolveWorkspaceParityFixtures(
  scenarioId: string,
): readonly WorkspaceParityFixture[] {
  const scenario = resolveWorkspaceParityScenario(scenarioId);
  return resolveScenarioFixtures(scenario, workspaceFixtureRegistry);
}
