<script lang="ts">
  /**
   * SessionCard Component
   *
   * Displays a session summary with variant-specific actions.
   *
   * Props:
   * - session: The AI session to display
   * - variant: running | queued | completed
   * - onSelect: Callback when card is selected
   * - onCancel: Callback to cancel session (running/queued)
   * - onRunNow: Callback to run immediately (queued only)
   * - onRemove: Callback to remove (queued/completed)
   *
   * Design:
   * - Compact card with session summary
   * - Status indicator
   * - Context info (file, lines)
   * - Touch-friendly tap target
   */

  import type { AISession, SessionState } from "../../../src/types/ai";

  interface Props {
    session: AISession;
    variant: "running" | "queued" | "completed";
    onSelect: () => void;
    onCancel?: (() => void) | undefined;
    onRunNow?: (() => void) | undefined;
    onRemove?: (() => void) | undefined;
  }

  // Svelte 5 props syntax
  const {
    session,
    variant,
    onSelect,
    onCancel = undefined,
    onRunNow = undefined,
    onRemove = undefined,
  }: Props = $props();

  /**
   * Get status color based on state
   */
  function getStatusColor(state: SessionState): string {
    switch (state) {
      case "running":
        return "bg-accent-emphasis";
      case "queued":
        return "bg-attention-emphasis";
      case "completed":
        return "bg-success-emphasis";
      case "failed":
        return "bg-danger-emphasis";
      case "cancelled":
        return "bg-bg-emphasis";
      default:
        return "bg-bg-emphasis";
    }
  }

  /**
   * Get status text
   */
  function getStatusText(state: SessionState): string {
    switch (state) {
      case "running":
        return "Running";
      case "queued":
        return "Queued";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "cancelled":
        return "Cancelled";
      default:
        return "Unknown";
    }
  }

  /**
   * Get relative time string
   */
  function getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return `${diffDay}d ago`;
  }

  /**
   * Truncate prompt for display
   */
  function truncatePrompt(prompt: string, maxLength = 100): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.slice(0, maxLength) + "...";
  }

  /**
   * Get context summary
   */
  const contextSummary = $derived.by(() => {
    if (session.context.primaryFile !== undefined) {
      const pf = session.context.primaryFile;
      const lineRange =
        pf.startLine === pf.endLine
          ? `L${pf.startLine}`
          : `L${pf.startLine}-${pf.endLine}`;
      return `${pf.path}:${lineRange}`;
    }
    if (session.context.references.length > 0) {
      const first = session.context.references[0]!;
      const more =
        session.context.references.length > 1
          ? ` +${session.context.references.length - 1}`
          : "";
      return `${first.path}${more}`;
    }
    return null;
  });

  /**
   * Handle card click - only navigate if user is not selecting text
   */
  function handleCardClick(): void {
    const selection = window.getSelection();
    if (selection !== null && selection.toString().length > 0) {
      return;
    }
    onSelect();
  }

  /**
   * Handle action button clicks (stop propagation)
   */
  function handleActionClick(
    event: MouseEvent,
    callback: (() => void) | undefined,
  ): void {
    event.stopPropagation();
    if (callback !== undefined) {
      callback();
    }
  }
</script>

<div
  class="session-card group relative border
         rounded-lg overflow-hidden
         {variant === 'running'
    ? 'animate-session-glow border-accent-emphasis/50'
    : 'bg-bg-secondary border-border-default hover:border-accent-emphasis/50 hover:bg-bg-hover'}
         transition-colors duration-150"
  role="article"
  aria-label={`Session: ${truncatePrompt(session.prompt, 50)}`}
>
  <!-- Main clickable area -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onclick={handleCardClick}
    class="w-full p-4 min-h-[80px] text-left cursor-pointer select-text"
  >
    <!-- Header row -->
    <div class="flex items-start justify-between gap-3 mb-2">
      <!-- Status indicator -->
      <div class="flex items-center gap-2 flex-shrink-0">
        {#if variant === "running"}
          <!-- Spinning arrow for active sessions -->
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
        {:else}
          <span
            class="inline-block w-2 h-2 rounded-full {getStatusColor(
              session.state,
            )}"
            aria-hidden="true"
          />
        {/if}
        <span class="text-xs font-medium text-text-secondary">
          {getStatusText(session.state)}
        </span>
        {#if variant === "running" && session.currentActivity}
          <span class="text-xs text-text-tertiary animate-pulse">
            {session.currentActivity}
          </span>
        {/if}
      </div>

      <!-- Timestamp -->
      <span class="text-xs text-text-tertiary flex-shrink-0">
        {getRelativeTime(session.createdAt)}
      </span>
    </div>

    <!-- Prompt text -->
    <p class="text-sm text-text-primary mb-2 line-clamp-2">
      {truncatePrompt(session.prompt)}
    </p>

    <!-- Context info -->
    {#if contextSummary !== null}
      <div class="flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-text-tertiary"
          aria-hidden="true"
        >
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span class="text-xs text-text-tertiary truncate">
          {contextSummary}
        </span>
      </div>
    {/if}
  </div>

  <!-- Action buttons (appear on hover/focus) -->
  <div
    class="absolute bottom-2 right-2 flex items-center gap-1
           opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
           transition-opacity duration-150"
  >
    {#if variant === "running" && onCancel !== undefined}
      <button
        type="button"
        onclick={(e) => handleActionClick(e, onCancel)}
        class="p-2 min-w-[36px] min-h-[36px]
               bg-danger-emphasis/20 text-danger-fg hover:bg-danger-emphasis/30
               rounded transition-colors
               focus:outline-none focus:ring-2 focus:ring-danger-emphasis"
        aria-label="Cancel session"
        title="Cancel"
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
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        </svg>
      </button>
    {/if}

    {#if variant === "queued"}
      {#if onRunNow !== undefined}
        <button
          type="button"
          onclick={(e) => handleActionClick(e, onRunNow)}
          class="p-2 min-w-[36px] min-h-[36px]
                 bg-success-emphasis/20 text-success-fg hover:bg-success-emphasis/30
                 rounded transition-colors
                 focus:outline-none focus:ring-2 focus:ring-success-emphasis"
          aria-label="Run now"
          title="Run Now"
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
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>
      {/if}
      {#if onCancel !== undefined}
        <button
          type="button"
          onclick={(e) => handleActionClick(e, onCancel)}
          class="p-2 min-w-[36px] min-h-[36px]
                 bg-attention-emphasis/20 text-attention-fg hover:bg-attention-emphasis/30
                 rounded transition-colors
                 focus:outline-none focus:ring-2 focus:ring-attention-emphasis"
          aria-label="Cancel"
          title="Cancel"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      {/if}
    {/if}

    {#if variant === "completed" && onRemove !== undefined}
      <button
        type="button"
        onclick={(e) => handleActionClick(e, onRemove)}
        class="p-2 min-w-[36px] min-h-[36px]
               bg-bg-tertiary text-text-tertiary hover:text-danger-fg hover:bg-danger-emphasis/20
               rounded transition-colors
               focus:outline-none focus:ring-2 focus:ring-danger-emphasis"
        aria-label="Remove"
        title="Remove"
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
          <polyline points="3 6 5 6 21 6" />
          <path
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          />
        </svg>
      </button>
    {/if}
  </div>
</div>

<style>
  /* Line clamp for prompt truncation */
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
