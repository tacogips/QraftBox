<script lang="ts">
  import type { DiffFile } from "../../src/types/diff";
  import type { FileNode } from "../../src/stores/files";
  import type { QueueStatus, AISession } from "../../../src/types/ai";
  import type { ModelProfile } from "../../../src/types/model-config";
  import {
    fetchModelConfigState,
    type PromptQueueItem,
  } from "../../src/lib/app-api";
  import type { AIPromptContext } from "../../src/lib/ai-feature-runtime";
  import FileTree from "../FileTree.svelte";
  import AIPromptPanel from "../AIPromptPanel.svelte";
  import CurrentSessionPanel from "../CurrentSessionPanel.svelte";

  let {
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
    onSubmitPrompt,
    onNewSession,
    onResumeCliSession,
    onCancelActiveSession,
    onCancelQueuedPrompt,
    onReloadFileTree,
  }: {
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

  let isPhoneViewport = $state(window.innerWidth <= 480);

  function detectPhoneViewport(): boolean {
    return window.innerWidth <= 480;
  }

  function detectMobileDevice(): boolean {
    const ua = navigator.userAgent;
    return /iPhone|iPod|Android/i.test(ua);
  }

  $effect(() => {
    const update = (): void => {
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

  function handleTreeFileSelect(path: string): void {
    onFileSelect(path);
    if ((detectPhoneViewport() || detectMobileDevice()) && !sidebarCollapsed) {
      onCollapseSidebar();
    }
  }

  const autocompleteAllFiles = $derived.by(() => {
    const paths: string[] = [];

    function collect(node: FileNode): void {
      if (!node.isDirectory) {
        paths.push(node.path);
        return;
      }
      if (node.children === undefined) {
        return;
      }
      for (const child of node.children) {
        collect(child);
      }
    }

    collect(fileTree);
    return paths;
  });
</script>

<div class="relative flex flex-1 min-h-0 overflow-hidden bg-bg-primary">
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
    <main class="flex-1 min-h-0 overflow-hidden bg-bg-primary">
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
        {projectPath}
      >
        {#snippet nextPromptContent()}
          <AIPromptPanel
            {contextId}
            {projectPath}
            {queueStatus}
            {isFirstMessage}
            changedFiles={changedFilePaths}
            allFiles={autocompleteAllFiles}
            modelProfiles={aiModelProfiles}
            selectedModelProfileId={selectedAiModelProfileId}
            onSelectModelProfile={(profileId) => {
              selectedAiModelProfileId = profileId;
            }}
            onSubmit={(prompt, immediate, refs, modelProfileId) => {
              void onSubmitPrompt(prompt, immediate, {
                primaryFile: undefined,
                references: refs,
                diffSummary: undefined,
                resumeSessionId: currentQraftAiSessionId,
                modelProfileId: modelProfileId ?? selectedAiModelProfileId,
              });
            }}
            {onNewSession}
            onResumeSession={onResumeCliSession}
          />
        {/snippet}
      </CurrentSessionPanel>
    </main>
  </div>
</div>
