<script lang="ts">
  /**
   * CurrentSessionPanel Component
   *
   * Compact panel shown above the AIPromptPanel in the Changes screen.
   * Shows:
   * 1. Queue count with expandable list of pending prompts
   * 2. Currently running session (with glow border animation)
   * 3. Most recent CLI session (when nothing is running)
   *
   * The panel border glows when a session is actively running and
   * stops when execution completes.
   */

  import type { AISession } from "../../src/types/ai";
  import type { ExtendedSessionEntry } from "../../src/types/claude-session";
  import { stripSystemTags } from "../../src/utils/strip-system-tags";
  import SessionTranscriptInline from "./sessions/SessionTranscriptInline.svelte";

  interface SessionSummaryData {
    readonly sessionId: string;
    readonly toolUsage: readonly { name: string; count: number }[];
    readonly tasks: readonly { id: string; subject: string; status: string }[];
    readonly filesModified: readonly { path: string; tool: string }[];
    readonly usage?:
      | {
          readonly inputTokens: number;
          readonly outputTokens: number;
          readonly cacheCreationTokens: number;
          readonly cacheReadTokens: number;
        }
      | undefined;
  }

  interface Props {
    contextId: string | null;
    projectPath: string;
    running: readonly AISession[];
    queued: readonly AISession[];
    recentlyCompleted: readonly AISession[];
    pendingPrompts: readonly { id: string; message: string; status: string }[];
    selectedCliSessionId: string | null;
    newSessionMode: boolean;
    onCancelSession: (id: string) => void;
    onResumeSession: (sessionId: string) => void;
    onCurrentSessionChange: (sessionId: string | null) => void;
    onNewSession?: () => void;
    onSearchSession?: () => void;
    onChangePage?: () => void;
  }

  const {
    contextId,
    projectPath,
    running,
    queued,
    recentlyCompleted,
    pendingPrompts,
    selectedCliSessionId,
    newSessionMode,
    onCancelSession,
    onResumeSession,
    onCurrentSessionChange,
    onNewSession,
    onSearchSession,
    onChangePage,
  }: Props = $props();

  /**
   * Most recent CLI session (shown when nothing else is active)
   */
  let recentCliSession = $state<ExtendedSessionEntry | null>(null);

  /**
   * Whether a CLI session is being loaded (after Resume click)
   */
  let cliSessionLoading = $state(false);

  /**
   * Expansion states
   */
  let sessionExpanded = $state(false);
  let queueExpanded = $state(false);

  /**
   * Session summary data (loaded on expand for CLI sessions)
   */
  let sessionSummary = $state<SessionSummaryData | null>(null);
  let summaryLoading = $state(false);
  let tasksExpanded = $state(false);
  let filesExpanded = $state(false);

  /**
   * Currently running QraftBox session
   */
  const runningSession = $derived(running.length > 0 ? running[0] : null);

  /**
   * Most recently completed QraftBox session
   */
  const completedSession = $derived(
    recentlyCompleted.length > 0 ? recentlyCompleted[0] : null,
  );

  /**
   * Whether something is actively running
   */
  const isRunning = $derived(running.length > 0);

  /**
   * All queued items = queued sessions + pending prompts
   */
  const allQueuedItems = $derived.by(() => {
    const items: { id: string; text: string; source: "session" | "prompt" }[] =
      [];
    for (const s of queued) {
      items.push({ id: s.id, text: s.prompt, source: "session" });
    }
    for (const p of pendingPrompts) {
      items.push({ id: p.id, text: p.message, source: "prompt" });
    }
    return items;
  });

  /**
   * Total queue count
   */
  const queueCount = $derived(allQueuedItems.length);

  /**
   * Whether the panel has anything to show
   */
  const hasContent = $derived(
    isRunning ||
      queueCount > 0 ||
      completedSession !== null ||
      cliSessionLoading ||
      recentCliSession !== null,
  );

  /**
   * What kind of session to display in the main card.
   * Priority: running > completed (recent QraftBox) > loading > cli
   */
  const displayMode = $derived.by(() => {
    if (isRunning) return "running" as const;
    if (completedSession !== null) return "completed" as const;
    if (cliSessionLoading) return "loading" as const;
    if (recentCliSession !== null) return "cli" as const;
    return "none" as const;
  });

  /**
   * Display title
   */
  const displayTitle = $derived.by(() => {
    if (runningSession !== null && runningSession !== undefined) {
      return stripSystemTags(runningSession.prompt);
    }
    if (completedSession !== null) {
      return stripSystemTags(completedSession.prompt);
    }
    if (recentCliSession !== null) {
      return stripSystemTags(
        recentCliSession.firstPrompt || recentCliSession.summary,
      );
    }
    return "";
  });

  /**
   * Elapsed time tracking for running session
   */
  let elapsedSeconds = $state(0);

  $effect(() => {
    if (
      runningSession === null ||
      runningSession === undefined ||
      runningSession.startedAt === undefined
    ) {
      elapsedSeconds = 0;
      return;
    }
    const startTime = new Date(runningSession.startedAt).getTime();
    const updateElapsed = (): void => {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  });

  const elapsedFormatted = $derived.by(() => {
    const min = Math.floor(elapsedSeconds / 60);
    const sec = elapsedSeconds % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  });

  function truncateText(text: string, maxLen = 100): string {
    const stripped = stripSystemTags(text).replaceAll("\n", " ");
    if (stripped.length <= maxLen) return stripped;
    return stripped.slice(0, maxLen) + "...";
  }

  function getRelativeTime(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    return `${diffDays}d ago`;
  }

  function formatTokenCount(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
    return count.toString();
  }

  function shortPath(fullPath: string): string {
    const parts = fullPath.split("/");
    if (parts.length <= 2) return fullPath;
    return ".../" + parts.slice(-2).join("/");
  }

  function getTaskStatusColor(status: string): string {
    switch (status) {
      case "completed":
        return "bg-success-emphasis";
      case "in_progress":
        return "bg-attention-emphasis";
      default:
        return "bg-border-default";
    }
  }

  /**
   * Fetch a specific CLI session by ID
   */
  async function fetchCliSessionById(sessionId: string): Promise<void> {
    if (contextId === null) return;
    cliSessionLoading = true;
    try {
      const resp = await fetch(
        `/api/ctx/${contextId}/claude-sessions/sessions/${sessionId}`,
      );
      if (!resp.ok) return;
      const session = (await resp.json()) as ExtendedSessionEntry;
      recentCliSession = session;
      // Reset summary when switching sessions
      sessionSummary = null;
    } catch {
      // Silently ignore
    } finally {
      cliSessionLoading = false;
    }
  }

  async function fetchRecentCliSession(): Promise<void> {
    if (contextId === null) return;
    try {
      const params = new URLSearchParams({
        offset: "0",
        limit: "1",
        sortBy: "modified",
        sortOrder: "desc",
      });
      if (projectPath.length > 0) {
        params.set("workingDirectoryPrefix", projectPath);
      }
      const resp = await fetch(
        `/api/ctx/${contextId}/claude-sessions/sessions?${params.toString()}`,
      );
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        sessions: ExtendedSessionEntry[];
        total: number;
      };
      if (data.sessions.length > 0 && data.sessions[0] !== undefined) {
        recentCliSession = data.sessions[0];
      }
    } catch {
      // Silently ignore
    }
  }

  async function fetchSessionSummary(sessionId: string): Promise<void> {
    if (contextId === null || sessionSummary !== null || summaryLoading) return;
    summaryLoading = true;
    try {
      const resp = await fetch(
        `/api/ctx/${contextId}/claude-sessions/sessions/${sessionId}/summary`,
      );
      if (resp.ok) {
        sessionSummary = (await resp.json()) as SessionSummaryData;
      }
    } catch {
      // Silently ignore
    } finally {
      summaryLoading = false;
    }
  }

  function toggleSession(): void {
    sessionExpanded = !sessionExpanded;
    if (sessionExpanded && displayMode === "cli" && recentCliSession !== null) {
      void fetchSessionSummary(recentCliSession.sessionId);
    }
  }

  $effect(() => {
    if (contextId === null) return;
    if (newSessionMode) {
      // In new session mode, clear the displayed CLI session
      recentCliSession = null;
      onCurrentSessionChange(null);
      return;
    }
    if (selectedCliSessionId !== null) {
      void fetchCliSessionById(selectedCliSessionId);
    } else {
      void fetchRecentCliSession();
    }
  });

  // Report current CLI session changes to parent
  $effect(() => {
    onCurrentSessionChange(recentCliSession?.sessionId ?? null);
  });
