<script lang="ts">
  import type { DiffFile, ViewMode } from "../../src/types/diff";
  import type { FileNode } from "../../src/stores/files";
  import type { QueueStatus, AISession } from "../../../src/types/ai";
  import type { ModelProfile } from "../../../src/types/model-config";
  import {
    buildRawFileUrl,
    fetchModelConfigState,
    type PromptQueueItem,
  } from "../../src/lib/app-api";
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
  const AI_PANEL_DEFAULT_HEIGHT = 400;
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
  let mobileBottomDockRef: HTMLDivElement | null = $state(null);
  let mobileBottomDockHeight = $state(0);
  let mobileViewportBottomOffset = $state(0);
  let mobileSafariFallbackOffset = $state(0);
  let mobileDockTop = $state<number | null>(null);
  let isIphone = $state(false);
  let isPhoneViewport = $state(false);

  function detectIphone(): boolean {
    const ua = navigator.userAgent;
    const isIphoneUa =
      /iPhone|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) &&
        "maxTouchPoints" in navigator &&
        navigator.maxTouchPoints > 1);
    return isIphoneUa && window.innerWidth <= 430;
  }

  function detectPhoneViewport(): boolean {
    return window.innerWidth <= 480;
  }

  function detectMobileDevice(): boolean {
    const ua = navigator.userAgent;
    return /iPhone|iPod|Android/i.test(ua);
  }

  function detectIphoneSafari(): boolean {
    const ua = navigator.userAgent;
    const isSafari =
      /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    return detectIphone() && isSafari;
  }

  $effect(() => {
    const update = (): void => {
      isIphone = detectIphone();
      isPhoneViewport = detectPhoneViewport();
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  });

  $effect(() => {
    if (isIphone && selectedHasDiff && effectiveViewMode === "side-by-side") {
      onSetViewMode("inline");
    }
  });

  $effect(() => {
    if (!isPhoneViewport || mobileBottomDockRef === null) {
      mobileBottomDockHeight = 0;
      return;
    }

    const updateHeight = (): void => {
      mobileBottomDockHeight = mobileBottomDockRef?.offsetHeight ?? 0;
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(mobileBottomDockRef);
    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
    };
  });

  $effect(() => {
    if (!isPhoneViewport) {
      mobileViewportBottomOffset = 0;
      mobileSafariFallbackOffset = 0;
      mobileDockTop = null;
      return;
    }

    const vv = window.visualViewport;

    const computeBottomOffset = (): void => {
      const occludedBottom =
        vv === undefined
          ? 0
          : Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      mobileViewportBottomOffset = Math.round(occludedBottom);

      const dockHeight =
        mobileBottomDockRef?.offsetHeight ?? mobileBottomDockHeight;
      const keyboardOpen =
        vv !== undefined && vv.height < window.innerHeight * 0.8;

      if (isIphone && vv !== undefined && !keyboardOpen) {
        const nextTop = Math.max(0, vv.offsetTop + vv.height - dockHeight);
        mobileDockTop = Math.round(nextTop);
      } else {
        mobileDockTop = null;
      }

      if (!detectMobileDevice() || !detectIphoneSafari()) {
        mobileSafariFallbackOffset = 0;
        return;
      }

      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari standalone mode.
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

      // Avoid forcing offset while keyboard is open.
      if (isStandalone || keyboardOpen) {
        mobileSafariFallbackOffset = 0;
        return;
      }

      // Safari can still overlay bottom toolbar without reporting viewport occlusion.
      // Keep the dock above that UI with a fixed fallback.
      mobileSafariFallbackOffset = occludedBottom > 0 ? 0 : 52;
    };

    computeBottomOffset();
    window.addEventListener("resize", computeBottomOffset);
    window.addEventListener("orientationchange", computeBottomOffset);
    vv?.addEventListener("resize", computeBottomOffset);
    vv?.addEventListener("scroll", computeBottomOffset);

    return () => {
      window.removeEventListener("resize", computeBottomOffset);
      window.removeEventListener("orientationchange", computeBottomOffset);
      vv?.removeEventListener("resize", computeBottomOffset);
      vv?.removeEventListener("scroll", computeBottomOffset);
    };
  });

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
    queueStatus,
    changedFilePaths,
    projectPath,
    runningSessions,
    queuedSessions,
    recentlyCompletedSessions,
    pendingPrompts,
    resumeDisplaySessionId,
    currentQraftAiSessionId,
    isFirstMessage,
    showIgnored,
    onToggleSidebar,
    onFileSelect,
    onFileTreeModeChange,
    onShowIgnoredChange,
    showAllFiles,
    onShowAllFilesChange,
    onDirectoryExpand,
    onLoadFullTree,
    onCollapseSidebar,
    onNarrowSidebar,
    onWidenSidebar,
    onSetViewMode,
    onSubmitPrompt,
    onNewSession,
    onResumeCliSession,
    onCancelActiveSession,
    onCancelQueuedPrompt,
    onReloadFileTree,
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
    queueStatus: QueueStatus;
    changedFilePaths: string[];
    projectPath: string;
    runningSessions: AISession[];
    queuedSessions: AISession[];
    recentlyCompletedSessions: AISession[];
    pendingPrompts: PromptQueueItem[];
    resumeDisplaySessionId: string | null;
    currentQraftAiSessionId: string;
    isFirstMessage: boolean;
    showIgnored: boolean;
    showAllFiles: boolean;
    onToggleSidebar: () => void;
    onFileSelect: (path: string) => void;
    onFileTreeModeChange: (mode: "diff" | "all") => void;
    onShowIgnoredChange: (value: boolean) => void;
    onShowAllFilesChange: (value: boolean) => void;
    onDirectoryExpand: (dirPath: string) => Promise<void>;
    onLoadFullTree: () => Promise<FileNode | undefined>;
    onCollapseSidebar: () => void;
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
    onReloadFileTree: () => void;
  } = $props();

  let sessionExpandTrigger = $state(0);
  let aiModelProfiles = $state<ModelProfile[]>([]);
  let selectedAiModelProfileId = $state<string | undefined>(undefined);

  async function loadAiModelConfig(): Promise<void> {
    try {
      const state = await fetchModelConfigState();
      aiModelProfiles = [...state.profiles];
      selectedAiModelProfileId =
        state.operationBindings.aiDefaultProfileId ?? undefined;
    } catch {
      aiModelProfiles = [];
      selectedAiModelProfileId = undefined;
    }
  }

  $effect(() => {
    void loadAiModelConfig();
  });

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
      modelProfileId: selectedAiModelProfileId,
      // resumeSessionId omitted: inline prompts create a new session
    });
  }

  function handleTreeFileSelect(path: string): void {
    onFileSelect(path);
    if ((detectPhoneViewport() || detectMobileDevice()) && !sidebarCollapsed) {
      onCollapseSidebar();
    }
  }
