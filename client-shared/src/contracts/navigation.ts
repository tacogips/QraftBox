export const APP_SCREENS = [
  "files",
  "ai-session",
  "commits",
  "terminal",
  "project",
  "system-info",
  "notifications",
  "model-profiles",
  "action-defaults",
] as const;

export type AppScreen = (typeof APP_SCREENS)[number];

export const DEFAULT_APP_SCREEN: AppScreen = "files";

export const VALID_APP_SCREENS: ReadonlySet<AppScreen> = new Set(APP_SCREENS);

export const LEGACY_SCREEN_ALIASES = {
  sessions: "ai-session",
  "model-config": "model-profiles",
} as const satisfies Readonly<Record<string, AppScreen>>;

export interface ParsedAppRoute {
  readonly projectSlug: string | null;
  readonly screen: AppScreen;
}

export interface ScreenRouteState extends ParsedAppRoute {
  readonly contextId: string | null;
  readonly selectedPath: string | null;
}

export interface WorkspaceSelectionState {
  readonly activeContextId: string | null;
  readonly openContextIds: readonly string[];
}

export function isAppScreen(value: string): value is AppScreen {
  return VALID_APP_SCREENS.has(value as AppScreen);
}

export function normalizeAppScreen(value: string): AppScreen | undefined {
  const aliasedScreen =
    LEGACY_SCREEN_ALIASES[value as keyof typeof LEGACY_SCREEN_ALIASES];
  const normalizedScreen = aliasedScreen ?? value;
  return isAppScreen(normalizedScreen) ? normalizedScreen : undefined;
}

export function parseAppHash(hashValue: string): ParsedAppRoute {
  const normalizedHash = hashValue.replace(/^#\/?/, "");
  const routeParts = normalizedHash
    .split("/")
    .filter((part) => part.length > 0);

  if (routeParts.length >= 2) {
    const projectSlug = routeParts[0] ?? null;
    const screenPart = routeParts[1] ?? DEFAULT_APP_SCREEN;
    return {
      projectSlug,
      screen: normalizeAppScreen(screenPart) ?? DEFAULT_APP_SCREEN,
    };
  }

  if (routeParts.length === 1) {
    const singlePart = routeParts[0] ?? "";
    const normalizedScreen = normalizeAppScreen(singlePart);
    if (normalizedScreen !== undefined) {
      return {
        projectSlug: null,
        screen: normalizedScreen,
      };
    }
    return {
      projectSlug: singlePart,
      screen: DEFAULT_APP_SCREEN,
    };
  }

  return {
    projectSlug: null,
    screen: DEFAULT_APP_SCREEN,
  };
}

export function screenFromHash(hashValue: string): AppScreen {
  return parseAppHash(hashValue).screen;
}

export function buildScreenHash(
  projectSlug: string | null,
  screen: AppScreen,
): string {
  return projectSlug !== null ? `#/${projectSlug}/${screen}` : `#/${screen}`;
}
