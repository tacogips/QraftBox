<script lang="ts">
  import type { DiffFile, ViewMode } from "../../src/types/diff";
  import type { FileNode } from "../../src/stores/files";
  import type { QueueStatus, AISession } from "../../../src/types/ai";
  import type { PromptQueueItem } from "../../src/lib/app-api";
  import type { AIPromptContext } from "../../src/lib/ai-feature-runtime";
  import DiffView from "../DiffView.svelte";
  import FileViewer from "../FileViewer.svelte";
  import FileTree from "../FileTree.svelte";
  import AIPromptPanel from "../AIPromptPanel.svelte";
  import CurrentSessionPanel from "../CurrentSessionPanel.svelte";
  import CurrentStateView from "../CurrentStateView.svelte";

  // AI panel resize constants
  const AI_PANEL_HEIGHT_KEY = "qraftbox-ai-panel-height";
  const AI_PANEL_MIN_HEIGHT = 120;
  const AI_PANEL_DEFAULT_HEIGHT = 256;
  // Minimum space reserved for file viewer + stats bar + drag handle
  const FILE_VIEWER_MIN_HEIGHT = 48;

  function loadAiPanelHeight(): number {
    try {
      const stored = localStorage.getItem(AI_PANEL_HEIGHT_KEY);
      if (stored !== null) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= AI_PANEL_MIN_HEIGHT) {
          return val;
        }
      }
    } catch {
      // ignore
    }
    return AI_PANEL_DEFAULT_HEIGHT;
  }

  let aiPanelHeight = $state(loadAiPanelHeight());
  let contentColumnRef: HTMLDivElement | null = $state(null);

  function handleResizeMouseDown(event: MouseEvent): void {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = aiPanelHeight;
    // Compute max from actual container height at drag start
    const containerHeight = contentColumnRef?.clientHeight ?? 800;
    const maxHeight = containerHeight - FILE_VIEWER_MIN_HEIGHT;

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    function onMouseMove(e: MouseEvent): void {
      const deltaY = startY - e.clientY;
      aiPanelHeight = Math.min(
        maxHeight,
        Math.max(AI_PANEL_MIN_HEIGHT, startHeight + deltaY),
      );
    }

    function onMouseUp(): void {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(AI_PANEL_HEIGHT_KEY, String(aiPanelHeight));
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  type FileContent = {
    path: string;
    content: string;
    language: string;
    isBinary?: boolean;
    isImage?: boolean;
    mimeType?: string;
  };

  let {
    activeTabIsGitRepo,
    loading,
    error,
    sidebarCollapsed,
    sidebarWidth,
    allFilesLoading,
    fileTree,
    fileTreeMode,
    selectedPath,
    diffFiles,
    contextId,
    selectedFile,
    effectiveViewMode,
    selectedHasDiff,
    fileContentLoading,
    fileContent,
    stats,
    navigatePrev,
    navigateNext,
    canNarrow,
    canWiden,
    aiPanelCollapsed,
    queueStatus,
    changedFilePaths,
    projectPath,
    runningSessions,
    queuedSessions,
    recentlyCompletedSessions,
    pendingPrompts,
    resumeDisplaySessionId,
    currentQraftAiSessionId,
    showIgnored,
    onToggleSidebar,
    onFileSelect,
    onFileTreeModeChange,
    onShowIgnoredChange,
    onDirectoryExpand,
    onLoadFullTree,
    onNarrowSidebar,
    onWidenSidebar,
    onSetViewMode,
    onSubmitPrompt,
    onNewSession,
    onResumeCliSession,
    onCancelActiveSession,
    onCancelQueuedPrompt,
    onToggleAiPanel,
  }: {
    activeTabIsGitRepo: boolean;
    loading: boolean;
    error: string | null;
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    allFilesLoading: boolean;
    fileTree: FileNode;
    fileTreeMode: "diff" | "all";
    selectedPath: string | null;
    diffFiles: DiffFile[];
    contextId: string | null;
    selectedFile: DiffFile | null;
    effectiveViewMode: ViewMode;
    selectedHasDiff: boolean;
    fileContentLoading: boolean;
    fileContent: FileContent | null;
    stats: {
      totalFiles: number;
      additions: number;
      deletions: number;
    };
    navigatePrev: (() => void) | undefined;
    navigateNext: (() => void) | undefined;
    canNarrow: boolean;
    canWiden: boolean;
    aiPanelCollapsed: boolean;
    queueStatus: QueueStatus;
    changedFilePaths: string[];
    projectPath: string;
    runningSessions: AISession[];
    queuedSessions: AISession[];
    recentlyCompletedSessions: AISession[];
    pendingPrompts: PromptQueueItem[];
    resumeDisplaySessionId: string | null;
    currentQraftAiSessionId: string;
    showIgnored: boolean;
    onToggleSidebar: () => void;
    onFileSelect: (path: string) => void;
    onFileTreeModeChange: (mode: "diff" | "all") => void;
    onShowIgnoredChange: (value: boolean) => void;
    onDirectoryExpand: (dirPath: string) => Promise<void>;
    onLoadFullTree: () => Promise<FileNode | undefined>;
    onNarrowSidebar: () => void;
    onWidenSidebar: () => void;
    onSetViewMode: (mode: ViewMode) => void;
    onSubmitPrompt: (
      message: string,
      immediate: boolean,
      context: AIPromptContext,
    ) => Promise<void>;
    onNewSession: () => void;
    onResumeCliSession: (resumeQraftId: string) => void;
    onCancelActiveSession: (sessionId: string) => Promise<void>;
    onCancelQueuedPrompt: (promptId: string) => Promise<void>;
    onToggleAiPanel: () => void;
  } = $props();

  let sessionExpandTrigger = $state(0);

  function handleInlineCommentSubmit(
    startLine: number,
    endLine: number,
    _side: "old" | "new",
    filePath: string,
    prompt: string,
    immediate: boolean,
  ): void {
    sessionExpandTrigger++;
    void onSubmitPrompt(prompt, immediate, {
      primaryFile: { path: filePath, startLine, endLine, content: "" },
      references: [],
      diffSummary: undefined,
      // resumeSessionId omitted: inline prompts create a new session
    });
  }
</script>

<div class="flex flex-1 min-h-0 overflow-hidden">
  <div class="relative flex shrink-0">
    {#if !sidebarCollapsed}
      <aside
        class="border-r border-border-default bg-bg-secondary overflow-auto"
        style:width="{sidebarWidth}px"
      >
        {#if !activeTabIsGitRepo}
          <div class="p-4 text-sm text-text-tertiary">Not a git repository</div>
        {:else if loading}
          <div class="p-4 text-sm text-text-secondary">Loading files...</div>
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
            {onFileSelect}
            changedCount={diffFiles.length}
            {contextId}
            {showIgnored}
            onModeChange={onFileTreeModeChange}
            {onShowIgnoredChange}
            {onDirectoryExpand}
            {onLoadFullTree}
            onNarrow={onNarrowSidebar}
            onWiden={onWidenSidebar}
            {canNarrow}
            {canWiden}
          />
        {/if}
      </aside>
    {/if}

    <button
      type="button"
      class="absolute top-3 -right-5 z-20 w-5 h-10 flex items-center justify-center
             bg-bg-secondary border border-l-0 border-border-default
             rounded-r text-text-secondary hover:text-text-primary hover:bg-bg-tertiary
             transition-colors cursor-pointer"
      onclick={onToggleSidebar}
      aria-label={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
      title={sidebarCollapsed ? "Show Sidebar (b)" : "Hide Sidebar (b)"}
    >
      <span class="text-xs leading-none"
        >{sidebarCollapsed ? "\u25B6" : "\u25C0"}</span
      >
    </button>
  </div>

  <div
    bind:this={contentColumnRef}
    class="flex flex-col flex-1 min-w-0 min-h-0"
  >
    <main class="flex-1 min-h-0 overflow-auto bg-bg-primary">
      {#if !activeTabIsGitRepo}
        <div
          class="flex flex-col items-center justify-center h-full text-text-tertiary gap-2"
        >
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
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
        <div class="p-8 text-center text-text-secondary">Loading diff...</div>
      {:else if error !== null}
        <div class="p-8 text-center text-danger-fg">{error}</div>
      {:else if selectedFile !== null && effectiveViewMode === "current-state"}
        <div class="px-2 pb-2">
          <CurrentStateView
            file={selectedFile}
            onCommentSubmit={handleInlineCommentSubmit}
            onNavigatePrev={navigatePrev}
            onNavigateNext={navigateNext}
          />
        </div>
      {:else if selectedFile !== null && (effectiveViewMode === "side-by-side" || effectiveViewMode === "inline")}
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
        <div class="p-8 text-center text-text-secondary">Loading file...</div>
      {:else if effectiveViewMode === "full-file" && fileContent !== null}
        <FileViewer
          path={fileContent.path}
          content={fileContent.content}
          language={fileContent.language}
          isBinary={fileContent.isBinary}
          isImage={fileContent.isImage}
          mimeType={fileContent.mimeType}
          onCommentSubmit={handleInlineCommentSubmit}
        />
      {:else if fileContentLoading}
        <div class="p-8 text-center text-text-secondary">Loading file...</div>
      {:else if fileContent !== null}
        <FileViewer
          path={fileContent.path}
          content={fileContent.content}
          language={fileContent.language}
          isBinary={fileContent.isBinary}
          isImage={fileContent.isImage}
          mimeType={fileContent.mimeType}
          onCommentSubmit={handleInlineCommentSubmit}
        />
      {:else}
        <div class="p-8 text-center text-text-secondary">
          Select a file to view
        </div>
      {/if}
    </main>

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
        <button
          type="button"
          class="p-1 transition-colors
                 {effectiveViewMode === 'full-file'
            ? 'bg-bg-emphasis text-text-on-emphasis'
            : 'text-text-secondary hover:bg-bg-hover'}"
          onclick={() => onSetViewMode("full-file")}
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

        <button
          type="button"
          class="p-1 border-l border-border-default transition-colors
                 {!selectedHasDiff
            ? 'text-text-disabled cursor-not-allowed opacity-40'
            : effectiveViewMode === 'side-by-side'
              ? 'bg-bg-emphasis text-text-on-emphasis'
              : 'text-text-secondary hover:bg-bg-hover'}"
          onclick={() => {
            if (selectedHasDiff) onSetViewMode("side-by-side");
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

        <button
          type="button"
          class="p-1 border-l border-border-default transition-colors
                 {!selectedHasDiff
            ? 'text-text-disabled cursor-not-allowed opacity-40'
            : effectiveViewMode === 'inline'
              ? 'bg-bg-emphasis text-text-on-emphasis'
              : 'text-text-secondary hover:bg-bg-hover'}"
          onclick={() => {
            if (selectedHasDiff) onSetViewMode("inline");
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

        <button
          type="button"
          class="p-1 border-l border-border-default transition-colors
                 {!selectedHasDiff
            ? 'text-text-disabled cursor-not-allowed opacity-40'
            : effectiveViewMode === 'current-state'
              ? 'bg-bg-emphasis text-text-on-emphasis'
              : 'text-text-secondary hover:bg-bg-hover'}"
          onclick={() => {
            if (selectedHasDiff) onSetViewMode("current-state");
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

    <!-- Drag handle to resize AI panel (above CurrentSessionPanel) -->
    <div
      class="shrink-0 h-1.5 cursor-row-resize flex items-center justify-center
             group hover:bg-accent-muted/40 transition-colors"
      onmousedown={handleResizeMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize AI panel"
    >
      <div
        class="w-8 h-0.5 rounded-full bg-border-default group-hover:bg-accent-emphasis transition-colors"
      ></div>
    </div>

    <div
      class="shrink-0 flex flex-col min-h-0 overflow-hidden"
      style:height="{aiPanelHeight}px"
    >
      <CurrentSessionPanel
        {contextId}
        currentClientSessionId={currentQraftAiSessionId}
        running={runningSessions}
        queued={queuedSessions}
        recentlyCompleted={recentlyCompletedSessions}
        {pendingPrompts}
        resumeSessionId={resumeDisplaySessionId}
        onCancelSession={onCancelActiveSession}
        {onCancelQueuedPrompt}
        onResumeSession={onResumeCliSession}
        {onNewSession}
        expandTrigger={sessionExpandTrigger}
      />

      <AIPromptPanel
        {contextId}
        {projectPath}
        collapsed={aiPanelCollapsed}
        {queueStatus}
        changedFiles={changedFilePaths}
        allFiles={changedFilePaths}
        onSubmit={(prompt, immediate, refs) => {
          sessionExpandTrigger++;
          void onSubmitPrompt(prompt, immediate, {
            primaryFile: undefined,
            references: refs,
            diffSummary: undefined,
            // TODO: pass resumeSessionId to continue current session
          });
        }}
        onToggle={onToggleAiPanel}
        {onNewSession}
        onResumeSession={onResumeCliSession}
      />
    </div>
  </div>
</div>
