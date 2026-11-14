import { describe, expect, test } from "bun:test";
import { evaluateParityScenario } from "../../../../client-shared/src/testing/parity";
import {
  resolveWorkspaceParityFixtures,
  resolveWorkspaceParityScenario,
} from "../../../../client-shared/src/testing/workspace-parity";
import type { RecentProjectsApiResponse } from "../../../../client-shared/src/api/workspace";
import {
  createWorkspaceShellState,
  filterAvailableRecentProjects,
  normalizeWorkspaceSnapshot,
  type WorkspaceApiResponse,
} from "../../../../client-shared/src/contracts/workspace";
import { collectWorkspaceShellText } from "./presentation";

function collectScenarioText(
  scenarioId: string,
): ReturnType<typeof collectWorkspaceShellText> {
  const fixtures = resolveWorkspaceParityFixtures(scenarioId);
  const workspaceFixture = fixtures.find(
    (fixture) => fixture.payload.endpoint === "/api/workspace",
  );
  const recentFixture = fixtures.find(
    (fixture) => fixture.payload.endpoint === "/api/workspace/recent",
  );

  if (workspaceFixture === undefined || recentFixture === undefined) {
    throw new Error(`Scenario '${scenarioId}' is missing required fixtures`);
  }

  const workspaceSnapshot = normalizeWorkspaceSnapshot(
    workspaceFixture.payload.response as WorkspaceApiResponse,
  );
  const recentProjects =
    (recentFixture.payload.response as RecentProjectsApiResponse).recent ?? [];
  const workspaceShellState = createWorkspaceShellState(
    workspaceSnapshot,
    recentProjects,
  );

  return collectWorkspaceShellText(
    workspaceShellState,
    filterAvailableRecentProjects(workspaceShellState.tabs, recentProjects),
  );
}

describe("solid workspace shell parity presentation", () => {
  test.each([
    "workspace-empty-state",
    "workspace-populated-state",
    "workspace-restricted-state",
  ])("matches shared parity expectations for %s", (scenarioId) => {
    const scenario = resolveWorkspaceParityScenario(scenarioId);
    const observedText = collectScenarioText(scenarioId);
    const result = evaluateParityScenario(scenario, observedText, "solid");

    expect(result).toEqual({
      scenarioId,
      target: "solid",
      passed: true,
      observations: [],
    });
  });

  test("includes the active project path and open-project controls for the populated scenario", () => {
    const observedText = collectScenarioText("workspace-populated-state");

    expect(observedText).toContain("Active project: /repos/alpha");
    expect(observedText).toContain("Open project");
    expect(observedText).toContain("/repos/gamma");
  });
});
