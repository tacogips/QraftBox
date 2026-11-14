import type { WorkspaceSelectionState } from "./navigation";

export interface WorkspaceTabSummary {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly isGitRepo: boolean;
  readonly projectSlug: string;
}

export interface RecentProjectSummary {
  readonly path: string;
  readonly name: string;
  readonly isGitRepo: boolean;
}

export interface WorkspaceMetadata {
  readonly temporaryProjectMode: boolean;
  readonly canManageProjects: boolean;
}

export interface WorkspaceSnapshot {
  readonly tabs: readonly WorkspaceTabSummary[];
  readonly activeTabId: string | null;
  readonly metadata: WorkspaceMetadata;
}

export interface WorkspaceApiResponse {
  readonly workspace: {
    readonly tabs?: readonly WorkspaceTabSummary[] | undefined;
    readonly activeTabId?: string | null | undefined;
  };
  readonly metadata?: {
    readonly temporaryProjectMode?: boolean | undefined;
    readonly canManageProjects?: boolean | undefined;
  };
}

export interface WorkspaceShellState extends WorkspaceSelectionState {
  readonly tabs: readonly WorkspaceTabSummary[];
  readonly recentProjects: readonly RecentProjectSummary[];
  readonly activeProjectPath: string | null;
  readonly canManageProjects: boolean;
  readonly temporaryProjectMode: boolean;
  readonly isEmpty: boolean;
}

export function normalizeWorkspaceSnapshot(
  response: WorkspaceApiResponse,
): WorkspaceSnapshot {
  return {
    tabs: response.workspace.tabs ?? [],
    activeTabId: response.workspace.activeTabId ?? null,
    metadata: {
      temporaryProjectMode: response.metadata?.temporaryProjectMode ?? false,
      canManageProjects: response.metadata?.canManageProjects ?? true,
    },
  };
}

export function createWorkspaceSelectionState(
  snapshot: WorkspaceSnapshot,
): WorkspaceSelectionState {
  const fallbackActiveTabId = snapshot.tabs[0]?.id ?? null;
  return {
    activeContextId: snapshot.activeTabId ?? fallbackActiveTabId,
    openContextIds: snapshot.tabs.map((workspaceTab) => workspaceTab.id),
  };
}

export function filterAvailableRecentProjects(
  tabs: readonly Pick<WorkspaceTabSummary, "path">[],
  recentProjects: readonly RecentProjectSummary[],
): readonly RecentProjectSummary[] {
  const openProjectPaths = new Set(
    tabs.map((workspaceTab) => workspaceTab.path),
  );

  return recentProjects.filter(
    (recentProject) => !openProjectPaths.has(recentProject.path),
  );
}

export function getActiveWorkspaceTab(
  workspaceState: Pick<WorkspaceShellState, "tabs" | "activeContextId">,
): WorkspaceTabSummary | null {
  return (
    workspaceState.tabs.find(
      (workspaceTab) => workspaceTab.id === workspaceState.activeContextId,
    ) ?? null
  );
}

export function createWorkspaceShellState(
  snapshot: WorkspaceSnapshot,
  recentProjects: readonly RecentProjectSummary[] = [],
): WorkspaceShellState {
  const workspaceSelectionState = createWorkspaceSelectionState(snapshot);
  const activeWorkspaceTab = getActiveWorkspaceTab({
    tabs: snapshot.tabs,
    activeContextId: workspaceSelectionState.activeContextId,
  });

  return {
    ...workspaceSelectionState,
    tabs: snapshot.tabs,
    recentProjects,
    activeProjectPath: activeWorkspaceTab?.path ?? null,
    canManageProjects: snapshot.metadata.canManageProjects,
    temporaryProjectMode: snapshot.metadata.temporaryProjectMode,
    isEmpty: snapshot.tabs.length === 0,
  };
}
