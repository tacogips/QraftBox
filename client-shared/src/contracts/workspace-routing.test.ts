import { describe, expect, test } from "vitest";
import type { ScreenRouteState } from "./navigation";
import {
  deriveRouteFromWorkspace,
  planWorkspaceRouteSync,
} from "./workspace-routing";

const BASE_ROUTE: ScreenRouteState = {
  projectSlug: "alpha",
  screen: "commits",
  contextId: "ctx-commits",
  selectedPath: "src/main.ts",
  selectedViewMode: null,
  fileTreeMode: null,
  selectedLineNumber: null,
};

describe("workspace routing contracts", () => {
  test("updates the route slug from the active workspace tab", () => {
    expect(
      deriveRouteFromWorkspace(BASE_ROUTE, {
        activeContextId: "ctx-2",
        tabs: [
          {
            id: "ctx-1",
            path: "/repos/alpha",
            name: "alpha",
            isGitRepo: true,
            projectSlug: "alpha",
          },
          {
            id: "ctx-2",
            path: "/repos/beta",
            name: "beta",
            isGitRepo: true,
            projectSlug: "beta",
          },
        ],
      }),
    ).toEqual({
      projectSlug: "beta",
      screen: "commits",
      contextId: "ctx-commits",
      selectedPath: "src/main.ts",
      selectedViewMode: null,
      fileTreeMode: null,
      selectedLineNumber: null,
    });
  });

  test("preserves the rest of the route when the workspace is empty", () => {
    expect(
      deriveRouteFromWorkspace(BASE_ROUTE, {
        activeContextId: null,
        tabs: [],
      }),
    ).toEqual({
      projectSlug: null,
      screen: "commits",
      contextId: "ctx-commits",
      selectedPath: "src/main.ts",
      selectedViewMode: null,
      fileTreeMode: null,
      selectedLineNumber: null,
    });
  });

  test("plans a tab activation when the route slug points at an inactive tab", () => {
    expect(
      planWorkspaceRouteSync(
        {
          projectSlug: "beta",
        },
        {
          activeContextId: "ctx-1",
          canManageProjects: true,
          tabs: [
            {
              id: "ctx-1",
              path: "/repos/alpha",
              name: "alpha",
              isGitRepo: true,
              projectSlug: "alpha",
            },
            {
              id: "ctx-2",
              path: "/repos/beta",
              name: "beta",
              isGitRepo: true,
              projectSlug: "beta",
            },
          ],
        },
      ),
    ).toEqual({
      type: "activate-tab",
      tabId: "ctx-2",
    });
  });

  test("plans an open-by-slug action when the requested route is not open yet", () => {
    expect(
      planWorkspaceRouteSync(
        {
          projectSlug: "gamma",
        },
        {
          activeContextId: "ctx-1",
          canManageProjects: true,
          tabs: [
            {
              id: "ctx-1",
              path: "/repos/alpha",
              name: "alpha",
              isGitRepo: true,
              projectSlug: "alpha",
            },
          ],
        },
      ),
    ).toEqual({
      type: "open-by-slug",
      projectSlug: "gamma",
    });
  });

  test("does nothing when restricted mode cannot open the requested route", () => {
    expect(
      planWorkspaceRouteSync(
        {
          projectSlug: "gamma",
        },
        {
          activeContextId: "ctx-1",
          canManageProjects: false,
          tabs: [
            {
              id: "ctx-1",
              path: "/repos/alpha",
              name: "alpha",
              isGitRepo: true,
              projectSlug: "alpha",
            },
          ],
        },
      ),
    ).toEqual({
      type: "noop",
    });
  });

  test("does nothing when the route already matches the active tab", () => {
    expect(
      planWorkspaceRouteSync(
        {
          projectSlug: "alpha",
        },
        {
          activeContextId: "ctx-1",
          canManageProjects: true,
          tabs: [
            {
              id: "ctx-1",
              path: "/repos/alpha",
              name: "alpha",
              isGitRepo: true,
              projectSlug: "alpha",
            },
          ],
        },
      ),
    ).toEqual({
      type: "noop",
    });
  });
});
