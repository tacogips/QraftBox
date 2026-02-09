<script lang="ts">
  import type { DiffFile, ViewMode } from "./types/diff";
  import type { FileNode } from "./stores/files";
  import type { QueueStatus, FileReference } from "../../src/types/ai";
  import DiffView from "../components/DiffView.svelte";
  import FileViewer from "../components/FileViewer.svelte";
  import FileTree from "../components/FileTree.svelte";
  import AIPromptPanel from "../components/AIPromptPanel.svelte";
  import UnifiedSessionsScreen from "../components/sessions/UnifiedSessionsScreen.svelte";
  import CommitsScreen from "../components/commits/CommitsScreen.svelte";
  import GitPushButton from "../components/git-actions/GitPushButton.svelte";
  import HeaderStatusBadges from "../components/HeaderStatusBadges.svelte";
  import WorktreeScreen from "../components/worktree/WorktreeScreen.svelte";
  import ToolsScreen from "../components/tools/ToolsScreen.svelte";
  import SystemInfoScreen from "../components/system-info/SystemInfoScreen.svelte";
  import CurrentStateView from "../components/CurrentStateView.svelte";

  /**
   * Screen type for navigation
   */
  type ScreenType =
    | "diff"
    | "commits"
    | "sessions"
    | "worktree"
    | "tools"
    | "system-info";

  /**
   * Valid screens for hash validation
   */
  const VALID_SCREENS: ReadonlySet<string> = new Set([
    "diff",
    "commits",
    "sessions",
    "worktree",
    "tools",
    "system-info",
  ]);

  /**
   * Parse the URL hash into a ScreenType, defaulting to "diff" for invalid hashes
   */
  function screenFromHash(): ScreenType {
    const hash = window.location.hash.replace(/^#\/?/, "");
    return VALID_SCREENS.has(hash) ? (hash as ScreenType) : "diff";
  }

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
  let currentScreen = $state<ScreenType>(screenFromHash());
  let headerMenuOpen = $state(false);
  let pathCopied = $state(false);

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
   * Navigate to a specific screen and update URL hash
   */
  function navigateToScreen(screen: ScreenType): void {
    currentScreen = screen;
    const newHash = `#/${screen}`;
    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
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
      projectPath: projectPath,
    };
    try {
      const resp = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        console.error("AI prompt error:", resp.status);
      } else if (immediate) {
        const data = (await resp.json()) as { prompt: { id: string } };
        await fetch(`/api/prompts/${data.prompt.id}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ immediate: true }),
        });
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
      projectPath: projectPath,
    };
    try {
      const resp = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        console.error("AI prompt error:", resp.status);
      } else if (immediate) {
        const data = (await resp.json()) as { prompt: { id: string } };
        await fetch(`/api/prompts/${data.prompt.id}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ immediate: true }),
        });
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
    const screen = screenFromHash();
    if (screen !== currentScreen) {
      currentScreen = screen;
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
          // Debounce refetch: wait 500ms after last event
          if (refetchTimer !== null) clearTimeout(refetchTimer);
          refetchTimer = setTimeout(() => {
            if (contextId !== null) {
              void fetchDiff(contextId);
            }
            refetchTimer = null;
          }, 500);
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

    // Set initial hash if empty
    if (
      !window.location.hash ||
      window.location.hash === "#" ||
      window.location.hash === "#/"
    ) {
      window.location.hash = `#/${currentScreen}`;
    }

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("hashchange", handleHashChange);
      disconnectWebSocket();
    };
  });

  // Fetch file content when selecting a non-diff file OR when full-file mode is active
  $effect(() => {
    if (selectedPath !== null && contextId !== null) {
      if (viewMode === "full-file") {
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

    <!-- Navigation (GitHub UnderlineNav style) -->
    <nav class="flex items-center gap-0 ml-4 h-full">
      <button
        type="button"
        class="px-3 py-1.5 text-sm transition-colors h-full border-b-2
               {currentScreen === 'worktree'
          ? 'text-text-primary font-semibold border-accent-emphasis'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
        onclick={() => navigateToScreen("worktree")}
      >
        Worktree
      </button>
    </nav>

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
  {#if headerMenuOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- Backdrop to close menu -->
    <div
      class="fixed inset-0 z-40"
      onclick={() => (headerMenuOpen = false)}
      onkeydown={() => {}}
      role="presentation"
    ></div>
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
    {#if contextId !== null}
      <HeaderStatusBadges {contextId} />
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
        Changes
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
    </nav>

    <!-- Git push button -->
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
              <div class="p-4 text-sm text-text-secondary">
                Loading files...
              </div>
            {:else if error !== null}
              <div class="p-4 text-sm text-danger-fg">{error}</div>
            {:else if allFilesLoading && fileTreeMode === "all"}
              <div class="p-4 text-sm text-text-secondary">
                Loading all files...
              </div>
            {:else if fileTree.children !== undefined && fileTree.children.length > 0}
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
              />
            {:else}
              <div class="p-4 text-sm text-text-secondary">
                {fileTreeMode === "diff"
                  ? "No changed files found"
                  : "No files found"}
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
          <span class="text-xs leading-none"
            >{sidebarCollapsed ? "\u25B6" : "\u25C0"}</span
          >
        </button>
      </div>

      <!-- Content / Diff View + AI Panel -->
      <div class="flex flex-col flex-1 min-w-0">
        <main class="flex-1 overflow-auto bg-bg-primary">
          {#if loading}
            <div class="p-8 text-center text-text-secondary">
              Loading diff...
            </div>
          {:else if error !== null}
            <div class="p-8 text-center text-danger-fg">{error}</div>
          {:else if selectedFile !== null && viewMode === "current-state"}
            <!-- Current State View -->
            <div class="p-4">
              <CurrentStateView file={selectedFile} />
            </div>
          {:else if selectedFile !== null && (viewMode === "side-by-side" || viewMode === "inline")}
            <!-- Diff View (side-by-side or inline) -->
            <div class="p-4">
              <DiffView
                file={selectedFile}
                mode={viewMode === "side-by-side" ? "side-by-side" : "inline"}
                onCommentSubmit={handleInlineCommentSubmit}
              />
            </div>
          {:else if viewMode === "full-file" && fileContentLoading}
            <div class="p-8 text-center text-text-secondary">
              Loading file...
            </div>
          {:else if viewMode === "full-file" && fileContent !== null}
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
            <!-- Side by Side icon: two vertical columns -->
            <button
              type="button"
              class="p-1 transition-colors
                     {viewMode === 'side-by-side'
                ? 'bg-bg-emphasis text-text-on-emphasis'
                : 'text-text-secondary hover:bg-bg-hover'}"
              onclick={() => setViewMode("side-by-side")}
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
                     {viewMode === 'inline'
                ? 'bg-bg-emphasis text-text-on-emphasis'
                : 'text-text-secondary hover:bg-bg-hover'}"
              onclick={() => setViewMode("inline")}
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
                     {viewMode === 'current-state'
                ? 'bg-bg-emphasis text-text-on-emphasis'
                : 'text-text-secondary hover:bg-bg-hover'}"
              onclick={() => setViewMode("current-state")}
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
            <!-- Full File icon: document with lines -->
            <button
              type="button"
              class="p-1 border-l border-border-default transition-colors
                     {viewMode === 'full-file'
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
          </div>
        </div>

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
        />
      </div>
    {:else if currentScreen === "sessions"}
      <!-- Unified Sessions Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <UnifiedSessionsScreen {contextId} {projectPath} />
        {/if}
      </main>
    {:else if currentScreen === "commits"}
      <!-- Commits Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <CommitsScreen {contextId} />
        {/if}
      </main>
    {:else if currentScreen === "worktree"}
      <!-- Worktree Screen -->
      <main class="flex-1 overflow-hidden">
        {#if contextId !== null}
          <WorktreeScreen {contextId} />
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
</div>
