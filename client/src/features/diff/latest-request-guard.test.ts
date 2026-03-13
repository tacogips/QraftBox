import { describe, expect, test } from "bun:test";
import { createLatestRequestGuard } from "./latest-request-guard";

describe("createLatestRequestGuard", () => {
  test("tracks the most recent request id", () => {
    const latestRequestGuard = createLatestRequestGuard();
    const firstRequestId = latestRequestGuard.issue();
    const secondRequestId = latestRequestGuard.issue();

    expect(latestRequestGuard.isCurrent(firstRequestId)).toBe(false);
    expect(latestRequestGuard.isCurrent(secondRequestId)).toBe(true);
  });

  test("invalidates in-flight requests", () => {
    const latestRequestGuard = createLatestRequestGuard();
    const activeRequestId = latestRequestGuard.issue();

    latestRequestGuard.invalidate();

    expect(latestRequestGuard.isCurrent(activeRequestId)).toBe(false);
  });
});
