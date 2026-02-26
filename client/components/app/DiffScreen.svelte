<script lang="ts">
  import type { DiffFile, ViewMode } from "../../src/types/diff";
  import type { FileNode } from "../../src/stores/files";
  import type { AISessionSubmitResult } from "../../../src/types/ai";
  import { buildScreenHash, parseHash } from "../../src/lib/app-routing";
  import { buildRawFileUrl } from "../../src/lib/app-api";
  import type { AIPromptContext } from "../../src/lib/ai-feature-runtime";
  import DiffView from "../DiffView.svelte";
  import FileViewer from "../FileViewer.svelte";
  import FileTree from "../FileTree.svelte";
  import CurrentStateView from "../CurrentStateView.svelte";
  import GitPushButton from "../git-actions/GitPushButton.svelte";

  let mobileBottomDockRef: HTMLDivElement | null = $state(null);
  let mobileBottomDockHeight = $state(0);
  let mobileViewportBottomOffset = $state(0);
  let mobileSafariFallbackOffset = $state(0);
  let isIphone = $state(false);
  let isPhoneViewport = $state(false);
  let latestSubmittedSessionId = $state<string | null>(null);

  const SESSION_QUERY_KEY = "ai_session_id";

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

  function buildSessionHistoryHref(sessionId: string): string {
    const { slug } = parseHash(window.location.hash);
    const url = new URL(window.location.href);
    url.searchParams.set(SESSION_QUERY_KEY, sessionId);
    url.hash = buildScreenHash(slug, "ai-session");
    return `${url.pathname}${url.search}${url.hash}`;
  }

  const latestSessionHistoryHref = $derived.by(() => {
    if (latestSubmittedSessionId === null) {
      return null;
    }
    return buildSessionHistoryHref(latestSubmittedSessionId);
  });

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
      return;
    }

    const vv = window.visualViewport;

    const computeBottomOffset = (): void => {
      const occludedBottom =
        vv === undefined
          ? 0
          : Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      const keyboardOpen =
        vv !== undefined && vv.height < window.innerHeight * 0.8;

      // Keep the dock anchored to the screen bottom during normal browsing.
      // Only lift it when the software keyboard actually occludes the viewport.
      mobileViewportBottomOffset = keyboardOpen
        ? Math.round(occludedBottom)
        : 0;

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

  type FileContent = {
    path: string;
    content: string;
    language: string;
    isBinary?: boolean;
    isImage?: boolean;
    mimeType?: string;
  };

  let {
    loading,
    error,
    sidebarCollapsed,
    sidebarWidth,
    allFilesLoading,
    projectPath,
    fileTree,
    fileTreeMode,
    selectedPath,
    diffFiles,
    contextId,
    isGitRepo,
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
    currentQraftAiSessionId,
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
    onReloadFileTree,
    onGitActionSuccess,
  }: {
    loading: boolean;
    error: string | null;
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    allFilesLoading: boolean;
    projectPath: string;
    fileTree: FileNode;
    fileTreeMode: "diff" | "all";
    selectedPath: string | null;
    diffFiles: DiffFile[];
    contextId: string | null;
    isGitRepo: boolean;
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
    currentQraftAiSessionId: string;
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
    ) => Promise<AISessionSubmitResult | null>;
    onReloadFileTree: () => void;
    onGitActionSuccess: (
      action: "commit" | "push" | "pull" | "pr" | "init",
    ) => Promise<void>;
  } = $props();

  function handleInlineCommentSubmit(
    startLine: number,
    endLine: number,
    _side: "old" | "new",
    filePath: string,
    prompt: string,
    immediate: boolean,
  ): void {
    void onSubmitPrompt(prompt, immediate, {
      primaryFile: { path: filePath, startLine, endLine, content: "" },
      references: [],
      diffSummary: undefined,
      resumeSessionId: currentQraftAiSessionId,
    }).then((result) => {
      latestSubmittedSessionId = result?.sessionId ?? currentQraftAiSessionId;
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
            currentDirectory={projectPath}
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
             {isPhoneViewport
        ? sidebarCollapsed
          ? '-left-0.5'
          : '-right-6'
        : '-right-4'}
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
    class="flex flex-col flex-1 min-w-0 min-h-0 transition-transform duration-200 ease-out"
    style:transform={isPhoneViewport && !sidebarCollapsed
      ? `translateX(${sidebarWidth}px)`
      : undefined}
  >
    {#if contextId !== null}
      <div
        class="h-10 border-b border-border-default bg-bg-secondary px-2 flex items-center justify-end"
      >
        <GitPushButton
          {contextId}
          {projectPath}
          hasChanges={diffFiles.length > 0}
          onSuccess={onGitActionSuccess}
          {isGitRepo}
        />
      </div>
    {/if}

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
            viewMode={effectiveViewMode}
            {selectedHasDiff}
            {isIphone}
            {onSetViewMode}
            onCommentSubmit={handleInlineCommentSubmit}
            submittedSessionId={latestSubmittedSessionId}
            submittedSessionHistoryHref={latestSessionHistoryHref}
            onDismissSubmittedSession={() => {
              latestSubmittedSessionId = null;
            }}
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
            viewMode={effectiveViewMode}
            {selectedHasDiff}
            {isIphone}
            {onSetViewMode}
            onCommentSubmit={handleInlineCommentSubmit}
            submittedSessionId={latestSubmittedSessionId}
            submittedSessionHistoryHref={latestSessionHistoryHref}
            onDismissSubmittedSession={() => {
              latestSubmittedSessionId = null;
            }}
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
          viewMode={effectiveViewMode}
          {selectedHasDiff}
          {isIphone}
          {onSetViewMode}
          onNavigatePrev={navigatePrev}
          onNavigateNext={navigateNext}
          onCommentSubmit={handleInlineCommentSubmit}
          submittedSessionId={latestSubmittedSessionId}
          submittedSessionHistoryHref={latestSessionHistoryHref}
          onDismissSubmittedSession={() => {
            latestSubmittedSessionId = null;
          }}
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
          viewMode={effectiveViewMode}
          {selectedHasDiff}
          {isIphone}
          {onSetViewMode}
          onNavigatePrev={navigatePrev}
          onNavigateNext={navigateNext}
          onCommentSubmit={handleInlineCommentSubmit}
          submittedSessionId={latestSubmittedSessionId}
          submittedSessionHistoryHref={latestSessionHistoryHref}
          onDismissSubmittedSession={() => {
            latestSubmittedSessionId = null;
          }}
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
        ? `${mobileViewportBottomOffset}px`
        : undefined}
      style:max-height={isPhoneViewport ? "70dvh" : undefined}
      style:padding-bottom={isPhoneViewport
        ? `calc(env(safe-area-inset-bottom, 0px) + ${mobileSafariFallbackOffset}px)`
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
      </div>
    </div>
  </div>
</div>
