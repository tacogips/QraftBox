import {
  createEffect,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createStore } from "solid-js/store";
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
import { buildAiSessionScreenHash } from "./features/ai-session/state";
import { ModelProfilesScreen } from "./features/model-config/ModelProfilesScreen";
import { createFilesViewModel } from "./features/diff/create-files-view-model";
import { createDiffViewModel } from "./features/diff/create-diff-view-model";
import { DiffScreen } from "./features/diff/DiffScreen";
import { BranchSwitcher } from "./features/diff/BranchSwitcher";
import { GitActionsBar } from "./features/diff/GitActionsBar";
import { FilesTabToggle } from "./features/diff/FilesTabToggle";
import { shouldShowGitActionsBar } from "./features/diff/git-actions-state";
import { createDiffRealtimeController } from "./features/diff/realtime";
import { refreshFilesScreenFromRealtime } from "./features/diff/realtime-refresh";
import { createGitStateRefreshController } from "./features/diff/git-state-refresh";
import { resolveFilesSearchState } from "./features/diff/search-state";
import {
  resolveViewModeForFileTreeModeChange,
  resolveViewModeForPathSelection,
} from "./features/diff/screen-state";
import { CommitsScreen } from "./features/commits/CommitsScreen";
import { NotificationsScreen } from "./features/notifications/NotificationsScreen";
import { SystemInfoScreen } from "./features/system-info/SystemInfoScreen";
import { TerminalScreen } from "./features/terminal/TerminalScreen";
import { WorkersScreen } from "./features/workers/WorkersScreen";
import { WorkspaceShell } from "./features/workspace/WorkspaceShell";
import { createWorkspaceViewModel } from "./features/workspace/create-workspace-view-model";
import { WorktreeCreateButton } from "./features/worktree/WorktreeCreateButton";
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
  "workers",
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
  workers: "Workers",
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
    left.selectedLineNumber === right.selectedLineNumber &&
    (left.filesTab ?? null) === (right.filesTab ?? null) &&
    (left.searchPattern ?? "") === (right.searchPattern ?? "") &&
    (left.searchScope ?? null) === (right.searchScope ?? null) &&
    (left.searchCaseSensitive ?? false) ===
      (right.searchCaseSensitive ?? false) &&
    (left.searchExcludeFileNames ?? "") ===
      (right.searchExcludeFileNames ?? "") &&
    (left.searchShowIgnored ?? false) === (right.searchShowIgnored ?? false) &&
    (left.searchShowAllFiles ?? false) === (right.searchShowAllFiles ?? false)
  );
}

function buildRouteHash(route: ScreenRouteState): string {
  return buildScreenHash(route.projectSlug, route.screen, {
    selectedPath: route.selectedPath,
    selectedViewMode: route.selectedViewMode,
    fileTreeMode: route.fileTreeMode,
    selectedLineNumber: route.selectedLineNumber,
    filesTab: route.filesTab,
    searchPattern: route.searchPattern,
    searchScope: route.searchScope,
    searchCaseSensitive: route.searchCaseSensitive,
    searchExcludeFileNames: route.searchExcludeFileNames,
    searchShowIgnored: route.searchShowIgnored,
    searchShowAllFiles: route.searchShowAllFiles,
  });
}

function replaceWindowHash(nextHash: string): void {
  if (window.location.hash === nextHash) {
    return;
  }

  window.history.replaceState(window.history.state, "", nextHash);
}

