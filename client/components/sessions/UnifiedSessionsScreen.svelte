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
  import { createQueueStore } from "../../src/stores/queue";
  import { claudeSessionsStore } from "../../src/stores/claude-sessions";
  import ActiveSessionsPanel from "./ActiveSessionsPanel.svelte";
  import HistorySessionsPanel from "./HistorySessionsPanel.svelte";

  interface Props {
    contextId: string;
    projectPath: string;
    onResumeToChanges?: (() => void) | undefined;
  }

  const { contextId, projectPath, onResumeToChanges = undefined }: Props = $props();

  /**
   * Queue store instance
   */
  const queueStore = createQueueStore();

  /**
   * Set context ID and initial project filter on the claude sessions store synchronously
   * (must happen before child components mount and call fetchSessions)
   */
  if (contextId.length > 0) {
    claudeSessionsStore.setContextId(contextId);
  }
  if (projectPath.length > 0) {
    claudeSessionsStore.setInitialFilters({
      workingDirectoryPrefix: projectPath,
    });
  }

  /**
   * Load queue on mount
   */
  $effect(() => {
    void queueStore.loadQueue();
  });

  /**
   * Whether there are any active (running/queued) sessions
   */
  const hasActiveSessions = $derived(
    queueStore.running.length > 0 || queueStore.queued.length > 0,
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
    } catch (e) {
      console.error("Failed to clear completed:", e);
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
    <!-- Active sessions (running/queued) shown at top when present -->
    {#if hasActiveSessions}
      <div class="px-4 py-4 border-b border-border-default">
        <ActiveSessionsPanel
          running={queueStore.running}
          queued={queueStore.queued}
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
      completedSessions={queueStore.completed}
      onResumeSession={handleResumeSession}
      onSelectSession={() => {}}
      onClearCompleted={handleClearCompleted}
    />
  </div>
</div>
