import type {
  ClaudeCodeUsage,
  DailyActivity,
} from "../../../../src/types/system-info";

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}

export function formatSystemInfoDate(dateValue: string): string {
  const parts = dateValue.split("-");
  if (parts.length === 3) {
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day)
    ) {
      return new Date(year, month - 1, day).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  }

  return new Date(dateValue).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getSystemInfoModelShortName(modelId: string): string {
  if (modelId.includes("opus-4-6")) {
    return "Opus 4.6";
  }
  if (modelId.includes("opus-4-5")) {
    return "Opus 4.5";
  }
  if (modelId.includes("sonnet-4-5")) {
    return "Sonnet 4.5";
  }
  if (modelId.includes("haiku")) {
    return "Haiku";
  }
  return modelId;
}

export function getSortedSystemInfoActivity(
  activities: readonly DailyActivity[],
): readonly DailyActivity[] {
  return [...activities].sort((left, right) =>
    right.date.localeCompare(left.date),
  );
}

export function getDailyTokenTotal(activity: DailyActivity): number {
  if (activity.tokensByModel === undefined) {
    return 0;
  }

  return Object.values(activity.tokensByModel).reduce(
    (sum, tokenCount) => sum + tokenCount,
    0,
  );
}

export function getRecentTokenTotal(usage: ClaudeCodeUsage | null): number {
  if (usage === null) {
    return 0;
  }

  return usage.recentDailyActivity.reduce(
    (sum, activity) => sum + getDailyTokenTotal(activity),
    0,
  );
}
