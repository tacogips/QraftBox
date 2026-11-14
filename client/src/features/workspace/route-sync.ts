import type { ScreenRouteState } from "../../../../client-shared/src/contracts/navigation";
import type { WorkspaceShellState } from "../../../../client-shared/src/contracts/workspace";

export interface InitializeWorkspaceRouteSyncOptions {
  readonly fetchWorkspaceShellState: () => Promise<WorkspaceShellState>;
  readonly getCurrentRoute: () => ScreenRouteState;
  readonly synchronizeWorkspaceRoute: (
    route: ScreenRouteState,
    currentWorkspaceState: WorkspaceShellState,
  ) => Promise<WorkspaceShellState>;
}

export async function initializeWorkspaceRouteSync(
  options: InitializeWorkspaceRouteSyncOptions,
): Promise<WorkspaceShellState> {
  const nextWorkspaceState = await options.fetchWorkspaceShellState();
  return options.synchronizeWorkspaceRoute(
    options.getCurrentRoute(),
    nextWorkspaceState,
  );
}
