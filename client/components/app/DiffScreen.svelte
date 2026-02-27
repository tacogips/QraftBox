<script lang="ts">
  import type { DiffFile, ViewMode } from "../../src/types/diff";
  import type { FileNode } from "../../src/stores/files";
  import type { AISessionSubmitResult } from "../../../src/types/ai";
  import { buildScreenHash, parseHash } from "../../src/lib/app-routing";
  import {
    addQueuedAiCommentApi,
    buildRawFileUrl,
    clearQueuedAiCommentsApi,
    fetchModelConfigState,
    fetchQueuedAiCommentsApi,
    removeQueuedAiCommentApi,
    updateQueuedAiCommentApi,
    type QueuedAiComment,
  } from "../../src/lib/app-api";
  import type { AIPromptContext } from "../../src/lib/ai-feature-runtime";
  import type { ModelProfile } from "../../../src/types/model-config";
  import DiffView from "../DiffView.svelte";
  import FileViewer from "../FileViewer.svelte";
  import FileTree from "../FileTree.svelte";
  import CurrentStateView from "../CurrentStateView.svelte";
  import GitPushButton from "../git-actions/GitPushButton.svelte";

  let mobileBottomDockRef: HTMLDivElement | null = $state(null);
  let mainContentRef: HTMLElement | null = $state(null);
  let mobileBottomDockHeight = $state(0);
  let mobileViewportBottomOffset = $state(0);
  let mobileSafariFallbackOffset = $state(0);
  let isIphone = $state(false);
  let isPhoneViewport = $state(false);
  let latestSubmittedSessionId = $state<string | null>(null);
  let queuedComments = $state<QueuedAiComment[]>([]);
  let pendingJumpTarget = $state<{
    filePath: string;
    lineNumber: number;
  } | null>(null);
  let commentListExpanded = $state(true);
  let editingCommentId = $state<string | null>(null);
  let editingCommentPrompt = $state("");
  let aiModelProfiles = $state<ModelProfile[]>([]);
  let selectedAiModelProfileId = $state<string | undefined>(undefined);
  let modelConfigLoaded = $state(false);

  const SESSION_QUERY_KEY = "ai_session_id";
  const LINE_HIGHLIGHT_CLASS = "line-jump-highlight";

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

  function escapeAttributeValue(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }

  function clearLineJumpHighlight(): void {
    const root = mainContentRef ?? document;
    for (const el of root.querySelectorAll(`.${LINE_HIGHLIGHT_CLASS}`)) {
      el.classList.remove(LINE_HIGHLIGHT_CLASS);
    }
  }

  function scrollToLine(filePath: string, lineNumber: number): boolean {
    const escapedPath = escapeAttributeValue(filePath);
    const selector = `[data-file-path="${escapedPath}"][data-line-number="${lineNumber}"]`;
    const root = mainContentRef ?? document;
    const target = root.querySelector(selector);
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    clearLineJumpHighlight();
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add(LINE_HIGHLIGHT_CLASS);
    window.setTimeout(() => {
      target.classList.remove(LINE_HIGHLIGHT_CLASS);
    }, 1400);
    return true;
  }

  function lineRangeLabel(comment: QueuedAiComment): string {
    return comment.startLine === comment.endLine
      ? `L${comment.startLine}`
      : `L${comment.startLine}-L${comment.endLine}`;
  }

  async function queueComment(
    filePath: string,
    startLine: number,
    endLine: number,
    side: "old" | "new",
    source: "diff" | "current-state" | "full-file",
    prompt: string,
  ): Promise<void> {
    try {
      const saved = await addQueuedAiCommentApi({
        projectPath,
        filePath,
        startLine,
        endLine,
        side,
        source,
        prompt,
      });
      queuedComments = [...queuedComments, saved];
    } catch (error) {
      console.error("Failed to queue AI comment:", error);
    }
  }

  async function removeQueuedComment(commentId: string): Promise<void> {
    queuedComments = queuedComments.filter(
      (comment) => comment.id !== commentId,
    );
    if (editingCommentId === commentId) {
      cancelEditingComment();
    }
    try {
      await removeQueuedAiCommentApi(projectPath, commentId);
    } catch (error) {
      console.error("Failed to remove queued AI comment:", error);
      const reloaded = await fetchQueuedAiCommentsApi(projectPath);
      queuedComments = [...reloaded];
    }
  }

  async function clearQueuedComments(): Promise<void> {
    queuedComments = [];
    editingCommentId = null;
    editingCommentPrompt = "";
    try {
      await clearQueuedAiCommentsApi(projectPath);
    } catch (error) {
      console.error("Failed to clear queued AI comments:", error);
      const reloaded = await fetchQueuedAiCommentsApi(projectPath);
      queuedComments = [...reloaded];
    }
  }

  function jumpToQueuedComment(comment: QueuedAiComment): void {
    pendingJumpTarget = {
      filePath: comment.filePath,
      lineNumber: comment.startLine,
    };
    if (selectedPath !== comment.filePath) {
      onFileSelect(comment.filePath);
      return;
    }
    scrollToLine(comment.filePath, comment.startLine);
  }

  async function submitQueuedComments(): Promise<void> {
    if (queuedComments.length === 0) {
      return;
    }

    const hasDiffContextComments = queuedComments.some(
      (comment) =>
        comment.source === "diff" || comment.source === "current-state",
    );
    const batchHeader = hasDiffContextComments
      ? "Please process the following queued file comments in one batch. For items marked [DIFF], answer in terms of old-vs-new changes and review intent."
      : "Please process the following queued file comments in one batch and provide a single consolidated response.";

    const sourceLabel = (
      source: "diff" | "current-state" | "full-file",
    ): string => {
      if (source === "full-file") {
        return "FULL_FILE";
      }
      return "DIFF";
    };

    const sections = queuedComments.map((comment, index) => {
      const lineRange = lineRangeLabel(comment);
      return `${index + 1}. [${sourceLabel(comment.source)}] ${comment.filePath}:${lineRange}\n${comment.prompt}`;
    });
    const message = `${batchHeader}\n\n${sections.join("\n\n")}`;
    const firstComment = queuedComments[0];
    if (firstComment === undefined) {
      return;
    }

    let result: AISessionSubmitResult | null;
    try {
      result = await onSubmitPrompt(message, true, {
        primaryFile: {
          path: firstComment.filePath,
          startLine: firstComment.startLine,
          endLine: firstComment.endLine,
          content: "",
        },
        references: queuedComments.map((comment) => ({
          path: comment.filePath,
          startLine: comment.startLine,
          endLine: comment.endLine,
          content: `[source:${comment.source}] ${comment.prompt}`,
        })),
        diffSummary: undefined,
        resumeSessionId: currentQraftAiSessionId,
        modelProfileId: selectedAiModelProfileId,
      });
    } catch (error) {
      console.error("Failed to submit queued comments:", error);
      return;
    }

    if (result === null) {
      return;
    }

    latestSubmittedSessionId = result.sessionId ?? currentQraftAiSessionId;
    try {
      await clearQueuedAiCommentsApi(projectPath);
      queuedComments = [];
      editingCommentId = null;
      editingCommentPrompt = "";
    } catch (error) {
      console.error("Failed to clear queued AI comments after submit:", error);
    }
  }

  function startEditingComment(comment: QueuedAiComment): void {
    editingCommentId = comment.id;
    editingCommentPrompt = comment.prompt;
  }

  function cancelEditingComment(): void {
    editingCommentId = null;
    editingCommentPrompt = "";
  }

  async function saveEditingComment(commentId: string): Promise<void> {
    const prompt = editingCommentPrompt.trim();
    if (prompt.length === 0) {
      return;
    }
    try {
      const updated = await updateQueuedAiCommentApi(
        projectPath,
        commentId,
        prompt,
      );
      queuedComments = queuedComments.map((comment) =>
        comment.id === commentId ? updated : comment,
      );
      cancelEditingComment();
    } catch (error) {
      console.error("Failed to update queued AI comment:", error);
    }
  }

  $effect(() => {
    if (pendingJumpTarget === null) {
      return;
    }
    if (selectedPath !== pendingJumpTarget.filePath) {
      return;
    }
    if (fileContentLoading) {
      return;
    }

    const jumpTarget = pendingJumpTarget;
    const timers: number[] = [];
    const delays = [0, 90, 180, 320];
    let done = false;

    for (const delay of delays) {
      const timer = window.setTimeout(() => {
        if (done) {
          return;
        }
        done = scrollToLine(jumpTarget.filePath, jumpTarget.lineNumber);
        if (done) {
          pendingJumpTarget = null;
        }
      }, delay);
      timers.push(timer);
    }

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  });

  $effect(() => {
    if (modelConfigLoaded) {
      return;
    }
    modelConfigLoaded = true;
    void fetchModelConfigState()
      .then((state) => {
        aiModelProfiles = [...state.profiles];
        selectedAiModelProfileId =
          state.operationBindings.aiDefaultProfileId ?? undefined;
      })
      .catch(() => {
        aiModelProfiles = [];
        selectedAiModelProfileId = undefined;
      });
  });

  $effect(() => {
    const activeProjectPath = projectPath.trim();
    if (activeProjectPath.length === 0) {
      queuedComments = [];
      return;
    }

    let disposed = false;
    void fetchQueuedAiCommentsApi(activeProjectPath)
      .then((comments) => {
        if (!disposed) {
          queuedComments = [...comments];
        }
      })
      .catch((error) => {
        console.error("Failed to load queued AI comments:", error);
      });

    return () => {
      disposed = true;
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
    side: "old" | "new",
    filePath: string,
    prompt: string,
    immediate: boolean,
    source: "diff" | "current-state" | "full-file",
    action: "submit" | "comment",
  ): void {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length === 0) {
      return;
    }
    if (source === "diff" && side === "old") {
      return;
    }
    if (action === "comment") {
      void queueComment(
        filePath,
        startLine,
        endLine,
        side,
        source,
        normalizedPrompt,
      );
      return;
    }

    const submitMessage =
      source === "diff" || source === "current-state"
        ? `Please treat this as a diff review comment and explain old-vs-new impact when relevant.\n\n${normalizedPrompt}`
        : normalizedPrompt;

    void onSubmitPrompt(submitMessage, immediate, {
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
      bind:this={mainContentRef}
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
            onCommentSubmit={(
              startLine,
              endLine,
              side,
              filePath,
              prompt,
              immediate,
              action,
            ) =>
              handleInlineCommentSubmit(
                startLine,
                endLine,
                side,
                filePath,
                prompt,
                immediate,
                "current-state",
                action,
              )}
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
            onCommentSubmit={(
              startLine,
              endLine,
              side,
              filePath,
              prompt,
              immediate,
              action,
            ) =>
              handleInlineCommentSubmit(
                startLine,
                endLine,
                side,
                filePath,
                prompt,
                immediate,
                "diff",
                action,
              )}
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
          onCommentSubmit={(
            startLine,
            endLine,
            side,
            filePath,
            prompt,
            immediate,
            action,
          ) =>
            handleInlineCommentSubmit(
              startLine,
              endLine,
              side,
              filePath,
              prompt,
              immediate,
              "full-file",
              action,
            )}
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
          onCommentSubmit={(
            startLine,
            endLine,
            side,
            filePath,
            prompt,
            immediate,
            action,
          ) =>
            handleInlineCommentSubmit(
              startLine,
              endLine,
              side,
              filePath,
              prompt,
              immediate,
              "full-file",
              action,
            )}
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
      {#if commentListExpanded}
        <div
          class="border-t border-border-default bg-bg-secondary px-3 py-2 max-h-52 overflow-auto"
        >
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="text-xs font-medium text-text-primary">
              Comment List ({queuedComments.length})
            </div>
            <div class="flex items-center gap-2">
              <select
                class="max-w-56 rounded border border-border-default bg-bg-primary px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-emphasis disabled:opacity-60"
                value={selectedAiModelProfileId ?? ""}
                disabled={aiModelProfiles.length === 0}
                onchange={(event) => {
                  const nextValue = (event.currentTarget as HTMLSelectElement)
                    .value;
                  selectedAiModelProfileId =
                    nextValue.length > 0 ? nextValue : undefined;
                }}
                aria-label="Profile for comment list submit"
              >
                {#if aiModelProfiles.length === 0}
                  <option value="">No profile available</option>
                {:else}
                  {#each aiModelProfiles as profile (profile.id)}
                    <option value={profile.id}>
                      {profile.name} ({profile.vendor} / {profile.model})
                    </option>
                  {/each}
                {/if}
              </select>
              <button
                type="button"
                class="px-3 py-1 text-xs rounded bg-accent-muted text-accent-fg
                       border border-accent-emphasis/40 hover:bg-accent-muted/80
                       disabled:opacity-50 disabled:cursor-not-allowed"
                onclick={() => void submitQueuedComments()}
                disabled={queuedComments.length === 0}
              >
                Submit comments
              </button>
              <button
                type="button"
                class="px-2 py-1 text-xs rounded border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed"
                onclick={() => void clearQueuedComments()}
                disabled={queuedComments.length === 0}
              >
                Clear all comments
              </button>
            </div>
          </div>
          {#if latestSubmittedSessionId !== null && latestSessionHistoryHref !== null}
            <div
              class="mb-2 flex items-center justify-between gap-3 rounded border border-accent-emphasis/40 bg-accent-muted/10 px-2 py-1 text-xs text-text-secondary"
            >
              <span class="truncate">AI session submitted.</span>
              <div class="flex items-center gap-2">
                <a
                  class="text-accent-fg underline underline-offset-2 hover:opacity-80"
                  href={latestSessionHistoryHref}
                >
                  View session history
                </a>
                <button
                  type="button"
                  class="text-text-secondary hover:text-text-primary"
                  onclick={() => {
                    latestSubmittedSessionId = null;
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          {/if}
          {#if queuedComments.length === 0}
            <p class="text-xs text-text-secondary">No queued comments.</p>
          {:else}
            <ul class="space-y-1.5">
              {#each queuedComments as comment (comment.id)}
                <li
                  class="rounded border border-border-default bg-bg-primary px-2 py-1.5"
                >
                  <div class="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      class="text-left text-xs font-mono text-accent-fg hover:underline"
                      onclick={() => jumpToQueuedComment(comment)}
                    >
                      {comment.filePath}:{lineRangeLabel(comment)}
                    </button>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        class="text-xs text-text-secondary hover:text-text-primary"
                        onclick={() => {
                          startEditingComment(comment);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="text-xs text-text-secondary hover:text-danger-fg"
                        onclick={() => void removeQueuedComment(comment.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  {#if editingCommentId === comment.id}
                    <div class="mt-1 space-y-1.5">
                      <textarea
                        class="w-full min-h-20 resize-y rounded border border-border-default bg-bg-secondary
                               px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
                        bind:value={editingCommentPrompt}
                      ></textarea>
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          class="px-2 py-0.5 text-xs bg-success-emphasis text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          onclick={() => void saveEditingComment(comment.id)}
                          disabled={editingCommentPrompt.trim().length === 0}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          class="px-2 py-0.5 text-xs rounded border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                          onclick={cancelEditingComment}
                        >
                          Cancel edit
                        </button>
                      </div>
                    </div>
                  {:else}
                    <p class="mt-1 text-xs text-text-secondary line-clamp-2">
                      {comment.prompt}
                    </p>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
      <div
        class="shrink-0 h-8 border-t border-border-default flex items-center px-4 bg-bg-secondary text-xs text-text-secondary gap-4"
      >
        <button
          type="button"
          class="px-2 py-0.5 rounded border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
          onclick={() => {
            commentListExpanded = !commentListExpanded;
          }}
        >
          {commentListExpanded ? "Hide comments" : "Show comments"} ({queuedComments.length})
        </button>
        <span>
          {stats.totalFiles} file{stats.totalFiles !== 1 ? "s" : ""} changed
        </span>
        <span class="text-success-fg">+{stats.additions}</span>
        <span class="text-danger-fg">-{stats.deletions}</span>
      </div>
    </div>
  </div>
</div>

<style>
  :global(.line-jump-highlight) {
    outline: 2px solid var(--color-accent-emphasis);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--color-accent-muted) 65%, transparent);
    transition:
      outline-color 0.2s ease,
      background-color 0.2s ease;
  }
</style>
