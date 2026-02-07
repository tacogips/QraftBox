<script lang="ts">
  import type { DiffFile, ViewMode } from "./types/diff";
  import type { FileNode } from "./stores/files";
  import DiffView from "../components/DiffView.svelte";
  import FileTree from "../components/FileTree.svelte";

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

  /**
   * Currently selected diff file
   */
  const selectedFile = $derived(
    selectedPath !== null
      ? diffFiles.find((f) => f.path === selectedPath) ?? null
      : diffFiles[0] ?? null,
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

    <div class="flex items-center gap-2 ml-auto">
      <!-- View Mode Toggle -->
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

      <!-- Sidebar Toggle -->
      <button
        type="button"
        class="px-3 py-1 text-sm border border-border-default rounded hover:bg-bg-tertiary"
        onclick={toggleSidebar}
        aria-label={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
      >
        {sidebarCollapsed ? "Show" : "Hide"} Sidebar
      </button>
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
    <!-- Sidebar / File Tree -->
    {#if !sidebarCollapsed}
      <aside
        class="w-64 border-r border-border-default bg-bg-secondary overflow-auto shrink-0"
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
  </div>

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
