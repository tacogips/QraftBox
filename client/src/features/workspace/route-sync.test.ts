import { describe, expect, mock, test } from "bun:test";
import type { ScreenRouteState } from "../../../../client-shared/src/contracts/navigation";
import { createWorkspaceShellState } from "../../../../client-shared/src/contracts/workspace";
import { initializeWorkspaceRouteSync } from "./route-sync";

const INITIAL_ROUTE: ScreenRouteState = {
  projectSlug: "alpha",
  screen: "files",
  contextId: null,
  selectedPath: null,
};

const UPDATED_ROUTE: ScreenRouteState = {
  projectSlug: "beta",
  screen: "commits",
  contextId: null,
  selectedPath: null,
};

describe("initializeWorkspaceRouteSync", () => {
  test("synchronizes against the latest route instead of the bootstrap snapshot", async () => {
    const fetchedWorkspaceState = createWorkspaceShellState({
      tabs: [
        {
          id: "tab-alpha",
          path: "/projects/alpha",
          name: "alpha",
          isGitRepo: true,
          projectSlug: "alpha",
        },
      ],
      activeTabId: "tab-alpha",
      metadata: {
        temporaryProjectMode: false,
        canManageProjects: true,
      },
    });
    const synchronizedWorkspaceState = createWorkspaceShellState({
      tabs: [
        {
          id: "tab-beta",
          path: "/projects/beta",
          name: "beta",
          isGitRepo: true,
          projectSlug: "beta",
        },
      ],
      activeTabId: "tab-beta",
      metadata: {
        temporaryProjectMode: false,
        canManageProjects: true,
      },
    });
    const synchronizeWorkspaceRoute = mock(async (route: ScreenRouteState) => {
      expect(route).toEqual(UPDATED_ROUTE);
      return synchronizedWorkspaceState;
    });

    const result = await initializeWorkspaceRouteSync({
      fetchWorkspaceShellState: async () => fetchedWorkspaceState,
      getCurrentRoute: () => UPDATED_ROUTE,
      synchronizeWorkspaceRoute,
    });

    expect(result).toBe(synchronizedWorkspaceState);
    expect(synchronizeWorkspaceRoute).toHaveBeenCalledTimes(1);
  });

  test("passes the fetched workspace state into route synchronization", async () => {
    const fetchedWorkspaceState = createWorkspaceShellState({
      tabs: [],
      activeTabId: null,
      metadata: {
        temporaryProjectMode: false,
        canManageProjects: true,
      },
    });
    const synchronizeWorkspaceRoute = mock(
      async (
        route: ScreenRouteState,
        currentWorkspaceState: ReturnType<typeof createWorkspaceShellState>,
      ) => {
        expect(route).toEqual(INITIAL_ROUTE);
        expect(currentWorkspaceState).toBe(fetchedWorkspaceState);
        return currentWorkspaceState;
      },
    );

    const result = await initializeWorkspaceRouteSync({
      fetchWorkspaceShellState: async () => fetchedWorkspaceState,
      getCurrentRoute: () => INITIAL_ROUTE,
      synchronizeWorkspaceRoute,
    });

    expect(result).toBe(fetchedWorkspaceState);
    expect(synchronizeWorkspaceRoute).toHaveBeenCalledTimes(1);
  });
});
