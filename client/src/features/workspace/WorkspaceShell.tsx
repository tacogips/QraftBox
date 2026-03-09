import { createMemo, For, Match, Show, Switch } from "solid-js";
import type { RecentProjectSummary } from "../../../../client-shared/src/contracts/workspace";
import type { WorkspaceShellState } from "../../../../client-shared/src/contracts/workspace";
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

export function WorkspaceShell(props: WorkspaceShellProps): JSX.Element {
  const presentation = createMemo(() =>
    createWorkspaceShellPresentation(props.workspaceState),
  );

  return (
    <section>
      <h2>{presentation().heading}</h2>
      <Switch>
        <Match when={props.errorMessage !== null}>
          <p role="alert">Failed to load workspace: {props.errorMessage}</p>
        </Match>
        <Match when={props.isLoading}>
          <p>Loading workspace...</p>
        </Match>
        <Match when={true}>
          <Show when={presentation().showEmptyWorkspaceNotice}>
            <p>No open workspace tabs.</p>
          </Show>
          <p>{presentation().activeProjectText}</p>
          <p>{presentation().managementModeText}</p>
          <Show when={presentation().showTemporaryProjectMode}>
            <p>Temporary project mode is active.</p>
          </Show>
          <section>
            <h3>{presentation().openTabsHeading}</h3>
            <Show
              when={props.workspaceState.tabs.length > 0}
              fallback={<p>{presentation().openTabsEmptyText}</p>}
            >
              <ul>
                <For each={props.workspaceState.tabs}>
                  {(workspaceTab) => (
                    <li>
                      <strong>{workspaceTab.name}</strong>
                      {" - "}
                      {workspaceTab.path}
                      <Show
                        when={
                          workspaceTab.id ===
                          props.workspaceState.activeContextId
                        }
                      >
                        {" (active)"}
                      </Show>
                      <Show when={props.workspaceState.canManageProjects}>
                        {" "}
                        <button
                          type="button"
                          disabled={
                            props.isMutating ||
                            workspaceTab.id ===
                              props.workspaceState.activeContextId
                          }
                          onClick={() =>
                            void props.onActivateTab(workspaceTab.id)
                          }
                        >
                          Activate
                        </button>{" "}
                        <button
                          type="button"
                          disabled={props.isMutating}
                          onClick={() => void props.onCloseTab(workspaceTab.id)}
                        >
                          Close
                        </button>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
          <Show when={presentation().showOpenProjectControls}>
            <section>
              <h3>{presentation().openProjectHeading}</h3>
              <input
                type="text"
                value={props.newProjectPath}
                placeholder="/path/to/project"
                disabled={props.isMutating}
                onInput={(event) =>
                  props.onNewProjectPathInput(event.currentTarget.value)
                }
              />{" "}
              <button
                type="button"
                disabled={
                  props.isMutating || props.newProjectPath.trim().length === 0
                }
                onClick={() => void props.onOpenProjectByPath()}
              >
                Open
              </button>
            </section>
          </Show>
          <section>
            <h3>{presentation().recentProjectsHeading}</h3>
            <Show
              when={props.availableRecentProjects.length > 0}
              fallback={<p>{presentation().recentProjectsEmptyText}</p>}
            >
              <ul>
                <For each={props.availableRecentProjects}>
                  {(recentProject) => (
                    <li>
                      <strong>{recentProject.name}</strong>
                      {" - "}
                      {recentProject.path}
                      <Show when={props.workspaceState.canManageProjects}>
                        {" "}
                        <button
                          type="button"
                          disabled={props.isMutating}
                          onClick={() =>
                            void props.onOpenRecentProject(recentProject.path)
                          }
                        >
                          Open
                        </button>{" "}
                        <button
                          type="button"
                          disabled={props.isMutating}
                          onClick={() =>
                            void props.onRemoveRecentProject(recentProject.path)
                          }
                        >
                          Remove
                        </button>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </Match>
      </Switch>
    </section>
  );
}
