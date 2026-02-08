<script lang="ts">
  import type { DiffFile, ViewMode } from "./types/diff";
  import type { FileNode } from "./stores/files";
  import type { QueueStatus, FileReference } from "../../src/types/ai";
  import DiffView from "../components/DiffView.svelte";
  import FileViewer from "../components/FileViewer.svelte";
  import FileTree from "../components/FileTree.svelte";
  import AIPromptPanel from "../components/AIPromptPanel.svelte";
  import ClaudeSessionsScreen from "../components/claude-sessions/ClaudeSessionsScreen.svelte";
  import SessionQueueScreen from "../components/session/SessionQueueScreen.svelte";
  import CommitsScreen from "../components/commits/CommitsScreen.svelte";
  import GitHubOpsScreen from "../components/github-ops/GitHubOpsScreen.svelte";
  import GitPushButton from "../components/git-actions/GitPushButton.svelte";
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
    | "github-ops"
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

  /**
   * Fetch all files tree from server
   */
  async function fetchAllFiles(ctxId: string): Promise<void> {
    if (allFilesTree !== null) return;
    allFilesLoading = true;
    try {
      const resp = await fetch(`/api/ctx/${ctxId}/files?mode=all`);
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
   * Active file tree based on mode
   */
  const fileTree = $derived(
    fileTreeMode === "diff" ? diffFileTree : (allFilesTree ?? diffFileTree),
  );

  /**
   * Whether the selected path has a diff entry
   */
  const selectedHasDiff = $derived(
    selectedPath !== null && diffFiles.some((f) => f.path === selectedPath),
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

  // Fetch file content when selecting a non-diff file
  $effect(() => {
    if (
      selectedPath !== null &&
      !selectedHasDiff &&
      contextId !== null &&
      fileTreeMode === "all"
    ) {
      void fetchFileContent(contextId, selectedPath);
    } else {
      fileContent = null;
    }
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
          ? 'bg-accent-emphasis text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("diff")}
      >
        Diff
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'commits'
          ? 'bg-accent-emphasis text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("commits")}
      >
        Commits
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'sessions'
          ? 'bg-accent-emphasis text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("sessions")}
      >
        Sessions
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'queue'
          ? 'bg-accent-emphasis text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("queue")}
      >
        Queue
      </button>
      <span class="w-px h-5 bg-border-default"></span>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'github-ops'
          ? 'bg-accent-emphasis text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("github-ops")}
      >
        GitHub Ops
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'worktree'
          ? 'bg-accent-emphasis text-white'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}"
        onclick={() => navigateToScreen("worktree")}
      >
        Worktree
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded transition-colors
               {currentScreen === 'tools'
          ? 'bg-accent-emphasis text-white'
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
            ? 'bg-accent-emphasis text-white border-accent-emphasis'
            : 'hover:bg-bg-tertiary'}"
          onclick={() => setViewMode("side-by-side")}
        >
          Side by Side
        </button>
        <button
          type="button"
          class="px-3 py-1 text-sm border border-border-default rounded transition-colors
                 {viewMode === 'inline'
            ? 'bg-accent-emphasis text-white border-accent-emphasis'
            : 'hover:bg-bg-tertiary'}"
          onclick={() => setViewMode("inline")}
        >
          Inline
        </button>
        <button
          type="button"
          class="px-3 py-1 text-sm border border-border-default rounded transition-colors
                 {viewMode === 'current-state'
            ? 'bg-accent-emphasis text-white border-accent-emphasis'
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
    class="flex items-center bg-bg-secondary border-b border-border-default px-2 overflow-x-auto"
  >
    {#if projectPath}
      <div
        class="py-2 px-4 text-sm border-b-2 border-accent-emphasis text-text-primary"
      >
        {projectPath}
      </div>
    {/if}
    <div class="ml-auto py-1 px-2">
      {#if contextId !== null}
        <GitPushButton {contextId} {projectPath} />
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
            class="w-64 border-r border-border-default bg-bg-secondary overflow-auto"
          >
            {#if loading}
              <div class="p-4 text-sm text-text-secondary">Loading files...</div>
            {:else if error !== null}
              <div class="p-4 text-sm text-danger-fg">{error}</div>
            {:else if allFilesLoading && fileTreeMode === "all"}
              <div class="p-4 text-sm text-text-secondary">Loading all files...</div>
            {:else if fileTree.children !== undefined && fileTree.children.length > 0}
              <FileTree
                tree={fileTree}
                mode={fileTreeMode}
                {selectedPath}
                onFileSelect={handleFileSelect}
                changedCount={diffFiles.length}
                onModeChange={(mode) => {
                  fileTreeMode = mode;
                  if (mode === "all" && contextId !== null) {
                    void fetchAllFiles(contextId);
                  }
                }}
              />
            {:else}
              <div class="p-4 text-sm text-text-secondary">
                {fileTreeMode === "diff" ? "No changed files found" : "No files found"}
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
          <div class="p-8 text-center text-danger-fg">{error}</div>
        {:else if selectedFile !== null && viewMode !== "current-state"}
          <div class="p-4">
            <DiffView
              file={selectedFile}
              mode={viewMode === "side-by-side" ? "side-by-side" : "inline"}
              onCommentSubmit={handleInlineCommentSubmit}
            />
          </div>
        {:else if fileContentLoading}
          <div class="p-8 text-center text-text-secondary">Loading file...</div>
        {:else if fileContent !== null}
          <FileViewer
            path={fileContent.path}
            content={fileContent.content}
            language={fileContent.language}
            onCommentSubmit={handleInlineCommentSubmit}
          />
        {:else if viewMode === "current-state"}
          <div class="p-8 text-center text-text-secondary">
            Current state view is under development
          </div>
        {:else}
          <div class="p-8 text-center text-text-secondary">
            Select a file to view
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
    {:else if currentScreen === "github-ops"}
      <!-- GitHub Operations Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <GitHubOpsScreen
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
    <span class="text-success-fg">+{stats.additions}</span>
    <span class="text-danger-fg">-{stats.deletions}</span>
    {#if contextId !== null}
      <span class="ml-auto text-text-tertiary">ctx: {contextId}</span>
    {/if}
  </footer>
</div>
