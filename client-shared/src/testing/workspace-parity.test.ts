import { describe, expect, test } from "vitest";
import {
  createWorkspaceShellState,
  normalizeWorkspaceSnapshot,
} from "../contracts/workspace";
import {
  listWorkspaceParityScenarios,
  resolveWorkspaceParityFixtures,
  resolveWorkspaceParityScenario,
} from "./workspace-parity";

describe("workspace parity scenarios", () => {
  test("lists the shared workspace migration scenarios", () => {
    expect(
      listWorkspaceParityScenarios().map((scenario) => scenario.id),
    ).toEqual([
      "workspace-empty-state",
      "workspace-populated-state",
      "workspace-restricted-state",
    ]);
  });

  test("resolves the populated workspace scenario into shared API fixtures", () => {
    const fixtures = resolveWorkspaceParityFixtures(
      "workspace-populated-state",
    );

    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      "workspace-populated",
      "recent-gamma",
    ]);
    expect(fixtures.map((fixture) => fixture.payload.endpoint)).toEqual([
      "/api/workspace",
      "/api/workspace/recent",
    ]);
  });

  test("captures restricted workspace behavior in one shared scenario", () => {
    const scenario = resolveWorkspaceParityScenario(
      "workspace-restricted-state",
    );
    const fixtures = resolveWorkspaceParityFixtures(scenario.id);
    const workspaceFixture = fixtures.find(
      (fixture) => fixture.payload.endpoint === "/api/workspace",
    );
    const recentFixture = fixtures.find(
      (fixture) => fixture.payload.endpoint === "/api/workspace/recent",
    );

    expect(workspaceFixture).toBeDefined();
    expect(recentFixture).toBeDefined();

    const workspaceShellState = createWorkspaceShellState(
      normalizeWorkspaceSnapshot(
        workspaceFixture!.payload.response as Parameters<
          typeof normalizeWorkspaceSnapshot
        >[0],
      ),
      (
        recentFixture!.payload.response as {
          readonly recent?: readonly {
            readonly path: string;
            readonly name: string;
            readonly isGitRepo: boolean;
          }[];
        }
      ).recent ?? [],
    );

    expect(workspaceShellState.canManageProjects).toBe(false);
    expect(workspaceShellState.temporaryProjectMode).toBe(true);
    expect(scenario.forbiddenText).toContain("Open project");
  });

  test("rejects unknown workspace scenario ids", () => {
    expect(() => resolveWorkspaceParityScenario("missing-scenario")).toThrow(
      "Unknown workspace parity scenario: missing-scenario",
    );
  });
});
