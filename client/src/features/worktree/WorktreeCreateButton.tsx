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
import { createWorktreeApiClient } from "../../../../client-shared/src/api/worktree";
import { suggestDefaultWorktreeName } from "./naming";

export interface WorktreeCreateButtonProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly projectPath: string;
  readonly isGitRepo: boolean;
  readonly triggerLabel?: string | undefined;
  readonly triggerClass?: string | undefined;
  onOpenWorktreeProject(path: string): Promise<void>;
}

interface LoadedWorktreeDialogData {
  readonly branches: readonly BranchInfo[];
  readonly selectedBaseBranch: string;
  readonly defaultWorktreeName: string;
}

function toErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

async function loadAllBranches(
  contextId: string,
  apiBaseUrl: string,
): Promise<readonly BranchInfo[]> {
  const branchesApiClient = createBranchesApiClient({ apiBaseUrl });
  const aggregatedBranches: BranchInfo[] = [];
  let currentOffset = 0;
  let totalBranches = 0;

  do {
    const branchListResponse = await branchesApiClient.listBranches(contextId, {
      offset: currentOffset,
      limit: 100,
    });

    if (currentOffset === 0) {
      totalBranches = branchListResponse.total;
    }

    aggregatedBranches.push(...branchListResponse.branches);
    currentOffset += branchListResponse.branches.length;

    if (branchListResponse.branches.length === 0) {
      break;
    }
  } while (currentOffset < totalBranches);

  return aggregatedBranches;
}

async function loadDialogData(
  contextId: string,
  apiBaseUrl: string,
): Promise<LoadedWorktreeDialogData> {
  const worktreeApiClient = createWorktreeApiClient({ apiBaseUrl });
  const [branches, worktreeListResponse] = await Promise.all([
    loadAllBranches(contextId, apiBaseUrl),
    worktreeApiClient.listWorktrees(contextId),
  ]);

  const fallbackBranchName = branches[0]?.name ?? "";
  const selectedBaseBranch =
    branches.find((branchInfo) => branchInfo.isCurrent)?.name ??
    branches.find((branchInfo) => branchInfo.isDefault)?.name ??
    fallbackBranchName;

  return {
    branches,
    selectedBaseBranch,
    defaultWorktreeName: suggestDefaultWorktreeName(
      worktreeListResponse.worktrees,
    ),
  };
}

