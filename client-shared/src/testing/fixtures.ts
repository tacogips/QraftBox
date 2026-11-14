import type { FrontendParityScenario } from "./parity";

export interface NamedFixture<TPayload> {
  readonly id: string;
  readonly payload: TPayload;
  readonly description?: string | undefined;
}

export function createFixtureRegistry<TFixture extends { readonly id: string }>(
  fixtures: readonly TFixture[],
): ReadonlyMap<string, TFixture> {
  const fixtureRegistry = new Map<string, TFixture>();

  for (const fixture of fixtures) {
    if (fixtureRegistry.has(fixture.id)) {
      throw new Error(`Duplicate fixture id: ${fixture.id}`);
    }

    fixtureRegistry.set(fixture.id, fixture);
  }

  return fixtureRegistry;
}

export function resolveScenarioFixtures<TFixture>(
  scenario: FrontendParityScenario,
  fixtureRegistry: ReadonlyMap<string, TFixture>,
): readonly TFixture[] {
  const resolvedFixtures: TFixture[] = [];
  const missingFixtureIds: string[] = [];

  for (const fixtureId of scenario.apiFixtures) {
    const fixture = fixtureRegistry.get(fixtureId);
    if (fixture === undefined) {
      missingFixtureIds.push(fixtureId);
      continue;
    }

    resolvedFixtures.push(fixture);
  }

  if (missingFixtureIds.length > 0) {
    throw new Error(
      `Missing fixtures for scenario '${scenario.id}': ${missingFixtureIds.join(", ")}`,
    );
  }

  return resolvedFixtures;
}
