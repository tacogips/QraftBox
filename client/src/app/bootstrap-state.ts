import type { ScreenRouteState } from "../../../client-shared/src/contracts/navigation";
import type { SolidCutoverEnvironmentStatus } from "../../../client-shared/src/contracts/frontend-status";
import {
  createWorkspaceShellState,
  type WorkspaceShellState,
} from "../../../client-shared/src/contracts/workspace";
import { DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS } from "./screen-registry";

export interface SolidBootstrapState {
  readonly route: ScreenRouteState;
  readonly workspace: WorkspaceShellState;
  readonly apiBaseUrl: string;
  readonly cutoverEnvironmentStatus: SolidCutoverEnvironmentStatus;
}

export function createSolidBootstrapState(
  initialRoute: ScreenRouteState,
  apiBaseUrl: string,
  cutoverEnvironmentStatus: SolidCutoverEnvironmentStatus = DEFAULT_SOLID_CUTOVER_ENVIRONMENT_STATUS,
): SolidBootstrapState {
  return {
    route: initialRoute,
    apiBaseUrl,
    cutoverEnvironmentStatus,
    workspace: createWorkspaceShellState({
      tabs: [],
      activeTabId: null,
      metadata: {
        temporaryProjectMode: false,
        canManageProjects: true,
      },
    }),
  };
}