</script>

<div class="relative flex flex-1 min-h-0 overflow-hidden">
  <div
    class="relative {isPhoneViewport
      ? 'absolute left-0 top-0 bottom-0 z-30'
      : 'flex shrink-0'}"
  >
    {#if !sidebarCollapsed}
      <aside
        class="h-full border-r border-border-default bg-bg-secondary overflow-auto"
        style:width="{sidebarWidth}px"
      >
        {#if loading}
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
            onFileSelect={handleTreeFileSelect}
            changedCount={diffFiles.length}
            {contextId}
            {showIgnored}
            {showAllFiles}
            onModeChange={onFileTreeModeChange}
            {onShowIgnoredChange}
            {onShowAllFilesChange}
            {onDirectoryExpand}
            {onLoadFullTree}
            onNarrow={onNarrowSidebar}
            onWiden={onWidenSidebar}
            {canNarrow}
            {canWiden}
            onReload={onReloadFileTree}
          />
        {/if}
      </aside>
    {/if}

    <button
      type="button"
      class="absolute top-12 z-20 flex items-center justify-center
             {isPhoneViewport ? 'w-6 h-10' : 'w-4 h-7'}
             {isPhoneViewport && sidebarCollapsed ? '-left-0.5' : '-right-4'}
             bg-bg-secondary border border-l-0 border-border-default
             rounded-r text-text-secondary hover:text-text-primary hover:bg-bg-tertiary
             transition-colors cursor-pointer"
      onclick={onToggleSidebar}
      aria-label={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
      title={sidebarCollapsed ? "Show Sidebar (b)" : "Hide Sidebar (b)"}
    >
      <span
        class="{isPhoneViewport ? 'text-[12px]' : 'text-[9px]'} leading-none"
        >{sidebarCollapsed ? "\u25B6" : "\u25C0"}</span
      >
    </button>
  </div>

  <div
    bind:this={contentColumnRef}
    class="flex flex-col flex-1 min-w-0 min-h-0 transition-transform duration-200 ease-out"
    style:transform={isPhoneViewport && !sidebarCollapsed
      ? `translateX(${sidebarWidth}px)`
      : undefined}
  >
    <main
      class="flex-1 min-h-0 overflow-auto bg-bg-primary"
      style:padding-bottom={isPhoneViewport
        ? `${mobileBottomDockHeight}px`
        : undefined}
    >
      {#if loading}
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
          isVideo={fileContent.isVideo}
          isPdf={fileContent.isPdf}
          mimeType={fileContent.mimeType}
          rawFileUrl={fileContent.ctxId !== undefined
            ? buildRawFileUrl(fileContent.ctxId, fileContent.path)
            : undefined}
          onNavigatePrev={navigatePrev}
          onNavigateNext={navigateNext}
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
          isVideo={fileContent.isVideo}
          isPdf={fileContent.isPdf}
          mimeType={fileContent.mimeType}
          rawFileUrl={fileContent.ctxId !== undefined
            ? buildRawFileUrl(fileContent.ctxId, fileContent.path)
            : undefined}
          onNavigatePrev={navigatePrev}
          onNavigateNext={navigateNext}
          onCommentSubmit={handleInlineCommentSubmit}
        />
      {:else}
        <div class="p-8 text-center text-text-secondary">
          Select a file to view
        </div>
      {/if}
    </main>

    <div
      bind:this={mobileBottomDockRef}
      class={isPhoneViewport
        ? "fixed left-0 right-0 bottom-0 z-40 bg-bg-secondary flex flex-col"
        : "shrink-0 flex flex-col min-h-0"}
      style:bottom={isPhoneViewport
        ? mobileDockTop !== null
          ? "auto"
          : `${mobileViewportBottomOffset + mobileSafariFallbackOffset}px`
        : undefined}
      style:top={isPhoneViewport && mobileDockTop !== null
        ? `${mobileDockTop}px`
        : undefined}
      style:max-height={isPhoneViewport ? "70dvh" : undefined}
      style:padding-bottom={isPhoneViewport
        ? "env(safe-area-inset-bottom, 0px)"
        : undefined}
    >
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

          {#if !isIphone}
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
          {/if}

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
            title={isIphone ? "Stack" : "Inline"}
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

      <!-- Drag handle to resize AI panel -->
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
        class="{isPhoneViewport
          ? 'flex-1'
          : 'shrink-0'} flex flex-col min-h-0 overflow-hidden"
        style:height={isPhoneViewport ? "auto" : `${aiPanelHeight}px`}
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
          expandTrigger={sessionExpandTrigger}
        />

        <AIPromptPanel
          {contextId}
          {projectPath}
          {queueStatus}
          {isFirstMessage}
          changedFiles={changedFilePaths}
          allFiles={changedFilePaths}
          modelProfiles={aiModelProfiles}
          selectedModelProfileId={selectedAiModelProfileId}
          onSelectModelProfile={(profileId) => {
            selectedAiModelProfileId = profileId;
          }}
          onSubmit={(prompt, immediate, refs, modelProfileId) => {
            sessionExpandTrigger++;
            void onSubmitPrompt(prompt, immediate, {
              primaryFile: undefined,
              references: refs,
              diffSummary: undefined,
              modelProfileId: modelProfileId ?? selectedAiModelProfileId,
            });
          }}
          {onNewSession}
          onResumeSession={onResumeCliSession}
        />
      </div>
    </div>
  </div>
</div>
