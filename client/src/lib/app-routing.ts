export type ScreenType =
  | "files"
  | "ai-session"
  | "commits"
  | "terminal"
  | "sessions"
  | "project"
  | "tools"
  | "system-info"
  | "model-config";

export const VALID_SCREENS: ReadonlySet<string> = new Set([
  "files",
  "ai-session",
  "commits",
  "terminal",
  "sessions",
  "project",
  "tools",
  "system-info",
  "model-config",
]);

export function parseHash(hashValue: string): {
  slug: string | null;
  screen: ScreenType;
} {
  const hash = hashValue.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);

  if (parts.length >= 2) {
    const slug = parts[0] ?? null;
    const page = parts[1] ?? "files";
    return {
      slug,
      screen: VALID_SCREENS.has(page) ? (page as ScreenType) : "files",
    };
  }

  if (parts.length === 1) {
    const single = parts[0] ?? "";
    if (VALID_SCREENS.has(single)) {
      return { slug: null, screen: single as ScreenType };
    }
    return { slug: single, screen: "files" };
  }

  return { slug: null, screen: "files" };
}

export function screenFromHash(hashValue: string): ScreenType {
  return parseHash(hashValue).screen;
}

export function buildScreenHash(
  slug: string | null,
  screen: ScreenType,
): string {
  return slug !== null ? `#/${slug}/${screen}` : `#/${screen}`;
}
