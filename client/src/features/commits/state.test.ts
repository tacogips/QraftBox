import { describe, expect, test } from "bun:test";
import { applyCommitSearchDraft, buildAppliedCommitSearchQuery } from "./state";

describe("commit search state helpers", () => {
  test("keeps draft text separate from the applied backend filter", () => {
    const appliedSearchQuery = applyCommitSearchDraft("  fix stale diff  ");

    expect(appliedSearchQuery).toBe("fix stale diff");
    expect(buildAppliedCommitSearchQuery(appliedSearchQuery)).toBe(
      "fix stale diff",
    );
    expect(buildAppliedCommitSearchQuery("")).toBeUndefined();
  });
});
