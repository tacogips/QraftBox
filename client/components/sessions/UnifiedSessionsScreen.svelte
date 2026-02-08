<script lang="ts">
  /**
   * UnifiedSessionsScreen Component
   *
   * Main screen that unifies active (running/queued) sessions and history
   * (completed QraftBox + Claude CLI sessions) into a single tabbed view.
   *
   * Props:
   * - onBack: Callback to navigate back to diff view
   */

  import type { AISession } from "../../../src/types/ai";
  import { createQueueStore } from "../../src/stores/queue";
  import { claudeSessionsStore } from "../../src/stores/claude-sessions";
  import SubTabNav from "./SubTabNav.svelte";
  import ActiveSessionsPanel from "./ActiveSessionsPanel.svelte";
  import HistorySessionsPanel from "./HistorySessionsPanel.svelte";
  import SessionTranscriptViewer from "./SessionTranscriptViewer.svelte";

  interface Props {
    contextId: string;
    projectPath: string;
    onBack: () => void;
  }

  const { contextId, projectPath, onBack }: Props = $props();

  /**
   * Selected session state for transcript viewing
   */
  let selectedSessionId = $state<string | null>(null);
  let selectedSessionTitle = $state<string>("");

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
   * Default sub-tab: "active" if running or queued sessions exist, else "history"
   */
  const defaultTab = $derived<"active" | "history">(
    queueStore.running.length > 0 || queueStore.queued.length > 0
      ? "active"
      : "history",
  );

  let currentSubTab = $state<"active" | "history" | null>(null);

  /**
   * Effective tab: use user selection if set, otherwise default
   */
  const effectiveTab = $derived(currentSubTab ?? defaultTab);

  /**
   * History count: updated by HistorySessionsPanel via callback
   * (claudeSessionsStore.total is not Svelte-reactive)
   */
  let historyCount = $state(0);

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
   */
  async function handleResumeSession(sessionId: string): Promise<void> {
    try {
      await claudeSessionsStore.resumeSession(sessionId);
    } catch (e) {
      console.error("Failed to resume session:", e);
    }
  }

  /**
   * Handle select session in history (view transcript)
   */
  function handleHistorySelectSession(sessionId: string): void {
    // Look up the session title from Claude CLI sessions or QraftBox completed sessions
    const cliSession = claudeSessionsStore.sessions.find(
      (s) => s.sessionId === sessionId,
    );
    if (cliSession !== undefined) {
      selectedSessionTitle =
        cliSession.summary || cliSession.firstPrompt.slice(0, 80) || sessionId;
    } else {
      const qbSession = queueStore.completed.find((s) => s.id === sessionId);
      selectedSessionTitle =
        qbSession !== undefined
          ? qbSession.prompt.slice(0, 80) || sessionId
          : sessionId;
    }
    selectedSessionId = sessionId;
  }

  /**
   * Handle back from transcript view to session list
   */
  function handleTranscriptBack(): void {
    selectedSessionId = null;
    selectedSessionTitle = "";
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

{#if selectedSessionId !== null}
  <!-- Transcript Viewer -->
  <SessionTranscriptViewer
    sessionId={selectedSessionId}
    sessionTitle={selectedSessionTitle}
    {contextId}
    onBack={handleTranscriptBack}
  />
{:else}
  <div
    class="flex flex-col h-full bg-bg-primary"
    role="main"
    aria-label="Sessions"
  >
    <!-- Header -->
    <header
      class="flex items-center gap-3 px-4 py-3
             bg-bg-secondary border-b border-border-default"
    >
      <!-- Back button -->
      <button
        type="button"
        onclick={onBack}
        class="p-2 min-w-[44px] min-h-[44px]
               text-text-secondary hover:text-text-primary
               hover:bg-bg-hover rounded-lg
               transition-colors
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
        aria-label="Back to diff view"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <h1 class="text-lg font-semibold text-text-primary">Sessions</h1>
    </header>

    <!-- Sub-tab navigation -->
    <SubTabNav
      activeTab={effectiveTab}
      onTabChange={(tab) => (currentSubTab = tab)}
      runningCount={queueStore.running.length}
      queuedCount={queueStore.queued.length}
      {historyCount}
    />

    <!-- Content based on sub-tab -->
    <div class="flex-1 overflow-y-auto">
      {#if effectiveTab === "active"}
        <div class="px-4 py-4">
          <ActiveSessionsPanel
            running={queueStore.running}
            queued={queueStore.queued}
            onSelectSession={handleSelectSession}
            onCancelSession={(id) => void handleCancelSession(id)}
            onRunNow={(id) => void handleRunNow(id)}
            onRemoveFromQueue={(id) => void handleRemoveFromQueue(id)}
          />
        </div>
      {:else}
        <HistorySessionsPanel
          completedSessions={queueStore.completed}
          onResumeSession={handleResumeSession}
          onSelectSession={handleHistorySelectSession}
          onClearCompleted={handleClearCompleted}
          onCountChange={(count) => (historyCount = count)}
        />
      {/if}
    </div>
  </div>
{/if}
