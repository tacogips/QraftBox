<script lang="ts">
  /**
   * CurrentSessionPanel Component
   *
   * Compact panel shown above the AIPromptPanel in the Changes screen.
   * Displays the currently running session and queued prompt count,
   * both expandable on click. Reuses the visual style of the
   * HistorySessionsPanel session rows.
   *
   * Props:
   * - running: Currently running AI sessions
   * - queued: Queued AI sessions
   * - onCancelSession: Callback to cancel a session
   */

  import type { AISession } from "../../src/types/ai";
  import { stripSystemTags } from "../../src/utils/strip-system-tags";

  interface Props {
    running: readonly AISession[];
    queued: readonly AISession[];
    onCancelSession: (id: string) => void;
  }

  const { running, queued, onCancelSession }: Props = $props();

  /**
   * Whether the running session card is expanded
   */
  let runningExpanded = $state(false);

  /**
   * Whether the queued prompts list is expanded
   */
  let queueExpanded = $state(false);

  /**
   * Current running session (first one, if any)
   */
  const currentSession = $derived(running.length > 0 ? running[0] : null);

  /**
   * Whether there is any content to show
   */
  const hasContent = $derived(running.length > 0 || queued.length > 0);

  /**
   * Elapsed time in seconds for the running session
   */
  let elapsedSeconds = $state(0);

  $effect(() => {
    if (currentSession === null || currentSession === undefined || currentSession.startedAt === undefined) {
      elapsedSeconds = 0;
      return;
    }

    const startTime = new Date(currentSession.startedAt).getTime();
    const updateElapsed = (): void => {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  });

  /**
   * Format elapsed time as m:ss
   */
  const elapsedFormatted = $derived.by(() => {
    const min = Math.floor(elapsedSeconds / 60);
    const sec = elapsedSeconds % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  });

  /**
   * Truncate prompt for display
   */
  function truncatePrompt(prompt: string, maxLen = 100): string {
    const stripped = stripSystemTags(prompt).replaceAll("\n", " ");
    if (stripped.length <= maxLen) return stripped;
    return stripped.slice(0, maxLen) + "...";
  }
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
               {running.length > 0 ? 'border-b border-border-default' : ''}"
      >
        <!-- Expand/collapse chevron -->
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

        <!-- Queue dot -->
        <span class="w-2 h-2 rounded-full bg-attention-emphasis shrink-0"></span>

        <!-- Count text -->
        <span class="text-xs text-text-secondary">
          {queued.length} queued prompt{queued.length !== 1 ? "s" : ""}
        </span>
      </button>

      <!-- Expanded queued list -->
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
                {truncatePrompt(session.prompt, 120)}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- Running session row -->
    {#if currentSession !== null && currentSession !== undefined}
      <button
        type="button"
        onclick={() => (runningExpanded = !runningExpanded)}
        class="w-full flex items-center gap-2 px-4 py-1.5
               hover:bg-bg-hover transition-colors text-left"
      >
        <!-- Expand/collapse chevron -->
        <svg
          class="w-3 h-3 text-text-tertiary transition-transform shrink-0
                 {runningExpanded ? 'rotate-90' : ''}"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path
            d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"
          />
        </svg>

        <!-- Spinning indicator -->
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

        <!-- Badge -->
        <span
          class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-muted text-accent-fg"
        >
          Running
        </span>

        <!-- Prompt text -->
        <span class="flex-1 text-xs text-text-primary truncate">
          {truncatePrompt(currentSession.prompt)}
        </span>

        <!-- Current activity -->
        {#if currentSession.currentActivity}
          <span class="text-[10px] text-text-tertiary shrink-0 animate-pulse">
            {currentSession.currentActivity}
          </span>
        {/if}

        <!-- Elapsed time -->
        <span class="text-xs font-mono text-text-tertiary tabular-nums shrink-0">
          {elapsedFormatted}
        </span>
      </button>

      <!-- Expanded running session details -->
      {#if runningExpanded}
        <div
          class="border-t border-border-default/50 bg-bg-primary px-6 py-2"
        >
          <!-- Full prompt text -->
          <p class="text-xs text-text-primary whitespace-pre-wrap mb-2">
            {stripSystemTags(currentSession.prompt)}
          </p>

          <!-- Context info -->
          {#if currentSession.context.primaryFile !== undefined}
            <div class="flex items-center gap-1.5 text-[10px] text-text-tertiary mb-2">
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span class="truncate">
                {currentSession.context.primaryFile.path}
              </span>
            </div>
          {/if}

          <!-- Cancel button -->
          <div class="flex justify-end">
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                onCancelSession(currentSession.id);
              }}
              class="px-2 py-0.5 text-[10px] font-medium rounded
                     bg-danger-emphasis/10 text-danger-fg hover:bg-danger-emphasis/20
                     border border-danger-emphasis/30
                     transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
{/if}
