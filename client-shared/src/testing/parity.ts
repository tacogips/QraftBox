import type { AppScreen } from "../contracts/navigation";

export type FrontendParityTarget = "svelte" | "solid";

export interface FrontendParityScenario {
  readonly id: string;
  readonly screen: AppScreen;
  readonly apiFixtures: readonly string[];
  readonly expectedText: readonly string[];
  readonly forbiddenText?: readonly string[] | undefined;
}

export interface FrontendParityResult {
  readonly scenarioId: string;
  readonly target: FrontendParityTarget;
  readonly passed: boolean;
  readonly observations: readonly string[];
}

export function evaluateParityScenario(
  scenario: FrontendParityScenario,
  observedText: readonly string[],
  target: FrontendParityTarget,
): FrontendParityResult {
  const observedTextSet = new Set(observedText);
  const observations: string[] = [];

  for (const expectedText of scenario.expectedText) {
    if (!observedTextSet.has(expectedText)) {
      observations.push(`Missing expected text: ${expectedText}`);
    }
  }

  for (const forbiddenText of scenario.forbiddenText ?? []) {
    if (observedTextSet.has(forbiddenText)) {
      observations.push(`Unexpected text present: ${forbiddenText}`);
    }
  }

  return {
    scenarioId: scenario.id,
    target,
    passed: observations.length === 0,
    observations,
  };
}
