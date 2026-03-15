import { createSignal } from "solid-js";
import type { DiffApiClient } from "../../../../client-shared/src/api/diff";
import type {
  DiffOverviewState,
  DiffViewMode,
} from "../../../../client-shared/src/contracts/diff";
import {
  createDiffController,
  createInitialDiffControllerState,
  type DiffControllerState,
  type DiffSynchronizationOptions,
} from "./diff-controller";

export interface DiffViewModel {
  readonly diffOverview: () => DiffOverviewState;
  readonly preferredViewMode: () => DiffViewMode;
  readonly isLoading: () => boolean;
  readonly unsupportedMessage: () => string | null;
  readonly errorMessage: () => string | null;
  synchronize(options: DiffSynchronizationOptions): Promise<void>;
  selectPath(activeContextId: string | null, path: string): void;
  setPreferredViewMode(mode: DiffViewMode): void;
}

export interface CreateDiffViewModelOptions {
  readonly apiBaseUrl?: string | undefined;
  readonly diffApiClient?: DiffApiClient | undefined;
}

export function createDiffViewModel(
  options: CreateDiffViewModelOptions = {},
): DiffViewModel {
  const [diffState, setDiffState] = createSignal<DiffControllerState>(
    createInitialDiffControllerState("side-by-side"),
  );
  const diffController = createDiffController({
    apiBaseUrl: options.apiBaseUrl,
    diffApiClient: options.diffApiClient,
    onStateChange(nextState) {
      setDiffState(nextState);
    },
  });
  setDiffState(diffController.getState());

  return {
    diffOverview: (): DiffOverviewState => diffState().diffOverview,
    preferredViewMode: (): DiffViewMode =>
      diffState().diffOverview.preferredViewMode,
    isLoading: (): boolean => diffState().isLoading,
    unsupportedMessage: (): string | null => diffState().unsupportedMessage,
    errorMessage: (): string | null => diffState().errorMessage,
    async synchronize(
      synchronizationOptions: DiffSynchronizationOptions,
    ): Promise<void> {
      await diffController.synchronize(synchronizationOptions);
    },
    selectPath(activeContextId: string | null, path: string): void {
      diffController.selectPath(activeContextId, path);
    },
    setPreferredViewMode(mode: DiffViewMode): void {
      diffController.setPreferredViewMode(mode);
    },
  };
}
