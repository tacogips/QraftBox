import type { ScreenRouteState } from "../../../client-shared/src/contracts/navigation";

export interface SolidAppBootstrapOptions {
  readonly initialRoute: ScreenRouteState;
  readonly apiBaseUrl: string;
}
