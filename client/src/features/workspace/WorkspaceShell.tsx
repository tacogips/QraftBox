import { createMemo, For, type JSX, Match, Show, Switch } from "solid-js";
import type {
  RecentProjectSummary,
  WorkspaceShellState,
} from "../../../../client-shared/src/contracts/workspace";
import { SummaryCard } from "../../components/SummaryCard";
import { ToolbarIconButton } from "../../components/ToolbarIconButton";
import { createWorkspaceShellPresentation } from "./presentation";

export interface WorkspaceShellProps {
  readonly workspaceState: WorkspaceShellState;
  readonly availableRecentProjects: readonly RecentProjectSummary[];
  readonly isLoading: boolean;
  readonly isMutating: boolean;
  readonly isPickingDirectory: boolean;
  readonly errorMessage: string | null;
  readonly newProjectPath: string;
  onNewProjectPathInput(path: string): void;
  onPickProjectDirectory(): Promise<void>;
  onOpenProjectByPath(): Promise<void>;
  onOpenRecentProject(path: string): Promise<void>;
  onRemoveRecentProject(path: string): Promise<void>;
  onActivateTab(tabId: string): Promise<void>;
  onCloseTab(tabId: string): Promise<void>;
}

function getProjectBadgeClass(isGitRepo: boolean): string {
  return isGitRepo
    ? "border border-accent-emphasis/40 bg-accent-muted/20 text-accent-fg"
    : "border border-border-default bg-bg-primary text-text-secondary";
}

