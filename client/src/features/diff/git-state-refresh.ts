import type { AppScreen } from "../../../../client-shared/src/contracts/navigation";

export interface GitStateRefreshController {
  connect(): void;
  disconnect(): void;
}

interface EventTargetLike {
  addEventListener(eventName: string, listener: () => void): void;
  removeEventListener(eventName: string, listener: () => void): void;
}

interface VisibilitySource extends EventTargetLike {
  readonly visibilityState: "visible" | "hidden";
}

export interface CreateGitStateRefreshControllerOptions {
  readonly pollMs?: number | undefined;
  readonly refreshScreens?: readonly AppScreen[] | undefined;
  readonly windowSource?: EventTargetLike | undefined;
  readonly documentSource?: VisibilitySource | undefined;
  readonly setIntervalFn?:
    | ((callback: () => void, delayMs: number) => ReturnType<typeof setInterval>)
    | undefined;
  readonly clearIntervalFn?:
    | ((timerId: ReturnType<typeof setInterval>) => void)
    | undefined;
  getContextId(): string | null;
  getActiveScreen(): AppScreen;
  isGitRepo(): boolean;
  refreshContext(contextId: string): Promise<void> | void;
}

function canRefreshGitState(
  options: CreateGitStateRefreshControllerOptions,
  documentSource: VisibilitySource,
  refreshScreens: ReadonlySet<AppScreen>,
): string | null {
  if (documentSource.visibilityState !== "visible") {
    return null;
  }

  if (!refreshScreens.has(options.getActiveScreen())) {
    return null;
  }

  if (!options.isGitRepo()) {
    return null;
  }

  return options.getContextId();
}

export function createGitStateRefreshController(
  options: CreateGitStateRefreshControllerOptions,
): GitStateRefreshController {
  const pollMs = options.pollMs ?? 15_000;
  const refreshScreens = new Set<AppScreen>(
    options.refreshScreens ?? ["files", "ai-session"],
  );
  const windowSource = options.windowSource ?? window;
  const documentSource = options.documentSource ?? document;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function refreshIfNeeded(): void {
    const activeContextId = canRefreshGitState(
      options,
      documentSource,
      refreshScreens,
    );
    if (activeContextId === null) {
      return;
    }

    void options.refreshContext(activeContextId);
  }

  function handleFocus(): void {
    refreshIfNeeded();
  }

  function handleVisibilityChange(): void {
    if (documentSource.visibilityState === "visible") {
      refreshIfNeeded();
    }
  }

  return {
    connect(): void {
      if (pollTimer !== null) {
        return;
      }

      pollTimer = setIntervalFn(refreshIfNeeded, pollMs);
      windowSource.addEventListener("focus", handleFocus);
      documentSource.addEventListener("visibilitychange", handleVisibilityChange);
    },
    disconnect(): void {
      if (pollTimer !== null) {
        clearIntervalFn(pollTimer);
        pollTimer = null;
      }

      windowSource.removeEventListener("focus", handleFocus);
      documentSource.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    },
  };
}
