import { describe, expect, test } from "vitest";
import {
  createWorkspaceSelectionState,
  filterAvailableRecentProjects,
  getActiveWorkspaceTab,
  createWorkspaceShellState,
  normalizeWorkspaceSnapshot,
} from "./workspace";

describe("workspace contracts", () => {
  test("normalizes workspace API responses with defaults", () => {
    expect(
      normalizeWorkspaceSnapshot({
        workspace: {},
      }),
    ).toEqual({
      tabs: [],
      activeTabId: null,
      metadata: {
        temporaryProjectMode: false,
        canManageProjects: true,
      },
    });
  });

  test("derives a stable selection state from the active tab id", () => {
    const workspaceSelectionState = createWorkspaceSelectionState({
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
      activeTabId: "ctx-2",
      metadata: {
        temporaryProjectMode: false,
        canManageProjects: true,
      },
    });

    expect(workspaceSelectionState).toEqual({
      activeContextId: "ctx-2",
      openContextIds: ["ctx-1", "ctx-2"],
    });
  });

  test("falls back to the first tab when the server has not set activeTabId", () => {
    const workspaceSelectionState = createWorkspaceSelectionState({
      tabs: [
        {
          id: "ctx-1",
          path: "/repos/alpha",
          name: "alpha",
          isGitRepo: true,
          projectSlug: "alpha",
        },
      ],
      activeTabId: null,
      metadata: {
        temporaryProjectMode: true,
        canManageProjects: false,
      },
    });

    expect(workspaceSelectionState).toEqual({
      activeContextId: "ctx-1",
      openContextIds: ["ctx-1"],
    });
  });

  test("builds a workspace shell state for frontend bootstrapping", () => {
    const workspaceShellState = createWorkspaceShellState(
      {
        tabs: [
          {
            id: "ctx-1",
            path: "/repos/alpha",
            name: "alpha",
            isGitRepo: true,
            projectSlug: "alpha",
          },
        ],
        activeTabId: null,
        metadata: {
          temporaryProjectMode: true,
          canManageProjects: false,
        },
      },
      [
        {
          path: "/repos/gamma",
          name: "gamma",
          isGitRepo: true,
        },
      ],
    );

    expect(workspaceShellState).toEqual({
      activeContextId: "ctx-1",
      openContextIds: ["ctx-1"],
      tabs: [
        {
          id: "ctx-1",
          path: "/repos/alpha",
          name: "alpha",
          isGitRepo: true,
          projectSlug: "alpha",
        },
      ],
      recentProjects: [
        {
          path: "/repos/gamma",
          name: "gamma",
          isGitRepo: true,
        },
      ],
      activeProjectPath: "/repos/alpha",
      canManageProjects: false,
      temporaryProjectMode: true,
      isEmpty: false,
    });
  });

  test("returns the active workspace tab when one is selected", () => {
    expect(
      getActiveWorkspaceTab({
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
            isGitRepo: false,
            projectSlug: "beta",
          },
        ],
        activeContextId: "ctx-2",
      }),
    ).toEqual({
      id: "ctx-2",
      path: "/repos/beta",
      name: "beta",
      isGitRepo: false,
      projectSlug: "beta",
    });
  });

  test("filters recent projects that are already open in workspace tabs", () => {
    expect(
      filterAvailableRecentProjects(
        [
          {
            path: "/repos/alpha",
          },
        ],
        [
          {
            path: "/repos/alpha",
            name: "alpha",
            isGitRepo: true,
          },
          {
            path: "/repos/beta",
            name: "beta",
            isGitRepo: true,
          },
        ],
      ),
    ).toEqual([
      {
        path: "/repos/beta",
        name: "beta",
        isGitRepo: true,
      },
    ]);
  });
});
