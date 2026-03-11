import { createMemo, For, type JSX, Match, Show, Switch } from "solid-js";
import type {
  RecentProjectSummary,
  WorkspaceShellState,
  WorkspaceTabSummary,
} from "../../../../client-shared/src/contracts/workspace";
import { createWorkspaceShellPresentation } from "./presentation";

export interface WorkspaceShellProps {
  readonly workspaceState: WorkspaceShellState;
  readonly availableRecentProjects: readonly RecentProjectSummary[];
  readonly isLoading: boolean;
  readonly isMutating: boolean;
  readonly errorMessage: string | null;
  readonly newProjectPath: string;
  onNewProjectPathInput(path: string): void;
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

function getTabCardClass(isActive: boolean): string {
  return isActive
    ? "border-accent-emphasis/60 bg-accent-muted/12 shadow-lg shadow-black/15"
    : "border-border-default bg-bg-secondary hover:border-accent-emphasis/35 hover:bg-bg-hover";
}

function renderProjectCard(
  project: WorkspaceTabSummary | RecentProjectSummary,
): JSX.Element {
  return (
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <p class="truncate text-sm font-semibold text-text-primary">
          {project.name}
        </p>
        <span
          class={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getProjectBadgeClass(
            project.isGitRepo,
          )}`}
        >
          {project.isGitRepo ? "Git" : "Folder"}
        </span>
      </div>
      <p class="mt-2 truncate font-mono text-xs text-text-tertiary">
        {project.path}
      </p>
    </div>
  );
}

export function WorkspaceShell(props: WorkspaceShellProps): JSX.Element {
  const presentation = createMemo(() =>
    createWorkspaceShellPresentation(props.workspaceState),
  );
  const activeTab = () =>
    props.workspaceState.tabs.find(
      (workspaceTab) =>
        workspaceTab.id === props.workspaceState.activeContextId,
    ) ?? null;

  return (
    <section class="flex min-h-0 flex-1 flex-col">
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
          <div class="flex min-h-0 flex-1 flex-col gap-4">
            <header class="grid gap-3 md:grid-cols-3">
              <div class="rounded-2xl border border-border-default bg-bg-secondary p-5 shadow-lg shadow-black/15 md:col-span-2">
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-fg">
                  Project
                </p>
                <h2 class="mt-2 text-2xl font-semibold text-text-primary">
                  Workspace Control
                </h2>
                <p class="mt-2 text-sm leading-6 text-text-secondary">
                  Open repositories, switch active tabs, and keep recent work
                  reachable without dropping back to the migration placeholder.
                </p>
                <Show when={activeTab() !== null}>
                  <div class="mt-4 rounded-xl border border-border-default bg-bg-primary/70 p-4">
                    <p class="text-xs uppercase tracking-[0.2em] text-text-tertiary">
                      Active project
                    </p>
                    <div class="mt-2">{renderProjectCard(activeTab()!)}</div>
                  </div>
                </Show>
              </div>
              <div class="rounded-2xl border border-border-default bg-bg-secondary p-5">
                <p class="text-xs uppercase tracking-[0.22em] text-text-tertiary">
                  Workspace mode
                </p>
                <p class="mt-3 text-lg font-semibold text-text-primary">
                  {props.workspaceState.canManageProjects
                    ? "Managed"
                    : "Temporary"}
                </p>
                <p class="mt-2 text-sm text-text-secondary">
                  {props.workspaceState.canManageProjects
                    ? "Projects can be opened, switched, and removed normally."
                    : "Project management is locked because temporary project mode is active."}
                </p>
                <Show when={props.workspaceState.temporaryProjectMode}>
                  <div class="mt-4 rounded-xl border border-attention-emphasis/30 bg-attention-muted/10 px-3 py-2 text-sm text-attention-fg">
                    Temporary project mode is active.
                  </div>
                </Show>
              </div>
            </header>

            <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_380px]">
              <main class="flex min-h-0 flex-col gap-4">
                <section class="rounded-2xl border border-border-default bg-bg-secondary">
                  <div class="border-b border-border-default px-5 py-4">
                    <div class="flex items-center justify-between gap-4">
                      <div>
                        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                          Open tabs
                        </p>
                        <p class="mt-2 text-sm text-text-secondary">
                          {presentation().openTabsHeading}
                        </p>
                      </div>
                      <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-xs text-text-secondary">
                        {props.workspaceState.tabs.length} open
                      </span>
                    </div>
                  </div>

                  <div class="p-4">
                    <Show
                      when={props.workspaceState.tabs.length > 0}
                      fallback={
                        <div class="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border-default bg-bg-primary/40 px-6 py-10 text-center text-sm text-text-secondary">
                          {presentation().openTabsEmptyText}
                        </div>
                      }
                    >
                      <div class="grid gap-3 md:grid-cols-2">
                        <For each={props.workspaceState.tabs}>
                          {(workspaceTab) => {
                            const isActive =
                              workspaceTab.id ===
                              props.workspaceState.activeContextId;
                            return (
                              <article
                                class={`rounded-xl border p-4 transition ${getTabCardClass(
                                  isActive,
                                )}`}
                              >
                                <div class="flex items-start justify-between gap-3">
                                  <div class="min-w-0 flex-1">
                                    {renderProjectCard(workspaceTab)}
                                  </div>
                                  <Show when={isActive}>
                                    <span class="rounded-full border border-accent-emphasis/40 bg-accent-muted/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
                                      Active
                                    </span>
                                  </Show>
                                </div>
                                <div class="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={props.isMutating || isActive}
                                    class="rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() =>
                                      void props.onActivateTab(workspaceTab.id)
                                    }
                                  >
                                    {isActive ? "Active" : "Switch to tab"}
                                  </button>
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
                                </div>
                              </article>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </div>
                </section>

                <section class="rounded-2xl border border-border-default bg-bg-secondary">
                  <div class="border-b border-border-default px-5 py-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                      Recent projects
                    </p>
                    <p class="mt-2 text-sm text-text-secondary">
                      Reopen common repositories directly from the workspace
                      shell.
                    </p>
                  </div>
                  <div class="p-4">
                    <Show
                      when={props.availableRecentProjects.length > 0}
                      fallback={
                        <div class="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-border-default bg-bg-primary/40 px-6 py-10 text-center text-sm text-text-secondary">
                          {presentation().recentProjectsEmptyText}
                        </div>
                      }
                    >
                      <div class="space-y-3">
                        <For each={props.availableRecentProjects}>
                          {(recentProject) => (
                            <article class="flex items-start justify-between gap-4 rounded-xl border border-border-default bg-bg-primary p-4">
                              <div class="min-w-0 flex-1">
                                {renderProjectCard(recentProject)}
                              </div>
                              <div class="flex shrink-0 gap-2">
                                <button
                                  type="button"
                                  disabled={props.isMutating}
                                  class="rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
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
                                  class="rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm font-medium text-text-secondary transition hover:border-danger-emphasis/40 hover:bg-danger-muted/10 hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={() =>
                                    void props.onRemoveRecentProject(
                                      recentProject.path,
                                    )
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            </article>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </section>
              </main>

              <aside class="flex min-h-0 flex-col gap-4">
                <section class="rounded-2xl border border-border-default bg-bg-secondary">
                  <div class="border-b border-border-default px-5 py-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                      Open project
                    </p>
                    <p class="mt-2 text-sm text-text-secondary">
                      {presentation().managementModeText}
                    </p>
                  </div>
                  <div class="space-y-4 p-5">
                    <label class="flex flex-col gap-2 text-sm text-text-secondary">
                      Project path
                      <input
                        type="text"
                        value={props.newProjectPath}
                        placeholder="/path/to/project"
                        disabled={props.isMutating}
                        class="rounded-lg border border-border-default bg-bg-primary px-3 py-3 font-mono text-sm text-text-primary outline-none transition focus:border-accent-emphasis disabled:cursor-not-allowed disabled:opacity-60"
                        onInput={(event) =>
                          props.onNewProjectPathInput(event.currentTarget.value)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={
                        props.isMutating ||
                        props.newProjectPath.trim().length === 0
                      }
                      class="w-full rounded-lg bg-accent-emphasis px-4 py-3 text-sm font-semibold text-text-on-emphasis transition hover:bg-accent-fg disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void props.onOpenProjectByPath()}
                    >
                      {props.isMutating ? "Opening..." : "Open project"}
                    </button>
                    <Show when={!props.workspaceState.canManageProjects}>
                      <div class="rounded-xl border border-attention-emphasis/30 bg-attention-muted/10 px-4 py-3 text-sm text-attention-fg">
                        Project changes are disabled while temporary project
                        mode is active.
                      </div>
                    </Show>
                  </div>
                </section>

                <section class="rounded-2xl border border-border-default bg-bg-secondary p-5">
                  <p class="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                    Status
                  </p>
                  <div class="mt-4 space-y-3">
                    <div class="rounded-xl border border-border-default bg-bg-primary p-4">
                      <p class="text-xs uppercase tracking-wide text-text-tertiary">
                        Active project path
                      </p>
                      <p class="mt-2 break-all font-mono text-sm text-text-primary">
                        {props.workspaceState.activeProjectPath ??
                          "No project open"}
                      </p>
                    </div>
                    <div class="rounded-xl border border-border-default bg-bg-primary p-4">
                      <p class="text-xs uppercase tracking-wide text-text-tertiary">
                        Recent project count
                      </p>
                      <p class="mt-2 text-lg font-semibold text-text-primary">
                        {props.availableRecentProjects.length}
                      </p>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </Match>
      </Switch>
    </section>
  );
}
