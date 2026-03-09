import {
  createEffect,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import {
  APP_SCREENS,
  buildScreenHash,
  parseAppHash,
  type ScreenRouteState,
} from "../../client-shared/src/contracts/navigation";
import { createFrontendStatusApiClient } from "../../client-shared/src/api/frontend-status";
import { getActiveWorkspaceTab } from "../../client-shared/src/contracts/workspace";
import type { SolidBootstrapState } from "./app/bootstrap-state";
import { createScreenNavigationItems } from "./app/navigation";
import {
  getSolidCutoverReadinessReport,
  getInProgressSolidScreens,
  getOutstandingSolidCutoverBlockers,
  getPlannedSolidScreens,
  getSolidScreenDefinition,
} from "./app/screen-registry";
import { ActionDefaultsScreen } from "./features/model-config/ActionDefaultsScreen";
import { AiSessionScreen } from "./features/ai-session/AiSessionScreen";
import { ModelProfilesScreen } from "./features/model-config/ModelProfilesScreen";
import { createFilesViewModel } from "./features/diff/create-files-view-model";
import { createDiffViewModel } from "./features/diff/create-diff-view-model";
import { DiffScreen } from "./features/diff/DiffScreen";
import { createDiffRealtimeController } from "./features/diff/realtime";
import { refreshFilesScreenFromRealtime } from "./features/diff/realtime-refresh";
import { createGitStateRefreshController } from "./features/diff/git-state-refresh";
import { resolveViewModeForFileTreeModeChange } from "./features/diff/screen-state";
import { CommitsScreen } from "./features/commits/CommitsScreen";
import { NotificationsScreen } from "./features/notifications/NotificationsScreen";
import { SystemInfoScreen } from "./features/system-info/SystemInfoScreen";
import { TerminalScreen } from "./features/terminal/TerminalScreen";
import { WorkspaceShell } from "./features/workspace/WorkspaceShell";
import { createWorkspaceViewModel } from "./features/workspace/create-workspace-view-model";

export interface AppProps {
  readonly bootstrapState: SolidBootstrapState;
}

function parseWindowRoute(): ScreenRouteState {
  const parsedRoute = parseAppHash(window.location.hash);
  return {
    ...parsedRoute,
    contextId: null,
    selectedPath: null,
  };
}

function sameRoute(left: ScreenRouteState, right: ScreenRouteState): boolean {
  return (
    left.projectSlug === right.projectSlug &&
    left.screen === right.screen &&
    left.contextId === right.contextId &&
    left.selectedPath === right.selectedPath
  );
}

function renderPlannedScreenPlaceholder(
  screen: ScreenRouteState["screen"],
): JSX.Element {
  const screenDefinition = getSolidScreenDefinition(screen);

  return (
    <section>
      <h2>{screenDefinition.label}</h2>
      <p>
        Solid migration status: {screenDefinition.implementationStatus}. Planned
        order: {screenDefinition.implementationOrder}.
      </p>
      <p>Parity gate: {screenDefinition.parityGate.summary}</p>
      <ul>
        <For each={screenDefinition.parityGate.checks}>
          {(check) => <li>{check}</li>}
        </For>
      </ul>
      <Show
        when={screenDefinition.blockers.length > 0}
        fallback={<p>No screen-specific blockers are currently recorded.</p>}
      >
        <h3>Current blockers</h3>
        <ul>
          <For each={screenDefinition.blockers}>
            {(blocker) => <li>{blocker.summary}</li>}
          </For>
        </ul>
      </Show>
    </section>
  );
}

export function App(props: AppProps): JSX.Element {
  const [activeRoute, setActiveRoute] = createSignal<ScreenRouteState>(
    props.bootstrapState.route,
  );
  const [cutoverEnvironmentStatus, setCutoverEnvironmentStatus] = createSignal(
    props.bootstrapState.cutoverEnvironmentStatus,
  );
  const frontendStatusApi = createFrontendStatusApiClient({
    apiBaseUrl: props.bootstrapState.apiBaseUrl,
  });
  const diffViewModel = createDiffViewModel({
    apiBaseUrl: props.bootstrapState.apiBaseUrl,
  });
  const filesViewModel = createFilesViewModel({
    apiBaseUrl: props.bootstrapState.apiBaseUrl,
  });
  const workspaceViewModel = createWorkspaceViewModel({
    initialRoute: props.bootstrapState.route,
    apiBaseUrl: props.bootstrapState.apiBaseUrl,
    getCurrentRoute: activeRoute,
    onRouteChange(nextRoute) {
      setActiveRoute(nextRoute);

      const nextHash = buildScreenHash(nextRoute.projectSlug, nextRoute.screen);
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
    },
  });
  const diffRealtimeController = createDiffRealtimeController({
    getContextId: () => workspaceViewModel.workspaceState().activeContextId,
    getProjectPath: () =>
      getActiveWorkspaceTab(workspaceViewModel.workspaceState())?.path ?? "",
    getSelectedPath: () => filesViewModel.selectedPath(),
    markAllFilesTreeStale: () => filesViewModel.markAllFilesTreeStale(),
    refreshDiff: async (contextId: string): Promise<void> => {
      const currentWorkspaceState = workspaceViewModel.workspaceState();
      const activeWorkspaceTab = getActiveWorkspaceTab(currentWorkspaceState);
      await refreshFilesScreenFromRealtime({
        activeScreen: activeRoute().screen,
        activeContextId: currentWorkspaceState.activeContextId,
        targetContextId: contextId,
        activeWorkspaceIsGitRepo: activeWorkspaceTab?.isGitRepo ?? false,
        refreshDiff: async (targetContextId: string): Promise<void> => {
          await diffViewModel.synchronize({
            screen: activeRoute().screen,
            activeContextId: targetContextId,
            activeWorkspaceIsGitRepo: true,
          });
        },
        refreshAllFilesTree: filesViewModel.refreshAllFilesTree,
        refreshSelectedFileContent: filesViewModel.refreshSelectedFileContent,
      });
    },
    refreshSelectedPath: async (contextId: string): Promise<void> => {
      await filesViewModel.refreshSelectedFileContent(contextId);
    },
  });
  const gitStateRefreshController = createGitStateRefreshController({
    getContextId: () => workspaceViewModel.workspaceState().activeContextId,
    getActiveScreen: () => activeRoute().screen,
    isGitRepo: () =>
      getActiveWorkspaceTab(workspaceViewModel.workspaceState())?.isGitRepo ??
      false,
    refreshContext: async (contextId: string): Promise<void> => {
      await diffViewModel.synchronize({
        screen: activeRoute().screen,
        activeContextId: contextId,
        activeWorkspaceIsGitRepo: true,
      });
    },
  });

  onMount(() => {
    const handleHashChange = (): void => {
      const nextRoute = parseWindowRoute();
      setActiveRoute((currentRoute) =>
        sameRoute(currentRoute, nextRoute) ? currentRoute : nextRoute,
      );
    };

    window.addEventListener("hashchange", handleHashChange);
    void frontendStatusApi
      .fetchFrontendStatus()
      .then((status) => {
        setCutoverEnvironmentStatus(status.solidCutoverEnvironmentStatus);
      })
      .catch(() => {
        // Keep the conservative bootstrap defaults when runtime status refresh fails.
      });
    diffRealtimeController.connect();
    gitStateRefreshController.connect();
    onCleanup(() => {
      window.removeEventListener("hashchange", handleHashChange);
      diffRealtimeController.disconnect();
      gitStateRefreshController.disconnect();
    });
  });

  createEffect(() => {
    const currentWorkspaceState = workspaceViewModel.workspaceState();
    const activeWorkspaceTab = getActiveWorkspaceTab(currentWorkspaceState);
    void diffViewModel.synchronize({
      screen: activeRoute().screen,
      activeContextId: currentWorkspaceState.activeContextId,
      activeWorkspaceIsGitRepo: activeWorkspaceTab?.isGitRepo ?? false,
    });
  });

  createEffect(() => {
    const currentWorkspaceState = workspaceViewModel.workspaceState();
    const activeWorkspaceTab = getActiveWorkspaceTab(currentWorkspaceState);
    void filesViewModel.synchronize({
      screen: activeRoute().screen,
      activeContextId: currentWorkspaceState.activeContextId,
      activeWorkspaceIsGitRepo: activeWorkspaceTab?.isGitRepo ?? false,
      diffOverview: diffViewModel.diffOverview(),
      preferredViewMode: diffViewModel.preferredViewMode(),
    });
  });

  const screenNavigationItems = () =>
    createScreenNavigationItems({
      projectSlug: activeRoute().projectSlug,
      screen: activeRoute().screen,
    });
  const activeScreenDefinition = () =>
    getSolidScreenDefinition(activeRoute().screen);
  const cutoverReadiness = () =>
    getSolidCutoverReadinessReport(cutoverEnvironmentStatus());
  const inProgressScreens = () => getInProgressSolidScreens();
  const outstandingCutoverBlockers = () =>
    getOutstandingSolidCutoverBlockers(cutoverEnvironmentStatus());
  const plannedScreens = () => getPlannedSolidScreens();
  const activeContextId = () =>
    workspaceViewModel.workspaceState().activeContextId;
  const activeWorkspaceIsGitRepo = () =>
    getActiveWorkspaceTab(workspaceViewModel.workspaceState())?.isGitRepo ??
    false;

  function navigateToScreen(screen: ScreenRouteState["screen"]): void {
    const nextRoute: ScreenRouteState = {
      ...activeRoute(),
      screen,
    };
    setActiveRoute(nextRoute);

    const nextHash = buildScreenHash(nextRoute.projectSlug, nextRoute.screen);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }

  function renderActiveScreen(): JSX.Element {
    if (activeRoute().screen === "project") {
      return (
        <WorkspaceShell
          workspaceState={workspaceViewModel.workspaceState()}
          availableRecentProjects={workspaceViewModel.availableRecentProjects()}
          isLoading={workspaceViewModel.isLoading()}
          isMutating={workspaceViewModel.isMutating()}
          errorMessage={workspaceViewModel.errorMessage()}
          newProjectPath={workspaceViewModel.newProjectPath()}
          onNewProjectPathInput={workspaceViewModel.setNewProjectPath}
          onOpenProjectByPath={workspaceViewModel.openProjectByPath}
          onOpenRecentProject={workspaceViewModel.openRecentProject}
          onRemoveRecentProject={workspaceViewModel.removeRecentProject}
          onActivateTab={workspaceViewModel.activateTab}
          onCloseTab={workspaceViewModel.closeTab}
        />
      );
    }

    if (activeRoute().screen === "files") {
      return (
        <DiffScreen
          diffOverview={diffViewModel.diffOverview()}
          selectedPath={filesViewModel.selectedPath()}
          supportsDiff={activeWorkspaceIsGitRepo()}
          preferredViewMode={diffViewModel.preferredViewMode()}
          fileTreeMode={filesViewModel.fileTreeMode()}
          diffTree={filesViewModel.diffTree(diffViewModel.diffOverview())}
          allFilesTree={filesViewModel.allFilesTree()}
          expandedPaths={filesViewModel.expandedPaths()}
          isLoading={diffViewModel.isLoading()}
          isAllFilesLoading={filesViewModel.isAllFilesLoading()}
          isFileContentLoading={filesViewModel.isFileContentLoading()}
          showIgnored={filesViewModel.showIgnored()}
          showAllFiles={filesViewModel.showAllFiles()}
          unsupportedMessage={diffViewModel.unsupportedMessage()}
          errorMessage={diffViewModel.errorMessage()}
          allFilesError={filesViewModel.allFilesError()}
          fileContentError={filesViewModel.fileContentError()}
          fileContent={filesViewModel.fileContent()}
          onChangeViewMode={(mode) => diffViewModel.setPreferredViewMode(mode)}
          onSelectPath={async (path: string) => {
            if (
              diffViewModel
                .diffOverview()
                .files.some((diffFile) => diffFile.path === path)
            ) {
              diffViewModel.selectPath(activeContextId(), path);
            }
            await filesViewModel.selectPath(activeContextId(), path);
          }}
          onChangeFileTreeMode={async (mode) => {
            const nextViewMode = resolveViewModeForFileTreeModeChange({
              previousFileTreeMode: filesViewModel.fileTreeMode(),
              nextFileTreeMode: mode,
              preferredViewMode: diffViewModel.preferredViewMode(),
            });
            if (nextViewMode !== diffViewModel.preferredViewMode()) {
              diffViewModel.setPreferredViewMode(nextViewMode);
            }
            await filesViewModel.setFileTreeMode(activeContextId(), mode);
          }}
          onToggleDirectory={async (path: string) => {
            await filesViewModel.toggleDirectory(activeContextId(), path);
          }}
          onToggleShowIgnored={async (value: boolean) => {
            await filesViewModel.setShowIgnored(activeContextId(), value);
          }}
          onToggleShowAllFiles={async (value: boolean) => {
            await filesViewModel.setShowAllFiles(activeContextId(), value);
          }}
          onReload={() => {
            if (activeContextId() === null) {
              return;
            }

            void diffViewModel.synchronize({
              screen: activeRoute().screen,
              activeContextId: activeContextId(),
              activeWorkspaceIsGitRepo: activeWorkspaceIsGitRepo(),
            });
            void filesViewModel.refreshAllFilesTree(activeContextId());
            void filesViewModel.refreshSelectedFileContent(activeContextId());
          }}
        />
      );
    }

    if (activeRoute().screen === "system-info") {
      return <SystemInfoScreen apiBaseUrl={props.bootstrapState.apiBaseUrl} />;
    }

    if (activeRoute().screen === "commits") {
      return (
        <CommitsScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
          isGitRepo={activeWorkspaceIsGitRepo()}
        />
      );
    }

    if (activeRoute().screen === "ai-session") {
      return (
        <AiSessionScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
          projectPath={
            getActiveWorkspaceTab(workspaceViewModel.workspaceState())?.path ??
            ""
          }
          selectedPath={filesViewModel.selectedPath()}
          fileContent={filesViewModel.fileContent()}
          diffOverview={diffViewModel.diffOverview()}
          onOpenFilesScreen={() => navigateToScreen("files")}
        />
      );
    }

    if (activeRoute().screen === "terminal") {
      return (
        <TerminalScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
        />
      );
    }

    if (activeRoute().screen === "notifications") {
      return <NotificationsScreen />;
    }

    if (activeRoute().screen === "model-profiles") {
      return (
        <ModelProfilesScreen apiBaseUrl={props.bootstrapState.apiBaseUrl} />
      );
    }

    if (activeRoute().screen === "action-defaults") {
      return (
        <ActionDefaultsScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
        />
      );
    }

    return renderPlannedScreenPlaceholder(activeRoute().screen);
  }

  return (
    <main>
      <h1>QraftBox Solid Frontend</h1>
      <p>
        Solid migration is running against the shared routing, workspace, diff,
        and cutover-readiness contracts. The remaining work is browser parity
        verification, Solid build readiness in this workspace, and deeper AI
        Sessions completion.
      </p>
      <p>
        Active route:{" "}
        <strong>
          {activeRoute().projectSlug !== null
            ? `${activeRoute().projectSlug} / ${activeRoute().screen}`
            : activeRoute().screen}
        </strong>
      </p>
      <p>
        Active screen status:{" "}
        <strong>{activeScreenDefinition().implementationStatus}</strong>
      </p>
      <section>
        <h2>Screen navigation</h2>
        <nav aria-label="Solid migration screens">
          <ul>
            <For each={screenNavigationItems()}>
              {(navigationItem) => (
                <li>
                  <a
                    href={navigationItem.href}
                    aria-current={navigationItem.isActive ? "page" : undefined}
                  >
                    {navigationItem.label}
                  </a>{" "}
                  <Switch>
                    <Match
                      when={
                        navigationItem.implementationStatus === "implemented"
                      }
                    >
                      <span>
                        {navigationItem.isActive ? "active" : "ready"}
                      </span>
                    </Match>
                    <Match
                      when={
                        navigationItem.implementationStatus === "in-progress"
                      }
                    >
                      <span>
                        {navigationItem.isActive ? "active" : "in progress"}
                      </span>
                    </Match>
                    <Match when={true}>
                      <em>planned</em>
                    </Match>
                  </Switch>
                </li>
              )}
            </For>
          </ul>
        </nav>
      </section>
      {renderActiveScreen()}
      <section>
        <h2>Shared screen registry</h2>
        <ul>
          <For each={APP_SCREENS}>{(screen) => <li>{screen}</li>}</For>
        </ul>
      </section>
      <section>
        <h2>Cutover readiness</h2>
        <p>
          Implemented screens: {cutoverReadiness().implementedScreenCount}/
          {cutoverReadiness().totalScreenCount}
        </p>
        <Show when={inProgressScreens().length > 0}>
          <p>In-progress screens: {inProgressScreens().join(", ")}</p>
        </Show>
        <Show when={plannedScreens().length > 0}>
          <p>Planned screens: {plannedScreens().join(", ")}</p>
        </Show>
        <ul>
          <For each={cutoverReadiness().criteria}>
            {(criterion) => (
              <li>
                <strong>{criterion.isSatisfied ? "pass" : "blocked"}</strong>{" "}
                {criterion.summary}
              </li>
            )}
          </For>
        </ul>
        <h3>Outstanding blockers</h3>
        <ul>
          <For each={outstandingCutoverBlockers()}>
            {(blocker) => (
              <li>
                <strong>
                  {blocker.scope}/{blocker.category}
                </strong>{" "}
                {blocker.summary}
              </li>
            )}
          </For>
        </ul>
      </section>
    </main>
  );
}
