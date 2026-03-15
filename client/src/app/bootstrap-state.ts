import type { ScreenRouteState } from "../../../client-shared/src/contracts/navigation";
import type { SolidSupportStatus } from "../../../client-shared/src/contracts/frontend-status";
import {
  createWorkspaceShellState,
  type WorkspaceShellState,
} from "../../../client-shared/src/contracts/workspace";
import { PACKAGED_RUNTIME_SOLID_SUPPORT_STATUS } from "./support-status";

export const DEFAULT_BOOTSTRAP_SOLID_SUPPORT_STATUS =
  PACKAGED_RUNTIME_SOLID_SUPPORT_STATUS;

export interface SolidBootstrapState {
  readonly route: ScreenRouteState;
  readonly workspace: WorkspaceShellState;
  readonly apiBaseUrl: string;
  readonly supportStatus: SolidSupportStatus;
}

export function createSolidBootstrapState(
  initialRoute: ScreenRouteState,
  apiBaseUrl: string,
  supportStatus: SolidSupportStatus = DEFAULT_BOOTSTRAP_SOLID_SUPPORT_STATUS,
): SolidBootstrapState {
  return {
    route: initialRoute,
    apiBaseUrl,
    supportStatus,
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
