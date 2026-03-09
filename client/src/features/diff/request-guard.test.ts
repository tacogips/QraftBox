import { describe, expect, test } from "bun:test";
import { createLatestDiffRequestGuard } from "./request-guard";

describe("createLatestDiffRequestGuard", () => {
  test("treats the most recent request as current", () => {
    const requestGuard = createLatestDiffRequestGuard();
    const firstRequest = requestGuard.issue("ctx-alpha");

    expect(requestGuard.isCurrent(firstRequest)).toBe(true);
  });

  test("marks older requests as stale after a newer request starts", () => {
    const requestGuard = createLatestDiffRequestGuard();
    const firstRequest = requestGuard.issue("ctx-alpha");
    const secondRequest = requestGuard.issue("ctx-beta");

    expect(requestGuard.isCurrent(firstRequest)).toBe(false);
    expect(requestGuard.isCurrent(secondRequest)).toBe(true);
  });

  test("invalidates in-flight requests when the diff screen is left", () => {
    const requestGuard = createLatestDiffRequestGuard();
    const inFlightRequest = requestGuard.issue("ctx-alpha");

    requestGuard.invalidate();

    expect(requestGuard.isCurrent(inFlightRequest)).toBe(false);
  });
});
