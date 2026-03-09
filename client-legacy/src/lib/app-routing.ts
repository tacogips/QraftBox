import {
  buildScreenHash,
  parseAppHash,
  screenFromHash,
  VALID_APP_SCREENS,
  type AppScreen,
  type ParsedAppRoute,
} from "../../../client-shared/src/contracts/navigation";

export { buildScreenHash, screenFromHash };
export const VALID_SCREENS = VALID_APP_SCREENS;

export type ScreenType = AppScreen;

export interface ParsedScreenRoute extends ParsedAppRoute {
  readonly slug: string | null;
}

export function parseHash(hashValue: string): ParsedScreenRoute {
  const parsedRoute = parseAppHash(hashValue);
  return {
    ...parsedRoute,
    // Preserve the legacy property name until all Svelte callers are migrated.
    slug: parsedRoute.projectSlug,
  };
}
