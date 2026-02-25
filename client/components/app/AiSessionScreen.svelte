<script lang="ts">
  import type {
    QueueStatus,
    AISession,
    AISessionSubmitResult,
    QraftAiSessionId,
    FileReference,
  } from "../../../src/types/ai";
  import type { ModelProfile } from "../../../src/types/model-config";
  import {
    fetchModelConfigState,
    type PromptQueueItem,
  } from "../../src/lib/app-api";
  import type { AIPromptContext } from "../../src/lib/ai-feature-runtime";
  import AiSessionOverviewGrid from "../sessions/AiSessionOverviewGrid.svelte";

  let {
    contextId,
    projectPath,
    runningSessions,
    queuedSessions,
    recentlyCompletedSessions = [],
    pendingPrompts,
    currentQraftAiSessionId,
    onSubmitPrompt,
    onNewSession,
    onResumeCliSession,
    onCancelActiveSession,
  }: {
    contextId: string | null;
    projectPath: string;
    runningSessions: AISession[];
    queuedSessions: AISession[];
    pendingPrompts: PromptQueueItem[];
    currentQraftAiSessionId?: string;
    onSubmitPrompt: (
      message: string,
      immediate: boolean,
      context: AIPromptContext,
    ) => Promise<AISessionSubmitResult | null>;
    onNewSession?: () => void;
    onResumeCliSession?: (resumeQraftId: string) => void;
    onCancelActiveSession?: (sessionId: string) => Promise<void>;
    // Unused parent props are allowed to preserve call-site compatibility.
    loading?: boolean;
    error?: string | null;
    sidebarCollapsed?: boolean;
    sidebarWidth?: number;
    allFilesLoading?: boolean;
    fileTree?: unknown;
    fileTreeMode?: "diff" | "all";
    selectedPath?: string | null;
    diffFiles?: unknown[];
    canNarrow?: boolean;
    canWiden?: boolean;
    queueStatus?: QueueStatus;
    changedFilePaths?: string[];
    recentlyCompletedSessions?: AISession[];
    resumeDisplaySessionId?: string | null;
    currentQraftAiSessionId?: string;
    isFirstMessage?: boolean;
    showIgnored?: boolean;
    showAllFiles?: boolean;
    onToggleSidebar?: () => void;
    onFileSelect?: (path: string) => void;
    onFileTreeModeChange?: (mode: "diff" | "all") => void;
    onShowIgnoredChange?: (value: boolean) => void;
    onShowAllFilesChange?: (value: boolean) => void;
    onDirectoryExpand?: (dirPath: string) => Promise<void>;
    onLoadFullTree?: () => Promise<unknown>;
    onCollapseSidebar?: () => void;
    onNarrowSidebar?: () => void;
    onWidenSidebar?: () => void;
    onNewSession?: () => void;
    onCancelQueuedPrompt?: (promptId: string) => Promise<void>;
    onReloadFileTree?: () => void;
  } = $props();

  let aiModelProfiles = $state<ModelProfile[]>([]);
  let selectedAiModelProfileId = $state<string | undefined>(undefined);
  let modelConfigLoaded = $state(false);

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
    if (modelConfigLoaded) {
      return;
    }
    modelConfigLoaded = true;
    void loadAiModelConfig();
  });

  async function handleOverviewPromptSubmit(
    sessionId: string,
    message: string,
    immediate: boolean,
    references: readonly FileReference[],
    modelProfileId?: string | undefined,
  ): Promise<AISessionSubmitResult | null> {
    if (typeof onResumeCliSession === "function") {
      onResumeCliSession(sessionId);
    }

    return onSubmitPrompt(message, immediate, {
      primaryFile: undefined,
      references,
      diffSummary: undefined,
      resumeSessionId: sessionId,
      modelProfileId,
    });
  }

  async function handleOverviewNewSessionPromptSubmit(
    message: string,
    immediate: boolean,
    references: readonly FileReference[],
  ): Promise<AISessionSubmitResult | null> {
    return onSubmitPrompt(message, immediate, {
      primaryFile: undefined,
      references,
      diffSummary: undefined,
      resumeSessionId: currentQraftAiSessionId as QraftAiSessionId | undefined,
      modelProfileId: selectedAiModelProfileId,
    });
  }
</script>

<div class="relative flex flex-1 min-h-0 overflow-hidden bg-bg-primary">
  <AiSessionOverviewGrid
    {contextId}
    {projectPath}
    {runningSessions}
    {queuedSessions}
    recentTerminalSessions={recentlyCompletedSessions}
    {pendingPrompts}
    newSessionSeedId={currentQraftAiSessionId ?? null}
    newSessionModelProfiles={aiModelProfiles}
    selectedNewSessionModelProfileId={selectedAiModelProfileId}
    onSelectNewSessionModelProfile={(profileId) => {
      selectedAiModelProfileId = profileId;
    }}
    {onNewSession}
    {onCancelActiveSession}
    onStartNewSessionPrompt={handleOverviewNewSessionPromptSubmit}
    onSubmitPrompt={handleOverviewPromptSubmit}
  />
</div>
