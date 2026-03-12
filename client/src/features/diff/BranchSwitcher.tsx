import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import {
  createBranchesApiClient,
  type BranchInfo,
} from "../../../../client-shared/src/api/branches";
import { createGitActionsApiClient } from "../../../../client-shared/src/api/git-actions";

export interface BranchSwitcherProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly isGitRepo: boolean;
  onSuccess(): Promise<void> | void;
}

export function BranchSwitcher(props: BranchSwitcherProps): JSX.Element {
  const branchesApi = createBranchesApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const gitActionsApi = createGitActionsApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const [operating, setOperating] = createSignal(false);
  const [currentBranchName, setCurrentBranchName] = createSignal("");
  const [availableBranches, setAvailableBranches] = createSignal<
    readonly BranchInfo[]
  >([]);
  const [branchDialogOpen, setBranchDialogOpen] = createSignal(false);
  const [branchLoading, setBranchLoading] = createSignal(false);
  const [branchFilterQuery, setBranchFilterQuery] = createSignal("");
  const [branchErrorMessage, setBranchErrorMessage] = createSignal<
    string | null
  >(null);
  const [checkoutBranchName, setCheckoutBranchName] = createSignal<
    string | null
  >(null);
  let latestBranchRequestId = 0;

  const branchButtonLabel = () => {
    const resolvedCurrentBranchName = currentBranchName().trim();
    return resolvedCurrentBranchName.length > 0
      ? resolvedCurrentBranchName
      : "Switch Branch";
  };
  const filteredBranches = createMemo(() => {
    const normalizedBranchQuery = branchFilterQuery().trim().toLowerCase();
    if (normalizedBranchQuery.length === 0) {
      return availableBranches();
    }

    return availableBranches().filter((branchInfo) =>
      branchInfo.name.toLowerCase().includes(normalizedBranchQuery),
    );
  });

  function resetBranchState(): void {
    setOperating(false);
    setCurrentBranchName("");
    setAvailableBranches([]);
    setBranchDialogOpen(false);
    setBranchLoading(false);
    setBranchFilterQuery("");
    setBranchErrorMessage(null);
    setCheckoutBranchName(null);
  }

  async function refreshOperationStatus(): Promise<void> {
    if (!props.isGitRepo || props.contextId === null) {
      setOperating(false);
      return;
    }

    try {
      const nextOperationStatus = await gitActionsApi.fetchOperationStatus();
      setOperating(nextOperationStatus.operating);
    } catch {
      // Keep the current UI state when polling fails.
    }
  }

  async function refreshCurrentBranchName(): Promise<void> {
    if (!props.isGitRepo || props.contextId === null) {
      resetBranchState();
      return;
    }

    const currentRequestId = ++latestBranchRequestId;
    try {
      const branchListResponse = await branchesApi.listBranches(
        props.contextId,
        {
          limit: 1,
        },
      );
      if (currentRequestId !== latestBranchRequestId) {
        return;
      }

      setCurrentBranchName(branchListResponse.current);
    } catch {
      if (currentRequestId !== latestBranchRequestId) {
        return;
      }

      setCurrentBranchName("");
    }
  }

  async function loadAllBranchesForDialog(): Promise<void> {
    if (!props.isGitRepo || props.contextId === null) {
      resetBranchState();
      return;
    }

    const currentRequestId = ++latestBranchRequestId;
    setBranchLoading(true);
    setBranchErrorMessage(null);

    try {
      const aggregatedBranches: BranchInfo[] = [];
      let currentOffset = 0;
      let totalBranches = 0;

      do {
        const branchListResponse = await branchesApi.listBranches(
          props.contextId,
          {
            offset: currentOffset,
            limit: 100,
          },
        );

        if (currentRequestId !== latestBranchRequestId) {
          return;
        }

        if (currentOffset === 0) {
          setCurrentBranchName(branchListResponse.current);
          totalBranches = branchListResponse.total;
        }

        aggregatedBranches.push(...branchListResponse.branches);
        currentOffset += branchListResponse.branches.length;

        if (branchListResponse.branches.length === 0) {
          break;
        }
      } while (currentOffset < totalBranches);

      if (currentRequestId !== latestBranchRequestId) {
        return;
      }

      setAvailableBranches(aggregatedBranches);
    } catch (error) {
      if (currentRequestId !== latestBranchRequestId) {
        return;
      }

      setAvailableBranches([]);
      setBranchErrorMessage(
        error instanceof Error ? error.message : "Failed to load branches.",
      );
    } finally {
      if (currentRequestId === latestBranchRequestId) {
        setBranchLoading(false);
      }
    }
  }

  function openBranchDialog(): void {
    if (
      !props.isGitRepo ||
      props.contextId === null ||
      operating() ||
      checkoutBranchName() !== null
    ) {
      return;
    }

    setBranchDialogOpen(true);
    setBranchFilterQuery("");
    setBranchErrorMessage(null);
    void loadAllBranchesForDialog();
  }

  async function handleBranchCheckout(branchName: string): Promise<void> {
    if (
      props.contextId === null ||
      branchName === currentBranchName() ||
      checkoutBranchName() !== null
    ) {
      return;
    }

    setCheckoutBranchName(branchName);
    setBranchErrorMessage(null);

    try {
      const checkoutResponse = await branchesApi.checkoutBranch(
        props.contextId,
        {
          branch: branchName,
        },
      );
      if (!checkoutResponse.success) {
        throw new Error(checkoutResponse.error ?? "Failed to checkout branch.");
      }

      setCurrentBranchName(checkoutResponse.currentBranch);
      setBranchDialogOpen(false);
      setBranchFilterQuery("");
      await props.onSuccess();
      await refreshCurrentBranchName();
    } catch (error) {
      setBranchErrorMessage(
        error instanceof Error ? error.message : "Failed to checkout branch.",
      );
    } finally {
      setCheckoutBranchName(null);
    }
  }

  createEffect(() => {
    if (!branchDialogOpen()) {
      return;
    }

    const closeDialogOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setBranchDialogOpen(false);
      }
    };

    window.addEventListener("keydown", closeDialogOnEscape);

    onCleanup(() => {
      window.removeEventListener("keydown", closeDialogOnEscape);
    });
  });

  createEffect(() => {
    if (!props.isGitRepo || props.contextId === null) {
      resetBranchState();
      return;
    }

    void refreshOperationStatus();
    void refreshCurrentBranchName();

    const intervalId = window.setInterval(() => {
      void refreshOperationStatus();
    }, 2000);

    onCleanup(() => {
      window.clearInterval(intervalId);
    });
  });

  return (
    <>
      <button
        type="button"
        class="rounded-md border border-border-default bg-bg-primary px-2.5 py-1 text-[11px] font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
        disabled={
          !props.isGitRepo ||
          props.contextId === null ||
          operating() ||
          checkoutBranchName() !== null
        }
        onClick={openBranchDialog}
      >
        <span class="font-mono">{branchButtonLabel()}</span>
      </button>
      <Show when={branchDialogOpen()}>
        <Portal>
          <div
            class="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setBranchDialogOpen(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Switch local branch"
              class="flex max-h-[min(80vh,42rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-secondary shadow-2xl shadow-black/30"
            >
              <div class="border-b border-border-default px-5 py-4">
                <div class="text-lg font-semibold text-text-primary">
                  Switch Branch
                </div>
                <div class="mt-1 text-sm text-text-secondary">
                  Choose the local branch to check out in this workspace.
                </div>
              </div>
              <div class="border-b border-border-subtle bg-bg-primary/60 px-5 py-3">
                <label class="flex flex-col gap-2 text-sm text-text-secondary">
                  <span>Current branch</span>
                  <span class="font-mono text-sm font-semibold text-text-primary">
                    {branchButtonLabel()}
                  </span>
                </label>
                <input
                  type="search"
                  value={branchFilterQuery()}
                  placeholder="Filter local branches..."
                  class="mt-3 w-full rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-emphasis"
                  onInput={(event) =>
                    setBranchFilterQuery(event.currentTarget.value)
                  }
                />
              </div>
              <div class="max-h-80 overflow-y-auto p-3">
                <Show when={branchErrorMessage() !== null}>
                  <div class="mb-3 rounded-xl border border-danger-emphasis/30 bg-danger-muted/10 px-3 py-2 text-sm text-danger-fg">
                    {branchErrorMessage()}
                  </div>
                </Show>
                <Show
                  when={!branchLoading()}
                  fallback={
                    <div class="px-3 py-8 text-center text-sm text-text-secondary">
                      Loading branches...
                    </div>
                  }
                >
                  <Show
                    when={filteredBranches().length > 0}
                    fallback={
                      <div class="px-3 py-8 text-center text-sm text-text-secondary">
                        No matching local branches.
                      </div>
                    }
                  >
                    <div class="grid gap-2">
                      <For each={filteredBranches()}>
                        {(branchInfo) => {
                          const isCurrentBranch = () =>
                            branchInfo.name === currentBranchName();
                          const isSwitchingToBranch = () =>
                            checkoutBranchName() === branchInfo.name;

                          return (
                            <button
                              type="button"
                              class={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${
                                isCurrentBranch()
                                  ? "border-accent-emphasis bg-accent-muted/20 text-text-primary"
                                  : "border-border-default bg-bg-primary text-text-secondary hover:bg-bg-hover"
                              }`}
                              disabled={
                                isCurrentBranch() ||
                                checkoutBranchName() !== null ||
                                operating()
                              }
                              onClick={() =>
                                void handleBranchCheckout(branchInfo.name)
                              }
                            >
                              <div class="min-w-0">
                                <div class="truncate font-mono font-medium">
                                  {branchInfo.name}
                                </div>
                                <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                                  <Show when={branchInfo.isCurrent}>
                                    <span class="rounded-full border border-accent-emphasis/40 px-2 py-0.5 text-accent-emphasis">
                                      Current
                                    </span>
                                  </Show>
                                  <Show when={branchInfo.isDefault}>
                                    <span class="rounded-full border border-border-default px-2 py-0.5 text-text-secondary">
                                      Default
                                    </span>
                                  </Show>
                                </div>
                              </div>
                              <span class="shrink-0 text-xs font-semibold">
                                {isCurrentBranch()
                                  ? "Checked out"
                                  : isSwitchingToBranch()
                                    ? "Switching..."
                                    : "Switch"}
                              </span>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </Show>
              </div>
              <div class="flex items-center justify-end gap-2 border-t border-border-default px-5 py-4">
                <button
                  type="button"
                  class="rounded-md border border-border-default bg-bg-primary px-3 py-1.5 text-sm font-medium text-text-primary transition hover:bg-bg-hover"
                  onClick={() => setBranchDialogOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  );
}