function renderPlannedScreenPlaceholder(
  screen: ScreenRouteState["screen"],
): JSX.Element {
  const screenDefinition = getSolidScreenDefinition(screen);

  return (
    <section class="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-8">
      <h2 class="text-2xl font-semibold">{screenDefinition.label}</h2>
      <p class="text-sm text-text-secondary">
        Frontend support status: {screenDefinition.implementationStatus}.
        Planned order: {screenDefinition.implementationOrder}.
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

function renderWorkspaceKindIcon(isGitRepo: boolean): JSX.Element {
  if (isGitRepo) {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="3"
          cy="3"
          r="1.75"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <circle
          cx="13"
          cy="5"
          r="1.75"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <circle
          cx="8"
          cy="13"
          r="1.75"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <path
          d="M4.4 4.05 7 10.9M11.35 5.5 9.15 11.55"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
    </svg>
  );
}

export function App(props: AppProps): JSX.Element {
  const [activeRoute, setActiveRoute] = createStore<ScreenRouteState>(
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
    getCurrentRoute: () => activeRoute,
    onRouteChange(nextRoute) {
      setActiveRoute(nextRoute);
      const nextHash = buildRouteHash(nextRoute);
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
        activeScreen: activeRoute.screen,
        activeContextId: currentWorkspaceState.activeContextId,
        targetContextId: contextId,
        activeWorkspaceIsGitRepo: activeWorkspaceTab?.isGitRepo ?? false,
        refreshDiff: async (targetContextId: string): Promise<void> => {
          await diffViewModel.synchronize({
            screen: activeRoute.screen,
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
    getActiveScreen: () => activeRoute.screen,
    isGitRepo: () =>
      getActiveWorkspaceTab(workspaceViewModel.workspaceState())?.isGitRepo ??
      false,
    refreshContext: async (contextId: string): Promise<void> => {
      await diffViewModel.synchronize({
        screen: activeRoute.screen,
        activeContextId: contextId,
        activeWorkspaceIsGitRepo: true,
      });
    },
  });

  onMount(() => {
    const handleHashChange = (): void => {
      const nextRoute = parseWindowRoute();
      setHeaderMenuOpen(false);
      if (!sameRoute(activeRoute, nextRoute)) {
        setActiveRoute(nextRoute);
      }
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

  const screenNavigationItems = () =>
    createScreenNavigationItems({
      projectSlug: activeRoute.projectSlug,
      screen: activeRoute.screen,
    });
  const activeContextId = () =>
    workspaceViewModel.workspaceState().activeContextId;
  const activeWorkspaceTab = () =>
    getActiveWorkspaceTab(workspaceViewModel.workspaceState());
  const activeWorkspaceIsGitRepo = () =>
    activeWorkspaceTab()?.isGitRepo ?? false;
  const effectiveFileTreeMode = () =>
    activeRoute.fileTreeMode ?? filesViewModel.fileTreeMode();
  const effectiveFilesSearchState = () =>
    resolveFilesSearchState({
      route: activeRoute,
      defaults: {
        fileTreeMode: effectiveFileTreeMode(),
        showIgnored: filesViewModel.showIgnored(),
        showAllFiles: filesViewModel.showAllFiles(),
        activeWorkspaceIsGitRepo: activeWorkspaceIsGitRepo(),
      },
    });
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
  const shouldRenderFilesTabToggle = () =>
    activeRoute.screen === "files" && activeContextId() !== null;
  const shouldRenderHeaderGitActions = () =>
    activeRoute.screen === "files" &&
    shouldShowGitActionsBar({
      isGitRepo: activeWorkspaceIsGitRepo(),
      projectPath: activeProjectPath(),
    });

  function refreshActiveFilesWorkspace(): void {
    if (activeContextId() === null) {
      return;
    }

    void diffViewModel.synchronize({
      screen: activeRoute.screen,
      activeContextId: activeContextId(),
      activeWorkspaceIsGitRepo: activeWorkspaceIsGitRepo(),
    });
    void filesViewModel.refreshAllFilesTree(activeContextId());
    void filesViewModel.refreshSelectedFileContent(activeContextId());
  }

  createEffect(
    on(
      [() => activeRoute.screen, activeContextId, activeWorkspaceIsGitRepo],
      ([activeScreen, nextContextId, workspaceIsGitRepo]) => {
        void diffViewModel.synchronize({
          screen: activeScreen,
          activeContextId: nextContextId,
          activeWorkspaceIsGitRepo: workspaceIsGitRepo,
        });
      },
    ),
  );

  createEffect(
    on(
      [
        () => activeRoute.screen,
        activeContextId,
        activeWorkspaceIsGitRepo,
        diffViewModel.diffOverview,
        diffViewModel.preferredViewMode,
      ],
      ([
        activeScreen,
        nextContextId,
        workspaceIsGitRepo,
        diffOverview,
        preferredViewMode,
      ]) => {
        void filesViewModel.synchronize({
          screen: activeScreen,
          activeContextId: nextContextId,
          activeWorkspaceIsGitRepo: workspaceIsGitRepo,
          diffOverview,
          preferredViewMode,
        });
      },
    ),
  );

  createEffect(
    on(
      [() => activeRoute.screen, () => activeRoute.selectedViewMode],
      ([activeScreen, routeSelectedViewMode]) => {
        if (activeScreen !== "files") {
          return;
        }

        if (
          routeSelectedViewMode !== null &&
          routeSelectedViewMode !== diffViewModel.preferredViewMode()
        ) {
          diffViewModel.setPreferredViewMode(routeSelectedViewMode);
        }
      },
    ),
  );

  createEffect(
    on(
      [
        () => activeRoute.screen,
        () => activeRoute.fileTreeMode,
        activeContextId,
      ],
      ([activeScreen, routeFileTreeMode]) => {
        if (activeScreen !== "files") {
          return;
        }

        if (
          routeFileTreeMode !== null &&
          routeFileTreeMode !== filesViewModel.fileTreeMode()
        ) {
          void filesViewModel.setFileTreeMode(
            activeContextId(),
            routeFileTreeMode,
          );
        }
      },
    ),
  );

  createEffect(
    on(
      [
        () => activeRoute.screen,
        () => activeRoute.selectedPath,
        activeContextId,
      ],
      ([activeScreen, routeSelectedPath]) => {
        if (activeScreen !== "files") {
          return;
        }

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
      },
    ),
  );

  createEffect(() => {
    const currentRoute = activeRoute;
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

      replaceWindowHash(buildRouteHash(nextRoute));
      return;
    }

    setActiveRoute(nextRoute);
    const nextHash = buildRouteHash(nextRoute);
    if (currentRoute.screen === "files" && nextRoute.screen === "files") {
      replaceWindowHash(nextHash);
      return;
    }

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  });

  function navigateToScreen(screen: ScreenRouteState["screen"]): void {
    setHeaderMenuOpen(false);
    const nextRoute: ScreenRouteState = {
      ...activeRoute,
      screen,
    };
    setActiveRoute(nextRoute);

    const nextHash = buildRouteHash(nextRoute);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }

  function renderActiveScreen(): JSX.Element {
    if (activeRoute.screen === "project") {
      return (
        <WorkspaceShell
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          workspaceState={workspaceViewModel.workspaceState()}
          availableRecentProjects={workspaceViewModel.availableRecentProjects()}
          isLoading={workspaceViewModel.isLoading()}
          isMutating={workspaceViewModel.isMutating()}
          isPickingDirectory={workspaceViewModel.isPickingDirectory()}
          errorMessage={workspaceViewModel.errorMessage()}
          newProjectPath={workspaceViewModel.newProjectPath()}
          activeProjectContextId={activeContextId()}
          activeProjectName={activeProjectLabel()}
          activeProjectPath={activeProjectPath()}
          activeProjectIsGitRepo={activeWorkspaceIsGitRepo()}
          onNewProjectPathInput={workspaceViewModel.setNewProjectPath}
          onOpenProjectPath={workspaceViewModel.openProjectPath}
          onPickProjectDirectory={workspaceViewModel.pickProjectDirectory}
          onOpenProjectByPath={workspaceViewModel.openProjectByPath}
          onOpenRecentProject={workspaceViewModel.openRecentProject}
          onRemoveRecentProject={workspaceViewModel.removeRecentProject}
          onActivateTab={workspaceViewModel.activateTab}
          onCloseTab={workspaceViewModel.closeTab}
        />
      );
    }

    if (activeRoute.screen === "files") {
      return (
        <DiffScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
          diffOverview={diffViewModel.diffOverview()}
          selectedPath={filesViewModel.selectedPath()}
          supportsDiff={activeWorkspaceIsGitRepo()}
          preferredViewMode={diffViewModel.preferredViewMode()}
          fileTreeMode={effectiveFileTreeMode()}
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
          filesTab={effectiveFilesSearchState().filesTab}
          searchPattern={effectiveFilesSearchState().searchPattern}
          searchScope={effectiveFilesSearchState().searchScope}
          searchCaseSensitive={effectiveFilesSearchState().searchCaseSensitive}
          searchExcludeFileNames={
            effectiveFilesSearchState().searchExcludeFileNames
          }
          searchShowIgnored={effectiveFilesSearchState().searchShowIgnored}
          searchShowAllFiles={effectiveFilesSearchState().searchShowAllFiles}
          onChangeViewMode={(mode) => {
            setActiveRoute({
              ...activeRoute,
              selectedViewMode: mode,
            });
            diffViewModel.setPreferredViewMode(mode);
          }}
          onSelectPath={async (path: string) => {
            const nextViewMode = resolveViewModeForPathSelection({
              selectedPath: path,
              diffOverview: diffViewModel.diffOverview(),
              preferredViewMode: diffViewModel.preferredViewMode(),
            });
            setActiveRoute({
              ...activeRoute,
              selectedPath: path,
              selectedViewMode: nextViewMode,
              selectedLineNumber: null,
            });
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
            setActiveRoute({
              ...activeRoute,
              fileTreeMode: mode,
            });
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
          onChangeFilesTab={(tab) => {
            const searchState = effectiveFilesSearchState();
            setActiveRoute({
              ...activeRoute,
              filesTab: tab,
              searchScope: searchState.searchScope,
              searchCaseSensitive: searchState.searchCaseSensitive,
              searchExcludeFileNames: searchState.searchExcludeFileNames,
              searchShowIgnored: searchState.searchShowIgnored,
              searchShowAllFiles: searchState.searchShowAllFiles,
            });
          }}
          onChangeSearchPattern={(pattern) => {
            const searchState = effectiveFilesSearchState();
            setActiveRoute({
              ...activeRoute,
              filesTab: "search",
              searchPattern: pattern,
              searchScope: searchState.searchScope,
              searchCaseSensitive: searchState.searchCaseSensitive,
              searchExcludeFileNames: searchState.searchExcludeFileNames,
              searchShowIgnored: searchState.searchShowIgnored,
              searchShowAllFiles: searchState.searchShowAllFiles,
            });
          }}
          onChangeSearchScope={(scope) => {
            const searchState = effectiveFilesSearchState();
            setActiveRoute({
              ...activeRoute,
              filesTab: "search",
              searchPattern: searchState.searchPattern,
              searchScope: scope,
              searchCaseSensitive: searchState.searchCaseSensitive,
              searchExcludeFileNames: searchState.searchExcludeFileNames,
              searchShowIgnored:
                scope === "all" ? searchState.searchShowIgnored : false,
              searchShowAllFiles:
                scope === "all" ? searchState.searchShowAllFiles : false,
            });
          }}
          onToggleSearchCaseSensitive={(value) => {
            const searchState = effectiveFilesSearchState();
            setActiveRoute({
              ...activeRoute,
              filesTab: "search",
              searchPattern: searchState.searchPattern,
              searchScope: searchState.searchScope,
              searchCaseSensitive: value,
              searchExcludeFileNames: searchState.searchExcludeFileNames,
              searchShowIgnored: searchState.searchShowIgnored,
              searchShowAllFiles: searchState.searchShowAllFiles,
            });
          }}
          onChangeSearchExcludeFileNames={(value) => {
            const searchState = effectiveFilesSearchState();
            setActiveRoute({
              ...activeRoute,
              filesTab: "search",
              searchPattern: searchState.searchPattern,
              searchScope: searchState.searchScope,
              searchCaseSensitive: searchState.searchCaseSensitive,
              searchExcludeFileNames: value,
              searchShowIgnored: searchState.searchShowIgnored,
              searchShowAllFiles: searchState.searchShowAllFiles,
            });
          }}
          onToggleSearchShowIgnored={(value) => {
            const searchState = effectiveFilesSearchState();
            setActiveRoute({
              ...activeRoute,
              filesTab: "search",
              searchPattern: searchState.searchPattern,
              searchScope: "all",
              searchCaseSensitive: searchState.searchCaseSensitive,
              searchExcludeFileNames: searchState.searchExcludeFileNames,
              searchShowIgnored: value,
              searchShowAllFiles: searchState.searchShowAllFiles,
            });
          }}
          onToggleSearchShowAllFiles={(value) => {
            const searchState = effectiveFilesSearchState();
            setActiveRoute({
              ...activeRoute,
              filesTab: "search",
              searchPattern: searchState.searchPattern,
              searchScope: "all",
              searchCaseSensitive: searchState.searchCaseSensitive,
              searchExcludeFileNames: searchState.searchExcludeFileNames,
              searchShowIgnored: searchState.searchShowIgnored,
              searchShowAllFiles: value,
            });
          }}
          onSubmitSearch={(params) => {
            setActiveRoute({
              ...activeRoute,
              filesTab: "search",
              searchPattern: params.pattern,
              searchScope: params.scope,
              searchCaseSensitive: params.caseSensitive,
              searchExcludeFileNames: params.excludeFileNames,
              searchShowIgnored:
                params.scope === "all" ? params.showIgnored : false,
              searchShowAllFiles:
                params.scope === "all" ? params.showAllFiles : false,
            });
          }}
          onOpenSearchResult={(path, lineNumber) => {
            const searchState = effectiveFilesSearchState();
            const pathIsChangedFile = diffViewModel
              .diffOverview()
              .files.some((diffFile) => diffFile.path === path);
            const nextViewMode = resolveViewModeForPathSelection({
              selectedPath: path,
              diffOverview: diffViewModel.diffOverview(),
              preferredViewMode: diffViewModel.preferredViewMode(),
            });

            setActiveRoute({
              ...activeRoute,
              filesTab: "file",
              selectedPath: path,
              selectedLineNumber: lineNumber,
              selectedViewMode: nextViewMode,
              fileTreeMode: pathIsChangedFile
                ? activeRoute.fileTreeMode
                : "all",
              searchPattern: searchState.searchPattern,
              searchScope: searchState.searchScope,
              searchCaseSensitive: searchState.searchCaseSensitive,
              searchExcludeFileNames: searchState.searchExcludeFileNames,
              searchShowIgnored: searchState.searchShowIgnored,
              searchShowAllFiles: searchState.searchShowAllFiles,
            });

            if (pathIsChangedFile) {
              diffViewModel.selectPath(activeContextId(), path);
            }

            if (nextViewMode !== diffViewModel.preferredViewMode()) {
              diffViewModel.setPreferredViewMode(nextViewMode);
            }

            if (!pathIsChangedFile) {
              void filesViewModel.setFileTreeMode(activeContextId(), "all");
              if (
                searchState.searchScope === "all" &&
                searchState.searchShowIgnored !== filesViewModel.showIgnored()
              ) {
                void filesViewModel.setShowIgnored(
                  activeContextId(),
                  searchState.searchShowIgnored,
                );
              }
              if (
                searchState.searchScope === "all" &&
                searchState.searchShowAllFiles !== filesViewModel.showAllFiles()
              ) {
                void filesViewModel.setShowAllFiles(
                  activeContextId(),
                  searchState.searchShowAllFiles,
                );
              }
            }

            void filesViewModel.selectPath(activeContextId(), path);
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
              screen: activeRoute.screen,
              activeContextId: activeContextId(),
              activeWorkspaceIsGitRepo: activeWorkspaceIsGitRepo(),
            });
            void filesViewModel.refreshAllFilesTree(activeContextId());
            void filesViewModel.refreshSelectedFileContent(activeContextId());
          }}
          onEnsureCompleteAllFilesTree={() => {
            if (activeContextId() === null) {
              return;
            }

            void filesViewModel.ensureCompleteAllFilesTree(activeContextId());
          }}
          selectedLineNumber={activeRoute.selectedLineNumber}
          onSelectLine={(lineNumber) => {
            const nextRoute = {
              ...activeRoute,
              selectedLineNumber: lineNumber,
            };
            setActiveRoute({
              ...activeRoute,
              selectedLineNumber: lineNumber,
            });
            const nextHash = buildRouteHash(nextRoute);
            if (window.location.hash !== nextHash) {
              replaceWindowHash(nextHash);
            }
          }}
          onOpenAiSession={(sessionId: QraftAiSessionId) => {
            window.location.hash = buildAiSessionScreenHash({
              projectSlug: activeRoute.projectSlug,
              overviewRouteState: {
                selectedSessionId: sessionId,
                isDraftComposerOpen: false,
                searchQuery: "",
                searchInTranscript: true,
              },
            });
          }}
        />
      );
    }

    if (activeRoute.screen === "system-info") {
      return <SystemInfoScreen apiBaseUrl={props.bootstrapState.apiBaseUrl} />;
    }

    if (activeRoute.screen === "commits") {
      return (
        <CommitsScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
          isGitRepo={activeWorkspaceIsGitRepo()}
        />
      );
    }

    if (activeRoute.screen === "ai-session") {
      return (
        <AiSessionScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
          projectSlug={activeRoute.projectSlug}
          projectPath={activeWorkspaceTab()?.path ?? ""}
          selectedPath={filesViewModel.selectedPath()}
          fileContent={filesViewModel.fileContent()}
          diffOverview={diffViewModel.diffOverview()}
          onOpenFilesScreen={() => navigateToScreen("files")}
          onOpenProjectScreen={() => navigateToScreen("project")}
        />
      );
    }

    if (activeRoute.screen === "terminal") {
      return (
        <TerminalScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
        />
      );
    }

    if (activeRoute.screen === "workers") {
      return (
        <WorkersScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          projectPath={activeProjectPath()}
        />
      );
    }

    if (activeRoute.screen === "notifications") {
      return <NotificationsScreen />;
    }

    if (activeRoute.screen === "model-profiles") {
      return (
        <ModelProfilesScreen apiBaseUrl={props.bootstrapState.apiBaseUrl} />
      );
    }

    if (activeRoute.screen === "action-defaults") {
      return (
        <ActionDefaultsScreen
          apiBaseUrl={props.bootstrapState.apiBaseUrl}
          contextId={activeContextId()}
        />
      );
    }

    return renderPlannedScreenPlaceholder(activeRoute.screen);
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
        <div class="flex flex-wrap items-center gap-3 border-t border-border-muted px-4 py-2 text-xs text-text-secondary">
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate">
              {activeContextId() === null
                ? "No project open"
                : activeProjectPath()}
            </span>
            <Show when={activeContextId() !== null}>
              <span
                class="inline-flex items-center text-text-tertiary"
                aria-label={
                  activeWorkspaceIsGitRepo()
                    ? "Git workspace"
                    : "Folder workspace"
                }
                title={
                  activeWorkspaceIsGitRepo()
                    ? "Git workspace"
                    : "Folder workspace"
                }
              >
                {renderWorkspaceKindIcon(activeWorkspaceIsGitRepo())}
              </span>
            </Show>
            <Show
              when={
                shouldRenderHeaderGitActions() && activeWorkspaceIsGitRepo()
              }
            >
              <BranchSwitcher
                apiBaseUrl={props.bootstrapState.apiBaseUrl}
                contextId={activeContextId()}
                isGitRepo={activeWorkspaceIsGitRepo()}
                onSuccess={refreshActiveFilesWorkspace}
              />
              <WorktreeCreateButton
                apiBaseUrl={props.bootstrapState.apiBaseUrl}
                contextId={activeContextId()}
                projectPath={activeProjectPath()}
                isGitRepo={activeWorkspaceIsGitRepo()}
                triggerLabel="Create Worktree"
                onOpenWorktreeProject={workspaceViewModel.openProjectPath}
              />
              <Show when={shouldRenderFilesTabToggle()}>
                <div class="ml-2">
                  <FilesTabToggle
                    filesTab={effectiveFilesSearchState().filesTab}
                    onChangeFilesTab={(filesTab) => {
                      const searchState = effectiveFilesSearchState();
                      setActiveRoute({
                        ...activeRoute,
                        filesTab,
                        searchScope: searchState.searchScope,
                        searchCaseSensitive: searchState.searchCaseSensitive,
                        searchExcludeFileNames:
                          searchState.searchExcludeFileNames,
                        searchShowIgnored: searchState.searchShowIgnored,
                        searchShowAllFiles: searchState.searchShowAllFiles,
                      });
                    }}
                  />
                </div>
              </Show>
            </Show>
            <Show
              when={
                shouldRenderFilesTabToggle() &&
                !(shouldRenderHeaderGitActions() && activeWorkspaceIsGitRepo())
              }
            >
              <FilesTabToggle
                filesTab={effectiveFilesSearchState().filesTab}
                onChangeFilesTab={(filesTab) => {
                  const searchState = effectiveFilesSearchState();
                  setActiveRoute({
                    ...activeRoute,
                    filesTab,
                    searchScope: searchState.searchScope,
                    searchCaseSensitive: searchState.searchCaseSensitive,
                    searchExcludeFileNames: searchState.searchExcludeFileNames,
                    searchShowIgnored: searchState.searchShowIgnored,
                    searchShowAllFiles: searchState.searchShowAllFiles,
                  });
                }}
              />
            </Show>
          </div>
          <Show when={shouldRenderHeaderGitActions()}>
            <GitActionsBar
              apiBaseUrl={props.bootstrapState.apiBaseUrl}
              projectPath={activeProjectPath()}
              isGitRepo={activeWorkspaceIsGitRepo()}
              hasChanges={diffViewModel.diffOverview().stats.totalFiles > 0}
              onSuccess={(_actionName) => {
                refreshActiveFilesWorkspace();
              }}
            />
          </Show>
        </div>
      </header>
      <main class="min-h-0 flex-1 overflow-hidden">
        <div class="h-full overflow-auto">{renderActiveScreen()}</div>
      </main>
    </div>
  );
}
