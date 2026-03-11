import { isDiffViewMode, type DiffViewMode } from "./diff";

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
  readonly contextId: string | null;
  readonly selectedPath: string | null;
  readonly selectedViewMode: DiffViewMode | null;
  readonly selectedLineNumber: number | null;
}

export interface ScreenRouteState extends ParsedAppRoute {}

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

function createDefaultParsedRoute(
  projectSlug: string | null,
  screen: AppScreen,
): ParsedAppRoute {
  return {
    projectSlug,
    screen,
    contextId: null,
    selectedPath: null,
    selectedViewMode: null,
    selectedLineNumber: null,
  };
}

function parseLineNumber(lineNumberValue: string | null): number | null {
  if (lineNumberValue === null) {
    return null;
  }

  const parsedLineNumber = Number(lineNumberValue);
  if (!Number.isInteger(parsedLineNumber) || parsedLineNumber <= 0) {
    return null;
  }

  return parsedLineNumber;
}

function appendRouteQuery(
  hashPath: string,
  routeState: Pick<
    ScreenRouteState,
    "selectedPath" | "selectedViewMode" | "selectedLineNumber"
  >,
): string {
  const hashSearchParams = new URLSearchParams();

  if (routeState.selectedPath !== null) {
    hashSearchParams.set("path", routeState.selectedPath);
  }

  if (routeState.selectedViewMode !== null) {
    hashSearchParams.set("view", routeState.selectedViewMode);
  }

  if (routeState.selectedLineNumber !== null) {
    hashSearchParams.set("line", String(routeState.selectedLineNumber));
  }

  const serializedSearch = hashSearchParams.toString();
  return serializedSearch.length > 0
    ? `${hashPath}?${serializedSearch}`
    : hashPath;
}

export function parseAppHash(hashValue: string): ParsedAppRoute {
  const normalizedHash = hashValue.replace(/^#\/?/, "");
  const [rawHashPath = "", hashQuery = ""] = normalizedHash.split("?", 2);
  const hashPath = rawHashPath;
  const routeParts = hashPath.split("/").filter((part) => part.length > 0);
  const hashSearchParams = new URLSearchParams(hashQuery);
  const selectedPath = hashSearchParams.get("path")?.trim() ?? "";
  const selectedViewModeValue = hashSearchParams.get("view")?.trim() ?? "";
  const selectedViewMode = isDiffViewMode(selectedViewModeValue)
    ? selectedViewModeValue
    : null;
  const selectedLineNumber = parseLineNumber(hashSearchParams.get("line"));

  if (routeParts.length >= 2) {
    const projectSlug = routeParts[0] ?? null;
    const screenPart = routeParts[1] ?? DEFAULT_APP_SCREEN;
    return {
      ...createDefaultParsedRoute(
        projectSlug,
        normalizeAppScreen(screenPart) ?? DEFAULT_APP_SCREEN,
      ),
      selectedPath: selectedPath.length > 0 ? selectedPath : null,
      selectedViewMode,
      selectedLineNumber,
    };
  }

  if (routeParts.length === 1) {
    const singlePart = routeParts[0] ?? "";
    const normalizedScreen = normalizeAppScreen(singlePart);
    if (normalizedScreen !== undefined) {
      return {
        ...createDefaultParsedRoute(null, normalizedScreen),
        selectedPath: selectedPath.length > 0 ? selectedPath : null,
        selectedViewMode,
        selectedLineNumber,
      };
    }
    return {
      ...createDefaultParsedRoute(singlePart, DEFAULT_APP_SCREEN),
      selectedPath: selectedPath.length > 0 ? selectedPath : null,
      selectedViewMode,
      selectedLineNumber,
    };
  }

  return {
    ...createDefaultParsedRoute(null, DEFAULT_APP_SCREEN),
    selectedPath: selectedPath.length > 0 ? selectedPath : null,
    selectedViewMode,
    selectedLineNumber,
  };
}

export function screenFromHash(hashValue: string): AppScreen {
  return parseAppHash(hashValue).screen;
}

export function buildScreenHash(
  projectSlug: string | null,
  screen: AppScreen,
  routeState: Pick<
    ScreenRouteState,
    "selectedPath" | "selectedViewMode" | "selectedLineNumber"
  > = {
    selectedPath: null,
    selectedViewMode: null,
    selectedLineNumber: null,
  },
): string {
  const hashPath =
    projectSlug !== null ? `#/${projectSlug}/${screen}` : `#/${screen}`;
  return appendRouteQuery(hashPath, routeState);
}
