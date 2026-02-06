<script lang="ts">
/**
 * SessionQueueScreen Component
 *
 * Main screen for managing AI sessions with queue display.
 *
 * Props:
 * - onBack: Callback to navigate back to diff view
 * - onSelectSession: Callback when a session is selected
 * - onBrowseAllSessions: Optional callback to navigate to Claude sessions browser
 *
 * Design:
 * - Running, Queued, and Completed sections
 * - Clear completed button
 * - Browse all sessions button
 * - Back navigation
 */

import type { AISession, ConversationViewMode } from "../../../src/types/ai";
import { createQueueStore } from "../../src/stores/queue";
import SessionCard from "./SessionCard.svelte";
import RunningSession from "./RunningSession.svelte";

interface Props {
  onBack: () => void;
  onSelectSession: (sessionId: string) => void;
  onBrowseAllSessions?: () => void;
}

// Svelte 5 props syntax
const { onBack, onSelectSession, onBrowseAllSessions }: Props = $props();

/**
 * Queue store instance
 */
const queueStore = createQueueStore();

/**
 * Load queue on mount
 */
$effect(() => {
  void queueStore.loadQueue();
});

/**
 * Handle session selection
 */
function handleSelectSession(session: AISession): void {
  queueStore.selectSession(session.id);
  onSelectSession(session.id);
}

/**
 * Handle cancel session
 */
async function handleCancelSession(sessionId: string): Promise<void> {
  try {
    await queueStore.cancelSession(sessionId);
  } catch (e) {
    // Error is stored in queueStore.error
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
  class="session-queue-screen flex flex-col h-full bg-bg-primary"
  role="main"
  aria-label="Session Queue"
>
  <!-- Header -->
  <header
    class="flex items-center justify-between px-4 py-3
           bg-bg-secondary border-b border-border-default"
  >
    <div class="flex items-center gap-3">
      <!-- Back button -->
      <button
        type="button"
        onclick={onBack}
        class="p-2 min-w-[44px] min-h-[44px]
               text-text-secondary hover:text-text-primary
               hover:bg-bg-hover rounded-lg
               transition-colors
               focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      <h1 class="text-lg font-semibold text-text-primary">
        AI Sessions
      </h1>
    </div>

    <div class="flex items-center gap-2">
      <!-- Browse all sessions button -->
      {#if onBrowseAllSessions !== undefined}
        <button
          type="button"
          onclick={onBrowseAllSessions}
          class="px-3 py-1.5 text-sm
                 text-text-secondary hover:text-blue-400
                 hover:bg-blue-600/10 rounded-lg
                 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-blue-500
                 flex items-center gap-2"
          aria-label="Browse all Claude sessions"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
          Browse All Sessions
        </button>
      {/if}

      <!-- Clear completed button -->
      {#if queueStore.completed.length > 0}
        <button
          type="button"
          onclick={() => void handleClearCompleted()}
          class="px-3 py-1.5 text-sm
                 text-text-secondary hover:text-red-400
                 hover:bg-red-600/10 rounded-lg
                 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          Clear Completed
        </button>
      {/if}
    </div>
  </header>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto px-4 py-4 space-y-6">
    <!-- Error message -->
    {#if queueStore.error !== null}
      <div
        class="p-4 bg-red-600/10 border border-red-500/30 rounded-lg"
        role="alert"
      >
        <p class="text-sm text-red-400">{queueStore.error}</p>
      </div>
    {/if}

    <!-- Loading state -->
    {#if queueStore.loading}
      <div class="flex items-center justify-center py-8">
        <svg
          class="animate-spin h-6 w-6 text-blue-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
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
        <span class="ml-2 text-sm text-text-secondary">Loading sessions...</span>
      </div>
    {:else}
      <!-- Running Section -->
      {#if queueStore.running.length > 0}
        <section aria-labelledby="running-heading">
          <h2
            id="running-heading"
            class="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2"
          >
            <span class="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Running ({queueStore.running.length})
          </h2>
          <div class="space-y-3">
            {#each queueStore.running as session (session.id)}
              <RunningSession
                {session}
                onCancel={() => void handleCancelSession(session.id)}
                onSelect={() => handleSelectSession(session)}
              />
            {/each}
          </div>
        </section>
      {/if}

      <!-- Queued Section -->
      {#if queueStore.queued.length > 0}
        <section aria-labelledby="queued-heading">
          <h2
            id="queued-heading"
            class="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2"
          >
            <span class="inline-block w-2 h-2 rounded-full bg-yellow-500" />
            Queued ({queueStore.queued.length})
          </h2>
          <div class="space-y-3">
            {#each queueStore.queued as session, index (session.id)}
              <SessionCard
                {session}
                variant="queued"
                onSelect={() => handleSelectSession(session)}
                onCancel={() => void handleCancelSession(session.id)}
                onRunNow={index === 0 ? () => void handleRunNow(session.id) : undefined}
                onRemove={() => void handleRemoveFromQueue(session.id)}
              />
            {/each}
          </div>
        </section>
      {/if}

      <!-- Completed Section -->
      {#if queueStore.completed.length > 0}
        <section aria-labelledby="completed-heading">
          <h2
            id="completed-heading"
            class="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2"
          >
            <span class="inline-block w-2 h-2 rounded-full bg-green-500" />
            Completed ({queueStore.completed.length})
          </h2>
          <div class="space-y-3">
            {#each queueStore.completed as session (session.id)}
              <SessionCard
                {session}
                variant="completed"
                onSelect={() => handleSelectSession(session)}
              />
            {/each}
          </div>
        </section>
      {/if}

      <!-- Empty state -->
      {#if queueStore.running.length === 0 && queueStore.queued.length === 0 && queueStore.completed.length === 0}
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-text-quaternary mb-4"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p class="text-text-secondary mb-1">No AI sessions yet</p>
          <p class="text-sm text-text-tertiary">
            Select code and press A to start an AI prompt
          </p>
        </div>
      {/if}
    {/if}
  </div>
</div>
