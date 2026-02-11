<script lang="ts">
  import type { DiffFile, ViewMode } from "./types/diff";
  import type { FileNode } from "./stores/files";
  import {
    generateQraftAiSessionId,
    type QraftAiSessionId,
    type QueueStatus,
    type FileReference,
    type AISession,
  } from "../../src/types/ai";
  // LocalPrompt type no longer needed - server manages prompt queue
  import DiffView from "../components/DiffView.svelte";
  import FileViewer from "../components/FileViewer.svelte";
  import FileTree from "../components/FileTree.svelte";
  import AIPromptPanel from "../components/AIPromptPanel.svelte";
  import CurrentSessionPanel from "../components/CurrentSessionPanel.svelte";
  import SessionToolbar from "../components/SessionToolbar.svelte";
  import UnifiedSessionsScreen from "../components/sessions/UnifiedSessionsScreen.svelte";
  import CommitsScreen from "../components/commits/CommitsScreen.svelte";
  import GitPushButton from "../components/git-actions/GitPushButton.svelte";
  import HeaderStatusBadges from "../components/HeaderStatusBadges.svelte";
  import ProjectScreen from "../components/project/ProjectScreen.svelte";
  import WorktreeButton from "../components/worktree/WorktreeButton.svelte";
  import ToolsScreen from "../components/tools/ToolsScreen.svelte";
  import SystemInfoScreen from "../components/system-info/SystemInfoScreen.svelte";
  import CurrentStateView from "../components/CurrentStateView.svelte";
  import MergeBranchDialog from "../components/MergeBranchDialog.svelte";

  /**
   * Screen type for navigation
   */
  type ScreenType =
    | "diff"
    | "commits"
    | "sessions"
    | "project"
    | "tools"
    | "system-info";

  /**
   * Valid screens for hash validation
   */
  const VALID_SCREENS: ReadonlySet<string> = new Set([
    "diff",
    "commits",
    "sessions",
    "project",
    "tools",
    "system-info",
  ]);

  /**
   * Parse URL hash into { slug, screen }.
   * Format: #/{projectSlug}/{page} or #/{page} (legacy)
   */
  function parseHash(): { slug: string | null; screen: ScreenType } {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const parts = hash.split("/").filter(Boolean);

    if (parts.length >= 2) {
      // #/{projectSlug}/{page}
      const slug = parts[0] ?? null;
      const page = parts[1] ?? "diff";
      return {
        slug,
        screen: VALID_SCREENS.has(page) ? (page as ScreenType) : "diff",
      };
    }

    if (parts.length === 1) {
      const single = parts[0] ?? "";
      // If it's a known screen name, treat as legacy #/{page}
      if (VALID_SCREENS.has(single)) {
        return { slug: null, screen: single as ScreenType };
      }
      // Otherwise treat as #/{projectSlug} with default screen
      return { slug: single, screen: "diff" };
    }

    return { slug: null, screen: "diff" };
  }

  /**
   * Get screen from hash (convenience for initial state)
   */
  function screenFromHash(): ScreenType {
    return parseHash().screen;
  }

  /**
   * Application state
   */
  let contextId = $state<string | null>(null);
  let diffFiles = $state<DiffFile[]>([]);
  let selectedPath = $state<string | null>(null);
  let viewMode = $state<ViewMode>("full-file");
  let fileTreeMode = $state<"diff" | "all">("all");
  let sidebarCollapsed = $state(false);

  const SIDEBAR_MIN_WIDTH = 160;
  const SIDEBAR_MAX_WIDTH = 480;
  const SIDEBAR_WIDTH_STEP = 64;
  const SIDEBAR_DEFAULT_WIDTH = 256;

  function loadSidebarWidth(): number {
    try {
      const stored = localStorage.getItem("qraftbox-sidebar-width");
      if (stored !== null) {
        const w = Number(stored);
        if (
          !Number.isNaN(w) &&
          w >= SIDEBAR_MIN_WIDTH &&
          w <= SIDEBAR_MAX_WIDTH
        ) {
          return w;
        }
      }
    } catch {
      // localStorage unavailable
    }
    return SIDEBAR_DEFAULT_WIDTH;
  }

  let sidebarWidth = $state(loadSidebarWidth());
  let loading = $state(true);
  let error = $state<string | null>(null);
  let projectPath = $state<string>("");
  let workspaceTabs = $state<ServerTab[]>([]);
  let currentScreen = $state<ScreenType>(screenFromHash());
  let headerMenuOpen = $state(false);
  let addProjectMenuOpen = $state(false);
  let addProjectBtnEl = $state<HTMLButtonElement | undefined>(undefined);
  let recentProjects = $state<
    Array<{ path: string; name: string; isGitRepo: boolean }>
  >([]);
  // Add-project state
  let newProjectPath = $state("");
  let newProjectError = $state<string | null>(null);
  let newProjectLoading = $state(false);
  let pickingDirectory = $state(false);
  let pathCopied = $state(false);
  let mergeDialogOpen = $state(false);

  // AI prompt state
  let aiPanelCollapsed = $state(true);
  let queueStatus = $state<QueueStatus>({
    runningCount: 0,
    queuedCount: 0,
    runningSessionIds: [],
    totalCount: 0,
  });

  // Running/queued/recently-completed sessions for CurrentSessionPanel
  let runningSessions = $state<AISession[]>([]);
  let queuedSessions = $state<AISession[]>([]);
  let recentlyCompletedSessions = $state<AISession[]>([]);
  let sessionPollTimer: ReturnType<typeof setInterval> | null = null;
  let sessionStreams = new Map<string, EventSource>();

  /**
   * Claude CLI session ID for display in CurrentSessionPanel (set by Resume).
   * This is purely for UI display; session resolution is handled server-side
   * via qraft_ai_session_id.
   */
  let resumeDisplaySessionId = $state<string | null>(null);

  /**
   * Client-generated session group ID (qraft_ai_session_id).
   * All prompts submitted in the same "session" share this ID so the server
   * can chain them together even before the Claude session ID is resolved.
   * The server maps qraft_ai_session_id to Claude CLI sessions internally.
   */
  let qraftAiSessionId = $state<QraftAiSessionId>(generateQraftAiSessionId());

  // Server-managed prompt queue (received via WebSocket)
  interface PromptQueueItem {
    id: string;
    message: string;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    claude_session_id?: string | undefined;
    current_activity?: string | undefined;
    error?: string | undefined;
    created_at: string;
    worktree_id: string;
    qraft_ai_session_id?: QraftAiSessionId | undefined;
  }
  let serverPromptQueue = $state<PromptQueueItem[]>([]);

  /**
   * Recent projects filtered to exclude currently open tabs
   */
  const availableRecentProjects = $derived(
    recentProjects.filter((r) => !workspaceTabs.some((t) => t.path === r.path)),
  );

  /**
   * Whether the active tab is a git repository
   */
  const activeTabIsGitRepo = $derived(
    contextId !== null
      ? (workspaceTabs.find((t) => t.id === contextId)?.isGitRepo ?? false)
      : false,
  );

  /**
   * Currently selected diff file
   */
  const selectedFile = $derived(
    selectedPath !== null
      ? (diffFiles.find((f) => f.path === selectedPath) ?? null)
      : (diffFiles[0] ?? null),
  );

  /**
   * Index of the currently selected file in diffFiles
   */
  const selectedFileIndex = $derived(
    selectedFile !== null
      ? diffFiles.findIndex((f) => f.path === selectedFile.path)
      : -1,
  );

  /**
   * Navigate to the previous diff file
   */
  const navigatePrev = $derived(
    selectedFileIndex > 0
      ? () => {
          const prev = diffFiles[selectedFileIndex - 1];
          if (prev !== undefined) selectedPath = prev.path;
        }
      : undefined,
  );

  /**
   * Navigate to the next diff file
   */
  const navigateNext = $derived(
    selectedFileIndex >= 0 && selectedFileIndex < diffFiles.length - 1
      ? () => {
          const next = diffFiles[selectedFileIndex + 1];
          if (next !== undefined) selectedPath = next.path;
        }
      : undefined,
  );

  /**
   * Build a proper nested directory tree from diff files
   */
  function buildFileTree(files: DiffFile[]): FileNode {
    const root: FileNode = {
      name: "",
      path: "",
      isDirectory: true,
      children: [],
    };

    for (const f of files) {
      const segments = f.path.split("/");
      let current = root;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg === undefined || seg.length === 0) continue;

        const segPath = segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        const children = (current.children ?? []) as FileNode[];

        const existing = children.find((c) => c.name === seg);
        if (existing !== undefined) {
          current = existing;
        } else {
          const newNode: FileNode = isLast
            ? {
                name: seg,
                path: segPath,
                isDirectory: false,
                status: f.status === "renamed" ? "modified" : f.status,
              }
            : { name: seg, path: segPath, isDirectory: true, children: [] };
          children.push(newNode);
          (current as { children: FileNode[] }).children = children;
          current = newNode;
        }
      }
    }

    sortTree(root);
    return root;
  }

  /**
   * Sort tree: directories first, then files, alphabetically
   */
  function sortTree(node: FileNode): void {
    if (!node.isDirectory || node.children === undefined) return;
    const children = node.children as FileNode[];
    children.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of children) {
      sortTree(c);
    }
  }

  /**
   * File tree derived from diff files (used in "diff" mode)
   */
  const diffFileTree = $derived(buildFileTree(diffFiles));

  /**
   * All-files tree fetched from server
   */
  let allFilesTree = $state<FileNode | null>(null);
  let allFilesLoading = $state(false);
  let allFilesTreeStale = false;

  /**
   * Map of file paths to their diff status
   */
  const diffStatusMap = $derived(
    new Map(
      diffFiles.map((f) => [
        f.path,
        f.status === "renamed" ? ("modified" as const) : f.status,
      ]),
    ),
  );

  /**
   * Recursively annotate a tree with diff status from diffStatusMap
   */
  function annotateTreeWithStatus(
    node: FileNode,
    statusMap: Map<string, "added" | "modified" | "deleted">,
  ): FileNode {
    if (node.isDirectory && node.children) {
      const annotatedChildren = node.children.map((child) =>
        annotateTreeWithStatus(child, statusMap),
      );
      // Only create new object if children actually changed
      const changed = annotatedChildren.some((c, i) => c !== node.children![i]);
      return changed ? { ...node, children: annotatedChildren } : node;
    }
    // For files, set status from the map if available
    const status = statusMap.get(node.path);
    if (status !== undefined && node.status === undefined) {
      return { ...node, status };
    }
    return node;
  }

  /**
   * Fetch all files tree from server
   */
  async function fetchAllFiles(ctxId: string): Promise<void> {
    if (allFilesTree !== null && !allFilesTreeStale) return;
    allFilesLoading = allFilesTree === null;
    allFilesTreeStale = false;
    try {
      const resp = await fetch(`/api/ctx/${ctxId}/files?mode=all&shallow=true`);
      if (!resp.ok) throw new Error(`Files API error: ${resp.status}`);
      const data = (await resp.json()) as { tree: ServerFileNode };
      allFilesTree = convertServerTree(data.tree);
    } catch (e) {
      console.error("Failed to fetch all files:", e);
    } finally {
      allFilesLoading = false;
    }
  }

  /**
   * Re-fetch all files tree (ignores cache, does not show loading state)
   */
  async function refreshAllFiles(ctxId: string): Promise<void> {
    try {
      const resp = await fetch(`/api/ctx/${ctxId}/files?mode=all`);
      if (!resp.ok) throw new Error(`Files API error: ${resp.status}`);
      const data = (await resp.json()) as { tree: ServerFileNode };
      allFilesTree = convertServerTree(data.tree);
      allFilesTreeStale = false;
    } catch (e) {
      console.error("Failed to refresh all files:", e);
    }
  }

  /**
   * Server FileNode uses type: "file" | "directory" -- convert to client's isDirectory format
   */
  interface ServerFileNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: ServerFileNode[];
    status?: string;
  }

  function convertServerTree(node: ServerFileNode): FileNode {
    const status =
      node.status === "added" ||
      node.status === "modified" ||
      node.status === "deleted"
        ? node.status
        : undefined;
    return {
      name: node.name,
      path: node.path,
      isDirectory: node.type === "directory",
      children: node.children?.map(convertServerTree),
      status,
    };
  }

  /**
   * Fetch immediate children of a directory (lazy loading)
   */
  async function fetchDirectoryChildren(
    ctxId: string,
    dirPath: string,
  ): Promise<FileNode[]> {
    const resp = await fetch(
      `/api/ctx/${ctxId}/files/children?path=${encodeURIComponent(dirPath)}`,
    );
    if (!resp.ok) throw new Error(`Children API error: ${resp.status}`);
    const data = (await resp.json()) as { children: ServerFileNode[] };
    return data.children.map(convertServerTree);
  }

  /**
   * Insert loaded children into the allFilesTree at the specified directory path
   */
  function insertChildrenIntoTree(
    node: FileNode,
    dirPath: string,
    children: readonly FileNode[],
  ): FileNode {
    if (node.path === dirPath && node.isDirectory) {
      return { ...node, children };
    }
    if (!node.isDirectory || node.children === undefined) {
      return node;
    }
    const updatedChildren = node.children.map((child) => {
      if (
        child.isDirectory &&
        (child.path === dirPath || dirPath.startsWith(child.path + "/"))
      ) {
        return insertChildrenIntoTree(child, dirPath, children);
      }
      return child;
    });
    const changed = updatedChildren.some((c, i) => c !== node.children![i]);
    return changed ? { ...node, children: updatedChildren } : node;
  }

  /**
   * Handle lazy loading when a directory is expanded in the file tree
   */
  async function handleDirectoryExpand(dirPath: string): Promise<void> {
    if (contextId === null) return;
    try {
      const children = await fetchDirectoryChildren(contextId, dirPath);
      if (allFilesTree !== null) {
        allFilesTree = insertChildrenIntoTree(allFilesTree, dirPath, children);
      }
    } catch (e) {
      console.error(`Failed to load directory children for ${dirPath}:`, e);
    }
  }

  /**
   * Load the full file tree (used for expand-all and filtering).
   * Returns the full annotated tree for immediate use by the caller.
   */
  async function handleLoadFullTree(): Promise<FileNode | undefined> {
    if (contextId === null) return undefined;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/files?mode=all`);
      if (!resp.ok) return undefined;
      const data = (await resp.json()) as { tree: ServerFileNode };
      const fullTree = convertServerTree(data.tree);
      allFilesTree = fullTree;
      return annotateTreeWithStatus(fullTree, diffStatusMap);
    } catch (e) {
      console.error("Failed to load full tree:", e);
      return undefined;
    }
  }

  /**
   * Active file tree based on mode
   */
  const fileTree = $derived(
    fileTreeMode === "diff"
      ? diffFileTree
      : allFilesTree !== null
        ? annotateTreeWithStatus(allFilesTree, diffStatusMap)
        : diffFileTree,
  );

  /**
   * Whether the selected path has a diff entry
   */
  const selectedHasDiff = $derived(
    selectedPath !== null && diffFiles.some((f) => f.path === selectedPath),
  );

  /**
   * Effective view mode: force full-file when selected file has no diff
   */
  const effectiveViewMode = $derived<ViewMode>(
    selectedHasDiff ? viewMode : "full-file",
  );

  /**
   * File content for non-diff files
   */
  let fileContent = $state<{
    path: string;
    content: string;
    language: string;
  } | null>(null);
  let fileContentLoading = $state(false);

  /**
   * Fetch file content from server (for non-diff files)
   */
  async function fetchFileContent(
    ctxId: string,
    filePath: string,
  ): Promise<void> {
    fileContentLoading = true;
    try {
      const resp = await fetch(`/api/ctx/${ctxId}/files/file/${filePath}`);
      if (!resp.ok) throw new Error(`File API error: ${resp.status}`);
      const data = (await resp.json()) as {
        path: string;
        content: string;
        language: string;
      };
      fileContent = {
        path: data.path,
        content: data.content,
        language: data.language,
      };
    } catch (e) {
      console.error("Failed to fetch file content:", e);
      fileContent = null;
    } finally {
      fileContentLoading = false;
    }
  }

  /**
   * Diff stats
   */
  const stats = $derived({
    totalFiles: diffFiles.length,
    additions: diffFiles.reduce((sum, f) => sum + f.additions, 0),
    deletions: diffFiles.reduce((sum, f) => sum + f.deletions, 0),
  });

  /**
   * Workspace tab type from server
   */
  type ServerTab = {
    id: string;
    path: string;
    name: string;
    isGitRepo: boolean;
    projectSlug: string;
  };

  /**
   * Fetch workspace to get context ID and all tabs
   */
  async function fetchContext(): Promise<string> {
    const resp = await fetch("/api/workspace");
    if (!resp.ok) throw new Error("Failed to fetch workspace");
    const data = (await resp.json()) as {
      workspace: {
        tabs?: ServerTab[];
        activeTabId?: string | null;
      };
    };
    const tabs = data.workspace.tabs;
    if (tabs !== undefined && tabs.length > 0) {
      workspaceTabs = tabs;
      // Use activeTabId from server, fallback to first tab
      const activeId = data.workspace.activeTabId;
      const activeTab =
        activeId !== undefined && activeId !== null
          ? tabs.find((t) => t.id === activeId)
          : undefined;
      const selectedTab = activeTab ?? tabs[0];
      if (selectedTab !== undefined) {
        projectPath = selectedTab.path;
        return selectedTab.id;
      }
    }

    // No tabs exist - show project selection screen
    workspaceTabs = [];
    currentScreen = "project";
    return "";
  }

  /**
   * Switch to a different project tab
   */
  async function switchProject(tabId: string): Promise<void> {
    if (tabId === contextId) return;
    const tab = workspaceTabs.find((t) => t.id === tabId);
    if (tab === undefined) return;

    try {
      // Notify server of active tab change
      await fetch(`/api/workspace/tabs/${tabId}/activate`, { method: "POST" });

      // Update local state
      contextId = tabId;
      projectPath = tab.path;

      // Reset file-related state for new context
      diffFiles = [];
      selectedPath = null;
      allFilesTree = null;
      allFilesTreeStale = false;
      fileContent = null;
      loading = true;

      // Only fetch diff for git repositories
      if (tab.isGitRepo) {
        await fetchDiff(tabId);
        if (fileTreeMode === "all") {
          void fetchAllFiles(tabId);
        }
      }
      void fetchPromptQueue();
      void fetchActiveSessions();

      // Navigate to diff if on project screen, otherwise update hash with new slug
      if (currentScreen === "project") {
        navigateToScreen("diff");
      } else {
        // Update hash to reflect the new project slug
        const slug = tab.projectSlug;
        if (slug.length > 0) {
          const newHash = `#/${slug}/${currentScreen}`;
          if (window.location.hash !== newHash) {
            window.location.hash = newHash;
          }
        }
      }
    } catch (e) {
      console.error("Failed to switch project:", e);
    } finally {
      loading = false;
    }
  }

  /**
   * Close a project tab
   */
  async function closeProjectTab(
    tabId: string,
    event: MouseEvent,
  ): Promise<void> {
    event.stopPropagation();

    // Remember the tab being closed for recent projects
    const closingTab = workspaceTabs.find((t) => t.id === tabId);

    try {
      const resp = await fetch(`/api/workspace/tabs/${tabId}`, {
        method: "DELETE",
      });
      if (!resp.ok) return;

      const data = (await resp.json()) as {
        workspace: {
          tabs: ServerTab[];
          activeTabId: string | null;
        };
      };

      workspaceTabs = data.workspace.tabs;

      // Add closed tab to recent projects (if not already there)
      if (closingTab !== undefined) {
        addToRecentProjects(closingTab);
      }

      if (tabId === contextId) {
        if (workspaceTabs.length === 0) {
          // All tabs closed - clear state and show project screen
          contextId = null;
          projectPath = "";
          diffFiles = [];
          selectedPath = null;
          allFilesTree = null;
          allFilesTreeStale = false;
          fileContent = null;
          loading = false;
          navigateToScreen("project");
        } else {
          // Active tab was closed - switch to server's new active
          const newActiveId = data.workspace.activeTabId;
          const newTab =
            newActiveId !== null
              ? workspaceTabs.find((t) => t.id === newActiveId)
              : workspaceTabs[0];

          if (newTab !== undefined) {
            contextId = newTab.id;
            projectPath = newTab.path;
            diffFiles = [];
            selectedPath = null;
            allFilesTree = null;
            allFilesTreeStale = false;
            fileContent = null;
            await fetchDiff(newTab.id);
            if (fileTreeMode === "all") {
              void fetchAllFiles(newTab.id);
            }
            void fetchPromptQueue();
            void fetchActiveSessions();
            // Update hash to reflect new active project
            if (newTab.projectSlug.length > 0) {
              window.location.hash = `#/${newTab.projectSlug}/${currentScreen}`;
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to close project tab:", e);
    }
  }

  /**
   * Add a project to the recent projects list (for previously-closed tabs)
   */
  function addToRecentProjects(tab: {
    path: string;
    name: string;
    isGitRepo: boolean;
  }): void {
    // Don't add if it's still open
    if (workspaceTabs.some((t) => t.path === tab.path)) return;
    // Remove duplicate if exists
    recentProjects = [
      { path: tab.path, name: tab.name, isGitRepo: tab.isGitRepo },
      ...recentProjects.filter((r) => r.path !== tab.path),
    ].slice(0, 20);
    // Persist to localStorage
    try {
      localStorage.setItem(
        "qraftbox:recent-projects",
        JSON.stringify(recentProjects),
      );
    } catch {
      // Ignore
    }
  }

  /**
   * Load recent projects from localStorage
   */
  function loadRecentProjects(): void {
    try {
      const stored = localStorage.getItem("qraftbox:recent-projects");
      if (stored !== null) {
        recentProjects = JSON.parse(stored) as Array<{
          path: string;
          name: string;
          isGitRepo: boolean;
        }>;
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Fetch recent directories from server and merge with local recent projects
   */
  async function fetchRecentProjects(): Promise<void> {
    try {
      const resp = await fetch("/api/workspace/recent");
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        recent: Array<{ path: string; name: string; isGitRepo: boolean }>;
      };
      // Merge server recent with local recent, dedup by path
      const openPaths = new Set(workspaceTabs.map((t) => t.path));
      const localPaths = new Set(recentProjects.map((r) => r.path));
      const merged = [...recentProjects];
      for (const r of data.recent) {
        if (!localPaths.has(r.path) && !openPaths.has(r.path)) {
          merged.push(r);
        }
      }
      recentProjects = merged.slice(0, 20);
    } catch {
      // Ignore
    }
  }

  /**
   * Open a project by path (used by both path input and recent list)
   */
  async function openProjectByPath(path: string): Promise<void> {
    const trimmed = path.trim();
    if (trimmed.length === 0) return;

    newProjectLoading = true;
    newProjectError = null;
    try {
      const resp = await fetch("/api/workspace/tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: trimmed }),
      });
      if (!resp.ok) {
        const errData = (await resp.json()) as { error?: string };
        newProjectError = errData.error ?? `Failed to open (${resp.status})`;
        return;
      }
      const data = (await resp.json()) as {
        tab: ServerTab;
        workspace: { tabs: ServerTab[] };
      };
      workspaceTabs = data.workspace.tabs;
      // Remove from recent since it's now open
      recentProjects = recentProjects.filter((r) => r.path !== trimmed);
      try {
        localStorage.setItem(
          "qraftbox:recent-projects",
          JSON.stringify(recentProjects),
        );
      } catch {
        // Ignore
      }
      addProjectMenuOpen = false;
      newProjectPath = "";
      await switchProject(data.tab.id);
    } catch (e) {
      newProjectError =
        e instanceof Error ? e.message : "Failed to open project";
    } finally {
      newProjectLoading = false;
    }
  }

  /**
   * Open a project from recent projects list
   */
  async function openRecentProject(path: string): Promise<void> {
    addProjectMenuOpen = false;
    await openProjectByPath(path);
  }

  /**
   * Remove a project from the recent projects list (both server and local)
   */
  async function removeRecentProject(path: string): Promise<void> {
    try {
      await fetch("/api/workspace/recent", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch {
      // Ignore server errors
    }
    recentProjects = recentProjects.filter((r) => r.path !== path);
    try {
      localStorage.setItem(
        "qraftbox:recent-projects",
        JSON.stringify(recentProjects),
      );
    } catch {
      // Ignore
    }
  }

  /**
   * Open native OS directory picker via server-side zenity/kdialog
   */
  async function pickDirectory(): Promise<void> {
    pickingDirectory = true;
    newProjectError = null;
    try {
      const resp = await fetch("/api/browse/pick-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startPath: projectPath.length > 0 ? projectPath : undefined,
        }),
      });
      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        newProjectError = data.error ?? "Failed to open directory picker";
        return;
      }
      const data = (await resp.json()) as { path: string | null };
      if (data.path === null) {
        // User cancelled
        return;
      }
      await openProjectByPath(data.path);
    } catch (e) {
      newProjectError =
        e instanceof Error ? e.message : "Failed to open directory picker";
    } finally {
      pickingDirectory = false;
    }
  }

  /**
   * Fetch diff data from server
   */
  async function fetchDiff(ctxId: string): Promise<void> {
    const resp = await fetch(`/api/ctx/${ctxId}/diff`);
    if (!resp.ok) throw new Error(`Diff API error: ${resp.status}`);
    const data = (await resp.json()) as { files: DiffFile[] };
    diffFiles = data.files;
    if (diffFiles.length > 0 && diffFiles[0] !== undefined) {
      selectedPath = diffFiles[0].path;
    }
  }

  /**
   * Initialize the application
   */
  async function init(): Promise<void> {
    loadRecentProjects();
    try {
      loading = true;
      error = null;

      // Check if hash contains a project slug to restore
      const parsed = parseHash();

      const ctxId = await fetchContext();
      if (ctxId === "") {
        // No tabs - fetch recent projects from server and stay on project selection screen
        void fetchRecentProjects();
        loading = false;
        return;
      }
      contextId = ctxId;

      // If hash has a slug, try to switch to that project
      if (parsed.slug !== null) {
        const targetTab = workspaceTabs.find(
          (t) => t.projectSlug === parsed.slug,
        );
        if (targetTab !== undefined && targetTab.id !== ctxId) {
          contextId = targetTab.id;
          projectPath = targetTab.path;
          await fetch(`/api/workspace/tabs/${targetTab.id}/activate`, {
            method: "POST",
          });
        }
      }

      // Apply the screen from hash
      if (parsed.screen !== currentScreen) {
        currentScreen = parsed.screen;
      }

      // Only fetch diff for git repositories
      if (activeTabIsGitRepo) {
        await fetchDiff(contextId);
        if (fileTreeMode === "all") {
          void fetchAllFiles(contextId);
        }
      }
      void fetchPromptQueue();
      void fetchActiveSessions();
      void fetchRecentProjects();

      // Set the hash to reflect current state
      const slug = currentProjectSlug();
      if (slug !== null) {
        const newHash = `#/${slug}/${currentScreen}`;
        if (window.location.hash !== newHash) {
          window.location.hash = newHash;
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
      console.error("Init error:", e);
    } finally {
      loading = false;
    }
  }

  /**
   * Handle file selection from tree
   */
  function handleFileSelect(path: string): void {
    selectedPath = path;
  }

  /**
   * Handle view mode change
   */
  function setViewMode(mode: ViewMode): void {
    viewMode = mode;
  }

  /**
   * Toggle sidebar
   */
  function toggleSidebar(): void {
    sidebarCollapsed = !sidebarCollapsed;
  }

  function saveSidebarWidth(w: number): void {
    try {
      localStorage.setItem("qraftbox-sidebar-width", String(w));
    } catch {
      // localStorage unavailable
    }
  }

  function narrowSidebar(): void {
    sidebarWidth = Math.max(
      SIDEBAR_MIN_WIDTH,
      sidebarWidth - SIDEBAR_WIDTH_STEP,
    );
    saveSidebarWidth(sidebarWidth);
  }

  function widenSidebar(): void {
    sidebarWidth = Math.min(
      SIDEBAR_MAX_WIDTH,
      sidebarWidth + SIDEBAR_WIDTH_STEP,
    );
    saveSidebarWidth(sidebarWidth);
  }

  /**
   * Get the current project slug from workspaceTabs + contextId
   */
  function currentProjectSlug(): string | null {
    if (contextId === null) return null;
    const tab = workspaceTabs.find((t) => t.id === contextId);
    return tab?.projectSlug ?? null;
  }

  /**
   * Navigate to a specific screen and update URL hash
   */
  function navigateToScreen(screen: ScreenType): void {
    currentScreen = screen;
    const slug = currentProjectSlug();
    const newHash = slug !== null ? `#/${slug}/${screen}` : `#/${screen}`;
    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  }

  /**
   * Changed file paths for autocomplete
   */
  const changedFilePaths = $derived(diffFiles.map((f) => f.path));

  /**
   * Submit AI prompt from the global panel.
   *
   * Simplified flow:
   * 1. POST { session_id, run_immediately, message } to /api/ai/submit
   * 2. Server manages queue, session continuity, and execution
   * 3. Queue status updates arrive via WebSocket
   */
  async function handleAIPanelSubmit(
    prompt: string,
    immediate: boolean,
    refs: readonly FileReference[],
  ): Promise<void> {
    if (contextId === null) return;

    console.log("!!!!!=======qraftAiSessionId:", qraftAiSessionId);
    try {
      const resp = await fetch("/api/ai/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_immediately: immediate,
          message: prompt,
          context: {
            primaryFile: undefined,
            references: refs,
            diffSummary: undefined,
          },
          project_path: projectPath,
          qraft_ai_session_id: qraftAiSessionId,
        }),
      });

      if (!resp.ok) {
        console.error("AI prompt submit error:", resp.status);
        return;
      }

      void fetchPromptQueue();
      void fetchActiveSessions();
    } catch (e) {
      console.error("AI prompt submit error:", e);
    }
  }

  /**
   * Submit AI prompt from inline comment box (GitHub-style)
   */
  async function handleInlineCommentSubmit(
    startLine: number,
    endLine: number,
    _side: "old" | "new",
    filePath: string,
    prompt: string,
    immediate: boolean,
  ): Promise<void> {
    if (contextId === null) return;
    try {
      const resp = await fetch("/api/ai/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_immediately: immediate,
          message: prompt,
          context: {
            primaryFile: {
              path: filePath,
              startLine,
              endLine,
              content: "",
            },
            references: [],
            diffSummary: undefined,
          },
          project_path: projectPath,
          qraft_ai_session_id: qraftAiSessionId,
        }),
      });
      if (!resp.ok) {
        console.error("AI inline prompt error:", resp.status);
      }
      void fetchPromptQueue();
      void fetchActiveSessions();
    } catch (e) {
      console.error("AI inline prompt submit error:", e);
    }
  }

  /**
   * Fetch server-side prompt queue via polling.
   * Supplements WebSocket updates to handle missed broadcasts
   * (e.g., rapid consecutive submissions).
   */
  async function fetchPromptQueue(): Promise<void> {
    try {
      const resp = await fetch("/api/ai/prompt-queue");
      if (!resp.ok) return;
      const data = (await resp.json()) as { prompts: PromptQueueItem[] };
      serverPromptQueue = data.prompts;

      // Derive queue status from prompt queue
      const runningPrompts = data.prompts.filter((p) => p.status === "running");
      const queuedPrompts = data.prompts.filter((p) => p.status === "queued");
      queueStatus = {
        runningCount: runningPrompts.length,
        queuedCount: queuedPrompts.length,
        runningSessionIds: [],
        totalCount: runningPrompts.length + queuedPrompts.length,
      };
    } catch {
      // Silently ignore
    }
  }

  /**
   * Fetch running/queued AI sessions for the CurrentSessionPanel
   */
  async function fetchActiveSessions(): Promise<void> {
    try {
      const resp = await fetch("/api/ai/sessions");
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        sessions: {
          id: string;
          state: string;
          prompt: string;
          createdAt: string;
          startedAt?: string | undefined;
          completedAt?: string | undefined;
          context: unknown;
          currentActivity?: string | undefined;
          claudeSessionId?: string | undefined;
        }[];
      };

      const running: AISession[] = [];
      const queued: AISession[] = [];
      const recentCompleted: AISession[] = [];
      const now = Date.now();
      const RECENT_WINDOW_MS = 60_000; // Show completed sessions for 60 seconds

      for (const info of data.sessions) {
        const session: AISession = {
          ...info,
          state: info.state as AISession["state"],
          context: info.context as AISession["context"],
          turns: [],
          currentActivity: info.currentActivity,
          claudeSessionId: info.claudeSessionId,
        };
        if (session.state === "running") {
          running.push(session);
        } else if (session.state === "queued") {
          queued.push(session);
        } else if (
          (session.state === "completed" || session.state === "failed") &&
          session.completedAt !== undefined
        ) {
          const completedTime = new Date(session.completedAt).getTime();
          if (now - completedTime < RECENT_WINDOW_MS) {
            recentCompleted.push(session);
          }
        }
      }

      runningSessions = running;
      queuedSessions = queued;
      recentlyCompletedSessions = recentCompleted;

      // Also refresh queue status to avoid stale display
      void fetchPromptQueue();
    } catch {
      // Silently ignore
    }
  }

  /**
   * Apply SSE progress event to in-memory running session state.
   */
  function applySessionProgressEvent(event: {
    type?: string;
    sessionId?: string;
    data?: { content?: unknown; toolName?: unknown };
  }): void {
    if (typeof event.sessionId !== "string") {
      return;
    }

    if (event.type === "message") {
      const content = event.data?.content;
      if (typeof content !== "string") return;
      runningSessions = runningSessions.map((session) =>
        session.id === event.sessionId
          ? {
              ...session,
              lastAssistantMessage: content,
              currentActivity: undefined,
            }
          : session,
      );
      return;
    }

    if (event.type === "thinking" || event.type === "session_started") {
      runningSessions = runningSessions.map((session) =>
        session.id === event.sessionId
          ? { ...session, currentActivity: "Thinking..." }
          : session,
      );
      return;
    }

    if (event.type === "tool_use") {
      const toolName = event.data?.toolName;
      runningSessions = runningSessions.map((session) =>
        session.id === event.sessionId
          ? {
              ...session,
              currentActivity:
                typeof toolName === "string" && toolName.length > 0
                  ? `Using ${toolName}...`
                  : "Using tool...",
            }
          : session,
      );
      return;
    }

    if (event.type === "tool_result") {
      runningSessions = runningSessions.map((session) =>
        session.id === event.sessionId
          ? { ...session, currentActivity: "Processing tool result..." }
          : session,
      );
    }
  }

  /**
   * Subscribe to a running session stream for near-realtime updates.
   */
  function ensureSessionStream(sessionId: string): void {
    if (sessionStreams.has(sessionId)) return;

    const es = new EventSource(`/api/ai/sessions/${sessionId}/stream`);
    es.onmessage = (msg) => {
      try {
        applySessionProgressEvent(
          JSON.parse(msg.data) as {
            type?: string;
            sessionId?: string;
            data?: { content?: unknown; toolName?: unknown };
          },
        );
      } catch {
        // Ignore malformed event payloads
      }
    };

    const onTerminalEvent = (): void => {
      closeSessionStream(sessionId);
      void reconcileSessionState(sessionId);
    };

    es.addEventListener("completed", onTerminalEvent);
    es.addEventListener("failed", onTerminalEvent);
    es.addEventListener("error", (msg) => {
      if (!(msg instanceof MessageEvent)) {
        // Transport-level errors are auto-retried by EventSource.
        return;
      }
      try {
        const parsed = JSON.parse(msg.data) as {
          type?: string;
          sessionId?: string;
          data?: { content?: unknown; toolName?: unknown };
        };
        if (parsed.type === "error") {
          onTerminalEvent();
          return;
        }
        applySessionProgressEvent(parsed);
      } catch {
        onTerminalEvent();
      }
    });
    es.addEventListener("cancelled", onTerminalEvent);
    es.addEventListener("session_started", (msg) => {
      if (!(msg instanceof MessageEvent)) return;
      try {
        applySessionProgressEvent(
          JSON.parse(msg.data) as {
            type?: string;
            sessionId?: string;
            data?: { content?: unknown; toolName?: unknown };
          },
        );
      } catch {
        // Ignore malformed event payloads
      }
    });
    es.addEventListener("thinking", (msg) => {
      if (!(msg instanceof MessageEvent)) return;
      try {
        applySessionProgressEvent(
          JSON.parse(msg.data) as {
            type?: string;
            sessionId?: string;
            data?: { content?: unknown; toolName?: unknown };
          },
        );
      } catch {
        // Ignore malformed event payloads
      }
    });
    es.addEventListener("tool_use", (msg) => {
      if (!(msg instanceof MessageEvent)) return;
      try {
        applySessionProgressEvent(
          JSON.parse(msg.data) as {
            type?: string;
            sessionId?: string;
            data?: { content?: unknown; toolName?: unknown };
          },
        );
      } catch {
        // Ignore malformed event payloads
      }
    });
    es.addEventListener("tool_result", (msg) => {
      if (!(msg instanceof MessageEvent)) return;
      try {
        applySessionProgressEvent(
          JSON.parse(msg.data) as {
            type?: string;
            sessionId?: string;
            data?: { content?: unknown; toolName?: unknown };
          },
        );
      } catch {
        // Ignore malformed event payloads
      }
    });
    es.addEventListener("message", (msg) => {
      if (!(msg instanceof MessageEvent)) return;
      try {
        applySessionProgressEvent(
          JSON.parse(msg.data) as {
            type?: string;
            sessionId?: string;
            data?: { content?: unknown; toolName?: unknown };
          },
        );
      } catch {
        // Ignore malformed event payloads
      }
    });
    es.onerror = () => {
      void reconcileSessionState(sessionId);
    };

    sessionStreams.set(sessionId, es);
  }

  /**
   * Close an active session stream.
   */
  function closeSessionStream(sessionId: string): void {
    const stream = sessionStreams.get(sessionId);
    if (stream === undefined) return;
    stream.close();
    sessionStreams.delete(sessionId);
  }

  /**
   * Ensure stream subscriptions exactly match running sessions.
   */
  function syncSessionStreams(): void {
    const runningIds = new Set(runningSessions.map((s) => s.id));
    for (const [sessionId] of sessionStreams) {
      if (!runningIds.has(sessionId)) {
        closeSessionStream(sessionId);
      }
    }
    for (const sessionId of runningIds) {
      ensureSessionStream(sessionId);
    }
  }

  /**
   * Reconcile client session state after stream terminal/transport events.
   */
  async function reconcileSessionState(sessionId: string): Promise<void> {
    await fetchActiveSessions();
    await fetchPromptQueue();
    const stillRunning = runningSessions.some((s) => s.id === sessionId);
    if (!stillRunning) {
      closeSessionStream(sessionId);
    }
  }

  /**
   * Manage polling interval for active sessions and pending prompts.
   * Also polls while recently completed sessions exist so their display
   * eventually clears and queue status stays accurate.
   */
  function manageSessionPolling(): void {
    const hasActive =
      runningSessions.length > 0 ||
      queuedSessions.length > 0 ||
      serverPromptQueue.some(
        (p) => p.status === "queued" || p.status === "running",
      ) ||
      recentlyCompletedSessions.length > 0;

    if (hasActive && sessionPollTimer === null) {
      sessionPollTimer = setInterval(() => {
        void fetchPromptQueue();
        void fetchActiveSessions();
      }, 2000);
    } else if (!hasActive && sessionPollTimer !== null) {
      clearInterval(sessionPollTimer);
      sessionPollTimer = null;
    }
  }

  // Re-evaluate polling when state changes
  $effect(() => {
    const _deps = [
      runningSessions.length,
      queuedSessions.length,
      serverPromptQueue.length,
      recentlyCompletedSessions.length,
    ];
    manageSessionPolling();
  });

  // Keep stream subscriptions in sync with running sessions.
  $effect(() => {
    const _runningIds = runningSessions.map((s) => s.id).join(",");
    syncSessionStreams();
  });

  /**
   * Cancel a running/queued session from the CurrentSessionPanel
   */
  async function handleCancelActiveSession(sessionId: string): Promise<void> {
    try {
      const resp = await fetch(`/api/ai/sessions/${sessionId}/cancel`, {
        method: "POST",
      });
      if (resp.ok) {
        runningSessions = runningSessions.filter((s) => s.id !== sessionId);
        queuedSessions = queuedSessions.filter((s) => s.id !== sessionId);
        void fetchPromptQueue();
      }
    } catch (e) {
      console.error("Failed to cancel session:", e);
    }
  }

  /**
   * Handle resume from Sessions screen: navigate to Changes and refresh sessions
   */
  function handleResumeToChanges(resumeQraftId: string): void {
    qraftAiSessionId = resumeQraftId as QraftAiSessionId;
    resumeDisplaySessionId = null;
    navigateToScreen("diff");
    void fetchActiveSessions();
    void fetchPromptQueue();
  }

  /**
   * Resume a Claude CLI session from CurrentSessionPanel
   */
  function handleResumeCliSession(resumeQraftId: string): void {
    if (contextId === null) return;
    qraftAiSessionId = resumeQraftId as QraftAiSessionId;
    resumeDisplaySessionId = null;
    void fetchActiveSessions();
    void fetchPromptQueue();
  }

  /**
   * Start a new session by expanding the AI prompt panel and focusing it
   */
  function handleNewSession(): void {
    resumeDisplaySessionId = null;
    qraftAiSessionId = generateQraftAiSessionId();
    if (aiPanelCollapsed) {
      aiPanelCollapsed = false;
    }
  }

  /**
   * Open Sessions screen from AI prompt panel.
   */
  function handleSearchSession(): void {
    navigateToScreen("sessions");
    void fetchActiveSessions();
    void fetchPromptQueue();
  }

  /**
   * Keyboard shortcuts
   */
  function handleKeydown(event: KeyboardEvent): void {
    const isInTextBox =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement;

    // Escape blurs focused text boxes
    if (isInTextBox && event.key === "Escape") {
      (event.target as HTMLElement).blur();
      return;
    }

    // Skip shortcuts while typing in text boxes
    if (isInTextBox) {
      return;
    }
    if (event.key === "b" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      toggleSidebar();
    }
    if (
      event.key === "a" &&
      !event.ctrlKey &&
      !event.metaKey &&
      currentScreen === "diff"
    ) {
      event.preventDefault();
      aiPanelCollapsed = !aiPanelCollapsed;
    }
  }

  /**
   * Handle browser back/forward navigation via hashchange
   */
  function handleHashChange(): void {
    const parsed = parseHash();
    if (parsed.screen !== currentScreen) {
      currentScreen = parsed.screen;
    }
    // If hash contains a slug that differs from current project, switch to it
    if (parsed.slug !== null) {
      const targetTab = workspaceTabs.find(
        (t) => t.projectSlug === parsed.slug,
      );
      if (targetTab !== undefined && targetTab.id !== contextId) {
        void switchProject(targetTab.id);
      }
    }
  }

  /**
   * Copy project path to clipboard
   */
  function copyPath(): void {
    void navigator.clipboard.writeText(projectPath).then(() => {
      pathCopied = true;
      setTimeout(() => {
        pathCopied = false;
      }, 1500);
    });
  }

  /**
   * Truncate long path to show last ~30 characters
   */
  function truncatePath(path: string): string {
    const maxLength = 30;
    if (path.length <= maxLength) {
      return path;
    }
    return "..." + path.slice(-maxLength);
  }

  /**
   * WebSocket connection for realtime file change updates
   */
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let refetchTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;

  /**
   * Connect to WebSocket for realtime updates
   */
  function connectWebSocket(): void {
    if (ws !== null && ws.readyState <= WebSocket.OPEN) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onopen = () => {
      reconnectDelay = 1000; // Reset backoff on successful connection
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { event: string; data: unknown };
        if (msg.event === "file-change" && contextId !== null) {
          // Mark all-files cache as stale so next switch re-fetches
          allFilesTreeStale = true;
          // Debounce refetch: wait 500ms after last event
          if (refetchTimer !== null) clearTimeout(refetchTimer);
          refetchTimer = setTimeout(() => {
            if (contextId !== null) {
              void fetchDiff(contextId);
              // Re-fetch all-files tree if currently in "all" mode
              if (fileTreeMode === "all") {
                void refreshAllFiles(contextId);
              }
            }
            refetchTimer = null;
          }, 500);
        } else if (msg.event === "ai:queue_update") {
          // Server-side prompt queue status update
          const update = msg.data as {
            prompts: PromptQueueItem[];
          };
          serverPromptQueue = update.prompts;

          // Update queue status from prompt queue data
          const runningPrompts = update.prompts.filter(
            (p) => p.status === "running",
          );
          const queuedPrompts = update.prompts.filter(
            (p) => p.status === "queued",
          );
          queueStatus = {
            runningCount: runningPrompts.length,
            queuedCount: queuedPrompts.length,
            runningSessionIds: [],
            totalCount: runningPrompts.length + queuedPrompts.length,
          };

          // Refresh active sessions to sync UI
          void fetchActiveSessions();
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      ws = null;
      // Auto-reconnect with exponential backoff
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
        connectWebSocket();
      }, reconnectDelay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, which handles reconnection
    };
  }

  /**
   * Disconnect WebSocket
   */
  function disconnectWebSocket(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (refetchTimer !== null) {
      clearTimeout(refetchTimer);
      refetchTimer = null;
    }
    if (ws !== null) {
      ws.onclose = null; // Prevent reconnect on intentional close
      ws.close();
      ws = null;
    }
  }

  // Initialize on mount
  $effect(() => {
    void init();
    connectWebSocket();
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("hashchange", handleHashChange);
      disconnectWebSocket();
      if (sessionPollTimer !== null) {
        clearInterval(sessionPollTimer);
        sessionPollTimer = null;
      }
      for (const [, stream] of sessionStreams) {
        stream.close();
      }
      sessionStreams.clear();
    };
  });

  // Fetch file content when selecting a non-diff file OR when full-file mode is active
  $effect(() => {
    if (selectedPath !== null && contextId !== null) {
      if (effectiveViewMode === "full-file") {
        void fetchFileContent(contextId, selectedPath);
      } else if (!selectedHasDiff && fileTreeMode === "all") {
        void fetchFileContent(contextId, selectedPath);
      } else {
        fileContent = null;
      }
    } else {
      fileContent = null;
    }
  });
