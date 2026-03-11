import { createEffect, createMemo, createSignal, onMount } from "solid-js";
import type { ScreenRouteState } from "../../../../client-shared/src/contracts/navigation";
import {
  deriveRouteFromWorkspace,
  planWorkspaceRouteSync,
} from "../../../../client-shared/src/contracts/workspace-routing";
import {
  filterAvailableRecentProjects,
  type RecentProjectSummary,
  type WorkspaceShellState,
  type WorkspaceSnapshot,
} from "../../../../client-shared/src/contracts/workspace";
import { createWorkspaceApiClient } from "../../../../client-shared/src/api/workspace";
import { initializeWorkspaceRouteSync } from "./route-sync";
import {
  createEmptyWorkspaceShellState,
  createWorkspaceShellStateFromSnapshot,
} from "./workspace-state";

export interface WorkspaceViewModel {
  readonly workspaceState: () => WorkspaceShellState;
  readonly availableRecentProjects: () => readonly RecentProjectSummary[];
  readonly errorMessage: () => string | null;
  readonly isLoading: () => boolean;
  readonly isMutating: () => boolean;
  readonly isPickingDirectory: () => boolean;
  readonly newProjectPath: () => string;
  setNewProjectPath(path: string): void;
  refresh(): Promise<void>;
  activateTab(tabId: string): Promise<void>;
  closeTab(tabId: string): Promise<void>;
  pickProjectDirectory(): Promise<void>;
  openProjectByPath(): Promise<void>;
  openRecentProject(path: string): Promise<void>;
  removeRecentProject(path: string): Promise<void>;
}

export interface CreateWorkspaceViewModelOptions {
  readonly initialRoute: ScreenRouteState;
  readonly apiBaseUrl: string;
  readonly getCurrentRoute: () => ScreenRouteState;
  onRouteChange(route: ScreenRouteState): void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown workspace loading error";
}

