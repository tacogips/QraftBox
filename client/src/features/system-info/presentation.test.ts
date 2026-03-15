import { describe, expect, test } from "bun:test";
import {
  formatCompactNumber,
  getDailyTokenTotal,
  getRecentTokenTotal,
  getSortedSystemInfoActivity,
  getSystemInfoModelShortName,
} from "./presentation";

describe("system info presentation helpers", () => {
  test("formats compact counts for usage summaries", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(1_500)).toBe("1.5K");
  });

  test("sorts recent activity with the newest date first", () => {
    expect(
      getSortedSystemInfoActivity([
        { date: "2026-03-01" },
        { date: "2026-03-03" },
      ]).map((activity) => activity.date),
    ).toEqual(["2026-03-03", "2026-03-01"]);
  });

  test("aggregates recent token totals across activity entries", () => {
    expect(
      getDailyTokenTotal({
        date: "2026-03-09",
        tokensByModel: {
          "claude-opus-4-6": 120,
          "gpt-5.3-codex": 30,
        },
      }),
    ).toBe(150);
    expect(
      getRecentTokenTotal({
        totalSessions: 0,
        totalMessages: 0,
        firstSessionDate: null,
        lastComputedDate: null,
        modelUsage: {},
        recentDailyActivity: [
          { date: "2026-03-08", tokensByModel: { a: 10 } },
          { date: "2026-03-09", tokensByModel: { b: 15 } },
        ],
      }),
    ).toBe(25);
  });

  test("maps long model ids to compact labels when possible", () => {
    expect(getSystemInfoModelShortName("claude-opus-4-6-20260301")).toBe(
      "Opus 4.6",
    );
    expect(getSystemInfoModelShortName("custom-model")).toBe("custom-model");
  });
});