</script>

<div class="flex flex-col h-screen bg-bg-primary text-text-primary">
  <!-- Header -->
  <header
    class="h-12 border-b border-border-default flex items-center px-4 bg-bg-secondary gap-4"
  >
    <h1 class="text-lg font-semibold">QraftBox</h1>

    <!-- Navigation: Project button + project tabs -->
    <div class="flex items-center ml-4 h-full flex-1 min-w-0">
      <!-- Scrollable tab area -->
      <nav
        class="flex items-center gap-0 h-full overflow-x-auto project-tabs-nav flex-1 min-w-0"
      >
        <button
          type="button"
          class="px-3 py-1.5 text-sm transition-colors h-full border-b-2 shrink-0
                 {currentScreen === 'project'
            ? 'text-text-primary font-semibold border-accent-emphasis'
            : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
          onclick={() => navigateToScreen("project")}
        >
          Project
        </button>
        {#if workspaceTabs.length > 0}
          <span class="text-border-default mx-1 shrink-0">|</span>
          {#each workspaceTabs as tab (tab.id)}
            <div class="flex items-center h-full shrink-0 group">
              <button
                type="button"
                class="pl-3 pr-1 py-1.5 text-sm transition-colors h-full border-b-2 whitespace-nowrap
                       {tab.id === contextId
                  ? 'text-text-primary font-semibold border-accent-emphasis'
                  : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
                onclick={() => void switchProject(tab.id)}
                title={tab.path}
              >
                {tab.name}
              </button>
              <button
                type="button"
                class="w-4 h-4 flex items-center justify-center shrink-0 mr-1
                       rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary
                       opacity-0 group-hover:opacity-100 transition-opacity"
                onclick={(e) => void closeProjectTab(tab.id, e)}
                title="Close {tab.name}"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path
                    d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
                  />
                </svg>
              </button>
            </div>
          {/each}
        {/if}
        <!-- Add project button (inside scrollable area, next to last tab) -->
        <button
          type="button"
          class="px-2 py-1 text-sm text-text-tertiary hover:text-text-primary transition-colors h-full shrink-0"
          bind:this={addProjectBtnEl}
          onclick={() => {
            addProjectMenuOpen = !addProjectMenuOpen;
            if (addProjectMenuOpen) {
              newProjectPath = "";
              newProjectError = null;
              void fetchRecentProjects();
            }
          }}
          title="Add project"
        >
          +
        </button>
      </nav>
    </div>

    <!-- Hamburger menu -->
    <div class="ml-auto relative">
      <button
        type="button"
        class="p-2 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        onclick={() => (headerMenuOpen = !headerMenuOpen)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z"
          ></path>
        </svg>
      </button>
      {#if headerMenuOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute right-0 top-full mt-1 w-40 bg-bg-secondary border border-border-default rounded-md shadow-lg z-50 py-1"
        >
          <button
            type="button"
            class="w-full text-left px-4 py-2 text-sm hover:bg-bg-tertiary transition-colors
                   {currentScreen === 'tools'
              ? 'text-text-primary font-semibold'
              : 'text-text-secondary'}"
            onclick={() => {
              navigateToScreen("tools");
              headerMenuOpen = false;
            }}
          >
            Tools
          </button>
          <button
            type="button"
            class="w-full text-left px-4 py-2 text-sm hover:bg-bg-tertiary transition-colors
                   {currentScreen === 'system-info'
              ? 'text-text-primary font-semibold'
              : 'text-text-secondary'}"
            onclick={() => {
              navigateToScreen("system-info");
              headerMenuOpen = false;
            }}
          >
            System Info
          </button>
        </div>
      {/if}
    </div>
  </header>
  {#if headerMenuOpen || addProjectMenuOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- Backdrop to close menus -->
    <div
      class="fixed inset-0 z-40"
      onclick={() => {
        headerMenuOpen = false;
        addProjectMenuOpen = false;
      }}
      onkeydown={() => {}}
      role="presentation"
    ></div>
  {/if}
  <!-- Add project dropdown (rendered outside header to avoid overflow clipping) -->
  {#if addProjectMenuOpen && addProjectBtnEl !== undefined}
    {@const rect = addProjectBtnEl.getBoundingClientRect()}
    <div
      class="fixed w-80 bg-bg-secondary border border-border-default rounded-md shadow-lg z-50 py-1"
      style="top: {rect.bottom + 4}px; left: {Math.min(
        rect.left,
        window.innerWidth - 336,
      )}px;"
    >
      <!-- Path input + file picker icon -->
      <div class="px-3 py-2">
        <label
          class="text-xs text-text-tertiary font-semibold uppercase tracking-wider mb-1.5 block"
        >
          Open Directory
        </label>
        <form
          class="flex items-center gap-1.5"
          onsubmit={(e) => {
            e.preventDefault();
            void openProjectByPath(newProjectPath);
          }}
        >
          <input
            type="text"
            bind:value={newProjectPath}
            class="flex-1 px-2 py-1.5 text-sm rounded border border-border-default
                   bg-bg-primary text-text-primary font-mono
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                   placeholder:text-text-tertiary"
            placeholder="/path/to/project"
            disabled={newProjectLoading || pickingDirectory}
          />
          <!-- Native OS file picker button -->
          <button
            type="button"
            disabled={pickingDirectory || newProjectLoading}
            onclick={() => void pickDirectory()}
            class="p-1.5 rounded text-text-secondary hover:text-accent-fg hover:bg-bg-tertiary
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors shrink-0"
            title="Browse directories"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path
                d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
              />
            </svg>
          </button>
          <button
            type="submit"
            disabled={newProjectPath.trim().length === 0 || newProjectLoading}
            class="px-2 py-1.5 rounded text-sm font-medium
                   bg-bg-tertiary text-text-primary hover:bg-border-default
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors shrink-0"
          >
            {newProjectLoading ? "..." : "Open"}
          </button>
        </form>
        {#if newProjectError !== null}
          <p class="mt-1.5 text-xs text-danger-fg">{newProjectError}</p>
        {/if}
      </div>
      <!-- Recent/previous projects -->
      {#if availableRecentProjects.length > 0}
        <div class="border-t border-border-default my-1"></div>
        <div
          class="px-4 py-1 text-xs text-text-tertiary font-semibold uppercase tracking-wider"
        >
          Previous Projects
        </div>
        <div class="max-h-60 overflow-y-auto">
          {#each availableRecentProjects as recent (recent.path)}
            <div
              class="flex items-center hover:bg-bg-tertiary transition-colors"
            >
              <button
                type="button"
                class="flex-1 text-left px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2 min-w-0"
                onclick={() => void openRecentProject(recent.path)}
                title={recent.path}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  class="shrink-0 {recent.isGitRepo
                    ? 'text-accent-fg'
                    : 'text-text-tertiary'}"
                >
                  <path
                    d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
                  />
                </svg>
                <span class="truncate flex-1">{recent.name}</span>
                <span class="text-xs text-text-tertiary truncate max-w-[120px]"
                  >{truncatePath(recent.path, 20)}</span
                >
              </button>
              <button
                type="button"
                class="shrink-0 p-1 mr-2 rounded text-text-tertiary hover:text-danger-fg hover:bg-danger-subtle transition-colors"
                title="Remove from history"
                onclick={(e) => {
                  e.stopPropagation();
                  void removeRecentProject(recent.path);
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path
                    d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
                  />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Tab Bar -->
  <div
    class="flex items-center bg-bg-secondary border-b border-border-default px-2 overflow-x-auto"
  >
    <!-- Project path and status -->
    {#if projectPath}
      <div
        class="py-2 px-4 text-sm border-b-2 border-accent-emphasis text-text-primary flex items-center gap-1"
        title={projectPath}
      >
        <span
          class="overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]"
        >
          {truncatePath(projectPath)}
        </span>
        <button
          type="button"
          class="text-text-secondary hover:text-text-primary transition-colors"
          onclick={copyPath}
          title="Copy path to clipboard"
        >
          {#if pathCopied}
            <!-- Checkmark icon -->
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
                fill="currentColor"
              />
            </svg>
          {:else}
            <!-- Clipboard icon -->
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M5.75 1a.75.75 0 0 0-.75.75v.5h-.5A1.75 1.75 0 0 0 2.75 4v9.5c0 .966.784 1.75 1.75 1.75h7a1.75 1.75 0 0 0 1.75-1.75V4a1.75 1.75 0 0 0-1.75-1.75h-.5v-.5A.75.75 0 0 0 10.25 1h-4.5zM10 2.5v.5h-4v-.5h4zm-6.5 2a.25.25 0 0 1 .25-.25h7.5a.25.25 0 0 1 .25.25v9.5a.25.25 0 0 1-.25.25h-7.5a.25.25 0 0 1-.25-.25V4.5z"
                fill="currentColor"
              />
            </svg>
          {/if}
        </button>
      </div>
    {/if}
    <!-- Worktree button (disabled when not a git repo) -->
    {#if contextId !== null}
      <WorktreeButton
        {contextId}
        {projectPath}
        onWorktreeSwitch={() => void init()}
        disabled={!activeTabIsGitRepo}
      />
    {/if}

    {#if contextId !== null && activeTabIsGitRepo}
      <HeaderStatusBadges {contextId} {projectPath} />
      <span class="text-border-default mx-1">|</span>
    {/if}

    <!-- Changes / Commits / Sessions tabs -->
    <nav class="flex items-center gap-0 h-full">
      <button
        type="button"
        class="px-3 py-1.5 text-sm transition-colors h-full border-b-2
               {currentScreen === 'diff'
          ? 'text-text-primary font-semibold border-accent-emphasis'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
        onclick={() => navigateToScreen("diff")}
      >
        Files
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm transition-colors h-full border-b-2
               {currentScreen === 'sessions'
          ? 'text-text-primary font-semibold border-accent-emphasis'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
        onclick={() => navigateToScreen("sessions")}
      >
        Sessions
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm transition-colors h-full border-b-2
               {currentScreen === 'commits'
          ? 'text-text-primary font-semibold border-accent-emphasis'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
        onclick={() => navigateToScreen("commits")}
      >
        Commits
      </button>
    </nav>

    <!-- Git push button (disabled when not a git repo) -->
    <div class="ml-auto py-1 px-2">
      {#if contextId !== null}
        <GitPushButton
          {contextId}
          {projectPath}
          hasChanges={diffFiles.length > 0}
          onSuccess={() => void fetchDiff(contextId)}
          isGitRepo={activeTabIsGitRepo}
        />
      {/if}
    </div>
  </div>

  <!-- Main Area -->
  <div class="flex flex-1 overflow-hidden">
    {#if currentScreen === "diff"}
      <!-- Sidebar / File Tree with tag toggle -->
      <div class="relative flex shrink-0">
        {#if !sidebarCollapsed}
          <aside
            class="border-r border-border-default bg-bg-secondary overflow-auto"
            style:width="{sidebarWidth}px"
          >
            {#if !activeTabIsGitRepo}
              <div class="p-4 text-sm text-text-tertiary">
                Not a git repository
              </div>
            {:else if loading}
              <div class="p-4 text-sm text-text-secondary">
                Loading files...
              </div>
            {:else if error !== null}
              <div class="p-4 text-sm text-danger-fg">{error}</div>
            {:else if allFilesLoading && fileTreeMode === "all"}
              <div class="p-4 text-sm text-text-secondary">
                Loading all files...
              </div>
            {:else}
              <FileTree
                tree={fileTree}
                mode={fileTreeMode}
                {selectedPath}
                onFileSelect={handleFileSelect}
                changedCount={diffFiles.length}
                {contextId}
                onModeChange={(mode) => {
                  fileTreeMode = mode;
                  if (mode === "all" && contextId !== null) {
                    void fetchAllFiles(contextId);
                  }
                }}
                onDirectoryExpand={handleDirectoryExpand}
                onLoadFullTree={handleLoadFullTree}
                onNarrow={narrowSidebar}
                onWiden={widenSidebar}
                canNarrow={sidebarWidth > SIDEBAR_MIN_WIDTH}
                canWiden={sidebarWidth < SIDEBAR_MAX_WIDTH}
              />
            {/if}
          </aside>
        {/if}
        <!-- Sidebar toggle tag -->
        <button
          type="button"
          class="absolute top-3 -right-5 z-10 w-5 h-10 flex items-center justify-center
                 bg-bg-secondary border border-l-0 border-border-default
                 rounded-r text-text-secondary hover:text-text-primary hover:bg-bg-tertiary
                 transition-colors cursor-pointer"
          onclick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          title={sidebarCollapsed ? "Show Sidebar (b)" : "Hide Sidebar (b)"}
        >
          <span class="text-xs leading-none"
            >{sidebarCollapsed ? "\u25B6" : "\u25C0"}</span
          >
        </button>
      </div>

      <!-- Content / Diff View + AI Panel -->
      <div class="flex flex-col flex-1 min-w-0">
        <main class="flex-1 overflow-auto bg-bg-primary">
          {#if !activeTabIsGitRepo}
            <div
              class="flex flex-col items-center justify-center h-full text-text-tertiary gap-2"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M4.72.22a.75.75 0 011.06 0l1 1a.75.75 0 01-1.06 1.06l-.47-.47-.47.47a.75.75 0 01-1.06-1.06l1-1zm3.78 0a.75.75 0 011.06 0l1 1a.75.75 0 01-1.06 1.06l-.47-.47-.47.47a.75.75 0 11-1.06-1.06l1-1zM1.5 3.25a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75v2a.75.75 0 01-.75.75H2.25a.75.75 0 01-.75-.75v-2zm.75 7.25a.75.75 0 00-.75.75v2c0 .414.336.75.75.75h11.5a.75.75 0 00.75-.75v-2a.75.75 0 00-.75-.75H2.25z"
                />
              </svg>
              <span class="text-sm">Not a git repository</span>
              <span class="text-xs"
                >Changes view is not available for non-git directories</span
              >
            </div>
          {:else if loading}
            <div class="p-8 text-center text-text-secondary">
              Loading diff...
            </div>
          {:else if error !== null}
            <div class="p-8 text-center text-danger-fg">{error}</div>
          {:else if selectedFile !== null && effectiveViewMode === "current-state"}
            <!-- Current State View -->
            <div class="px-2 pb-2">
              <CurrentStateView
                file={selectedFile}
                onCommentSubmit={handleInlineCommentSubmit}
                onNavigatePrev={navigatePrev}
                onNavigateNext={navigateNext}
              />
            </div>
          {:else if selectedFile !== null && (effectiveViewMode === "side-by-side" || effectiveViewMode === "inline")}
            <!-- Diff View (side-by-side or inline) -->
            <div class="px-2 pb-2">
              <DiffView
                file={selectedFile}
                mode={effectiveViewMode === "side-by-side"
                  ? "side-by-side"
                  : "inline"}
                onCommentSubmit={handleInlineCommentSubmit}
                onNavigatePrev={navigatePrev}
                onNavigateNext={navigateNext}
              />
            </div>
          {:else if effectiveViewMode === "full-file" && fileContentLoading}
            <div class="p-8 text-center text-text-secondary">
              Loading file...
            </div>
          {:else if effectiveViewMode === "full-file" && fileContent !== null}
            <!-- Full File Viewer (for diff files viewed as full content) -->
            <FileViewer
              path={fileContent.path}
              content={fileContent.content}
              language={fileContent.language}
              onCommentSubmit={handleInlineCommentSubmit}
            />
          {:else if fileContentLoading}
            <div class="p-8 text-center text-text-secondary">
              Loading file...
            </div>
          {:else if fileContent !== null}
            <!-- File Viewer (for non-diff files in all-files mode) -->
            <FileViewer
              path={fileContent.path}
              content={fileContent.content}
              language={fileContent.language}
              onCommentSubmit={handleInlineCommentSubmit}
            />
          {:else}
            <div class="p-8 text-center text-text-secondary">
              Select a file to view
            </div>
          {/if}
        </main>

        <!-- Diff Stats + View Mode Panel (between viewer and AI panel) -->
        <div
          class="shrink-0 h-8 border-t border-border-default flex items-center px-4 bg-bg-secondary text-xs text-text-secondary gap-4"
        >
          <span>
            {stats.totalFiles} file{stats.totalFiles !== 1 ? "s" : ""} changed
          </span>
          <span class="text-success-fg">+{stats.additions}</span>
          <span class="text-danger-fg">-{stats.deletions}</span>
          <div
            class="flex items-center border border-border-default rounded-md overflow-hidden ml-auto"
          >
            <!-- Full File icon: document with lines -->
            <button
              type="button"
              class="p-1 transition-colors
                     {effectiveViewMode === 'full-file'
                ? 'bg-bg-emphasis text-text-on-emphasis'
                : 'text-text-secondary hover:bg-bg-hover'}"
              onclick={() => setViewMode("full-file")}
              title="Full File"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V13.5A1.5 1.5 0 0112 15H4.5A1.5 1.5 0 013 13.5v-11z"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <line
                  x1="5.5"
                  y1="6"
                  x2="11"
                  y2="6"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
                <line
                  x1="5.5"
                  y1="8.5"
                  x2="11"
                  y2="8.5"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
                <line
                  x1="5.5"
                  y1="11"
                  x2="9"
                  y2="11"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
              </svg>
            </button>
            <!-- Side by Side icon: two vertical columns -->
            <button
              type="button"
              class="p-1 border-l border-border-default transition-colors
                     {!selectedHasDiff
                ? 'text-text-disabled cursor-not-allowed opacity-40'
                : effectiveViewMode === 'side-by-side'
                  ? 'bg-bg-emphasis text-text-on-emphasis'
                  : 'text-text-secondary hover:bg-bg-hover'}"
              onclick={() => {
                if (selectedHasDiff) setViewMode("side-by-side");
              }}
              disabled={!selectedHasDiff}
              title="Side by Side"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect
                  x="1"
                  y="2"
                  width="6"
                  height="12"
                  rx="1"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <rect
                  x="9"
                  y="2"
                  width="6"
                  height="12"
                  rx="1"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
              </svg>
            </button>
            <!-- Inline icon: stacked lines (unified diff) -->
            <button
              type="button"
              class="p-1 border-l border-border-default transition-colors
                     {!selectedHasDiff
                ? 'text-text-disabled cursor-not-allowed opacity-40'
                : effectiveViewMode === 'inline'
                  ? 'bg-bg-emphasis text-text-on-emphasis'
                  : 'text-text-secondary hover:bg-bg-hover'}"
              onclick={() => {
                if (selectedHasDiff) setViewMode("inline");
              }}
              disabled={!selectedHasDiff}
              title="Inline"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect
                  x="1"
                  y="2"
                  width="14"
                  height="12"
                  rx="1"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <line
                  x1="4"
                  y1="5.5"
                  x2="12"
                  y2="5.5"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
                <line
                  x1="4"
                  y1="8"
                  x2="12"
                  y2="8"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
                <line
                  x1="4"
                  y1="10.5"
                  x2="10"
                  y2="10.5"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
              </svg>
            </button>
            <!-- Current icon: single document -->
            <button
              type="button"
              class="p-1 border-l border-border-default transition-colors
                     {!selectedHasDiff
                ? 'text-text-disabled cursor-not-allowed opacity-40'
                : effectiveViewMode === 'current-state'
                  ? 'bg-bg-emphasis text-text-on-emphasis'
                  : 'text-text-secondary hover:bg-bg-hover'}"
              onclick={() => {
                if (selectedHasDiff) setViewMode("current-state");
              }}
              disabled={!selectedHasDiff}
              title="Current"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V13.5A1.5 1.5 0 0112 15H4.5A1.5 1.5 0 013 13.5v-11z"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Session Toolbar (new session + search session) -->
        <SessionToolbar
          {contextId}
          {projectPath}
          onNewSession={handleNewSession}
          onResumeSession={(qraftId) => handleResumeCliSession(qraftId)}
        />

        <!-- Current Session Panel (above AI panel) -->
        <CurrentSessionPanel
          {contextId}
          {projectPath}
          running={runningSessions}
          queued={queuedSessions}
          recentlyCompleted={recentlyCompletedSessions}
          pendingPrompts={serverPromptQueue.filter(
            (p) => p.status === "queued" || p.status === "running",
          )}
          resumeSessionId={resumeDisplaySessionId}
          onCancelSession={(id) => void handleCancelActiveSession(id)}
          onResumeSession={(qraftId) => handleResumeCliSession(qraftId)}
        />

        <!-- AI Prompt Panel (below stats bar, does not overlap sidebar) -->
        <AIPromptPanel
          collapsed={aiPanelCollapsed}
          {queueStatus}
          changedFiles={changedFilePaths}
          allFiles={changedFilePaths}
          onSubmit={handleAIPanelSubmit}
          onToggle={() => {
            aiPanelCollapsed = !aiPanelCollapsed;
          }}
          onNewSession={handleNewSession}
          onSearchSession={handleSearchSession}
        />
      </div>
    {:else if currentScreen === "commits"}
      <!-- Commits Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <CommitsScreen {contextId} isGitRepo={activeTabIsGitRepo} />
        {/if}
      </main>
    {:else if currentScreen === "sessions"}
      <!-- Unified Sessions Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <UnifiedSessionsScreen
            {contextId}
            {projectPath}
            onResumeToChanges={handleResumeToChanges}
          />
        {/if}
      </main>
    {:else if currentScreen === "project"}
      <!-- Project Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <ProjectScreen
            {contextId}
            {projectPath}
            onProjectChanged={() => void init()}
          />
        {:else}
          <!-- No project open - show project selection -->
          <div
            class="flex flex-col items-center justify-center h-full gap-6 text-text-secondary"
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="text-text-tertiary"
            >
              <path
                d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
              />
            </svg>
            <p class="text-lg">No project open</p>
            <p class="text-sm text-text-tertiary">
              Open a project directory to get started.
            </p>

            <!-- Open project controls -->
            <div class="w-full max-w-md flex flex-col gap-3">
              <!-- Native OS file picker button -->
              <button
                type="button"
                disabled={pickingDirectory || newProjectLoading}
                onclick={() => void pickDirectory()}
                class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium
                       bg-accent-emphasis hover:brightness-110 text-white
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all"
              >
                {#if pickingDirectory}
                  <svg
                    class="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    />
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Opening file picker...
                {:else}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path
                      d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
                    />
                  </svg>
                  Choose Directory...
                {/if}
              </button>

              <!-- Path input -->
              <div class="flex items-center gap-2">
                <div class="h-px flex-1 bg-border-default"></div>
                <span class="text-xs text-text-tertiary">or enter path</span>
                <div class="h-px flex-1 bg-border-default"></div>
              </div>
              <form
                class="flex items-center gap-2"
                onsubmit={(e) => {
                  e.preventDefault();
                  if (newProjectPath.trim().length > 0) {
                    void openProjectByPath(newProjectPath.trim());
                  }
                }}
              >
                <input
                  type="text"
                  bind:value={newProjectPath}
                  class="flex-1 px-3 py-2 text-sm rounded-lg border border-border-default
                         bg-bg-secondary text-text-primary font-mono
                         focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                         placeholder:text-text-tertiary"
                  placeholder="/path/to/project"
                />
                <button
                  type="submit"
                  disabled={newProjectPath.trim().length === 0 ||
                    newProjectLoading}
                  class="px-4 py-2 rounded-lg text-sm font-medium
                         bg-bg-tertiary hover:bg-border-default text-text-primary
                         border border-border-default
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
                >
                  {#if newProjectLoading}
                    Opening...
                  {:else}
                    Open
                  {/if}
                </button>
              </form>

              <!-- Error display -->
              {#if newProjectError !== null}
                <div
                  class="p-3 rounded-lg border border-danger-muted bg-danger-subtle text-danger-fg text-sm"
                  role="alert"
                >
                  {newProjectError}
                </div>
              {/if}
            </div>

            <!-- Recent projects -->
            {#if availableRecentProjects.length > 0}
              <div class="w-full max-w-md">
                <h3
                  class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-4"
                >
                  Recent Projects
                </h3>
                <div
                  class="border border-border-default rounded-lg bg-bg-secondary overflow-hidden"
                >
                  {#each availableRecentProjects as recent (recent.path)}
                    <div
                      class="flex items-center border-b border-border-default last:border-b-0 hover:bg-bg-tertiary transition-colors"
                    >
                      <button
                        type="button"
                        class="flex-1 text-left px-4 py-2.5 text-sm flex items-center gap-3 min-w-0"
                        onclick={() => void openRecentProject(recent.path)}
                        title={recent.path}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          class="shrink-0 {recent.isGitRepo
                            ? 'text-accent-fg'
                            : 'text-text-tertiary'}"
                        >
                          <path
                            d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
                          />
                        </svg>
                        <div class="flex-1 min-w-0">
                          <span class="text-text-primary font-medium"
                            >{recent.name}</span
                          >
                          <span class="text-xs text-text-tertiary ml-2 truncate"
                            >{recent.path}</span
                          >
                        </div>
                      </button>
                      <button
                        type="button"
                        class="shrink-0 p-2 mr-2 rounded text-text-tertiary hover:text-danger-fg hover:bg-danger-subtle transition-colors"
                        title="Remove from recent projects"
                        onclick={() => void removeRecentProject(recent.path)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path
                            d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
                          />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </main>
    {:else if currentScreen === "tools"}
      <!-- Tools Screen -->
      <main class="flex-1 overflow-hidden">
        <ToolsScreen />
      </main>
    {:else if currentScreen === "system-info"}
      <!-- System Info Screen -->
      <main class="flex-1 overflow-hidden">
        <SystemInfoScreen />
      </main>
    {/if}
  </div>

  <!-- Merge Branch Dialog -->
  {#if mergeDialogOpen && contextId !== null}
    <MergeBranchDialog
      {contextId}
      onClose={() => {
        mergeDialogOpen = false;
      }}
    />
  {/if}
</div>

<style>
  /* Hide scrollbar on project tabs for cleaner appearance */
  .project-tabs-nav {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .project-tabs-nav::-webkit-scrollbar {
    display: none;
  }
</style>
