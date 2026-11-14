<script lang="ts">
  import type { DiffFile, ViewMode } from "./types/diff";
  import type { FileNode } from "./stores/files";
  import {
    generateQraftAiSessionId,
    type QraftAiSessionId,
    type QueueStatus,
    type AISession,
  } from "../../src/types/ai";
  import { screenFromHash, type ScreenType } from "./lib/app-routing";
  import { annotateTreeWithStatus, buildFileTree } from "./lib/file-tree-utils";
  import {
    type PromptQueueItem,
    type RecentProject,
    type ServerTab,
  } from "./lib/app-api";
  import { createSessionStreamController } from "./lib/ai-runtime";
  import { createWorkspaceController } from "./lib/workspace-runtime";
  import { createAppRealtimeController } from "./lib/app-realtime";
  import { createAIFeatureController } from "./lib/ai-feature-runtime";
  import {
    createFileViewController,
    loadSidebarWidth,
    saveSidebarWidth,
    type FileContent,
  } from "./lib/file-view-runtime";
  // LocalPrompt type no longer needed - server manages prompt queue
  import AppTopNav from "../components/app/AppTopNav.svelte";
  import DiffScreen from "../components/app/DiffScreen.svelte";
  import ProjectSelectionScreen from "../components/app/ProjectSelectionScreen.svelte";
  import UnifiedSessionsScreen from "../components/sessions/UnifiedSessionsScreen.svelte";
  import CommitsScreen from "../components/commits/CommitsScreen.svelte";
  import TerminalScreen from "../components/terminal/TerminalScreen.svelte";
  import ToolsScreen from "../components/tools/ToolsScreen.svelte";
  import SystemInfoScreen from "../components/system-info/SystemInfoScreen.svelte";
  import ModelConfigScreen from "../components/model-config/ModelConfigScreen.svelte";
  import MergeBranchDialog from "../components/MergeBranchDialog.svelte";

  function shouldDefaultToCollapsedSidebar(): boolean {
    if (typeof window === "undefined") return false;
    const isMobileUa = /iPhone|iPod|Android/i.test(navigator.userAgent);
    const isPhoneViewport = window.innerWidth <= 480;
    return isMobileUa || isPhoneViewport;
  }

  /**
   * Application state
   */
  let contextId = $state<string | null>(null);
  let diffFiles = $state<DiffFile[]>([]);
  let selectedPath = $state<string | null>(null);
  let viewMode = $state<ViewMode>("full-file");
  let fileTreeMode = $state<"diff" | "all">("all");
  let sidebarCollapsed = $state(shouldDefaultToCollapsedSidebar());

  const SIDEBAR_MIN_WIDTH = 160;
  const SIDEBAR_MAX_WIDTH = 480;
  const SIDEBAR_WIDTH_STEP = 64;
  const SIDEBAR_DEFAULT_WIDTH = 256;

  let sidebarWidth = $state(
    loadSidebarWidth({
      storageKey: "qraftbox-sidebar-width",
      min: SIDEBAR_MIN_WIDTH,
      max: SIDEBAR_MAX_WIDTH,
      fallback: SIDEBAR_DEFAULT_WIDTH,
    }),
  );
  let loading = $state(true);
  let error = $state<string | null>(null);
  let projectPath = $state<string>("");
  let workspaceTabs = $state<ServerTab[]>([]);
  let currentScreen = $state<ScreenType>(screenFromHash(window.location.hash));
  let recentProjects = $state<RecentProject[]>([]);
  // Add-project state
  let newProjectPath = $state("");
  let newProjectError = $state<string | null>(null);
  let newProjectLoading = $state(false);
  let pickingDirectory = $state(false);
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
   * Whether to show git-ignored files in the file tree (default: hidden)
   */
  let showIgnored = $state(false);

  /**
   * Whether to show all files including non-git files (default: hidden)
   */
  let showAllFiles = $state(false);

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

  const fileViewController = createFileViewController({
    getContextId: () => contextId,
    getAllFilesTree: () => allFilesTree,
    setAllFilesTree: (value) => (allFilesTree = value),
    getAllFilesTreeStale: () => allFilesTreeStale,
    setAllFilesTreeStale: (value) => (allFilesTreeStale = value),
    setAllFilesLoading: (value) => (allFilesLoading = value),
    getDiffStatusMap: () => diffStatusMap,
    setFileContent: (value) => (fileContent = value),
    setFileContentLoading: (value) => (fileContentLoading = value),
    getShowIgnored: () => showIgnored,
    getShowAllFiles: () => showAllFiles,
  });

  const {
    fetchAllFiles,
    refreshAllFiles,
    handleDirectoryExpand,
    handleLoadFullTree,
    fetchFileContent,
    getEffectiveViewMode,
  } = fileViewController;

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
    getEffectiveViewMode(selectedHasDiff, viewMode),
  );

  /**
   * File content for non-diff files
   */
  let fileContent = $state<FileContent | null>(null);
  let fileContentLoading = $state(false);

  /**
   * Diff stats
   */
  const stats = $derived({
    totalFiles: diffFiles.length,
    additions: diffFiles.reduce((sum, f) => sum + f.additions, 0),
    deletions: diffFiles.reduce((sum, f) => sum + f.deletions, 0),
  });

  let fetchPromptQueueRef: () => Promise<void> = async () => {};
  let fetchActiveSessionsRef: () => Promise<void> = async () => {};

  const workspaceController = createWorkspaceController({
    getContextId: () => contextId,
    setContextId: (value) => (contextId = value),
    getProjectPath: () => projectPath,
    setProjectPath: (value) => (projectPath = value),
    getWorkspaceTabs: () => workspaceTabs,
    setWorkspaceTabs: (value) => (workspaceTabs = value),
    getCurrentScreen: () => currentScreen,
    setCurrentScreen: (value) => (currentScreen = value),
    setError: (value) => (error = value),
    getRecentProjects: () => recentProjects,
    setRecentProjects: (value) => (recentProjects = value),
    setNewProjectPath: (value) => (newProjectPath = value),
    setNewProjectError: (value) => (newProjectError = value),
    setNewProjectLoading: (value) => (newProjectLoading = value),
    setPickingDirectory: (value) => (pickingDirectory = value),
    setLoading: (value) => (loading = value),
    getFileTreeMode: () => fileTreeMode,
    setFileTreeMode: (value) => (fileTreeMode = value),
    setShowAllFiles: (value) => (showAllFiles = value),
    setDiffFiles: (value) => (diffFiles = value),
    setSelectedPath: (value) => (selectedPath = value),
    setAllFilesTree: (value) => (allFilesTree = value as FileNode | null),
    setAllFilesTreeStale: (value) => (allFilesTreeStale = value),
    setFileContent: (value) =>
      (fileContent = value as {
        path: string;
        content: string;
        language: string;
        isBinary?: boolean;
        isImage?: boolean;
        mimeType?: string;
      } | null),
    fetchAllFiles,
    fetchPromptQueue: () => fetchPromptQueueRef(),
    fetchActiveSessions: () => fetchActiveSessionsRef(),
  });

  const {
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
  } = workspaceController;

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

  function collapseSidebar(): void {
    sidebarCollapsed = true;
  }

  function narrowSidebar(): void {
    sidebarWidth = Math.max(
      SIDEBAR_MIN_WIDTH,
      sidebarWidth - SIDEBAR_WIDTH_STEP,
    );
    saveSidebarWidth("qraftbox-sidebar-width", sidebarWidth);
  }

  function widenSidebar(): void {
    sidebarWidth = Math.min(
      SIDEBAR_MAX_WIDTH,
      sidebarWidth + SIDEBAR_WIDTH_STEP,
    );
    saveSidebarWidth("qraftbox-sidebar-width", sidebarWidth);
  }

  const aiFeatureController = createAIFeatureController({
    getContextId: () => contextId,
    getProjectPath: () => projectPath,
    getQraftAiSessionId: () => qraftAiSessionId,
    setQraftAiSessionId: (value) => (qraftAiSessionId = value),
    getRunningSessions: () => runningSessions,
    setRunningSessions: (value) => (runningSessions = value),
    getQueuedSessions: () => queuedSessions,
    setQueuedSessions: (value) => (queuedSessions = value),
    getRecentlyCompletedSessions: () => recentlyCompletedSessions,
    setRecentlyCompletedSessions: (value) =>
      (recentlyCompletedSessions = value),
    getServerPromptQueue: () => serverPromptQueue,
    setServerPromptQueue: (value) => (serverPromptQueue = value),
    setQueueStatus: (value) => (queueStatus = value),
    getAIPanelCollapsed: () => aiPanelCollapsed,
    setAIPanelCollapsed: (value) => (aiPanelCollapsed = value),
    setResumeDisplaySessionId: (value) => (resumeDisplaySessionId = value),
    navigateToScreen,
  });

  const {
    submitPrompt,
    fetchPromptQueue,
    fetchActiveSessions,
    handleCancelActiveSession,
    handleCancelQueuedPrompt,
    handleResumeToChanges,
    handleResumeCliSession,
    handleNewSession,
    hasActiveSessionWork,
  } = aiFeatureController;

  fetchPromptQueueRef = fetchPromptQueue;
  fetchActiveSessionsRef = fetchActiveSessions;

  const sessionStreamController = createSessionStreamController({
    getRunningSessions: () => runningSessions,
    setRunningSessions: (sessions) => {
      runningSessions = sessions;
    },
    fetchActiveSessions,
    fetchPromptQueue,
  });

  /**
   * Manage polling interval for active sessions and pending prompts.
   * Also polls while recently completed sessions exist so their display
   * eventually clears and queue status stays accurate.
   */
  function manageSessionPolling(): void {
    if (hasActiveSessionWork() && sessionPollTimer === null) {
      sessionPollTimer = setInterval(() => {
        void fetchPromptQueue();
        void fetchActiveSessions();
      }, 2000);
    } else if (!hasActiveSessionWork() && sessionPollTimer !== null) {
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
    sessionStreamController.sync();
  });

  /**
   * Changed file paths for autocomplete
   */
  const changedFilePaths = $derived(diffFiles.map((f) => f.path));

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
      currentScreen === "files"
    ) {
      event.preventDefault();
      aiPanelCollapsed = !aiPanelCollapsed;
    }
  }

  const realtimeController = createAppRealtimeController({
    getContextId: () => contextId,
    getFileTreeMode: () => fileTreeMode,
    markAllFilesTreeStale: () => {
      allFilesTreeStale = true;
    },
    fetchDiff,
    refreshAllFiles,
    setPromptQueue: (prompts) => {
      serverPromptQueue = prompts;
    },
    setQueueStatus: (status) => {
      queueStatus = status;
    },
    fetchActiveSessions,
  });

  // Initialize on mount
  $effect(() => {
    void init();
    realtimeController.connect();
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("hashchange", handleHashChange);
      realtimeController.disconnect();
      if (sessionPollTimer !== null) {
        clearInterval(sessionPollTimer);
        sessionPollTimer = null;
      }
      sessionStreamController.closeAll();
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

  // On mobile, entering the files screen should start with tree collapsed.
  $effect(() => {
    if (currentScreen === "files" && shouldDefaultToCollapsedSidebar()) {
      sidebarCollapsed = true;
    }
  });
</script>

<div class="flex flex-col h-[100dvh] bg-bg-primary text-text-primary">
  <AppTopNav
    {currentScreen}
    {workspaceTabs}
    {contextId}
    {projectPath}
    {activeTabIsGitRepo}
    hasChanges={diffFiles.length > 0}
    {availableRecentProjects}
    {newProjectPath}
    {newProjectError}
    {newProjectLoading}
    {pickingDirectory}
    onNavigateToScreen={navigateToScreen}
    onSwitchProject={switchProject}
    onCloseProjectTab={closeProjectTab}
    onFetchRecentProjects={fetchRecentProjects}
    onNewProjectPathChange={(value) => {
      newProjectPath = value;
      newProjectError = null;
    }}
    onOpenProjectByPath={openProjectByPath}
    onOpenRecentProject={openRecentProject}
    onRemoveRecentProject={removeRecentProject}
    onPickDirectory={pickDirectory}
    onWorktreeSwitch={init}
    onPushSuccess={async () => {
      if (contextId !== null) {
        await fetchDiff(contextId);
      }
    }}
  />

  <!-- Main Area -->
  <div class="flex flex-1 min-h-0 overflow-hidden">
    {#if currentScreen === "files"}
      <DiffScreen
        {activeTabIsGitRepo}
        {loading}
        {error}
        {sidebarCollapsed}
        {sidebarWidth}
        {allFilesLoading}
        {fileTree}
        {fileTreeMode}
        {selectedPath}
        {diffFiles}
        {contextId}
        {selectedFile}
        {effectiveViewMode}
        {selectedHasDiff}
        {fileContentLoading}
        {fileContent}
        {stats}
        {navigatePrev}
        {navigateNext}
        canNarrow={sidebarWidth > SIDEBAR_MIN_WIDTH}
        canWiden={sidebarWidth < SIDEBAR_MAX_WIDTH}
        {aiPanelCollapsed}
        {queueStatus}
        {changedFilePaths}
        {projectPath}
        {runningSessions}
        {queuedSessions}
        {recentlyCompletedSessions}
        pendingPrompts={serverPromptQueue.filter((p) => p.status === "queued")}
        {resumeDisplaySessionId}
        currentQraftAiSessionId={qraftAiSessionId}
        onToggleSidebar={toggleSidebar}
        onFileSelect={handleFileSelect}
        onFileTreeModeChange={(mode) => {
          fileTreeMode = mode;
          if (mode === "all" && contextId !== null) {
            void fetchAllFiles(contextId);
          }
        }}
        {showIgnored}
        onShowIgnoredChange={(value) => {
          showIgnored = value;
          allFilesTree = null;
          allFilesTreeStale = true;
          if (contextId !== null && fileTreeMode === "all") {
            void fetchAllFiles(contextId);
          }
        }}
        {showAllFiles}
        onShowAllFilesChange={(value) => {
          showAllFiles = value;
          allFilesTree = null;
          allFilesTreeStale = true;
          if (contextId !== null && fileTreeMode === "all") {
            void fetchAllFiles(contextId);
          }
        }}
        onReloadFileTree={() => {
          if (contextId !== null) {
            void fetchDiff(contextId);
            if (fileTreeMode === "all") {
              allFilesTree = null;
              allFilesTreeStale = true;
              void fetchAllFiles(contextId);
            }
          }
        }}
        onDirectoryExpand={handleDirectoryExpand}
        onLoadFullTree={handleLoadFullTree}
        onCollapseSidebar={collapseSidebar}
        onNarrowSidebar={narrowSidebar}
        onWidenSidebar={widenSidebar}
        onSetViewMode={setViewMode}
        onSubmitPrompt={submitPrompt}
        onNewSession={handleNewSession}
        onResumeCliSession={handleResumeCliSession}
        onCancelActiveSession={handleCancelActiveSession}
        onCancelQueuedPrompt={handleCancelQueuedPrompt}
        onToggleAiPanel={() => {
          aiPanelCollapsed = !aiPanelCollapsed;
        }}
      />
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
    {:else if currentScreen === "terminal"}
      <!-- Terminal Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <TerminalScreen {contextId} />
        {/if}
      </main>
    {:else if currentScreen === "project"}
      <!-- Project Screen -->
      <main class="flex-1 overflow-hidden">
        <ProjectSelectionScreen
          {pickingDirectory}
          {newProjectLoading}
          {newProjectPath}
          {newProjectError}
          {availableRecentProjects}
          onPickDirectory={pickDirectory}
          onNewProjectPathChange={(value) => {
            newProjectPath = value;
          }}
          onOpenProject={openProjectByPath}
          onOpenRecentProject={openRecentProject}
          onRemoveRecentProject={removeRecentProject}
        />
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
    {:else if currentScreen === "model-config"}
      <!-- Model Config Screen -->
      <main class="flex-1 overflow-hidden">
        <ModelConfigScreen />
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
