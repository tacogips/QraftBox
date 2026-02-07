<script lang="ts">
  import type { DiffFile, ViewMode } from "./types/diff";
  import type { FileNode } from "./stores/files";
  import type { QueueStatus, FileReference } from "../../src/types/ai";
  import DiffView from "../components/DiffView.svelte";
  import FileTree from "../components/FileTree.svelte";
  import AIPromptPanel from "../components/AIPromptPanel.svelte";
  import ClaudeSessionsScreen from "../components/claude-sessions/ClaudeSessionsScreen.svelte";
  import SessionQueueScreen from "../components/session/SessionQueueScreen.svelte";
  import CommitsScreen from "../components/commits/CommitsScreen.svelte";
  import GitOpsScreen from "../components/git-ops/GitOpsScreen.svelte";
  import WorktreeScreen from "../components/worktree/WorktreeScreen.svelte";
  import ToolsScreen from "../components/tools/ToolsScreen.svelte";

  /**
   * Screen type for navigation
   */
  type ScreenType =
    | "diff"
    | "commits"
    | "sessions"
    | "queue"
    | "git-ops"
    | "worktree"
    | "tools";

  /**
   * Application state
   */
  let contextId = $state<string | null>(null);
  let diffFiles = $state<DiffFile[]>([]);
  let selectedPath = $state<string | null>(null);
  let viewMode = $state<ViewMode>("side-by-side");
  let fileTreeMode = $state<"diff" | "all">("diff");
  let sidebarCollapsed = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let projectPath = $state<string>("");
  let currentScreen = $state<ScreenType>("diff");

  // AI prompt state
  let aiPanelCollapsed = $state(true);
  let queueStatus = $state<QueueStatus>({
    runningCount: 0,
    queuedCount: 0,
    runningSessionIds: [],
    totalCount: 0,
  });

  /**
   * Currently selected diff file
   */
  const selectedFile = $derived(
    selectedPath !== null
      ? (diffFiles.find((f) => f.path === selectedPath) ?? null)
      : (diffFiles[0] ?? null),
  );

  /**
   * Build file tree from diff files
   */
  function buildFileTree(files: DiffFile[]): FileNode {
    const root: FileNode = {
      name: "",
      path: "",
      isDirectory: true,
      children: files.map((f) => ({
        name: f.path.split("/").pop() ?? f.path,
        path: f.path,
        isDirectory: false,
        status: f.status === "renamed" ? "modified" : f.status,
      })),
    };
    return root;
  }

  /**
   * File tree derived from diff files
   */
  const fileTree = $derived(buildFileTree(diffFiles));

  /**
   * Diff stats
   */
  const stats = $derived({
    totalFiles: diffFiles.length,
    additions: diffFiles.reduce((sum, f) => sum + f.additions, 0),
    deletions: diffFiles.reduce((sum, f) => sum + f.deletions, 0),
  });

  /**
   * Fetch workspace to get context ID
   */
  async function fetchContext(): Promise<string> {
    const resp = await fetch("/api/workspace");
    if (!resp.ok) throw new Error("Failed to fetch workspace");
    const data = (await resp.json()) as {
      workspace: { tabs?: Array<{ id: string; path: string }> };
    };
    const tabs = data.workspace.tabs;
    if (tabs !== undefined && tabs.length > 0 && tabs[0] !== undefined) {
      projectPath = tabs[0].path;
      return tabs[0].id;
    }

    // No tabs exist - create one by posting current location
    // The server's CLI creates an initial context on startup, so this
    // fallback handles edge cases where the workspace is empty
    const createResp = await fetch("/api/workspace/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "." }),
    });
    if (createResp.ok) {
      const createData = (await createResp.json()) as {
        tab?: { id: string; path: string };
      };
      if (createData.tab !== undefined) {
        projectPath = createData.tab.path;
        return createData.tab.id;
      }
    }

    throw new Error("No workspace tabs available");
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
    try {
      loading = true;
      error = null;
      const ctxId = await fetchContext();
      contextId = ctxId;
      await fetchDiff(ctxId);
      void fetchQueueStatus();
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

  /**
   * Navigate to a specific screen
   */
  function navigateToScreen(screen: ScreenType): void {
    currentScreen = screen;
  }

  /**
   * Changed file paths for autocomplete
   */
  const changedFilePaths = $derived(diffFiles.map((f) => f.path));

  /**
   * Submit AI prompt from the global panel
   */
  async function handleAIPanelSubmit(
    prompt: string,
    immediate: boolean,
    refs: readonly FileReference[],
  ): Promise<void> {
    if (contextId === null) return;
    const body = {
      prompt,
      context: {
        primaryFile: undefined,
        references: refs,
        diffSummary: undefined,
      },
      options: {
        projectPath: projectPath,
        sessionMode: "new" as const,
        immediate,
      },
    };
    try {
      const resp = await fetch("/api/ai/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        console.error("AI prompt error:", resp.status);
      }
      void fetchQueueStatus();
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
    side: "old" | "new",
    filePath: string,
    prompt: string,
    immediate: boolean,
  ): Promise<void> {
    if (contextId === null) return;
    const body = {
      prompt,
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
      options: {
        projectPath: projectPath,
        sessionMode: "new" as const,
        immediate,
      },
    };
    try {
      const resp = await fetch("/api/ai/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        console.error("AI prompt error:", resp.status);
      }
      void fetchQueueStatus();
    } catch (e) {
      console.error("AI prompt submit error:", e);
    }
  }

  /**
   * Fetch AI queue status
   */
  async function fetchQueueStatus(): Promise<void> {
    try {
      const resp = await fetch("/api/ai/queue/status");
      if (resp.ok) {
        queueStatus = (await resp.json()) as QueueStatus;
      }
    } catch {
      // Silently ignore - queue status is non-critical
    }
  }

  /**
   * Keyboard shortcuts
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.key === "b" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      toggleSidebar();
    }
    if (event.key === "a" && !event.ctrlKey && !event.metaKey && currentScreen === "diff") {
      event.preventDefault();
      aiPanelCollapsed = !aiPanelCollapsed;
    }
  }

  // Initialize on mount
  $effect(() => {
    void init();
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

<div class="flex flex-col h-screen bg-bg-primary text-text-primary">
  <!-- Header -->
  <header
    class="h-14 border-b border-border-default flex items-center px-4 bg-bg-secondary gap-4"
  >
    <h1 class="text-lg font-semibold">QraftBox</h1>
    <span class="text-sm text-text-secondary">Local Diff Viewer</span>

    <!-- Navigation -->
    <nav class="flex items-center gap-1 ml-4">
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'diff'
          ? 'bg-blue-600 text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("diff")}
      >
        Diff
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'commits'
          ? 'bg-blue-600 text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("commits")}
      >
        Commits
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'sessions'
          ? 'bg-blue-600 text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("sessions")}
      >
        Sessions
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'queue'
          ? 'bg-blue-600 text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("queue")}
      >
        Queue
      </button>
      <span class="w-px h-5 bg-border-default"></span>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'git-ops'
          ? 'bg-blue-600 text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("git-ops")}
      >
        Git Ops
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'worktree'
          ? 'bg-blue-600 text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("worktree")}
      >
        Worktree
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'tools'
          ? 'bg-blue-600 text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("tools")}
      >
        Tools
      </button>
    </nav>

    <div class="flex items-center gap-2 ml-auto">
      <!-- View Mode Toggle (only visible on diff screen) -->
      {#if currentScreen === "diff"}
        <button
          type="button"
          class="px-3 py-1 text-sm border border-border-default rounded transition-colors
                 {viewMode === 'side-by-side'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'hover:bg-bg-tertiary'}"
          onclick={() => setViewMode("side-by-side")}
        >
          Side by Side
        </button>
        <button
          type="button"
          class="px-3 py-1 text-sm border border-border-default rounded transition-colors
                 {viewMode === 'inline'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'hover:bg-bg-tertiary'}"
          onclick={() => setViewMode("inline")}
        >
          Inline
        </button>
        <button
          type="button"
          class="px-3 py-1 text-sm border border-border-default rounded transition-colors
                 {viewMode === 'current-state'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'hover:bg-bg-tertiary'}"
          onclick={() => setViewMode("current-state")}
        >
          Current
        </button>

      {/if}
    </div>
  </header>

  <!-- Tab Bar -->
  <div
    class="flex bg-bg-secondary border-b border-border-default px-2 overflow-x-auto"
  >
    {#if projectPath}
      <div
        class="py-2 px-4 text-sm border-b-2 border-blue-600 text-text-primary"
      >
        {projectPath}
      </div>
    {/if}
  </div>

  <!-- Main Area -->
  <div class="flex flex-1 overflow-hidden">
    {#if currentScreen === "diff"}
      <!-- Sidebar / File Tree with tag toggle -->
      <div class="relative flex shrink-0">
        {#if !sidebarCollapsed}
          <aside
            class="w-64 border-r border-border-default bg-bg-secondary overflow-auto"
          >
            {#if loading}
              <div class="p-4 text-sm text-text-secondary">Loading files...</div>
            {:else if error !== null}
              <div class="p-4 text-sm text-red-600">{error}</div>
            {:else if fileTree.children !== undefined && fileTree.children.length > 0}
              <FileTree
                tree={fileTree}
                mode={fileTreeMode}
                {selectedPath}
                onFileSelect={handleFileSelect}
                onModeChange={(mode) => {
                  fileTreeMode = mode;
                }}
              />
            {:else}
              <div class="p-4 text-sm text-text-secondary">
                No changed files found
              </div>
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
          <span class="text-xs leading-none">{sidebarCollapsed ? "\u25B6" : "\u25C0"}</span>
        </button>
      </div>

      <!-- Content / Diff View -->
      <main class="flex-1 overflow-auto bg-bg-primary">
        {#if loading}
          <div class="p-8 text-center text-text-secondary">Loading diff...</div>
        {:else if error !== null}
          <div class="p-8 text-center text-red-600">{error}</div>
        {:else if selectedFile !== null && viewMode !== "current-state"}
          <div class="p-4">
            <DiffView
              file={selectedFile}
              mode={viewMode === "side-by-side" ? "side-by-side" : "inline"}
              onCommentSubmit={handleInlineCommentSubmit}
            />
          </div>
        {:else if viewMode === "current-state"}
          <div class="p-8 text-center text-text-secondary">
            Current state view is under development
          </div>
        {:else}
          <div class="p-8 text-center text-text-secondary">
            Select a file to view diff
          </div>
        {/if}
      </main>
    {:else if currentScreen === "sessions"}
      <!-- Claude Sessions Screen -->
      <main class="flex-1 overflow-hidden">
        <ClaudeSessionsScreen onBack={() => navigateToScreen("diff")} />
      </main>
    {:else if currentScreen === "queue"}
      <!-- Session Queue Screen -->
      <main class="flex-1 overflow-hidden">
        <SessionQueueScreen
          onBack={() => navigateToScreen("diff")}
          onSelectSession={(id) => {
            console.log("Selected session:", id);
          }}
          onBrowseAllSessions={() => navigateToScreen("sessions")}
        />
      </main>
    {:else if currentScreen === "commits"}
      <!-- Commits Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <CommitsScreen
            {contextId}
            onBack={() => navigateToScreen("diff")}
          />
        {/if}
      </main>
    {:else if currentScreen === "git-ops"}
      <!-- Git Operations Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <GitOpsScreen
            {contextId}
            onBack={() => navigateToScreen("diff")}
          />
        {/if}
      </main>
    {:else if currentScreen === "worktree"}
      <!-- Worktree Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <WorktreeScreen
            {contextId}
            onBack={() => navigateToScreen("diff")}
          />
        {/if}
      </main>
    {:else if currentScreen === "tools"}
      <!-- Tools Screen -->
      <main class="flex-1 overflow-hidden">
        <ToolsScreen onBack={() => navigateToScreen("diff")} />
      </main>
    {/if}
  </div>

  <!-- AI Prompt Panel (diff screen only) -->
  {#if currentScreen === "diff"}
    <AIPromptPanel
      collapsed={aiPanelCollapsed}
      {queueStatus}
      changedFiles={changedFilePaths}
      allFiles={changedFilePaths}
      onSubmit={handleAIPanelSubmit}
      onToggle={() => { aiPanelCollapsed = !aiPanelCollapsed; }}
    />
  {/if}

  <!-- Footer -->
  <footer
    class="h-8 border-t border-border-default flex items-center px-4 bg-bg-secondary text-xs text-text-secondary gap-4"
  >
    <span>
      {stats.totalFiles} file{stats.totalFiles !== 1 ? "s" : ""} changed
    </span>
    <span class="text-green-800">+{stats.additions}</span>
    <span class="text-red-600">-{stats.deletions}</span>
    {#if contextId !== null}
      <span class="ml-auto text-text-tertiary">ctx: {contextId}</span>
    {/if}
  </footer>
</div>
