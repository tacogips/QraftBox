import { describe, expect, test } from "bun:test";
import { createLatestActionDefaultsRequestGuard } from "./state";

describe("model-config screen state helpers", () => {
  test("marks older action-defaults requests as stale after a newer request", () => {
    const requestGuard = createLatestActionDefaultsRequestGuard();
    const firstRequest = requestGuard.issue("ctx-1");
    const secondRequest = requestGuard.issue("ctx-2");

    expect(requestGuard.isCurrent(firstRequest)).toBe(false);
    expect(requestGuard.isCurrent(secondRequest)).toBe(true);
  });

  test("invalidates in-flight action-defaults requests", () => {
    const requestGuard = createLatestActionDefaultsRequestGuard();
    const inFlightRequest = requestGuard.issue("ctx-1");

    requestGuard.invalidate();

    expect(requestGuard.isCurrent(inFlightRequest)).toBe(false);
  });
});
