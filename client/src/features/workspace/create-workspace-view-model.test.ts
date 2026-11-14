import { describe, expect, test } from "bun:test";
import {
  filterAvailableRecentProjects,
  type RecentProjectSummary,
} from "../../../../client-shared/src/contracts/workspace";
import { createWorkspaceShellStateFromSnapshot } from "./workspace-state";

const RECENT_PROJECTS: readonly RecentProjectSummary[] = [
  {
    path: "/repos/alpha",
    name: "alpha",
    isGitRepo: true,
  },
  {
    path: "/repos/gamma",
    name: "gamma",
    isGitRepo: true,
  },
];

describe("createWorkspaceShellStateFromSnapshot", () => {
  test("preserves the full recent-project dataset in state", () => {
    const workspaceState = createWorkspaceShellStateFromSnapshot(
      {
        tabs: [
          {
            id: "ctx-alpha",
            path: "/repos/alpha",
            name: "alpha",
            isGitRepo: true,
            projectSlug: "alpha",
          },
        ],
        activeTabId: "ctx-alpha",
        metadata: {
          temporaryProjectMode: false,
          canManageProjects: true,
        },
      },
      RECENT_PROJECTS,
    );

    expect(workspaceState.recentProjects).toEqual(RECENT_PROJECTS);
    expect(
      filterAvailableRecentProjects(
        workspaceState.tabs,
        workspaceState.recentProjects,
      ),
    ).toEqual([
      {
        path: "/repos/gamma",
        name: "gamma",
        isGitRepo: true,
      },
    ]);
  });
});
