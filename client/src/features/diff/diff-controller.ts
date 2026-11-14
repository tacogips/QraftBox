import {
  createDiffApiClient,
  type DiffApiClient,
} from "../../../../client-shared/src/api/diff";
import {
  createDiffOverviewState,
  type DiffOverviewState,
  type DiffViewMode,
} from "../../../../client-shared/src/contracts/diff";
import { resolveDiffLoadDecision } from "./load-decision";
import { createLatestDiffRequestGuard } from "./request-guard";
import {
  rememberDiffSelection,
  resolveRememberedDiffSelection,
} from "./selection-memory";

export interface DiffControllerState {
  readonly diffOverview: DiffOverviewState;
  readonly isLoading: boolean;
  readonly unsupportedMessage: string | null;
  readonly errorMessage: string | null;
}

export interface DiffSynchronizationOptions {
  readonly screen: string;
  readonly activeContextId: string | null;
  readonly activeWorkspaceIsGitRepo: boolean;
}

export interface CreateDiffControllerOptions {
  readonly apiBaseUrl?: string | undefined;
  readonly diffApiClient?: DiffApiClient | undefined;
  readonly onStateChange?: ((state: DiffControllerState) => void) | undefined;
}

export interface DiffController {
  getState(): DiffControllerState;
  synchronize(options: DiffSynchronizationOptions): Promise<void>;
  selectPath(activeContextId: string | null, path: string): void;
  setPreferredViewMode(mode: DiffViewMode): void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to load diff";
}

function serializeDiffOverviewSnapshot(options: {
  readonly files: readonly DiffOverviewState["files"][number][];
  readonly stats: DiffOverviewState["stats"];
  readonly selectedPath: string | null;
  readonly preferredViewMode: DiffViewMode;
}): string {
  return JSON.stringify(options);
}

export function createInitialDiffControllerState(
  preferredViewMode: DiffViewMode,
): DiffControllerState {
  return {
    diffOverview: createDiffOverviewState([], null, preferredViewMode),
    isLoading: false,
    unsupportedMessage: null,
    errorMessage: null,
  };
}

export function createDiffController(
  options: CreateDiffControllerOptions = {},
): DiffController {
  const diffApiClient =
    options.diffApiClient ??
    createDiffApiClient({
      apiBaseUrl: options.apiBaseUrl,
    });
  const notifyStateChange = options.onStateChange ?? (() => {});
  const diffRequestGuard = createLatestDiffRequestGuard();
  let preferredViewMode: DiffViewMode = "side-by-side";
  let state = createInitialDiffControllerState(preferredViewMode);
  let loadedDiffContextId: string | null = null;
  let rememberedDiffSelections: Readonly<Record<string, string>> = {};

  function setState(nextState: DiffControllerState): void {
    state = nextState;
    notifyStateChange(state);
  }

  function updateState(
    updater: (currentState: DiffControllerState) => DiffControllerState,
  ): void {
    setState(updater(state));
  }

  function resetDiffState(): void {
    diffRequestGuard.invalidate();
    loadedDiffContextId = null;
    setState(createInitialDiffControllerState(preferredViewMode));
  }

  return {
    getState(): DiffControllerState {
      return state;
    },
    async synchronize(
      synchronizationOptions: DiffSynchronizationOptions,
    ): Promise<void> {
      const diffLoadDecision = resolveDiffLoadDecision(synchronizationOptions);

      if (diffLoadDecision.type === "reset") {
        resetDiffState();
        return;
      }

      if (diffLoadDecision.type === "unsupported") {
        diffRequestGuard.invalidate();
        loadedDiffContextId = null;
        setState({
          diffOverview: createDiffOverviewState([], null, preferredViewMode),
          isLoading: false,
          unsupportedMessage: diffLoadDecision.unsupportedMessage,
          errorMessage: null,
        });
        return;
      }

      const requestToken = diffRequestGuard.issue(diffLoadDecision.contextId);
      const shouldShowLoading =
        loadedDiffContextId !== diffLoadDecision.contextId &&
        state.diffOverview.files.length === 0;
      if (shouldShowLoading || state.unsupportedMessage !== null) {
        updateState((currentState) => ({
          ...currentState,
          isLoading: shouldShowLoading,
          unsupportedMessage: null,
          errorMessage: shouldShowLoading ? null : currentState.errorMessage,
        }));
      }

      try {
        const diffResponse = await diffApiClient.fetchContextDiff(
          diffLoadDecision.contextId,
        );
        if (!diffRequestGuard.isCurrent(requestToken)) {
          return;
        }

        const requestedSelectedPath = resolveRememberedDiffSelection({
          activeContextId: diffLoadDecision.contextId,
          loadedContextId: loadedDiffContextId,
          currentSelectedPath: state.diffOverview.selectedPath,
          rememberedSelections: rememberedDiffSelections,
        });
        const nextDiffOverview = createDiffOverviewState(
          diffResponse.files,
          requestedSelectedPath,
          preferredViewMode,
          diffResponse.stats,
        );
        const currentSnapshot = serializeDiffOverviewSnapshot({
          files: state.diffOverview.files,
          stats: state.diffOverview.stats,
          selectedPath: state.diffOverview.selectedPath,
          preferredViewMode: state.diffOverview.preferredViewMode,
        });
        const nextSnapshot = serializeDiffOverviewSnapshot({
          files: nextDiffOverview.files,
          stats: nextDiffOverview.stats,
          selectedPath: nextDiffOverview.selectedPath,
          preferredViewMode: nextDiffOverview.preferredViewMode,
        });

        if (
          currentSnapshot !== nextSnapshot ||
          state.errorMessage !== null ||
          state.unsupportedMessage !== null ||
          state.isLoading
        ) {
          updateState((currentState) => ({
            ...currentState,
            diffOverview: nextDiffOverview,
            errorMessage: null,
            unsupportedMessage: null,
          }));
        }

        const selectedPath = nextDiffOverview.selectedPath;
        if (selectedPath !== null) {
          rememberedDiffSelections = rememberDiffSelection(
            rememberedDiffSelections,
            diffLoadDecision.contextId,
            selectedPath,
          );
        }
        loadedDiffContextId = diffLoadDecision.contextId;
      } catch (error) {
        if (!diffRequestGuard.isCurrent(requestToken)) {
          return;
        }

        loadedDiffContextId = diffLoadDecision.contextId;
        updateState((currentState) => ({
          ...currentState,
          diffOverview: createDiffOverviewState([], null, preferredViewMode),
          errorMessage: toErrorMessage(error),
        }));
      } finally {
        if (diffRequestGuard.isCurrent(requestToken) && state.isLoading) {
          updateState((currentState) => ({
            ...currentState,
            isLoading: false,
          }));
        }
      }
    },
    selectPath(activeContextId: string | null, path: string): void {
      if (activeContextId !== null) {
        rememberedDiffSelections = rememberDiffSelection(
          rememberedDiffSelections,
          activeContextId,
          path,
        );
      }

      updateState((currentState) => ({
        ...currentState,
        diffOverview: createDiffOverviewState(
          currentState.diffOverview.files,
          path,
          preferredViewMode,
          currentState.diffOverview.stats,
        ),
      }));
    },
    setPreferredViewMode(mode: DiffViewMode): void {
      preferredViewMode = mode;
      updateState((currentState) => ({
        ...currentState,
        diffOverview: createDiffOverviewState(
          currentState.diffOverview.files,
          currentState.diffOverview.selectedPath,
          preferredViewMode,
          currentState.diffOverview.stats,
        ),
      }));
    },
  };
}
