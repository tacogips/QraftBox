import { buildScreenHash, parseHash, type ScreenType } from "./app-routing";
import {
  activateWorkspaceTab,
  closeWorkspaceTab,
  createWorkspaceTab,
  fetchDiffFiles,
  fetchRecentWorkspaceProjects,
  fetchWorkspace,
  pickDirectoryViaServer,
  removeRecentWorkspaceProject,
  type RecentProject,
  type ServerTab,
} from "./app-api";
import type { DiffFile } from "../types/diff";

type SetState<T> = (value: T) => void;
type GetState<T> = () => T;

interface WorkspaceControllerDeps {
  getContextId: GetState<string | null>;
  setContextId: SetState<string | null>;
  getProjectPath: GetState<string>;
  setProjectPath: SetState<string>;
  getWorkspaceTabs: GetState<ServerTab[]>;
  setWorkspaceTabs: SetState<ServerTab[]>;
  getCurrentScreen: GetState<ScreenType>;
  setCurrentScreen: SetState<ScreenType>;
  setError: SetState<string | null>;
  getRecentProjects: GetState<RecentProject[]>;
  setRecentProjects: SetState<RecentProject[]>;
  setNewProjectPath: SetState<string>;
  setNewProjectError: SetState<string | null>;
  setNewProjectLoading: SetState<boolean>;
  setPickingDirectory: SetState<boolean>;
  setLoading: SetState<boolean>;
  getFileTreeMode: GetState<"diff" | "all">;
  setFileTreeMode: SetState<"diff" | "all">;
  setShowAllFiles: SetState<boolean>;
  setDiffFiles: SetState<DiffFile[]>;
  setSelectedPath: SetState<string | null>;
  setAllFilesTree: SetState<unknown | null>;
  setAllFilesTreeStale: SetState<boolean>;
  setFileContent: SetState<unknown | null>;
  fetchAllFiles: (ctxId: string) => Promise<void>;
  fetchPromptQueue: () => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
}

function persistRecentProjects(recentProjects: RecentProject[]): void {
  try {
    localStorage.setItem(
      "qraftbox:recent-projects",
      JSON.stringify(recentProjects),
    );
  } catch {
    // Ignore
  }
}

function loadRecentProjectsFromStorage(): RecentProject[] {
  try {
    const stored = localStorage.getItem("qraftbox:recent-projects");
    if (stored !== null) {
      return JSON.parse(stored) as RecentProject[];
    }
  } catch {
    // Ignore
  }
  return [];
}