export function createWorkspaceViewModel(
  options: CreateWorkspaceViewModelOptions,
): WorkspaceViewModel {
  const workspaceApi = createWorkspaceApiClient({
    apiBaseUrl: options.apiBaseUrl,
  });
  const [workspaceState, setWorkspaceState] = createSignal(
    createEmptyWorkspaceShellState(),
  );
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [isMutating, setIsMutating] = createSignal(false);
  const [isPickingDirectory, setIsPickingDirectory] = createSignal(false);
  const [newProjectPath, setNewProjectPath] = createSignal("");

  const availableRecentProjects = createMemo(() =>
    filterAvailableRecentProjects(
      workspaceState().tabs,
      workspaceState().recentProjects,
    ),
  );

  function applyWorkspaceSnapshot(
    workspaceSnapshot: WorkspaceSnapshot,
    recentProjects: readonly RecentProjectSummary[] = workspaceState()
      .recentProjects,
  ): void {
    const nextWorkspaceState = createWorkspaceShellStateFromSnapshot(
      workspaceSnapshot,
      recentProjects,
    );
    setWorkspaceState(nextWorkspaceState);
    options.onRouteChange(
      deriveRouteFromWorkspace(options.getCurrentRoute(), nextWorkspaceState),
    );
  }

  async function synchronizeWorkspaceRoute(
    route: ScreenRouteState,
    currentWorkspaceState: WorkspaceShellState,
  ): Promise<WorkspaceShellState> {
    const syncPlan = planWorkspaceRouteSync(route, currentWorkspaceState);

    if (syncPlan.type === "noop") {
      return currentWorkspaceState;
    }

    if (syncPlan.type === "activate-tab") {
      const workspaceSnapshot = await workspaceApi.activateWorkspaceTab(
        syncPlan.tabId,
      );
      return createWorkspaceShellStateFromSnapshot(
        workspaceSnapshot,
        currentWorkspaceState.recentProjects,
      );
    }

    const openResult = await workspaceApi.openWorkspaceTabBySlug(
      syncPlan.projectSlug,
    );
    return createWorkspaceShellStateFromSnapshot(
      openResult.workspaceSnapshot,
      currentWorkspaceState.recentProjects,
    );
  }

  async function runMutation(
    operation: () => Promise<void>,
    failureMessage: string,
  ): Promise<void> {
    setIsMutating(true);
    setErrorMessage(null);

    try {
      await operation();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : failureMessage);
    } finally {
      setIsMutating(false);
    }
  }

  async function initialize(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextWorkspaceState = await initializeWorkspaceRouteSync({
        fetchWorkspaceShellState: () => workspaceApi.fetchWorkspaceShellState(),
        getCurrentRoute: options.getCurrentRoute,
        synchronizeWorkspaceRoute,
      });

      setWorkspaceState(nextWorkspaceState);
      options.onRouteChange(
        deriveRouteFromWorkspace(options.getCurrentRoute(), nextWorkspaceState),
      );
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setWorkspaceState(createEmptyWorkspaceShellState());
    } finally {
      setIsLoading(false);
    }
  }

  onMount(() => {
    void initialize();
  });

  createEffect(() => {
    const currentRoute = options.getCurrentRoute();
    const currentWorkspaceState = workspaceState();

    if (isLoading() || isMutating() || isPickingDirectory()) {
      return;
    }

    const syncPlan = planWorkspaceRouteSync(
      currentRoute,
      currentWorkspaceState,
    );
    if (syncPlan.type === "noop") {
      return;
    }

    void runMutation(async () => {
      const nextWorkspaceState = await synchronizeWorkspaceRoute(
        currentRoute,
        currentWorkspaceState,
      );
      setWorkspaceState(nextWorkspaceState);
      options.onRouteChange(
        deriveRouteFromWorkspace(options.getCurrentRoute(), nextWorkspaceState),
      );
    }, "Failed to synchronize workspace route");
  });

  return {
    workspaceState,
    availableRecentProjects,
    errorMessage,
    isLoading,
    isMutating,
    isPickingDirectory,
    newProjectPath,
    setNewProjectPath,
    refresh: initialize,
    activateTab: async (tabId: string) =>
      runMutation(async () => {
        const workspaceSnapshot =
          await workspaceApi.activateWorkspaceTab(tabId);
        applyWorkspaceSnapshot(workspaceSnapshot);
      }, "Failed to activate workspace tab"),
    closeTab: async (tabId: string) =>
      runMutation(async () => {
        const workspaceSnapshot = await workspaceApi.closeWorkspaceTab(tabId);
        applyWorkspaceSnapshot(workspaceSnapshot);
      }, "Failed to close workspace tab"),
    pickProjectDirectory: async () => {
      if (isPickingDirectory()) {
        return;
      }

      const startPathCandidate =
        newProjectPath().trim().length > 0
          ? newProjectPath().trim()
          : (workspaceState().activeProjectPath ?? undefined);

      setIsPickingDirectory(true);
      setErrorMessage(null);

      try {
        const selectedPath =
          await workspaceApi.pickDirectory(startPathCandidate);
        if (selectedPath === null || selectedPath.trim().length === 0) {
          return;
        }

        setNewProjectPath(selectedPath);
        const openResult = await workspaceApi.openWorkspaceTab(selectedPath);
        applyWorkspaceSnapshot(openResult.workspaceSnapshot);
        setNewProjectPath("");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to open directory picker",
        );
      } finally {
        setIsPickingDirectory(false);
      }
    },
    openProjectByPath: async () =>
      runMutation(async () => {
        const trimmedProjectPath = newProjectPath().trim();
        if (trimmedProjectPath.length === 0) {
          return;
        }

        const openResult =
          await workspaceApi.openWorkspaceTab(trimmedProjectPath);
        applyWorkspaceSnapshot(openResult.workspaceSnapshot);
        setNewProjectPath("");
      }, "Failed to open project"),
    openRecentProject: async (path: string) =>
      runMutation(async () => {
        const openResult = await workspaceApi.openWorkspaceTab(path);
        applyWorkspaceSnapshot(openResult.workspaceSnapshot);
      }, "Failed to open recent project"),
    removeRecentProject: async (path: string) =>
      runMutation(async () => {
        await workspaceApi.removeRecentProject(path);
        setWorkspaceState((currentWorkspaceState) => ({
          ...currentWorkspaceState,
          recentProjects: currentWorkspaceState.recentProjects.filter(
            (recentProject) => recentProject.path !== path,
          ),
        }));
      }, "Failed to remove recent project"),
  };
}
