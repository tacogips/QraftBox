import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import {
  createGitActionsApiClient,
  type GitActionName,
  type GitActionResult,
  type GitOperationPhase,
  type PullRequestStatus,
} from "../../../../client-shared/src/api/git-actions";
import {
  canRunPullRequestAction,
  extractPullRequestUrl,
  getPullRequestActionLabel,
  resolvePullRequestBaseBranch,
  resolveSelectedPullRequestBaseBranch,
  shouldShowCancelGitActionButton,
} from "./git-actions-state";
import { createLatestRequestGuard } from "./latest-request-guard";

export interface GitActionsBarProps {
  readonly apiBaseUrl: string;
  readonly projectPath: string;
  readonly isGitRepo: boolean;
  readonly hasChanges: boolean;
  onSuccess(action: GitActionName): Promise<void> | void;
}

interface NoticeState {
  readonly type: "success" | "error";
  readonly message: string;
}

function createActionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `git-action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getGitActionButtonClass(
  variant: "pull" | "commit" | "push" | "pr",
): string {
  if (variant === "pull") {
    return "border-attention-emphasis/60 bg-attention-emphasis text-white hover:brightness-110";
  }

  if (variant === "commit") {
    return "border-success-emphasis/60 bg-success-emphasis text-white hover:brightness-110";
  }

  if (variant === "push") {
    return "border-accent-emphasis/60 bg-accent-emphasis text-white hover:brightness-110";
  }

  return "border-done-emphasis/60 bg-done-emphasis text-white hover:brightness-110";
}

function getNoticeClass(type: NoticeState["type"]): string {
  if (type === "error") {
    return "border-danger-emphasis/40 bg-danger-muted/10 text-danger-fg";
  }

  return "border-success-emphasis/40 bg-success-muted/10 text-success-fg";
}

function getOperationLabel(
  phase: GitOperationPhase,
  idleLabel: string,
): string {
  if (phase === "committing") {
    return "AI generating...";
  }
  if (phase === "pushing") {
    return "Pushing...";
  }
  if (phase === "pulling") {
    return "Pulling...";
  }
  if (phase === "creating-pr") {
    return "AI generating...";
  }

  return idleLabel;
}

function getActionButtonLabel(options: {
  readonly activePhase: GitOperationPhase;
  readonly buttonPhase: GitOperationPhase;
  readonly idleLabel: string;
}): string {
  return options.activePhase === options.buttonPhase
    ? getOperationLabel(options.activePhase, options.idleLabel)
    : options.idleLabel;
}

function throwIfGitActionFailed(
  result: GitActionResult,
  fallbackMessage: string,
): void {
  if (!result.success) {
    throw new Error(result.error ?? fallbackMessage);
  }
}

export function GitActionsBar(props: GitActionsBarProps): JSX.Element {
  const gitActionsApi = createGitActionsApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const operationStatusRequestGuard = createLatestRequestGuard();
  const pullRequestStatusRequestGuard = createLatestRequestGuard();
  const [operating, setOperating] = createSignal(false);
  const [operationPhase, setOperationPhase] =
    createSignal<GitOperationPhase>("idle");
  const [localOperationLock, setLocalOperationLock] = createSignal(false);
  const [activeActionId, setActiveActionId] = createSignal<string | null>(null);
  const [cancellingOperation, setCancellingOperation] = createSignal(false);
  const [notice, setNotice] = createSignal<NoticeState | null>(null);
  const [prStatus, setPrStatus] = createSignal<PullRequestStatus | null>(null);
  const [prLoading, setPrLoading] = createSignal(false);
  const [selectedBaseBranch, setSelectedBaseBranch] = createSignal("");
  const [pullRequestDialogOpen, setPullRequestDialogOpen] = createSignal(false);

  const prNumber = () => prStatus()?.pr?.number ?? null;
  const pullRequestLink = () => prStatus()?.pr?.url ?? null;
  const primaryPrActionLabel = () => getPullRequestActionLabel(prNumber());
  const canRunPrimaryPrAction = () =>
    canRunPullRequestAction({
      operating: operating(),
      prLoading: prLoading(),
      prCanCreate: prStatus()?.canCreatePR ?? false,
      prNumber: prNumber(),
    });
  const canCancelCurrentAction = () =>
    shouldShowCancelGitActionButton({
      operating: operating(),
      operationPhase: operationPhase(),
      activeActionId: activeActionId(),
      cancellingOperation: cancellingOperation(),
    });

  function setSuccessNotice(message: string): void {
    setNotice({
      type: "success",
      message,
    });
  }

  function setErrorNotice(error: unknown, fallbackMessage: string): void {
    setNotice({
      type: "error",
      message: error instanceof Error ? error.message : fallbackMessage,
    });
  }

  async function refreshPullRequestStatus(): Promise<void> {
    if (!props.isGitRepo) {
      pullRequestStatusRequestGuard.invalidate();
      setPrStatus(null);
      setSelectedBaseBranch("");
      setPullRequestDialogOpen(false);
      return;
    }

    const currentRequestId = pullRequestStatusRequestGuard.issue();
    setPrLoading(true);
    try {
      const nextPullRequestStatus = await gitActionsApi.fetchPullRequestStatus(
        props.projectPath,
      );
      if (!pullRequestStatusRequestGuard.isCurrent(currentRequestId)) {
        return;
      }
      setPrStatus(nextPullRequestStatus);
      setSelectedBaseBranch((currentSelectedBaseBranch) =>
        resolveSelectedPullRequestBaseBranch({
          selectedBaseBranch: currentSelectedBaseBranch,
          fallbackBaseBranch: nextPullRequestStatus.baseBranch,
          availableBaseBranches: nextPullRequestStatus.availableBaseBranches,
        }),
      );
    } catch {
      if (!pullRequestStatusRequestGuard.isCurrent(currentRequestId)) {
        return;
      }
      setPrStatus(null);
      setSelectedBaseBranch("");
      setPullRequestDialogOpen(false);
    } finally {
      if (pullRequestStatusRequestGuard.isCurrent(currentRequestId)) {
        setPrLoading(false);
      }
    }
  }

  async function refreshOperationStatus(): Promise<void> {
    if (!props.isGitRepo || localOperationLock()) {
      return;
    }

    const currentRequestId = operationStatusRequestGuard.issue();
    try {
      const nextOperationStatus = await gitActionsApi.fetchOperationStatus();
      if (!operationStatusRequestGuard.isCurrent(currentRequestId)) {
        return;
      }
      setOperating(nextOperationStatus.operating);
      setOperationPhase(
        nextOperationStatus.operating ? nextOperationStatus.phase : "idle",
      );
      if (!nextOperationStatus.operating) {
        setActiveActionId(null);
        setCancellingOperation(false);
      }
    } catch {
      if (!operationStatusRequestGuard.isCurrent(currentRequestId)) {
        return;
      }
      // Keep the local UI state when polling fails.
    }
  }

  async function finalizeSuccessfulAction(
    action: GitActionName,
    successMessage: string,
  ): Promise<void> {
    if (action === "commit" || action === "pr") {
      await refreshPullRequestStatus();
    }
    setSuccessNotice(successMessage);
    await props.onSuccess(action);
  }

  async function runGitAction(options: {
    readonly action: GitActionName;
    readonly phase: GitOperationPhase;
    readonly actionId?: string | undefined;
    readonly execute: () => Promise<GitActionResult>;
    readonly successMessage: string;
    readonly fallbackErrorMessage: string;
  }): Promise<void> {
    operationStatusRequestGuard.invalidate();
    pullRequestStatusRequestGuard.invalidate();
    setLocalOperationLock(true);
    setOperating(true);
    setOperationPhase(options.phase);
    setActiveActionId(options.actionId ?? null);
    setCancellingOperation(false);
    setNotice(null);

    try {
      const result = await options.execute();
      throwIfGitActionFailed(result, options.fallbackErrorMessage);
      await finalizeSuccessfulAction(options.action, options.successMessage);
    } catch (error) {
      setErrorNotice(error, options.fallbackErrorMessage);
    } finally {
      setLocalOperationLock(false);
      setOperating(false);
      setOperationPhase("idle");
      setActiveActionId(null);
      setCancellingOperation(false);
    }
  }

  async function handlePull(): Promise<void> {
    await runGitAction({
      action: "pull",
      phase: "pulling",
      execute: () => gitActionsApi.pull(props.projectPath),
      successMessage: "Pull completed.",
      fallbackErrorMessage: "Pull failed.",
    });
  }

  async function handleCommit(): Promise<void> {
    const actionId = createActionId();
    await runGitAction({
      action: "commit",
      phase: "committing",
      actionId,
      execute: () =>
        gitActionsApi.commit({
          projectPath: props.projectPath,
          actionId,
        }),
      successMessage: "Commit completed.",
      fallbackErrorMessage: "Commit failed.",
    });
  }

  async function handlePush(): Promise<void> {
    await runGitAction({
      action: "push",
      phase: "pushing",
      execute: () => gitActionsApi.push(props.projectPath),
      successMessage: "Push completed.",
      fallbackErrorMessage: "Push failed.",
    });
  }

  async function handlePullRequestAction(): Promise<void> {
    const baseBranch = resolvePullRequestBaseBranch({
      selectedBaseBranch: selectedBaseBranch(),
      fallbackBaseBranch: prStatus()?.baseBranch ?? "main",
    });
    const actionId = createActionId();
    const hasExistingPullRequest = prNumber() !== null;
    setPullRequestDialogOpen(false);

    await runGitAction({
      action: "pr",
      phase: "creating-pr",
      actionId,
      execute: async () => {
        const result = hasExistingPullRequest
          ? await gitActionsApi.updatePullRequest({
              projectPath: props.projectPath,
              baseBranch,
              actionId,
            })
          : await gitActionsApi.createPullRequest({
              projectPath: props.projectPath,
              baseBranch,
              actionId,
            });
        const pullRequestUrl = extractPullRequestUrl(result.output);
        if (pullRequestUrl !== null) {
          setPrStatus((currentPullRequestStatus) => {
            if (currentPullRequestStatus === null) {
              return currentPullRequestStatus;
            }

            return {
              ...currentPullRequestStatus,
              hasPR: true,
              pr: {
                url: pullRequestUrl,
                number: currentPullRequestStatus.pr?.number ?? 0,
                state: currentPullRequestStatus.pr?.state ?? "open",
                title: currentPullRequestStatus.pr?.title ?? "",
              },
            };
          });
        }
        return result;
      },
      successMessage: hasExistingPullRequest
        ? "Pull request updated."
        : "Pull request created.",
      fallbackErrorMessage: hasExistingPullRequest
        ? "Failed to update pull request."
        : "Failed to create pull request.",
    });
  }

  function handleBaseBranchSelection(baseBranch: string): void {
    setSelectedBaseBranch(baseBranch);
  }

  function openPullRequestDialog(): void {
    if (!canRunPrimaryPrAction()) {
      return;
    }

    setPullRequestDialogOpen(true);
  }

  createEffect(() => {
    if (!pullRequestDialogOpen()) {
      return;
    }

    const closeDialogOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setPullRequestDialogOpen(false);
      }
    };

    window.addEventListener("keydown", closeDialogOnEscape);

    onCleanup(() => {
      window.removeEventListener("keydown", closeDialogOnEscape);
    });
  });

  async function handleCancelCurrentAction(): Promise<void> {
    const currentActionId = activeActionId();
    if (currentActionId === null || !canCancelCurrentAction()) {
      return;
    }

    setCancellingOperation(true);
    try {
      await gitActionsApi.cancel(currentActionId);
      setSuccessNotice("Cancellation requested.");
    } catch (error) {
      setErrorNotice(error, "Failed to cancel the current action.");
      setCancellingOperation(false);
    }
  }

  createEffect(() => {
    if (!props.isGitRepo || props.projectPath.trim().length === 0) {
      operationStatusRequestGuard.invalidate();
      pullRequestStatusRequestGuard.invalidate();
      setOperating(false);
      setOperationPhase("idle");
      setActiveActionId(null);
      setCancellingOperation(false);
      setNotice(null);
      setPrStatus(null);
      setSelectedBaseBranch("");
      setPullRequestDialogOpen(false);
      return;
    }

    void refreshOperationStatus();
    void refreshPullRequestStatus();

    const intervalId = window.setInterval(() => {
      void refreshOperationStatus();
    }, 2000);

    onCleanup(() => {
      window.clearInterval(intervalId);
    });
  });

  return (
    <div class="contents">
      <Show when={pullRequestDialogOpen()}>
        <Portal>
          <div
            class="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setPullRequestDialogOpen(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Choose pull request base branch"
              class="flex max-h-[min(80vh,42rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-secondary shadow-2xl shadow-black/30"
            >
              <div class="border-b border-border-default px-5 py-4">
                <div class="text-lg font-semibold text-text-primary">
                  {primaryPrActionLabel()}
                </div>
                <div class="mt-1 text-sm text-text-secondary">
                  Choose the base branch for this pull request.
                </div>
                <Show
                  when={prStatus()?.pr !== null && prStatus()?.pr !== undefined}
                >
                  <a
                    href={pullRequestLink() ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    class="mt-3 inline-flex w-fit items-center rounded-md border border-border-default bg-bg-primary px-3 py-1.5 text-sm font-medium text-text-primary transition hover:bg-bg-hover"
                  >
                    Open PR #{prNumber()}
                  </a>
                </Show>
              </div>
              <div class="border-b border-border-subtle bg-bg-primary/60 px-5 py-3 text-sm text-text-secondary">
                Selected base branch:
                <span class="ml-2 font-semibold text-text-primary">
                  {resolvePullRequestBaseBranch({
                    selectedBaseBranch: selectedBaseBranch(),
                    fallbackBaseBranch: prStatus()?.baseBranch ?? "main",
                  })}
                </span>
              </div>
              <div class="max-h-80 overflow-y-auto p-3">
                <div class="grid gap-2">
                  <For each={prStatus()?.availableBaseBranches ?? []}>
                    {(baseBranch) => (
                      <button
                        type="button"
                        class={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${
                          selectedBaseBranch() === baseBranch
                            ? "border-accent-emphasis bg-accent-muted/20 text-text-primary"
                            : "border-border-default bg-bg-primary text-text-secondary hover:bg-bg-hover"
                        }`}
                        onClick={() => handleBaseBranchSelection(baseBranch)}
                      >
                        <span class="truncate font-medium">{baseBranch}</span>
                        <Show when={selectedBaseBranch() === baseBranch}>
                          <span class="text-xs font-semibold text-accent-emphasis">
                            Selected
                          </span>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div class="flex items-center justify-end gap-2 border-t border-border-default px-5 py-4">
                <button
                  type="button"
                  class="rounded-md border border-border-default bg-bg-primary px-3 py-1.5 text-sm font-medium text-text-primary transition hover:bg-bg-hover"
                  onClick={() => setPullRequestDialogOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class={`rounded-md border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${getGitActionButtonClass(
                    "pr",
                  )}`}
                  disabled={operating() || prLoading()}
                  onClick={() => void handlePullRequestAction()}
                >
                  {primaryPrActionLabel()}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
      <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class={`rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${getGitActionButtonClass(
            "pull",
          )}`}
          disabled={operating()}
          onClick={() => void handlePull()}
        >
          {getActionButtonLabel({
            activePhase: operationPhase(),
            buttonPhase: "pulling",
            idleLabel: "Pull",
          })}
        </button>
        <button
          type="button"
          class={`rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${getGitActionButtonClass(
            "commit",
          )}`}
          disabled={operating() || !props.hasChanges}
          title={props.hasChanges ? undefined : "No changed files to commit"}
          onClick={() => void handleCommit()}
        >
          {getActionButtonLabel({
            activePhase: operationPhase(),
            buttonPhase: "committing",
            idleLabel: "Commit",
          })}
        </button>
        <button
          type="button"
          class={`rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${getGitActionButtonClass(
            "push",
          )}`}
          disabled={operating()}
          onClick={() => void handlePush()}
        >
          {getActionButtonLabel({
            activePhase: operationPhase(),
            buttonPhase: "pushing",
            idleLabel: "Push",
          })}
        </button>
        <button
          type="button"
          class={`rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${getGitActionButtonClass(
            "pr",
          )}`}
          disabled={!canRunPrimaryPrAction()}
          onClick={openPullRequestDialog}
        >
          <span class="flex flex-col items-center leading-tight">
            <span>
              {getActionButtonLabel({
                activePhase: operationPhase(),
                buttonPhase: "creating-pr",
                idleLabel: primaryPrActionLabel(),
              })}
            </span>
            <Show when={prNumber() !== null}>
              <span class="mt-1 text-[10px] font-medium opacity-90">
                PR #{prNumber()}
              </span>
            </Show>
          </span>
        </button>
        <Show when={canCancelCurrentAction() || cancellingOperation()}>
          <button
            type="button"
            class="rounded-md border border-danger-emphasis/60 bg-danger-emphasis px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCancelCurrentAction() && !cancellingOperation()}
            onClick={() => void handleCancelCurrentAction()}
          >
            {cancellingOperation() ? "Cancelling..." : "Cancel"}
          </button>
        </Show>
        <Show when={prStatus()?.pr !== null && prStatus()?.pr !== undefined}>
          <button
            type="button"
            class="rounded-md border border-border-default bg-bg-primary px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-bg-hover"
            onClick={() => {
              const currentPullRequest = prStatus()?.pr;
              if (
                currentPullRequest !== null &&
                currentPullRequest !== undefined
              ) {
                window.open(
                  currentPullRequest.url,
                  "_blank",
                  "noopener,noreferrer",
                );
              }
            }}
          >
            Open PR
          </button>
        </Show>
        <Show
          when={
            (prStatus()?.reason ?? "").length > 0 &&
            prStatus()?.pr === null &&
            !(prStatus()?.canCreatePR ?? false)
          }
        >
          <span class="rounded-full border border-border-default bg-bg-primary px-2 py-1 text-[11px] text-text-secondary">
            PR unavailable: {prStatus()?.reason}
          </span>
        </Show>
        <Show when={notice() !== null}>
          <span
            class={`rounded-full border px-2 py-1 text-[11px] ${getNoticeClass(
              notice()!.type,
            )}`}
          >
            {notice()!.message}
          </span>
        </Show>
      </div>
    </div>
  );
}
