import {
  createWorkspaceShellState,
  type RecentProjectSummary,
  type WorkspaceShellState,
  type WorkspaceSnapshot,
} from "../../../../client-shared/src/contracts/workspace";

export function createEmptyWorkspaceShellState(): WorkspaceShellState {
  return createWorkspaceShellState({
    tabs: [],
    activeTabId: null,
    metadata: {
      temporaryProjectMode: false,
      canManageProjects: true,
    },
  });
}

export function createWorkspaceShellStateFromSnapshot(
  workspaceSnapshot: WorkspaceSnapshot,
  recentProjects: readonly RecentProjectSummary[],
): WorkspaceShellState {
  return createWorkspaceShellState(workspaceSnapshot, recentProjects);
}
