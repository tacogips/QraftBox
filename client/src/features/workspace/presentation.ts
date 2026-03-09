import type {
  RecentProjectSummary,
  WorkspaceShellState,
} from "../../../../client-shared/src/contracts/workspace";

export interface WorkspaceShellPresentation {
  readonly heading: string;
  readonly activeProjectText: string;
  readonly managementModeText: string;
  readonly showTemporaryProjectMode: boolean;
  readonly showEmptyWorkspaceNotice: boolean;
  readonly openTabsHeading: string;
  readonly openTabsEmptyText: string;
  readonly showOpenProjectControls: boolean;
  readonly openProjectHeading: string;
  readonly recentProjectsHeading: string;
  readonly recentProjectsEmptyText: string;
}

export function createWorkspaceShellPresentation(
  workspaceState: WorkspaceShellState,
): WorkspaceShellPresentation {
  return {
    heading: "Workspace shell",
    activeProjectText: `Active project: ${workspaceState.activeProjectPath ?? "No project selected"}`,
    managementModeText: `Management mode: ${
      workspaceState.canManageProjects ? "interactive" : "restricted"
    }`,
    showTemporaryProjectMode: workspaceState.temporaryProjectMode,
    showEmptyWorkspaceNotice: workspaceState.isEmpty,
    openTabsHeading: "Open tabs",
    openTabsEmptyText: "No tabs are open yet.",
    showOpenProjectControls: workspaceState.canManageProjects,
    openProjectHeading: "Open project",
    recentProjectsHeading: "Recent projects",
    recentProjectsEmptyText: "No recent projects recorded by the server.",
  };
}

export function collectWorkspaceShellText(
  workspaceState: WorkspaceShellState,
  availableRecentProjects: readonly RecentProjectSummary[],
): readonly string[] {
  const presentation = createWorkspaceShellPresentation(workspaceState);
  const text: string[] = [
    presentation.heading,
    presentation.activeProjectText,
    presentation.managementModeText,
    presentation.openTabsHeading,
    presentation.recentProjectsHeading,
  ];

  if (presentation.showEmptyWorkspaceNotice) {
    text.push("No open workspace tabs.");
  }

  if (presentation.showTemporaryProjectMode) {
    text.push("Temporary project mode is active.");
  }

  if (workspaceState.tabs.length === 0) {
    text.push(presentation.openTabsEmptyText);
  } else {
    for (const workspaceTab of workspaceState.tabs) {
      text.push(workspaceTab.name, workspaceTab.path);
      if (workspaceTab.id === workspaceState.activeContextId) {
        text.push("(active)");
      }
    }
  }

  if (presentation.showOpenProjectControls) {
    text.push(presentation.openProjectHeading);
  }

  if (availableRecentProjects.length === 0) {
    text.push(presentation.recentProjectsEmptyText);
  } else {
    for (const recentProject of availableRecentProjects) {
      text.push(recentProject.name, recentProject.path);
    }
  }

  return text;
}