</script>

{#if hasContent}
  <div
    class="current-session-panel border-t border-border-default bg-bg-secondary
           {isRunning ? 'session-running-glow' : ''}"
    role="region"
    aria-label="Current session status"
  >
    <!-- Queue count row (above session card) -->
    {#if queueCount > 0}
      <button
        type="button"
        onclick={() => (queueExpanded = !queueExpanded)}
        class="w-full flex items-center gap-2 px-4 py-1.5
               hover:bg-bg-hover transition-colors text-left
               border-b border-border-default"
      >
        <svg
          class="w-3 h-3 text-text-tertiary transition-transform shrink-0
                 {queueExpanded ? 'rotate-90' : ''}"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path
            d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"
          />
        </svg>
        <span class="w-2 h-2 rounded-full bg-attention-emphasis shrink-0"
        ></span>
        <span class="text-xs text-text-secondary">
          {queueCount} queued prompt{queueCount !== 1 ? "s" : ""}
        </span>
      </button>

      {#if queueExpanded}
        <div class="border-b border-border-default bg-bg-primary">
          {#each allQueuedItems as item, index (item.id)}
            <div
              class="flex items-center gap-2 px-6 py-1.5 text-xs
                     {index < allQueuedItems.length - 1
                ? 'border-b border-border-default/50'
                : ''}"
            >
              <span
                class="text-text-tertiary shrink-0 w-4 text-right font-mono"
              >
                {index + 1}.
              </span>
              <span class="text-text-secondary truncate">
                {truncateText(item.text, 120)}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- Current session card -->
    {#if displayMode !== "none"}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        onclick={toggleSession}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleSession();
          }
        }}
        role="button"
        tabindex={0}
        class="w-full flex items-center gap-2 px-4 py-2
               hover:bg-bg-hover transition-colors text-left cursor-pointer select-none"
      >
        <!-- Chevron -->
        <svg
          class="w-3.5 h-3.5 text-text-tertiary transition-transform shrink-0
                 {sessionExpanded ? 'rotate-90' : ''}"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path
            d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"
          />
        </svg>

        {#if displayMode === "running"}
          <!-- Running spinner -->
          <svg
            class="animate-spin h-3.5 w-3.5 text-accent-fg shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span
            class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-muted text-accent-fg"
          >
            Running
          </span>
        {:else if displayMode === "completed"}
          <!-- Completed checkmark -->
          <svg
            class="h-3.5 w-3.5 text-success-fg shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span
            class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold
                       {completedSession?.state === 'failed'
              ? 'bg-danger-subtle text-danger-fg'
              : 'bg-success-muted text-success-fg'}"
          >
            {completedSession?.state === "failed" ? "Failed" : "Done"}
          </span>
        {:else if displayMode === "loading"}
          <!-- Loading spinner -->
          <svg
            class="animate-spin h-3.5 w-3.5 text-text-tertiary shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span
            class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-bg-tertiary text-text-secondary"
          >
            Loading
          </span>
        {:else}
          <span
            class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-bg-tertiary text-text-secondary"
          >
            CLI
          </span>
        {/if}

        <!-- Title -->
        <span class="flex-1 text-xs text-text-primary truncate">
          {displayMode === "loading"
            ? "Loading session..."
            : truncateText(displayTitle)}
        </span>

        {#if displayMode === "running" && runningSession !== null && runningSession !== undefined}
          {#if runningSession.currentActivity}
            <span class="text-[10px] text-text-tertiary shrink-0 animate-pulse">
              {runningSession.currentActivity}
            </span>
          {/if}
          <span
            class="text-xs font-mono text-text-tertiary tabular-nums shrink-0"
          >
            {elapsedFormatted}
          </span>
        {:else if displayMode === "completed" && completedSession !== null}
          <span class="text-[10px] text-text-tertiary shrink-0">
            {completedSession.completedAt !== undefined
              ? getRelativeTime(completedSession.completedAt)
              : ""}
          </span>
        {:else if recentCliSession !== null}
          <span class="text-[10px] text-text-tertiary shrink-0">
            {recentCliSession.messageCount} msgs
          </span>
          <span class="text-[10px] text-text-tertiary shrink-0">
            {getRelativeTime(recentCliSession.modified)}
          </span>
        {/if}
      </div>

      <!-- Expanded content -->
      {#if sessionExpanded}
        <div class="border-t border-border-default/50 bg-bg-primary">
          {#if displayMode === "running" && runningSession !== null && runningSession !== undefined}
            <div class="px-4 py-2">
              <div class="border-l-4 border-accent-emphasis bg-bg-tertiary/30 rounded-r px-3 py-2 mb-2">
                <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-muted text-accent-fg mb-1 inline-block">user</span>
                <p class="text-xs text-text-primary whitespace-pre-wrap mt-1">
                  {stripSystemTags(runningSession.prompt)}
                </p>
              </div>
              {#if runningSession.context.primaryFile !== undefined}
                <div
                  class="flex items-center gap-1.5 text-[10px] text-text-tertiary mb-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path
                      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                    />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span class="truncate"
                    >{runningSession.context.primaryFile.path}</span
                  >
                </div>
              {/if}
              {#if runningSession.lastAssistantMessage !== undefined && runningSession.lastAssistantMessage.length > 0}
                <div
                  class="border-l-4 border-success-emphasis bg-bg-tertiary/30 rounded-r px-3 py-2 mt-1 mb-2"
                >
                  <span
                    class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success-muted text-success-fg mb-1 inline-block"
                    >assistant (live)</span
                  >
                  <p
                    class="text-xs text-text-primary whitespace-pre-wrap font-mono mt-1 max-h-[200px] overflow-y-auto"
                  >
                    {stripSystemTags(runningSession.lastAssistantMessage)}
                  </p>
                </div>
              {/if}
              <div class="flex justify-end">
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    onCancelSession(runningSession.id);
                  }}
                  class="px-2 py-0.5 text-[10px] font-medium rounded
                         bg-danger-emphasis/10 text-danger-fg hover:bg-danger-emphasis/20
                         border border-danger-emphasis/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else if displayMode === "completed" && completedSession !== null}
            <div class="px-4 py-2">
              <div class="border-l-4 border-accent-emphasis bg-bg-tertiary/30 rounded-r px-3 py-2 mb-2">
                <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-muted text-accent-fg mb-1 inline-block">user</span>
                <p class="text-xs text-text-primary whitespace-pre-wrap mt-1">
                  {stripSystemTags(completedSession.prompt)}
                </p>
              </div>
              {#if completedSession.state === "failed"}
                <p class="text-xs text-danger-fg">Session failed.</p>
              {:else if completedSession.lastAssistantMessage}
                <div
                  class="border-l-4 border-success-emphasis bg-bg-tertiary/30 rounded-r px-3 py-2 mt-1"
                >
                  <span
                    class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success-muted text-success-fg mb-1 inline-block"
                    >assistant</span
                  >
                  <p
                    class="text-xs text-text-primary whitespace-pre-wrap font-mono mt-1 max-h-[200px] overflow-y-auto"
                  >
                    {stripSystemTags(completedSession.lastAssistantMessage)}
                  </p>
                </div>
              {:else}
                <p class="text-xs text-success-fg">Session completed.</p>
              {/if}
            </div>
          {:else if recentCliSession !== null && contextId !== null}
            <div
              class="px-4 py-2 bg-bg-tertiary/30 border-b border-border-default"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    onResumeSession(recentCliSession.sessionId);
                  }}
                  class="shrink-0 px-2.5 py-0.5 text-xs font-medium rounded
                         bg-bg-tertiary hover:bg-bg-hover text-text-primary
                         border border-border-default"
                >
                  Resume
                </button>

                {#if summaryLoading}
                  <span class="text-text-tertiary text-xs">|</span>
                  <svg
                    class="animate-spin h-3 w-3 text-text-tertiary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    />
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span class="text-xs text-text-tertiary"
                    >Loading summary...</span
                  >
                {:else if sessionSummary !== null}
                  {#if sessionSummary.toolUsage.length > 0 || sessionSummary.filesModified.length > 0 || sessionSummary.tasks.length > 0}
                    <span class="text-text-tertiary text-xs">|</span>
                  {/if}
                  {#each sessionSummary.toolUsage.slice(0, 6) as tool}
                    <span
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-tertiary text-text-secondary"
                    >
                      {tool.name}<span class="text-text-tertiary"
                        >:{tool.count}</span
                      >
                    </span>
                  {/each}
                  {#if sessionSummary.toolUsage.length > 6}
                    <span class="text-[10px] text-text-tertiary"
                      >+{sessionSummary.toolUsage.length - 6} more</span
                    >
                  {/if}
                  {#if sessionSummary.filesModified.length > 0 || sessionSummary.tasks.length > 0}
                    <span class="text-text-tertiary text-xs mx-1">|</span>
                  {/if}
                  {#if sessionSummary.filesModified.length > 0}
                    <button
                      type="button"
                      onclick={() => (filesExpanded = !filesExpanded)}
                      class="text-[11px] text-text-secondary hover:text-accent-fg transition-colors"
                    >
                      {sessionSummary.filesModified.length} file{sessionSummary
                        .filesModified.length !== 1
                        ? "s"
                        : ""}
                    </button>
                  {/if}
                  {#if sessionSummary.tasks.length > 0}
                    {#if sessionSummary.filesModified.length > 0}
                      <span class="text-text-tertiary text-xs">|</span>
                    {/if}
                    <button
                      type="button"
                      onclick={() => (tasksExpanded = !tasksExpanded)}
                      class="text-[11px] text-text-secondary hover:text-accent-fg transition-colors"
                    >
                      {sessionSummary.tasks.length} task{sessionSummary.tasks
                        .length !== 1
                        ? "s"
                        : ""}
                    </button>
                  {/if}
                {/if}
              </div>

              {#if sessionSummary?.usage !== undefined && (sessionSummary.usage.inputTokens > 0 || sessionSummary.usage.outputTokens > 0)}
                <div
                  class="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-text-tertiary"
                >
                  <span
                    >in:{formatTokenCount(
                      sessionSummary.usage.inputTokens,
                    )}</span
                  >
                  <span
                    >out:{formatTokenCount(
                      sessionSummary.usage.outputTokens,
                    )}</span
                  >
                  {#if sessionSummary.usage.cacheCreationTokens > 0}
                    <span
                      >cache-w:{formatTokenCount(
                        sessionSummary.usage.cacheCreationTokens,
                      )}</span
                    >
                  {/if}
                  {#if sessionSummary.usage.cacheReadTokens > 0}
                    <span
                      >cache-r:{formatTokenCount(
                        sessionSummary.usage.cacheReadTokens,
                      )}</span
                    >
                  {/if}
                </div>
              {/if}

              {#if filesExpanded && sessionSummary !== null && sessionSummary.filesModified.length > 0}
                <div class="mt-2 space-y-0.5">
                  {#each sessionSummary.filesModified as file}
                    <div class="flex items-center gap-2 py-0.5 text-[11px]">
                      <span
                        class="shrink-0 px-1 rounded text-[9px] font-bold {file.tool ===
                        'Edit'
                          ? 'bg-attention-muted text-attention-fg'
                          : 'bg-success-muted text-success-fg'}"
                      >
                        {file.tool === "Edit" ? "M" : "A"}
                      </span>
                      <span
                        class="text-text-secondary font-mono truncate"
                        title={file.path}>{shortPath(file.path)}</span
                      >
                    </div>
                  {/each}
                </div>
              {/if}

              {#if tasksExpanded && sessionSummary !== null && sessionSummary.tasks.length > 0}
                <div class="mt-2 space-y-0.5">
                  {#each sessionSummary.tasks as task}
                    <div class="flex items-center gap-2 py-0.5 text-[11px]">
                      <span
                        class="shrink-0 w-2 h-2 rounded-full {getTaskStatusColor(
                          task.status,
                        )}"
                      ></span>
                      <span class="text-text-primary truncate"
                        >{task.subject}</span
                      >
                      <span class="text-text-tertiary shrink-0"
                        >{task.status}</span
                      >
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <SessionTranscriptInline
              sessionId={recentCliSession.sessionId}
              {contextId}
              maxMessages={3}
            />
          {/if}
        </div>
      {/if}
    {/if}

    <!-- Session Management Icons Row -->
    <div
      class="flex items-center gap-2 px-4 py-2 border-t border-border-default/50"
    >
      {#if onNewSession !== undefined}
        <button
          type="button"
          onclick={onNewSession}
          class="p-1.5 rounded hover:bg-bg-hover transition-colors
                 text-text-tertiary hover:text-text-primary"
          title="New Session"
          aria-label="Create new session"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      {/if}

      {#if onSearchSession !== undefined}
        <button
          type="button"
          onclick={onSearchSession}
          class="p-1.5 rounded hover:bg-bg-hover transition-colors
                 text-text-tertiary hover:text-text-primary"
          title="Search Sessions"
          aria-label="Search and browse sessions"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>
      {/if}

      {#if onChangePage !== undefined}
        <button
          type="button"
          onclick={onChangePage}
          class="p-1.5 rounded hover:bg-bg-hover transition-colors
                 text-text-tertiary hover:text-text-primary"
          title="Change Page"
          aria-label="Navigate to different page"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
            />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M10 9H8" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
          </svg>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes glow-pulse {
    0%,
    100% {
      box-shadow: 0 0 4px 1px rgba(56, 132, 255, 0.3);
    }
    50% {
      box-shadow: 0 0 12px 3px rgba(56, 132, 255, 0.6);
    }
  }

  .session-running-glow {
    animation: glow-pulse 2s ease-in-out infinite;
  }
</style>
