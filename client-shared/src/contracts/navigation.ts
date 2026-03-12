import { isDiffViewMode, type DiffViewMode } from "./diff";
import { isFileTreeMode, type FileTreeMode } from "./files";

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
const DEFAULT_FILES_VIEW_MODE: DiffViewMode = "side-by-side";
const DEFAULT_FILES_TREE_MODE: FileTreeMode = "diff";

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
  readonly fileTreeMode: FileTreeMode | null;
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
  const isFilesScreen = screen === "files";
  return {
    projectSlug,
    screen,
    contextId: null,
    selectedPath: null,
    selectedViewMode: isFilesScreen ? DEFAULT_FILES_VIEW_MODE : null,
    fileTreeMode: isFilesScreen ? DEFAULT_FILES_TREE_MODE : null,
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
  screen: AppScreen,
  routeState: Partial<
    Pick<
      ScreenRouteState,
      | "selectedPath"
      | "selectedViewMode"
      | "fileTreeMode"
      | "selectedLineNumber"
    >
  >,
): string {
  if (screen !== "files") {
    return hashPath;
  }

  const hashSearchParams = new URLSearchParams();
  const selectedPath = routeState.selectedPath?.trim() ?? "";
  const normalizedSelectedPath = selectedPath.length > 0 ? selectedPath : null;
  const selectedLineNumber =
    normalizedSelectedPath === null
      ? null
      : (routeState.selectedLineNumber ?? null);

  if (normalizedSelectedPath !== null) {
    hashSearchParams.set("path", normalizedSelectedPath);
  }

  if (
    routeState.selectedViewMode !== null &&
    routeState.selectedViewMode !== undefined &&
    routeState.selectedViewMode !== DEFAULT_FILES_VIEW_MODE
  ) {
    hashSearchParams.set("view", routeState.selectedViewMode);
  }

  if (
    routeState.fileTreeMode !== null &&
    routeState.fileTreeMode !== undefined &&
    routeState.fileTreeMode !== DEFAULT_FILES_TREE_MODE
  ) {
    hashSearchParams.set("tree", routeState.fileTreeMode);
  }

  if (selectedLineNumber != null) {
    hashSearchParams.set("line", String(selectedLineNumber));
  }

  const serializedSearch = hashSearchParams.toString();
  return serializedSearch.length > 0
    ? `${hashPath}?${serializedSearch}`
    : hashPath;
}

function createParsedRouteWithQueryState(params: {
  readonly projectSlug: string | null;
  readonly screen: AppScreen;
  readonly selectedPath: string;
  readonly selectedViewMode: DiffViewMode | undefined;
  readonly fileTreeMode: FileTreeMode | undefined;
  readonly selectedLineNumber: number | null;
}): ParsedAppRoute {
  const defaultRoute = createDefaultParsedRoute(
    params.projectSlug,
    params.screen,
  );

  if (params.screen !== "files") {
    return defaultRoute;
  }

  const normalizedSelectedPath = params.selectedPath.trim();
  const selectedPath =
    normalizedSelectedPath.length > 0 ? normalizedSelectedPath : null;

  return {
    ...defaultRoute,
    selectedPath,
    selectedViewMode: params.selectedViewMode ?? defaultRoute.selectedViewMode,
    fileTreeMode: params.fileTreeMode ?? defaultRoute.fileTreeMode,
    selectedLineNumber:
      selectedPath === null ? null : params.selectedLineNumber,
  };
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
    : undefined;
  const fileTreeModeValue = hashSearchParams.get("tree")?.trim() ?? "";
  const fileTreeMode = isFileTreeMode(fileTreeModeValue)
    ? fileTreeModeValue
    : undefined;
  const selectedLineNumber = parseLineNumber(hashSearchParams.get("line"));

  if (routeParts.length >= 2) {
    const projectSlug = routeParts[0] ?? null;
    const screenPart = routeParts[1] ?? DEFAULT_APP_SCREEN;
    const screen = normalizeAppScreen(screenPart) ?? DEFAULT_APP_SCREEN;
    return createParsedRouteWithQueryState({
      projectSlug,
      screen,
      selectedPath,
      selectedViewMode,
      fileTreeMode,
      selectedLineNumber,
    });
  }

  if (routeParts.length === 1) {
    const singlePart = routeParts[0] ?? "";
    const normalizedScreen = normalizeAppScreen(singlePart);
    if (normalizedScreen !== undefined) {
      return createParsedRouteWithQueryState({
        projectSlug: null,
        screen: normalizedScreen,
        selectedPath,
        selectedViewMode,
        fileTreeMode,
        selectedLineNumber,
      });
    }
    return createParsedRouteWithQueryState({
      projectSlug: singlePart,
      screen: DEFAULT_APP_SCREEN,
      selectedPath,
      selectedViewMode,
      fileTreeMode,
      selectedLineNumber,
    });
  }

  return createParsedRouteWithQueryState({
    projectSlug: null,
    screen: DEFAULT_APP_SCREEN,
    selectedPath,
    selectedViewMode,
    fileTreeMode,
    selectedLineNumber,
  });
}

export function screenFromHash(hashValue: string): AppScreen {
  return parseAppHash(hashValue).screen;
}

export function buildScreenHash(
  projectSlug: string | null,
  screen: AppScreen,
  routeState: Partial<
    Pick<
      ScreenRouteState,
      | "selectedPath"
      | "selectedViewMode"
      | "fileTreeMode"
      | "selectedLineNumber"
    >
  > = {},
): string {
  const hashPath =
    projectSlug !== null ? `#/${projectSlug}/${screen}` : `#/${screen}`;
  return appendRouteQuery(hashPath, screen, routeState);
}