export function createWorkspaceController(deps: WorkspaceControllerDeps): {
  init: () => Promise<void>;
  switchProject: (tabId: string) => Promise<void>;
  closeProjectTab: (tabId: string, event: MouseEvent) => Promise<void>;
  fetchRecentProjects: () => Promise<void>;
  openProjectByPath: (path: string) => Promise<void>;
  openRecentProject: (path: string) => Promise<void>;
  removeRecentProject: (path: string) => Promise<void>;
  pickDirectory: () => Promise<void>;
  fetchDiff: (ctxId: string) => Promise<void>;
  navigateToScreen: (screen: ScreenType) => void;
  handleHashChange: () => void;
} {
  function resetProjectState(): void {
    deps.setDiffFiles([]);
    deps.setSelectedPath(null);
    deps.setAllFilesTree(null);
    deps.setAllFilesTreeStale(false);
    deps.setFileContent(null);
  }

  async function fetchDiff(ctxId: string): Promise<void> {
    const files = await fetchDiffFiles(ctxId);
    deps.setDiffFiles(files);
    if (files.length > 0 && files[0] !== undefined) {
      deps.setSelectedPath(files[0].path);
    }
  }

  function currentProjectSlug(): string | null {
    const contextId = deps.getContextId();
    if (contextId === null) return null;
    const tab = deps.getWorkspaceTabs().find((item) => item.id === contextId);
    return tab?.projectSlug ?? null;
  }

  function navigateToScreen(screen: ScreenType): void {
    deps.setCurrentScreen(screen);
    const slug = currentProjectSlug();
    const newHash = buildScreenHash(slug, screen);
    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  }

  function addToRecentProjects(tab: {
    path: string;
    name: string;
    isGitRepo: boolean;
  }): void {
    const workspaceTabs = deps.getWorkspaceTabs();
    if (workspaceTabs.some((item) => item.path === tab.path)) {
      return;
    }

    const recentProjects = deps.getRecentProjects();
    const updated = [
      { path: tab.path, name: tab.name, isGitRepo: tab.isGitRepo },
      ...recentProjects.filter((item) => item.path !== tab.path),
    ].slice(0, 20);

    deps.setRecentProjects(updated);
    persistRecentProjects(updated);
  }

  async function fetchContext(): Promise<string> {
    const workspace = await fetchWorkspace();
    const tabs = workspace.tabs;
    if (tabs.length > 0) {
      deps.setWorkspaceTabs(tabs);
      const activeTab =
        workspace.activeTabId !== null
          ? tabs.find((t) => t.id === workspace.activeTabId)
          : undefined;
      const selectedTab = activeTab ?? tabs[0];
      if (selectedTab !== undefined) {
        deps.setProjectPath(selectedTab.path);
        return selectedTab.id;
      }
    }

    deps.setWorkspaceTabs([]);
    deps.setCurrentScreen("project");
    return "";
  }

  async function switchProject(tabId: string): Promise<void> {
    if (tabId === deps.getContextId()) return;

    const tab = deps.getWorkspaceTabs().find((item) => item.id === tabId);
    if (tab === undefined) return;

    try {
      await activateWorkspaceTab(tabId);
      deps.setContextId(tabId);
      deps.setProjectPath(tab.path);
      resetProjectState();
      deps.setLoading(true);

      if (tab.isGitRepo) {
        await fetchDiff(tabId);
        if (deps.getFileTreeMode() === "all") {
          void deps.fetchAllFiles(tabId);
        }
      } else {
        // Non-git directory: force all-files mode with filesystem listing
        deps.setFileTreeMode("all");
        deps.setShowAllFiles(true);
        void deps.fetchAllFiles(tabId);
      }

      void deps.fetchPromptQueue();
      void deps.fetchActiveSessions();

      if (deps.getCurrentScreen() === "project") {
        navigateToScreen("files");
      } else if (tab.projectSlug.length > 0) {
        const hash = buildScreenHash(tab.projectSlug, deps.getCurrentScreen());
        if (window.location.hash !== hash) {
          window.location.hash = hash;
        }
      }
    } catch (error) {
      console.error("Failed to switch project:", error);
    } finally {
      deps.setLoading(false);
    }
  }

  async function closeProjectTab(
    tabId: string,
    event: MouseEvent,
  ): Promise<void> {
    event.stopPropagation();
    const closingTab = deps.getWorkspaceTabs().find((tab) => tab.id === tabId);

    try {
      const result = await closeWorkspaceTab(tabId);
      deps.setWorkspaceTabs(result.tabs);

      if (closingTab !== undefined) {
        addToRecentProjects(closingTab);
      }

      if (tabId !== deps.getContextId()) {
        return;
      }

      const tabs = result.tabs;
      if (tabs.length === 0) {
        deps.setContextId(null);
        deps.setProjectPath("");
        resetProjectState();
        deps.setLoading(false);
        navigateToScreen("project");
        return;
      }

      const nextTab =
        result.activeTabId !== null
          ? tabs.find((tab) => tab.id === result.activeTabId)
          : tabs[0];

      if (nextTab === undefined) {
        return;
      }

      deps.setContextId(nextTab.id);
      deps.setProjectPath(nextTab.path);
      resetProjectState();
      if (nextTab.isGitRepo) {
        await fetchDiff(nextTab.id);
        if (deps.getFileTreeMode() === "all") {
          void deps.fetchAllFiles(nextTab.id);
        }
      } else {
        deps.setFileTreeMode("all");
        deps.setShowAllFiles(true);
        void deps.fetchAllFiles(nextTab.id);
      }
      void deps.fetchPromptQueue();
      void deps.fetchActiveSessions();

      if (nextTab.projectSlug.length > 0) {
        window.location.hash = buildScreenHash(
          nextTab.projectSlug,
          deps.getCurrentScreen(),
        );
      }
    } catch (error) {
      console.error("Failed to close project tab:", error);
    }
  }

  async function fetchRecentProjects(): Promise<void> {
    try {
      const serverRecent = await fetchRecentWorkspaceProjects();
      const workspaceTabs = deps.getWorkspaceTabs();
      const openPaths = new Set(workspaceTabs.map((tab) => tab.path));
      const recentProjects = deps.getRecentProjects();
      const localPaths = new Set(recentProjects.map((item) => item.path));
      const merged = [...recentProjects];

      for (const item of serverRecent) {
        if (!localPaths.has(item.path) && !openPaths.has(item.path)) {
          merged.push(item);
        }
      }

      deps.setRecentProjects(merged.slice(0, 20));
    } catch {
      // Ignore
    }
  }

  async function openProjectByPath(path: string): Promise<void> {
    const trimmed = path.trim();
    if (trimmed.length === 0) return;

    deps.setNewProjectLoading(true);
    deps.setNewProjectError(null);

    try {
      const result = await createWorkspaceTab(trimmed);
      deps.setWorkspaceTabs(result.tabs);

      const filtered = deps
        .getRecentProjects()
        .filter((recent) => recent.path !== trimmed);
      deps.setRecentProjects(filtered);
      persistRecentProjects(filtered);

      deps.setNewProjectPath("");
      await switchProject(result.tab.id);
    } catch (error) {
      deps.setNewProjectError(
        error instanceof Error ? error.message : "Failed to open project",
      );
    } finally {
      deps.setNewProjectLoading(false);
    }
  }

  async function openRecentProject(path: string): Promise<void> {
    await openProjectByPath(path);
  }

  async function removeRecentProject(path: string): Promise<void> {
    try {
      await removeRecentWorkspaceProject(path);
    } catch {
      // Ignore server errors
    }

    const filtered = deps
      .getRecentProjects()
      .filter((recent) => recent.path !== path);
    deps.setRecentProjects(filtered);
    persistRecentProjects(filtered);
  }

  async function pickDirectory(): Promise<void> {
    deps.setPickingDirectory(true);
    deps.setNewProjectError(null);

    try {
      const currentPath = deps.getProjectPath();
      const selectedPath = await pickDirectoryViaServer(
        currentPath.length > 0 ? currentPath : undefined,
      );
      if (selectedPath === null) {
        return;
      }
      await openProjectByPath(selectedPath);
    } catch (error) {
      deps.setNewProjectError(
        error instanceof Error
          ? error.message
          : "Failed to open directory picker",
      );
    } finally {
      deps.setPickingDirectory(false);
    }
  }

  function handleHashChange(): void {
    const parsed = parseHash(window.location.hash);
    if (parsed.screen !== deps.getCurrentScreen()) {
      deps.setCurrentScreen(parsed.screen);
    }

    if (parsed.slug !== null) {
      const targetTab = deps
        .getWorkspaceTabs()
        .find((tab) => tab.projectSlug === parsed.slug);
      if (targetTab !== undefined && targetTab.id !== deps.getContextId()) {
        void switchProject(targetTab.id);
      }
    }
  }

  async function init(): Promise<void> {
    deps.setRecentProjects(loadRecentProjectsFromStorage());

    try {
      deps.setLoading(true);
      deps.setError(null);

      const parsed = parseHash(window.location.hash);
      const contextId = await fetchContext();

      if (contextId === "") {
        void fetchRecentProjects();
        deps.setLoading(false);
        return;
      }

      deps.setContextId(contextId);

      if (parsed.slug !== null) {
        const targetTab = deps
          .getWorkspaceTabs()
          .find((tab) => tab.projectSlug === parsed.slug);
        if (targetTab !== undefined && targetTab.id !== contextId) {
          deps.setContextId(targetTab.id);
          deps.setProjectPath(targetTab.path);
          await activateWorkspaceTab(targetTab.id);
        }
      }

      if (parsed.screen !== deps.getCurrentScreen()) {
        deps.setCurrentScreen(parsed.screen);
      }

      const activeTab = deps
        .getWorkspaceTabs()
        .find((tab) => tab.id === deps.getContextId());
      const activeContextId = deps.getContextId();
      if (activeContextId !== null) {
        if (activeTab?.isGitRepo === true) {
          await fetchDiff(activeContextId);
          if (deps.getFileTreeMode() === "all") {
            void deps.fetchAllFiles(activeContextId);
          }
        } else {
          // Non-git directory: force all-files mode with filesystem listing
          deps.setFileTreeMode("all");
          deps.setShowAllFiles(true);
          void deps.fetchAllFiles(activeContextId);
        }
      }

      void deps.fetchPromptQueue();
      void deps.fetchActiveSessions();
      void fetchRecentProjects();

      const slug = currentProjectSlug();
      if (slug !== null) {
        const hash = buildScreenHash(slug, deps.getCurrentScreen());
        if (window.location.hash !== hash) {
          window.location.hash = hash;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load";
      deps.setError(message);
      console.error("Init error:", error);
    } finally {
      deps.setLoading(false);
    }
  }

  return {
    init,
    switchProject,
    closeProjectTab,
    fetchRecentProjects,
    openProjectByPath,
    openRecentProject,
    removeRecentProject,
    pickDirectory,
    fetchDiff,
    navigateToScreen,
    handleHashChange,
  };
}
