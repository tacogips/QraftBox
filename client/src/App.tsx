import {
  createEffect,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  buildScreenHash,
  parseAppHash,
  type AppScreen,
  type ScreenRouteState,
} from "../../client-shared/src/contracts/navigation";
import { getActiveWorkspaceTab } from "../../client-shared/src/contracts/workspace";
import type { SolidBootstrapState } from "./app/bootstrap-state";
import { createScreenNavigationItems } from "./app/navigation";
import { resolveUiSynchronizedRouteState } from "./app/route-sync";
import { getSolidScreenDefinition } from "./app/screen-registry";
import { ActionDefaultsScreen } from "./features/model-config/ActionDefaultsScreen";
import { AiSessionScreen } from "./features/ai-session/AiSessionScreen";
import { ModelProfilesScreen } from "./features/model-config/ModelProfilesScreen";
import { createFilesViewModel } from "./features/diff/create-files-view-model";
import { createDiffViewModel } from "./features/diff/create-diff-view-model";
import { DiffScreen } from "./features/diff/DiffScreen";
import { createDiffRealtimeController } from "./features/diff/realtime";
import { refreshFilesScreenFromRealtime } from "./features/diff/realtime-refresh";
import { createGitStateRefreshController } from "./features/diff/git-state-refresh";
import {
  resolveViewModeForFileTreeModeChange,
  resolveViewModeForPathSelection,
} from "./features/diff/screen-state";
import { CommitsScreen } from "./features/commits/CommitsScreen";
import { NotificationsScreen } from "./features/notifications/NotificationsScreen";
import { SystemInfoScreen } from "./features/system-info/SystemInfoScreen";
import { TerminalScreen } from "./features/terminal/TerminalScreen";
import { WorkspaceShell } from "./features/workspace/WorkspaceShell";
import { createWorkspaceViewModel } from "./features/workspace/create-workspace-view-model";
import type { QraftAiSessionId } from "../../src/types/ai";

export interface AppProps {
  readonly bootstrapState: SolidBootstrapState;
}

const PRIMARY_NAVIGATION_SCREENS: readonly AppScreen[] = [
  "files",
  "ai-session",
  "commits",
  "terminal",
] as const;

const SECONDARY_NAVIGATION_SCREENS: readonly AppScreen[] = [
  "project",
  "system-info",
  "notifications",
  "model-profiles",
  "action-defaults",
] as const;

const NAVIGATION_LABELS: Readonly<Record<AppScreen, string>> = {
  project: "Project",
  files: "Files",
  "ai-session": "Sessions",
  commits: "Commits",
  terminal: "Terminal",
  "system-info": "System Info",
  notifications: "Notifications",
  "model-profiles": "Model Profiles",
  "action-defaults": "Action Defaults",
};

function parseWindowRoute(): ScreenRouteState {
  return parseAppHash(window.location.hash);
}

function sameRoute(left: ScreenRouteState, right: ScreenRouteState): boolean {
  return (
    left.projectSlug === right.projectSlug &&
    left.screen === right.screen &&
    left.contextId === right.contextId &&
    left.selectedPath === right.selectedPath &&
    left.selectedViewMode === right.selectedViewMode &&
    left.fileTreeMode === right.fileTreeMode &&
    left.selectedLineNumber === right.selectedLineNumber
  );
}

function renderPlannedScreenPlaceholder(
  screen: ScreenRouteState["screen"],
): JSX.Element {
  const screenDefinition = getSolidScreenDefinition(screen);

  return (
    <section class="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-8">
      <h2 class="text-2xl font-semibold">{screenDefinition.label}</h2>
      <p class="text-sm text-text-secondary">
        Solid support status: {screenDefinition.implementationStatus}. Planned
        order: {screenDefinition.implementationOrder}.
      </p>
      <p class="text-sm text-text-secondary">
        Parity gate: {screenDefinition.parityGate.summary}
      </p>
      <ul class="list-disc pl-5 text-sm text-text-primary">
        <For each={screenDefinition.parityGate.checks}>
          {(check) => <li>{check}</li>}
        </For>
      </ul>
      <h3 class="text-lg font-semibold">Current blockers</h3>
      <ul class="list-disc pl-5 text-sm text-text-secondary">
        <For each={screenDefinition.blockers}>
          {(blocker) => <li>{blocker.summary}</li>}
        </For>
      </ul>
    </section>
  );
}