export function WorkspaceShell(props: WorkspaceShellProps): JSX.Element {
  const presentation = createMemo(() =>
    createWorkspaceShellPresentation(props.workspaceState),
  );

  return (
    <section class="mx-auto flex h-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Switch>
        <Match when={props.errorMessage !== null}>
          <div class="rounded-2xl border border-danger-emphasis/40 bg-danger-muted/10 p-6 text-sm text-danger-fg">
            Failed to load workspace: {props.errorMessage}
          </div>
        </Match>
        <Match when={props.isLoading}>
          <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-border-default bg-bg-secondary text-text-secondary">
            <div class="flex gap-2">
              <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis" />
              <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis [animation-delay:120ms]" />
              <span class="h-2 w-2 animate-pulse rounded-full bg-accent-emphasis [animation-delay:240ms]" />
            </div>
            <p class="text-sm">Loading workspace...</p>
          </div>
        </Match>
        <Match when={true}>
          <div class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="flex flex-col gap-2">
              <h2 class="text-2xl font-semibold text-text-primary">Project</h2>
            </div>

            <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-primary">
              <div class="flex flex-col gap-3 border-b border-border-default bg-bg-primary px-4 py-3 lg:flex-row lg:items-center">
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={props.newProjectPath}
                    placeholder="/path/to/project"
                    disabled={props.isMutating || props.isPickingDirectory}
                    class="w-full rounded-md border border-border-default bg-bg-secondary px-3 py-2 font-mono text-sm text-text-primary outline-none transition focus:border-accent-emphasis disabled:cursor-not-allowed disabled:opacity-60"
                    onInput={(event) =>
                      props.onNewProjectPathInput(event.currentTarget.value)
                    }
                  />
                  <ToolbarIconButton
                    label={
                      props.isPickingDirectory
                        ? "Opening directory picker"
                        : "Browse directories"
                    }
                    disabled={
                      props.isMutating ||
                      props.isPickingDirectory ||
                      !props.workspaceState.canManageProjects
                    }
                    onClick={() => void props.onPickProjectDirectory()}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
                    </svg>
                  </ToolbarIconButton>
                </div>
                <div class="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span class="rounded-full border border-border-default bg-bg-secondary px-3 py-2">
                    {props.workspaceState.tabs.length} open
                  </span>
                  <span class="rounded-full border border-border-default bg-bg-secondary px-3 py-2">
                    {props.availableRecentProjects.length} recent
                  </span>
                  <button
                    type="button"
                    disabled={
                      props.isMutating ||
                      props.isPickingDirectory ||
                      props.newProjectPath.trim().length === 0
                    }
                    class="rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void props.onOpenProjectByPath()}
                  >
                    {props.isMutating || props.isPickingDirectory
                      ? "Opening..."
                      : "Open project"}
                  </button>
                </div>
              </div>

              <div class="px-4 pt-3">
                <Show when={!props.workspaceState.canManageProjects}>
                  <p class="rounded-md border border-attention-emphasis/30 bg-attention-muted/10 px-3 py-2 text-sm text-attention-fg">
                    {presentation().managementModeText}
                  </p>
                </Show>
              </div>

              <div class="min-h-0 flex-1 overflow-auto p-4">
                <section class="space-y-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                        Open projects
                      </p>
                      <p class="mt-1 text-sm text-text-secondary">
                        {presentation().openProjectsHeading}
                      </p>
                    </div>
                  </div>

                  <Show
                    when={props.workspaceState.tabs.length > 0}
                    fallback={
                      <div class="py-12 text-center text-sm text-text-secondary">
                        {presentation().openProjectsEmptyText}
                      </div>
                    }
                  >
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      <For each={props.workspaceState.tabs}>
                        {(workspaceTab) => {
                          const isActive =
                            workspaceTab.id ===
                            props.workspaceState.activeContextId;
                          return (
                            <SummaryCard
                              selected={isActive}
                              titleLabel="Project"
                              title={workspaceTab.name}
                              bodyLabel="Path"
                              body={workspaceTab.path}
                              topSlot={
                                <div class="flex items-start justify-between gap-3">
                                  <div class="flex flex-wrap items-center gap-2">
                                    <span
                                      class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getProjectBadgeClass(
                                        workspaceTab.isGitRepo,
                                      )}`}
                                    >
                                      {workspaceTab.isGitRepo
                                        ? "Git"
                                        : "Folder"}
                                    </span>
                                  </div>
                                </div>
                              }
                              footerSlot={
                                <>
                                  <Show when={!isActive}>
                                    <button
                                      type="button"
                                      disabled={props.isMutating}
                                      class="rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                                      onClick={() =>
                                        void props.onActivateTab(
                                          workspaceTab.id,
                                        )
                                      }
                                    >
                                      Open
                                    </button>
                                  </Show>
                                  <button
                                    type="button"
                                    disabled={props.isMutating}
                                    class="rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-medium text-text-secondary transition hover:border-danger-emphasis/40 hover:bg-danger-muted/10 hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() =>
                                      void props.onCloseTab(workspaceTab.id)
                                    }
                                  >
                                    Close
                                  </button>
                                </>
                              }
                            />
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </section>

                <section class="mt-6 space-y-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                      Recent projects
                    </p>
                    <p class="mt-1 text-sm text-text-secondary">
                      Reopen common repositories directly from the workspace
                      shell.
                    </p>
                  </div>

                  <Show
                    when={props.availableRecentProjects.length > 0}
                    fallback={
                      <div class="py-12 text-center text-sm text-text-secondary">
                        {presentation().recentProjectsEmptyText}
                      </div>
                    }
                  >
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      <For each={props.availableRecentProjects}>
                        {(recentProject) => (
                          <SummaryCard
                            titleLabel="Project"
                            title={recentProject.name}
                            bodyLabel="Path"
                            body={recentProject.path}
                            topSlot={
                              <div class="flex flex-wrap items-center gap-2">
                                <span
                                  class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getProjectBadgeClass(
                                    recentProject.isGitRepo,
                                  )}`}
                                >
                                  {recentProject.isGitRepo ? "Git" : "Folder"}
                                </span>
                              </div>
                            }
                            footerSlot={
                              <>
                                <button
                                  type="button"
                                  disabled={props.isMutating}
                                  class="rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={() =>
                                    void props.onOpenRecentProject(
                                      recentProject.path,
                                    )
                                  }
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  disabled={props.isMutating}
                                  class="rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-medium text-text-secondary transition hover:border-danger-emphasis/40 hover:bg-danger-muted/10 hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={() =>
                                    void props.onRemoveRecentProject(
                                      recentProject.path,
                                    )
                                  }
                                >
                                  Remove
                                </button>
                              </>
                            }
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
              </div>
            </div>
          </div>
        </Match>
      </Switch>
    </section>
  );
}
