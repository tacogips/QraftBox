import { describe, expect, test } from "vitest";
import { createFixtureRegistry, resolveScenarioFixtures } from "./fixtures";

describe("fixture registry helpers", () => {
  test("creates a registry and resolves scenario fixture references", () => {
    const fixtureRegistry = createFixtureRegistry([
      {
        id: "workspace-empty",
        payload: { workspace: { tabs: [] } },
      },
      {
        id: "recent-empty",
        payload: { recent: [] },
      },
    ]);

    expect(
      resolveScenarioFixtures(
        {
          id: "workspace-empty-state",
          screen: "project",
          apiFixtures: ["workspace-empty", "recent-empty"],
          expectedText: ["Project"],
        },
        fixtureRegistry,
      ),
    ).toEqual([
      {
        id: "workspace-empty",
        payload: { workspace: { tabs: [] } },
      },
      {
        id: "recent-empty",
        payload: { recent: [] },
      },
    ]);
  });

  test("rejects duplicate fixture ids", () => {
    expect(() =>
      createFixtureRegistry([
        { id: "workspace-empty", payload: {} },
        { id: "workspace-empty", payload: {} },
      ]),
    ).toThrow("Duplicate fixture id: workspace-empty");
  });

  test("fails when a scenario references missing fixtures", () => {
    const fixtureRegistry = createFixtureRegistry([
      {
        id: "workspace-empty",
        payload: { workspace: { tabs: [] } },
      },
    ]);

    expect(() =>
      resolveScenarioFixtures(
        {
          id: "workspace-empty-state",
          screen: "project",
          apiFixtures: ["workspace-empty", "recent-empty"],
          expectedText: [],
        },
        fixtureRegistry,
      ),
    ).toThrow(
      "Missing fixtures for scenario 'workspace-empty-state': recent-empty",
    );
  });
});
