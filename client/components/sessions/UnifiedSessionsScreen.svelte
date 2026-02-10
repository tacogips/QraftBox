<script lang="ts">
  /**
   * UnifiedSessionsScreen Component
   *
   * Main screen showing all sessions for the current project directory
   * in a single scrollable view. Running/queued sessions appear at the top,
   * followed by the full session history list.
   *
   * Props:
   * - contextId: Context ID for API calls
   * - projectPath: Current project directory path
   */

  import type { AISession } from "../../../src/types/ai";
  import type { LocalPrompt } from "../../../src/types/local-prompt";
  import { createQueueStore } from "../../src/stores/queue";
  import { claudeSessionsStore } from "../../src/stores/claude-sessions";
  import ActiveSessionsPanel from "./ActiveSessionsPanel.svelte";
  import HistorySessionsPanel from "./HistorySessionsPanel.svelte";
  import PendingPromptsPanel from "./PendingPromptsPanel.svelte";

  interface Props {
    contextId: string;
    projectPath: string;
    onResumeToChanges?: (() => void) | undefined;
  }

  const {
    contextId,
    projectPath,
    onResumeToChanges = undefined,
  }: Props = $props();

  /**
   * Queue store instance
   */
  const queueStore = createQueueStore();
  let runningSessions = $state<readonly AISession[]>([]);
  let queuedSessions = $state<readonly AISession[]>([]);
  let completedSessions = $state<readonly AISession[]>([]);
  let pendingPrompts = $state<LocalPrompt[]>([]);

  function syncFromQueueStore(): void {
    runningSessions = [...queueStore.running];
    queuedSessions = [...queueStore.queued];
    completedSessions = [...queueStore.completed];
  }

  /**
   * Fetch pending prompts from local prompt store
   */
  async function fetchPendingPrompts(): Promise<void> {
    try {
      const response = await fetch("/api/prompts?status=pending");
      if (!response.ok) return;
      const data = (await response.json()) as {
        prompts: LocalPrompt[];
        total: number;
      };
      pendingPrompts = data.prompts;
    } catch {
      // Non-critical
    }
  }

  /**
   * Reactively configure the claude sessions store when contextId or projectPath changes.
   * This runs on initial render AND whenever the user switches projects.
   */
  $effect(() => {
    claudeSessionsStore.reset();
    if (contextId.length > 0) {
      claudeSessionsStore.setContextId(contextId);
    }
    if (projectPath.length > 0) {
      claudeSessionsStore.setInitialFilters({
        workingDirectoryPrefix: projectPath,
      });
    }
    void claudeSessionsStore.fetchSessions();
  });

  /**
   * Load queue and pending prompts on mount
   */
  $effect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = async (): Promise<void> => {
      await queueStore.loadQueue();
      await fetchPendingPrompts();
      if (!cancelled) {
        syncFromQueueStore();
      }
    };

    void refresh();
    timer = setInterval(() => {
      void refresh();
    }, 3000);

    return () => {
      cancelled = true;
      if (timer !== null) {
        clearInterval(timer);
      }
    };
  });

  /**
   * Whether there are any active (running/queued) sessions or pending prompts
   */
  const hasActiveSessions = $derived(
    runningSessions.length > 0 ||
      queuedSessions.length > 0 ||
      pendingPrompts.length > 0,
  );

  /**
   * Handle session selection from ActiveSessionsPanel
   */
  function handleSelectSession(session: AISession): void {
    queueStore.selectSession(session.id);
  }

  /**
   * Handle cancel session
   */
  async function handleCancelSession(sessionId: string): Promise<void> {
    try {
      await queueStore.cancelSession(sessionId);
      syncFromQueueStore();
    } catch (e) {
      console.error("Failed to cancel session:", e);
    }
  }

  /**
   * Handle run now
   */
  async function handleRunNow(sessionId: string): Promise<void> {
    try {
      await queueStore.runNow(sessionId);
      syncFromQueueStore();
    } catch (e) {
      console.error("Failed to run session:", e);
    }
  }

  /**
   * Handle remove from queue
   */
  async function handleRemoveFromQueue(sessionId: string): Promise<void> {
    try {
      await queueStore.removeFromQueue(sessionId);
      syncFromQueueStore();
    } catch (e) {
      console.error("Failed to remove session:", e);
    }
  }

  /**
   * Handle resume session (Claude CLI)
   * After resume, navigate to Changes screen if callback provided
   */
  async function handleResumeSession(sessionId: string): Promise<void> {
    try {
      await claudeSessionsStore.resumeSession(sessionId);
      if (onResumeToChanges !== undefined) {
        onResumeToChanges();
      }
    } catch (e) {
      console.error("Failed to resume session:", e);
    }
  }

  /**
   * Handle clear completed
   */
  async function handleClearCompleted(): Promise<void> {
    try {
      await queueStore.clearCompleted();
      syncFromQueueStore();
    } catch (e) {
      console.error("Failed to clear completed:", e);
    }
  }

  /**
   * Handle resume pending prompt - dispatch it
   */
  async function handleResumePendingPrompt(promptId: string): Promise<void> {
    try {
      const response = await fetch(`/api/prompts/${promptId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediate: true }),
      });
      if (response.ok) {
        await fetchPendingPrompts();
        await queueStore.loadQueue();
        syncFromQueueStore();
      }
    } catch (e) {
      console.error("Failed to resume prompt:", e);
    }
  }

  /**
   * Handle cancel pending prompt
   */
  async function handleCancelPendingPrompt(promptId: string): Promise<void> {
    try {
      const response = await fetch(`/api/prompts/${promptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (response.ok) {
        await fetchPendingPrompts();
      }
    } catch (e) {
      console.error("Failed to cancel prompt:", e);
    }
  }

  /**
   * Handle cancel all pending prompts
   */
  async function handleCancelAllPendingPrompts(): Promise<void> {
    try {
      await Promise.all(
        pendingPrompts.map((p) =>
          fetch(`/api/prompts/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "cancelled" }),
          }),
        ),
      );
      await fetchPendingPrompts();
    } catch (e) {
      console.error("Failed to cancel all pending prompts:", e);
    }
  }

  /**
   * Handle delete pending prompt
   */
  async function handleDeletePendingPrompt(promptId: string): Promise<void> {
    try {
      const response = await fetch(`/api/prompts/${promptId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await fetchPendingPrompts();
      }
    } catch (e) {
      console.error("Failed to delete prompt:", e);
    }
  }
</script>

<div
  class="flex flex-col h-full bg-bg-primary"
  role="main"
  aria-label="Sessions"
>
  <!-- Single scrollable content area -->
  <div class="flex-1 overflow-y-auto">
    <!-- Active sessions (running/queued) and pending prompts shown at top when present -->
    {#if hasActiveSessions}
      <div class="px-4 py-4 border-b border-border-default">
        <PendingPromptsPanel
          prompts={pendingPrompts}
          onResume={(id) => void handleResumePendingPrompt(id)}
          onCancel={(id) => void handleCancelPendingPrompt(id)}
          onCancelAll={() => void handleCancelAllPendingPrompts()}
          onDelete={(id) => void handleDeletePendingPrompt(id)}
        />
        <ActiveSessionsPanel
          running={[...runningSessions]}
          queued={[...queuedSessions]}
          onSelectSession={handleSelectSession}
          onCancelSession={(id) => void handleCancelSession(id)}
          onRunNow={(id) => void handleRunNow(id)}
          onRemoveFromQueue={(id) => void handleRemoveFromQueue(id)}
        />
      </div>
    {/if}

    <!-- Session history list (always visible) -->
    <HistorySessionsPanel
      {contextId}
      {completedSessions}
      onResumeSession={handleResumeSession}
      onSelectSession={() => {}}
      onClearCompleted={handleClearCompleted}
    />
  </div>
</div>
