import { describe, expect, test } from "bun:test";
import {
  listDiffParityScenarios,
  resolveDiffParityFixtures,
  resolveDiffParityScenario,
} from "./diff-parity";

describe("diff parity scenarios", () => {
  test("lists the shared diff migration scenarios", () => {
    expect(listDiffParityScenarios().map((scenario) => scenario.id)).toEqual([
      "diff-loading-state",
      "diff-populated-state",
      "diff-empty-state",
      "diff-error-state",
      "diff-non-git-state",
    ]);
  });

  test("resolves the populated diff scenario into shared API fixtures", () => {
    const fixtures = resolveDiffParityFixtures("diff-populated-state");

    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]?.payload.endpoint).toBe("/api/ctx/ctx-alpha/diff");
    expect(fixtures[0]?.payload.status).toBe(200);
  });

  test("captures server error semantics in one shared scenario", () => {
    const scenario = resolveDiffParityScenario("diff-error-state");
    const fixtures = resolveDiffParityFixtures("diff-error-state");

    expect(scenario.expectedText).toContain(
      "Failed to load diff: diff backend offline",
    );
    expect(fixtures[0]?.payload.response).toEqual({
      error: "diff backend offline",
    });
  });

  test("rejects unknown diff scenario ids", () => {
    expect(() => resolveDiffParityScenario("diff-missing")).toThrow(
      "Unknown diff parity scenario: diff-missing",
    );
  });
});
