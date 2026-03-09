import type { ScreenRouteState } from "./navigation";
import type { WorkspaceShellState } from "./workspace";

export type WorkspaceRouteSyncPlan =
  | {
      readonly type: "noop";
    }
  | {
      readonly type: "activate-tab";
      readonly tabId: string;
    }
  | {
      readonly type: "open-by-slug";
      readonly projectSlug: string;
    };

export function deriveRouteFromWorkspace(
  route: ScreenRouteState,
  workspaceState: Pick<WorkspaceShellState, "tabs" | "activeContextId">,
): ScreenRouteState {
  const activeWorkspaceTab = workspaceState.tabs.find(
    (workspaceTab) => workspaceTab.id === workspaceState.activeContextId,
  );

  return {
    ...route,
    projectSlug: activeWorkspaceTab?.projectSlug ?? null,
  };
}

export function planWorkspaceRouteSync(
  route: Pick<ScreenRouteState, "projectSlug">,
  workspaceState: Pick<
    WorkspaceShellState,
    "tabs" | "activeContextId" | "canManageProjects"
  >,
): WorkspaceRouteSyncPlan {
  if (route.projectSlug === null) {
    return { type: "noop" };
  }

  const matchingWorkspaceTab = workspaceState.tabs.find(
    (workspaceTab) => workspaceTab.projectSlug === route.projectSlug,
  );

  if (matchingWorkspaceTab !== undefined) {
    return matchingWorkspaceTab.id === workspaceState.activeContextId
      ? { type: "noop" }
      : {
          type: "activate-tab",
          tabId: matchingWorkspaceTab.id,
        };
  }

  if (!workspaceState.canManageProjects) {
    return { type: "noop" };
  }

  return {
    type: "open-by-slug",
    projectSlug: route.projectSlug,
  };
}
