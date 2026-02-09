<script lang="ts">
  /**
   * CurrentSessionPanel Component
   *
   * Compact panel shown above the AIPromptPanel in the Changes screen.
   * Shows the currently active session (most recent CLI session or running
   * QraftBox session) and queued prompt count, both expandable on click.
   * Reuses the visual style of HistorySessionsPanel session rows.
   *
   * Props:
   * - contextId: Context ID for API calls
   * - running: Currently running QraftBox AI sessions
   * - queued: Queued QraftBox AI sessions
   * - onCancelSession: Callback to cancel a QraftBox session
   * - onResumeSession: Callback to resume a CLI session
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
    readonly usage?: {
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly cacheCreationTokens: number;
      readonly cacheReadTokens: number;
    } | undefined;
  }

  interface Props {
    contextId: string | null;
    running: readonly AISession[];
    queued: readonly AISession[];
    onCancelSession: (id: string) => void;
    onResumeSession: (sessionId: string) => void;
  }

  const { contextId, running, queued, onCancelSession, onResumeSession }: Props = $props();

  /**
   * Most recent CLI session
   */
  let recentCliSession = $state<ExtendedSessionEntry | null>(null);

  /**
   * Whether the current session card is expanded
   */
  let sessionExpanded = $state(false);

  /**
   * Whether the queued prompts list is expanded
   */
  let queueExpanded = $state(false);

  /**
   * Session summary data (loaded on expand)
   */
  let sessionSummary = $state<SessionSummaryData | null>(null);
  let summaryLoading = $state(false);

  /**
   * Expanded sub-sections in summary
   */
  let tasksExpanded = $state(false);
  let filesExpanded = $state(false);

  /**
   * Current running QraftBox session (first one, if any)
   */
  const runningSession = $derived(running.length > 0 ? running[0] : null);

  /**
   * Determine which session to show as the "current session"
   * Priority: running QraftBox session > most recent CLI session
   */
  const displaySession = $derived.by(() => {
    if (runningSession !== null && runningSession !== undefined) {
      return { kind: "running" as const, id: runningSession.id };
    }
    if (recentCliSession !== null) {
      return { kind: "cli" as const, id: recentCliSession.sessionId };
    }
    return null;
  });

  /**
   * Display title for the current session
   */
  const displayTitle = $derived.by(() => {
    if (runningSession !== null && runningSession !== undefined) {
      return stripSystemTags(runningSession.prompt);
    }
    if (recentCliSession !== null) {
      return stripSystemTags(recentCliSession.firstPrompt || recentCliSession.summary);
    }
    return "";
  });

  /**
   * Whether there is any content to show
   */
  const hasContent = $derived(
    displaySession !== null || queued.length > 0,
  );

  /**
   * Elapsed time tracking for running session
   */
  let elapsedSeconds = $state(0);

  $effect(() => {
    if (runningSession === null || runningSession === undefined || runningSession.startedAt === undefined) {
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

  /**
   * Truncate text for display
   */
  function truncateText(text: string, maxLen = 100): string {
    const stripped = stripSystemTags(text).replaceAll("\n", " ");
    if (stripped.length <= maxLen) return stripped;
    return stripped.slice(0, maxLen) + "...";
  }

  /**
   * Get relative time string
   */
  function getRelativeTime(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  }

  /**
   * Format token count
   */
  function formatTokenCount(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
    return count.toString();
  }

  /**
   * Get short file path
   */
  function shortPath(fullPath: string): string {
    const parts = fullPath.split("/");
    if (parts.length <= 2) return fullPath;
    return ".../" + parts.slice(-2).join("/");
  }

  /**
   * Task status dot color
   */
  function getTaskStatusColor(status: string): string {
    switch (status) {
      case "completed": return "bg-success-emphasis";
      case "in_progress": return "bg-attention-emphasis";
      default: return "bg-border-default";
    }
  }

  /**
   * Fetch the most recent CLI session
   */
  async function fetchRecentCliSession(): Promise<void> {
    if (contextId === null) return;
    try {
      const params = new URLSearchParams({
        offset: "0",
        limit: "1",
        sortBy: "modified",
        sortOrder: "desc",
      });
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

  /**
   * Fetch session summary (for CLI session on expand)
   */
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

  /**
   * Handle session card toggle
   */
  function toggleSession(): void {
    sessionExpanded = !sessionExpanded;
    if (sessionExpanded && displaySession !== null && displaySession.kind === "cli") {
      void fetchSessionSummary(displaySession.id);
    }
  }

  /**
   * Fetch recent CLI session when contextId becomes available
   */
  $effect(() => {
    if (contextId !== null) {
      void fetchRecentCliSession();
    }
  });
</script>

{#if hasContent}
  <div
    class="current-session-panel border-t border-border-default bg-bg-secondary"
    role="region"
    aria-label="Current session status"
  >
    <!-- Queued prompts row -->
    {#if queued.length > 0}
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
        <span class="w-2 h-2 rounded-full bg-attention-emphasis shrink-0"></span>
        <span class="text-xs text-text-secondary">
          {queued.length} queued prompt{queued.length !== 1 ? "s" : ""}
        </span>
      </button>

      {#if queueExpanded}
        <div class="border-b border-border-default bg-bg-primary">
          {#each queued as session, index (session.id)}
            <div
              class="flex items-center gap-2 px-6 py-1.5 text-xs
                     {index < queued.length - 1 ? 'border-b border-border-default/50' : ''}"
            >
              <span class="text-text-tertiary shrink-0 w-4 text-right font-mono">
                {index + 1}.
              </span>
              <span class="text-text-secondary truncate">
                {truncateText(session.prompt, 120)}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- Current session row (running QraftBox or most recent CLI) -->
    {#if displaySession !== null}
      <!-- Session header (clickable) -->
      <button
        type="button"
        onclick={toggleSession}
        class="w-full flex items-center gap-2 px-4 py-2
               hover:bg-bg-hover transition-colors text-left"
      >
        <!-- Expand/collapse chevron -->
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

        {#if displaySession.kind === "running"}
          <!-- Running indicator -->
          <svg
            class="animate-spin-smooth h-3.5 w-3.5 text-accent-fg shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-muted text-accent-fg">
            Running
          </span>
        {:else}
          <!-- CLI session badge -->
          <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-bg-tertiary text-text-secondary">
            CLI
          </span>
        {/if}

        <!-- Title -->
        <span class="flex-1 text-xs text-text-primary truncate">
          {truncateText(displayTitle)}
        </span>

        {#if displaySession.kind === "running" && runningSession !== null && runningSession !== undefined}
          <!-- Running session: activity + elapsed time -->
          {#if runningSession.currentActivity}
            <span class="text-[10px] text-text-tertiary shrink-0 animate-pulse">
              {runningSession.currentActivity}
            </span>
          {/if}
          <span class="text-xs font-mono text-text-tertiary tabular-nums shrink-0">
            {elapsedFormatted}
          </span>
        {:else if recentCliSession !== null}
          <!-- CLI session: message count + relative time -->
          <span class="text-[10px] text-text-tertiary shrink-0">
            {recentCliSession.messageCount} msgs
          </span>
          <span class="text-[10px] text-text-tertiary shrink-0">
            {getRelativeTime(recentCliSession.modified)}
          </span>
        {/if}
      </button>

      <!-- Expanded session content -->
      {#if sessionExpanded}
        <div class="border-t border-border-default/50 bg-bg-primary">
          {#if displaySession.kind === "running" && runningSession !== null && runningSession !== undefined}
            <!-- Running QraftBox session details -->
            <div class="px-4 py-2">
              <p class="text-xs text-text-primary whitespace-pre-wrap mb-2">
                {stripSystemTags(runningSession.prompt)}
              </p>
              {#if runningSession.context.primaryFile !== undefined}
                <div class="flex items-center gap-1.5 text-[10px] text-text-tertiary mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span class="truncate">{runningSession.context.primaryFile.path}</span>
                </div>
              {/if}
              <div class="flex justify-end">
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); onCancelSession(runningSession.id); }}
                  class="px-2 py-0.5 text-[10px] font-medium rounded
                         bg-danger-emphasis/10 text-danger-fg hover:bg-danger-emphasis/20
                         border border-danger-emphasis/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else if recentCliSession !== null && contextId !== null}
            <!-- CLI session summary + Resume + transcript -->
            <div class="px-4 py-2 bg-bg-tertiary/30 border-b border-border-default">
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); onResumeSession(recentCliSession.sessionId); }}
                  class="shrink-0 px-2.5 py-0.5 text-xs font-medium rounded
                         bg-bg-tertiary hover:bg-bg-hover text-text-primary
                         border border-border-default"
                >
                  Resume
                </button>

                {#if summaryLoading}
                  <span class="text-text-tertiary text-xs">|</span>
                  <svg class="animate-spin h-3 w-3 text-text-tertiary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span class="text-xs text-text-tertiary">Loading summary...</span>
                {:else if sessionSummary !== null}
                  {#if sessionSummary.toolUsage.length > 0 || sessionSummary.filesModified.length > 0 || sessionSummary.tasks.length > 0}
                    <span class="text-text-tertiary text-xs">|</span>
                  {/if}

                  {#each sessionSummary.toolUsage.slice(0, 6) as tool}
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-tertiary text-text-secondary">
                      {tool.name}<span class="text-text-tertiary">:{tool.count}</span>
                    </span>
                  {/each}
                  {#if sessionSummary.toolUsage.length > 6}
                    <span class="text-[10px] text-text-tertiary">+{sessionSummary.toolUsage.length - 6} more</span>
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
                      {sessionSummary.filesModified.length} file{sessionSummary.filesModified.length !== 1 ? "s" : ""}
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
                      {sessionSummary.tasks.length} task{sessionSummary.tasks.length !== 1 ? "s" : ""}
                    </button>
                  {/if}
                {/if}
              </div>

              <!-- Token usage -->
              {#if sessionSummary?.usage !== undefined && (sessionSummary.usage.inputTokens > 0 || sessionSummary.usage.outputTokens > 0)}
                <div class="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-text-tertiary">
                  <span>in:{formatTokenCount(sessionSummary.usage.inputTokens)}</span>
                  <span>out:{formatTokenCount(sessionSummary.usage.outputTokens)}</span>
                  {#if sessionSummary.usage.cacheCreationTokens > 0}
                    <span>cache-w:{formatTokenCount(sessionSummary.usage.cacheCreationTokens)}</span>
                  {/if}
                  {#if sessionSummary.usage.cacheReadTokens > 0}
                    <span>cache-r:{formatTokenCount(sessionSummary.usage.cacheReadTokens)}</span>
                  {/if}
                </div>
              {/if}

              <!-- Expandable file list -->
              {#if filesExpanded && sessionSummary !== null && sessionSummary.filesModified.length > 0}
                <div class="mt-2 space-y-0.5">
                  {#each sessionSummary.filesModified as file}
                    <div class="flex items-center gap-2 py-0.5 text-[11px]">
                      <span class="shrink-0 px-1 rounded text-[9px] font-bold {file.tool === 'Edit' ? 'bg-attention-muted text-attention-fg' : 'bg-success-muted text-success-fg'}">
                        {file.tool === "Edit" ? "M" : "A"}
                      </span>
                      <span class="text-text-secondary font-mono truncate" title={file.path}>
                        {shortPath(file.path)}
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Expandable task list -->
              {#if tasksExpanded && sessionSummary !== null && sessionSummary.tasks.length > 0}
                <div class="mt-2 space-y-0.5">
                  {#each sessionSummary.tasks as task}
                    <div class="flex items-center gap-2 py-0.5 text-[11px]">
                      <span class="shrink-0 w-2 h-2 rounded-full {getTaskStatusColor(task.status)}"></span>
                      <span class="text-text-primary truncate">{task.subject}</span>
                      <span class="text-text-tertiary shrink-0">{task.status}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Inline transcript (same as Sessions screen) -->
            <SessionTranscriptInline sessionId={recentCliSession.sessionId} {contextId} />
          {/if}
        </div>
      {/if}
    {/if}
  </div>
{/if}