export function WorktreeCreateButton(
  props: WorktreeCreateButtonProps,
): JSX.Element {
  const worktreeApiClient = createWorktreeApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isCreating, setIsCreating] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [availableBranches, setAvailableBranches] = createSignal<
    readonly BranchInfo[]
  >([]);
  const [selectedBaseBranch, setSelectedBaseBranch] = createSignal("");
  const [branchFilterQuery, setBranchFilterQuery] = createSignal("");
  const [worktreeName, setWorktreeName] = createSignal("");

  const filteredBranches = createMemo(() => {
    const normalizedBranchFilter = branchFilterQuery().trim().toLowerCase();
    if (normalizedBranchFilter.length === 0) {
      return availableBranches();
    }

    return availableBranches().filter((branchInfo) =>
      branchInfo.name.toLowerCase().includes(normalizedBranchFilter),
    );
  });

  const createSummaryText = createMemo(() => {
    const trimmedWorktreeName = worktreeName().trim();
    const trimmedBaseBranch = selectedBaseBranch().trim();

    if (trimmedWorktreeName.length === 0 || trimmedBaseBranch.length === 0) {
      return "Create a new worktree-backed project tab.";
    }

    return `Create branch '${trimmedWorktreeName}' from '${trimmedBaseBranch}' and open it as a new worktree project.`;
  });

  function resetDialogState(): void {
    setErrorMessage(null);
    setIsLoading(false);
    setIsCreating(false);
    setAvailableBranches([]);
    setSelectedBaseBranch("");
    setBranchFilterQuery("");
    setWorktreeName("");
  }

  async function openDialog(): Promise<void> {
    if (!props.isGitRepo || props.contextId === null || isLoading()) {
      return;
    }

    setDialogOpen(true);
    setErrorMessage(null);
    setBranchFilterQuery("");
    setIsLoading(true);

    try {
      const dialogData = await loadDialogData(
        props.contextId,
        props.apiBaseUrl,
      );
      setAvailableBranches(dialogData.branches);
      setSelectedBaseBranch(dialogData.selectedBaseBranch);
      setWorktreeName(dialogData.defaultWorktreeName);
    } catch (error) {
      resetDialogState();
      setDialogOpen(true);
      setErrorMessage(toErrorMessage(error, "Failed to load worktree data."));
    } finally {
      setIsLoading(false);
    }
  }

  function closeDialog(): void {
    if (isCreating()) {
      return;
    }

    setDialogOpen(false);
    resetDialogState();
  }

  async function createWorktreeProject(): Promise<void> {
    const contextId = props.contextId;
    const trimmedWorktreeName = worktreeName().trim();
    const trimmedBaseBranch = selectedBaseBranch().trim();

    if (contextId === null) {
      return;
    }

    if (trimmedBaseBranch.length === 0) {
      setErrorMessage("Select a base branch before creating the worktree.");
      return;
    }

    if (trimmedWorktreeName.length === 0) {
      setErrorMessage("Worktree name is required.");
      return;
    }

    if (
      availableBranches().some(
        (branchInfo) => branchInfo.name === trimmedWorktreeName,
      )
    ) {
      setErrorMessage(
        `Branch '${trimmedWorktreeName}' already exists. Choose another worktree name.`,
      );
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const createWorktreeResponse = await worktreeApiClient.createWorktree(
        contextId,
        {
          branch: trimmedWorktreeName,
          worktreeName: trimmedWorktreeName,
          createBranch: true,
          baseBranch: trimmedBaseBranch,
        },
      );

      if (!createWorktreeResponse.success) {
        throw new Error(
          createWorktreeResponse.error ?? "Failed to create worktree project.",
        );
      }

      await props.onOpenWorktreeProject(createWorktreeResponse.path);
      setDialogOpen(false);
      resetDialogState();
    } catch (error) {
      setErrorMessage(
        toErrorMessage(error, "Failed to create worktree project."),
      );
    } finally {
      setIsCreating(false);
    }
  }

  createEffect(() => {
    if (!dialogOpen()) {
      return;
    }

    const closeDialogOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    window.addEventListener("keydown", closeDialogOnEscape);

    onCleanup(() => {
      window.removeEventListener("keydown", closeDialogOnEscape);
    });
  });

  createEffect(() => {
    if (!props.isGitRepo || props.contextId === null) {
      setDialogOpen(false);
      resetDialogState();
    }
  });

  return (
    <>
      <button
        type="button"
        class={
          props.triggerClass ??
          "rounded-md border border-border-default bg-bg-primary px-2.5 py-1 text-[11px] font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
        }
        disabled={
          !props.isGitRepo ||
          props.contextId === null ||
          props.projectPath.trim().length === 0 ||
          isLoading() ||
          isCreating()
        }
        onClick={() => void openDialog()}
      >
        {props.triggerLabel ?? "Create Worktree"}
      </button>
      <Show when={dialogOpen()}>
        <Portal>
          <div
            class="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeDialog();
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Create worktree project"
              class="flex max-h-[min(80vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-secondary shadow-2xl shadow-black/30"
            >
              <div class="border-b border-border-default px-5 py-4">
                <div class="text-lg font-semibold text-text-primary">
                  Create Worktree Project
                </div>
                <div class="mt-1 text-sm text-text-secondary">
                  Select a base branch, name the worktree, then open it as a
                  separate project tab.
                </div>
              </div>
              <div class="flex flex-col gap-4 overflow-auto px-5 py-4">
                <div class="rounded-xl border border-border-default bg-bg-primary/70 px-4 py-3">
                  <div class="text-xs uppercase tracking-[0.2em] text-text-tertiary">
                    Source project
                  </div>
                  <div class="mt-2 font-mono text-sm text-text-primary">
                    {props.projectPath}
                  </div>
                </div>

                <Show when={errorMessage() !== null}>
                  <div class="rounded-xl border border-danger-emphasis/40 bg-danger-muted/10 px-4 py-3 text-sm text-danger-fg">
                    {errorMessage()}
                  </div>
                </Show>

                <Show
                  when={!isLoading()}
                  fallback={
                    <div class="rounded-xl border border-border-default bg-bg-primary/50 px-4 py-6 text-sm text-text-secondary">
                      Loading branches and worktree state...
                    </div>
                  }
                >
                  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <div class="space-y-3">
                      <label class="block text-sm text-text-secondary">
                        Base branch
                      </label>
                      <input
                        type="search"
                        value={branchFilterQuery()}
                        placeholder="Filter local branches..."
                        class="w-full rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-emphasis"
                        onInput={(event) =>
                          setBranchFilterQuery(event.currentTarget.value)
                        }
                      />
                      <div class="max-h-72 overflow-auto rounded-xl border border-border-default bg-bg-primary">
                        <Show
                          when={filteredBranches().length > 0}
                          fallback={
                            <div class="px-4 py-6 text-sm text-text-secondary">
                              No matching local branches.
                            </div>
                          }
                        >
                          <div class="divide-y divide-border-muted">
                            <For each={filteredBranches()}>
                              {(branchInfo) => {
                                const isSelected =
                                  branchInfo.name === selectedBaseBranch();

                                return (
                                  <button
                                    type="button"
                                    class={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                                      isSelected
                                        ? "bg-accent-muted/20 text-text-primary"
                                        : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                                    }`}
                                    onClick={() =>
                                      setSelectedBaseBranch(branchInfo.name)
                                    }
                                  >
                                    <div class="min-w-0">
                                      <div class="font-mono text-sm">
                                        {branchInfo.name}
                                      </div>
                                      <div class="mt-1 text-xs text-text-tertiary">
                                        {branchInfo.lastCommit.message}
                                      </div>
                                    </div>
                                    <div class="flex shrink-0 flex-col items-end gap-1 text-[10px] uppercase tracking-wide text-text-tertiary">
                                      <Show when={branchInfo.isCurrent}>
                                        <span>Current</span>
                                      </Show>
                                      <Show when={branchInfo.isDefault}>
                                        <span>Default</span>
                                      </Show>
                                    </div>
                                  </button>
                                );
                              }}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </div>

                    <div class="space-y-3 rounded-xl border border-border-default bg-bg-primary/70 px-4 py-4">
                      <label class="block text-sm text-text-secondary">
                        Worktree name
                      </label>
                      <input
                        type="text"
                        value={worktreeName()}
                        placeholder="wt-1"
                        class="w-full rounded-md border border-border-default bg-bg-primary px-3 py-2 font-mono text-sm text-text-primary outline-none transition focus:border-accent-emphasis"
                        onInput={(event) =>
                          setWorktreeName(event.currentTarget.value)
                        }
                      />
                      <div class="text-xs text-text-secondary">
                        {createSummaryText()}
                      </div>
                      <div class="rounded-lg border border-border-default bg-bg-secondary px-3 py-3 text-xs text-text-tertiary">
                        The worktree and its new branch use the same name so the
                        resulting project tab stays easy to identify.
                      </div>
                    </div>
                  </div>
                </Show>
              </div>
              <div class="flex items-center justify-end gap-3 border-t border-border-default px-5 py-4">
                <button
                  type="button"
                  class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm text-text-secondary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isCreating()}
                  onClick={closeDialog}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-md border border-accent-emphasis/40 bg-accent-muted/20 px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoading() || isCreating()}
                  onClick={() => void createWorktreeProject()}
                >
                  {isCreating() ? "Creating..." : "Create Worktree Project"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  );
}