function getPrimaryNavigationButtonClass(isActive: boolean): string {
  return isActive
    ? "h-full border-b-2 border-accent-emphasis px-3 py-3 text-sm font-semibold text-text-primary"
    : "h-full border-b-2 border-transparent px-3 py-3 text-sm text-text-secondary transition-colors hover:border-border-emphasis hover:text-text-primary";
}

function getSecondaryNavigationButtonClass(isActive: boolean): string {
  return isActive
    ? "rounded-md border border-border-emphasis bg-bg-tertiary px-3 py-2 text-sm font-medium text-text-primary"
    : "rounded-md border border-transparent px-3 py-2 text-sm text-text-secondary transition-colors hover:border-border-default hover:bg-bg-tertiary hover:text-text-primary";
}

export function App(props: AppProps): JSX.Element {
  const [activeRoute, setActiveRoute] = createSignal<ScreenRouteState>(
    props.bootstrapState.route,
  );
  const [headerMenuOpen, setHeaderMenuOpen] = createSignal(false);
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

      const nextHash = buildScreenHash(
        nextRoute.projectSlug,
        nextRoute.screen,
        {
          selectedPath: nextRoute.selectedPath,
          selectedViewMode: nextRoute.selectedViewMode,
          fileTreeMode: nextRoute.fileTreeMode,
          selectedLineNumber: nextRoute.selectedLineNumber,
        },
      );
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
      setHeaderMenuOpen(false);
      setActiveRoute((currentRoute) =>
        sameRoute(currentRoute, nextRoute) ? currentRoute : nextRoute,
      );
    };

    window.addEventListener("hashchange", handleHashChange);
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
  const activeContextId = () =>
    workspaceViewModel.workspaceState().activeContextId;
  const activeWorkspaceTab = () =>
    getActiveWorkspaceTab(workspaceViewModel.workspaceState());
  const activeWorkspaceIsGitRepo = () =>
    activeWorkspaceTab()?.isGitRepo ?? false;
  const primaryNavigationItems = () =>
    screenNavigationItems().filter((navigationItem) =>
      PRIMARY_NAVIGATION_SCREENS.includes(navigationItem.screen),
    );
  const secondaryNavigationItems = () =>
    screenNavigationItems().filter((navigationItem) =>
      SECONDARY_NAVIGATION_SCREENS.includes(navigationItem.screen),
    );
  const activeProjectLabel = () => activeWorkspaceTab()?.name ?? "No Project";
  const activeProjectPath = () => activeWorkspaceTab()?.path ?? "";

  createEffect(() => {
    if (activeRoute().screen !== "files") {
      return;
    }

    const routeSelectedViewMode = activeRoute().selectedViewMode;
    if (
      routeSelectedViewMode !== null &&
      routeSelectedViewMode !== diffViewModel.preferredViewMode()
    ) {
      diffViewModel.setPreferredViewMode(routeSelectedViewMode);
    }
  });

  createEffect(() => {
    if (activeRoute().screen !== "files") {
      return;
    }

    const routeFileTreeMode = activeRoute().fileTreeMode;
    if (
      routeFileTreeMode !== null &&
      routeFileTreeMode !== filesViewModel.fileTreeMode()
    ) {
      void filesViewModel.setFileTreeMode(activeContextId(), routeFileTreeMode);
    }
  });

  createEffect(() => {
    if (activeRoute().screen !== "files") {
      return;
    }

    const routeSelectedPath = activeRoute().selectedPath;
    if (
      routeSelectedPath === null ||
      routeSelectedPath === filesViewModel.selectedPath()
    ) {
      return;
    }

    if (
      diffViewModel
        .diffOverview()
        .files.some((diffFile) => diffFile.path === routeSelectedPath)
    ) {
      diffViewModel.selectPath(activeContextId(), routeSelectedPath);
    }

    const nextViewMode = resolveViewModeForPathSelection({
      selectedPath: routeSelectedPath,
      diffOverview: diffViewModel.diffOverview(),
      preferredViewMode: diffViewModel.preferredViewMode(),
    });
    if (nextViewMode !== diffViewModel.preferredViewMode()) {
      diffViewModel.setPreferredViewMode(nextViewMode);
    }

    void filesViewModel.selectPath(activeContextId(), routeSelectedPath);
  });

  createEffect(() => {
    const currentRoute = activeRoute();
    const nextRoute = resolveUiSynchronizedRouteState({
      currentRoute,
      filesSelectedPath: filesViewModel.selectedPath(),
      preferredViewMode: diffViewModel.preferredViewMode(),
      fileTreeMode: filesViewModel.fileTreeMode(),
      activeWorkspaceIsGitRepo: activeWorkspaceIsGitRepo(),
    });

    if (sameRoute(currentRoute, nextRoute)) {
      if (currentRoute.screen !== "files") {
        return;
      }

      const nextHash = buildScreenHash(
        nextRoute.projectSlug,
        nextRoute.screen,
        {
          selectedPath: nextRoute.selectedPath,
          selectedViewMode: nextRoute.selectedViewMode,
          fileTreeMode: nextRoute.fileTreeMode,
          selectedLineNumber: nextRoute.selectedLineNumber,
        },
      );
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
      return;
    }

    setActiveRoute(nextRoute);
    const nextHash = buildScreenHash(nextRoute.projectSlug, nextRoute.screen, {
      selectedPath: nextRoute.selectedPath,
      selectedViewMode: nextRoute.selectedViewMode,
      fileTreeMode: nextRoute.fileTreeMode,
      selectedLineNumber: nextRoute.selectedLineNumber,
    });
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  });

  function navigateToScreen(screen: ScreenRouteState["screen"]): void {
    setHeaderMenuOpen(false);
    const nextRoute: ScreenRouteState = {
      ...activeRoute(),
      screen,
    };
    setActiveRoute(nextRoute);

    const nextHash = buildScreenHash(nextRoute.projectSlug, nextRoute.screen, {
      selectedPath: nextRoute.selectedPath,
      selectedViewMode: nextRoute.selectedViewMode,
      fileTreeMode: nextRoute.fileTreeMode,
      selectedLineNumber: nextRoute.selectedLineNumber,
    });
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
          isPickingDirectory={workspaceViewModel.isPickingDirectory()}
          errorMessage={workspaceViewModel.errorMessage()}
          newProjectPath={workspaceViewModel.newProjectPath()}
          onNewProjectPathInput={workspaceViewModel.setNewProjectPath}
          onPickProjectDirectory={workspaceViewModel.pickProjectDirectory}
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
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
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
          projectPath={activeProjectPath()}
          onChangeViewMode={(mode) => {
            setActiveRoute((currentRoute) => ({
              ...currentRoute,
              selectedViewMode: mode,
            }));
            diffViewModel.setPreferredViewMode(mode);
          }}
          onSelectPath={async (path: string) => {
            const nextViewMode = resolveViewModeForPathSelection({
              selectedPath: path,
              diffOverview: diffViewModel.diffOverview(),
              preferredViewMode: diffViewModel.preferredViewMode(),
            });
            setActiveRoute((currentRoute) => ({
              ...currentRoute,
              selectedPath: path,
              selectedViewMode: nextViewMode,
              selectedLineNumber: null,
            }));
            if (
              diffViewModel
                .diffOverview()
                .files.some((diffFile) => diffFile.path === path)
            ) {
              diffViewModel.selectPath(activeContextId(), path);
            }
            if (nextViewMode !== diffViewModel.preferredViewMode()) {
              diffViewModel.setPreferredViewMode(nextViewMode);
            }
            await filesViewModel.selectPath(activeContextId(), path);
          }}
          onChangeFileTreeMode={async (mode) => {
            setActiveRoute((currentRoute) => ({
              ...currentRoute,
              fileTreeMode: mode,
            }));
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
          onExpandAllDirectories={() => {
            filesViewModel.expandAllDirectories();
          }}
          onCollapseAllDirectories={() => {
            filesViewModel.collapseAllDirectories();
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
          selectedLineNumber={activeRoute().selectedLineNumber}
          onSelectLine={(lineNumber) => {
            setActiveRoute((currentRoute) => ({
              ...currentRoute,
              selectedLineNumber: lineNumber,
            }));
          }}
          onOpenAiSession={(sessionId: QraftAiSessionId) => {
            const projectSlug = activeRoute().projectSlug;
            const baseHash =
              projectSlug !== null
                ? `#/${projectSlug}/ai-session`
                : "#/ai-session";
            window.location.hash = `${baseHash}?ai_session_id=${encodeURIComponent(
              sessionId,
            )}`;
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
          projectPath={activeWorkspaceTab()?.path ?? ""}
          selectedPath={null}
          fileContent={null}
          diffOverview={diffViewModel.diffOverview()}
          onOpenFilesScreen={() => navigateToScreen("files")}
          onOpenProjectScreen={() => navigateToScreen("project")}
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
    <div class="flex h-screen flex-col bg-bg-primary text-text-primary">
      <header class="border-b border-border-default bg-bg-secondary/95 backdrop-blur">
        <div class="flex min-h-12 items-center gap-3 px-4">
          <button
            type="button"
            class="flex min-w-0 max-w-[280px] items-center gap-2 rounded-md border border-border-default bg-bg-primary px-3 py-2 text-left transition-colors hover:bg-bg-tertiary"
            onClick={() => navigateToScreen("project")}
            title={activeProjectPath()}
          >
            <span class="text-base font-semibold text-text-primary">
              QraftBox
            </span>
            <span class="truncate text-sm text-text-secondary">
              {activeProjectLabel()}
            </span>
          </button>
          <nav
            aria-label="Primary screens"
            class="flex min-w-0 flex-1 items-center overflow-x-auto"
          >
            <For each={primaryNavigationItems()}>
              {(navigationItem) => (
                <a
                  href={navigationItem.href}
                  aria-current={navigationItem.isActive ? "page" : undefined}
                  class={getPrimaryNavigationButtonClass(
                    navigationItem.isActive,
                  )}
                >
                  {NAVIGATION_LABELS[navigationItem.screen]}
                </a>
              )}
            </For>
          </nav>
          <div class="relative">
            <button
              type="button"
              class="rounded-md p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              aria-expanded={headerMenuOpen()}
              aria-haspopup="menu"
              aria-label="Open menu"
              onClick={() => setHeaderMenuOpen((currentValue) => !currentValue)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z" />
              </svg>
            </button>
            <Show when={headerMenuOpen()}>
              <div class="absolute right-0 top-full z-50 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-border-default bg-bg-secondary p-2 shadow-2xl shadow-black/30">
                <For each={secondaryNavigationItems()}>
                  {(navigationItem) => (
                    <a
                      href={navigationItem.href}
                      aria-current={
                        navigationItem.isActive ? "page" : undefined
                      }
                      class={getSecondaryNavigationButtonClass(
                        navigationItem.isActive,
                      )}
                      onClick={() => setHeaderMenuOpen(false)}
                    >
                      {NAVIGATION_LABELS[navigationItem.screen]}
                    </a>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-border-muted px-4 py-2 text-xs text-text-secondary">
          <span class="truncate">
            {activeContextId() === null
              ? "No project open"
              : activeProjectPath()}
          </span>
          <span>
            {activeWorkspaceIsGitRepo() ? "Git workspace" : "Non-git workspace"}
          </span>
        </div>
      </header>
      <main class="min-h-0 flex-1 overflow-hidden">
        <div class="h-full overflow-auto">{renderActiveScreen()}</div>
      </main>
    </div>
  );
}
