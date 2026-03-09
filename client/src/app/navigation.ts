import {
  buildScreenHash,
  type AppScreen,
  type ScreenRouteState,
} from "../../../client-shared/src/contracts/navigation";
import type { SolidScreenImplementationStatus } from "./screen-registry";
import { getSolidScreenDefinition } from "./screen-registry";

export interface ScreenNavigationItem {
  readonly screen: AppScreen;
  readonly label: string;
  readonly href: string;
  readonly isActive: boolean;
  readonly implementationStatus: SolidScreenImplementationStatus;
}

export function createScreenNavigationItems(
  route: Pick<ScreenRouteState, "projectSlug" | "screen">,
): readonly ScreenNavigationItem[] {
  const projectSlug = route.projectSlug;

  return (
    [
      "project",
      "files",
      "ai-session",
      "commits",
      "terminal",
      "system-info",
      "notifications",
      "model-profiles",
      "action-defaults",
    ] as AppScreen[]
  ).map((screen) => ({
    screen,
    label: getSolidScreenDefinition(screen).label,
    href: buildScreenHash(projectSlug, screen),
    isActive: route.screen === screen,
    implementationStatus: getSolidScreenDefinition(screen).implementationStatus,
  }));
}
