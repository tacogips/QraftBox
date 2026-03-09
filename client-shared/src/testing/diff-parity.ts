import type { DiffApiResponse } from "../contracts/diff";
import { createFixtureRegistry, resolveScenarioFixtures } from "./fixtures";
import type { FrontendParityScenario } from "./parity";

export interface DiffParityFixturePayload {
  readonly endpoint: string;
  readonly status: number;
  readonly response: DiffApiResponse | { readonly error: string };
}

export interface DiffParityFixture {
  readonly id: string;
  readonly payload: DiffParityFixturePayload;
  readonly description?: string | undefined;
}

export const DIFF_PARITY_FIXTURES: readonly DiffParityFixture[] = [
  {
    id: "diff-populated",
    description: "Two changed files are available for the active workspace.",
    payload: {
      endpoint: "/api/ctx/ctx-alpha/diff",
      status: 200,
      response: {
        files: [
          {
            path: "src/main.ts",
            status: "modified",
            additions: 8,
            deletions: 3,
            chunks: [],
            isBinary: false,
          },
          {
            path: "README.md",
            status: "added",
            additions: 5,
            deletions: 0,
            chunks: [],
            isBinary: false,
          },
        ],
      },
    },
  },
  {
    id: "diff-empty",
    description: "The active workspace has no changed files.",
    payload: {
      endpoint: "/api/ctx/ctx-empty/diff",
      status: 200,
      response: {
        files: [],
      },
    },
  },
  {
    id: "diff-error",
    description: "The diff endpoint returns an actionable error message.",
    payload: {
      endpoint: "/api/ctx/ctx-error/diff",
      status: 500,
      response: {
        error: "diff backend offline",
      },
    },
  },
] as const;

export const DIFF_PARITY_SCENARIOS: readonly FrontendParityScenario[] = [
  {
    id: "diff-loading-state",
    screen: "files",
    apiFixtures: [],
    expectedText: ["Diff screen", "Loading diff..."],
    forbiddenText: ["No changed files are available for this workspace."],
  },
  {
    id: "diff-populated-state",
    screen: "files",
    apiFixtures: ["diff-populated"],
    expectedText: [
      "Diff screen",
      "Changed files: 2 | +13 | -3",
      "Selected file: src/main.ts (modified)",
      "src/main.ts",
      "README.md",
    ],
    forbiddenText: ["No changed files are available for this workspace."],
  },
  {
    id: "diff-empty-state",
    screen: "files",
    apiFixtures: ["diff-empty"],
    expectedText: [
      "Diff screen",
      "Selected file: none",
      "No changed files are available for this workspace.",
    ],
    forbiddenText: ["Failed to load diff:"],
  },
  {
    id: "diff-error-state",
    screen: "files",
    apiFixtures: ["diff-error"],
    expectedText: ["Diff screen", "Failed to load diff: diff backend offline"],
    forbiddenText: ["Loading diff..."],
  },
  {
    id: "diff-non-git-state",
    screen: "files",
    apiFixtures: [],
    expectedText: [
      "Diff screen",
      "Diff view is unavailable for non-Git workspaces.",
    ],
    forbiddenText: ["Loading diff...", "Failed to load diff:"],
  },
] as const;

const diffFixtureRegistry = createFixtureRegistry(DIFF_PARITY_FIXTURES);
const diffScenarioRegistry = createFixtureRegistry(DIFF_PARITY_SCENARIOS);

export function listDiffParityScenarios(): readonly FrontendParityScenario[] {
  return DIFF_PARITY_SCENARIOS;
}

export function resolveDiffParityScenario(
  scenarioId: string,
): FrontendParityScenario {
  const scenario = diffScenarioRegistry.get(scenarioId);
  if (scenario === undefined) {
    throw new Error(`Unknown diff parity scenario: ${scenarioId}`);
  }
  return scenario;
}

export function resolveDiffParityFixtures(
  scenarioId: string,
): readonly DiffParityFixture[] {
  const scenario = resolveDiffParityScenario(scenarioId);
  return resolveScenarioFixtures(scenario, diffFixtureRegistry);
}
