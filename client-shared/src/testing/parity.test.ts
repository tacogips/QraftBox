import { describe, expect, test } from "vitest";
import { evaluateParityScenario } from "./parity";

describe("parity helpers", () => {
  test("passes when all expected text is present and forbidden text is absent", () => {
    const result = evaluateParityScenario(
      {
        id: "workspace-shell",
        screen: "project",
        apiFixtures: ["workspace.json"],
        expectedText: ["Workspace", "Recent Projects"],
        forbiddenText: ["Fatal Error"],
      },
      ["Workspace", "Recent Projects", "Open Project"],
      "solid",
    );

    expect(result).toEqual({
      scenarioId: "workspace-shell",
      target: "solid",
      passed: true,
      observations: [],
    });
  });

  test("reports missing and forbidden text observations", () => {
    const result = evaluateParityScenario(
      {
        id: "diff-empty",
        screen: "files",
        apiFixtures: ["diff-empty.json"],
        expectedText: ["Changed Files", "No changes"],
        forbiddenText: ["Unhandled Exception"],
      },
      ["Changed Files", "Unhandled Exception"],
      "svelte",
    );

    expect(result).toEqual({
      scenarioId: "diff-empty",
      target: "svelte",
      passed: false,
      observations: [
        "Missing expected text: No changes",
        "Unexpected text present: Unhandled Exception",
      ],
    });
  });
});
