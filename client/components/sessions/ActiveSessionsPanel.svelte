<script lang="ts">
  /**
   * ActiveSessionsPanel Component
   *
   * Displays running and queued AI sessions.
   * Extracted from SessionQueueScreen for use in the unified sessions screen.
   *
   * Props:
   * - running: Currently running sessions
   * - queued: Sessions waiting in queue
   * - onSelectSession: Callback when a session is selected
   * - onCancelSession: Callback to cancel a session
   * - onRunNow: Callback to run a queued session immediately
   * - onRemoveFromQueue: Callback to remove a session from queue
   */

  import type { AISession } from "../../../src/types/ai";
  import RunningSession from "../session/RunningSession.svelte";
  import SessionCard from "../session/SessionCard.svelte";

  interface Props {
    running: AISession[];
    queued: AISession[];
    onSelectSession: (session: AISession) => void;
    onCancelSession: (sessionId: string) => void;
    onRunNow: (sessionId: string) => void;
    onRemoveFromQueue: (sessionId: string) => void;
  }

  const {
    running,
    queued,
    onSelectSession,
    onCancelSession,
    onRunNow,
    onRemoveFromQueue,
  }: Props = $props();

  const isEmpty = $derived(running.length === 0 && queued.length === 0);
</script>

<div class="active-sessions-panel space-y-6">
  {#if isEmpty}
    <!-- Empty state - intentionally minimal -->
    <div class="py-6"></div>
  {:else}
    <!-- Running Section -->
    {#if running.length > 0}
      <section aria-labelledby="running-heading">
        <h2
          id="running-heading"
          class="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2"
        >
          <svg
            class="animate-spin-smooth h-4 w-4 text-accent-fg shrink-0"
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
          RUNNING ({running.length})
        </h2>
        <div class="space-y-3">
          {#each running as session (session.id)}
            <RunningSession
              {session}
              onCancel={() => onCancelSession(session.id)}
              onSelect={() => onSelectSession(session)}
            />
          {/each}
        </div>
      </section>
    {/if}

    <!-- Queued Section -->
    {#if queued.length > 0}
      <section aria-labelledby="queued-heading">
        <h2
          id="queued-heading"
          class="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2"
        >
          <span
            class="inline-block w-2 h-2 rounded-full bg-attention-emphasis"
          />
          QUEUED ({queued.length})
        </h2>
        <div class="space-y-3">
          {#each queued as session, index (session.id)}
            <SessionCard
              {session}
              variant="queued"
              onSelect={() => onSelectSession(session)}
              onCancel={() => onCancelSession(session.id)}
              onRunNow={index === 0 ? () => onRunNow(session.id) : undefined}
              onRemove={() => onRemoveFromQueue(session.id)}
            />
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>
