<script lang="ts">
  /**
   * SessionCard Component
   *
   * Displays a single Claude session with metadata and actions.
   * Shows session source, title, metadata, and resume/view buttons.
   *
   * Props:
   * - session: Extended session entry with all metadata
   * - onResume: Callback when resume button is clicked
   * - onView: Callback when view button is clicked (optional)
   *
   * Design:
   * - Source badge (QraftBox/CLI) with distinct colors
   * - First prompt as title (truncated)
   * - Metadata: project path, branch, message count
   * - Relative timestamps
   * - Action buttons (Resume, View)
   * - Hover state for interactive feedback
   */

  import type { ExtendedSessionEntry } from "../../../src/types/claude-session";

  interface Props {
    session: ExtendedSessionEntry;
    onResume: (sessionId: string) => void;
    onView?: (sessionId: string) => void;
  }

  const { session, onResume, onView }: Props = $props();

  /**
   * Get relative time string (e.g., "2 hours ago", "yesterday")
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
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }

  /**
   * Truncate text to max length with ellipsis
   */
  function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  }

  /**
   * Get source badge color classes
   */
  const sourceBadgeClasses = $derived.by(() => {
    switch (session.source) {
      case "qraftbox":
        return "bg-accent-muted text-accent-fg border-accent-emphasis/30";
      case "claude-cli":
        return "bg-done-muted text-done-fg border-done-emphasis/30";
      case "codex-cli":
        return "bg-attention-emphasis/20 text-attention-fg border-attention-emphasis/40";
      default:
        return "bg-bg-emphasis/20 text-text-tertiary border-border-emphasis/30";
    }
  });

  /**
   * Get source badge text
   */
  const sourceBadgeText = $derived.by(() => {
    switch (session.source) {
      case "qraftbox":
        return "QraftBox";
      case "claude-cli":
        return "Claude CLI";
      case "codex-cli":
        return "Codex CLI";
      default:
        return "UNKNOWN";
    }
  });

  /**
   * Extract project name from path
   */
  const projectName = $derived.by(() => {
    const parts = session.projectPath.split("/");
    return parts[parts.length - 1] || session.projectPath;
  });

  /**
   * Relative timestamp
   */
  const relativeTime = $derived(getRelativeTime(session.modified));

  /**
   * Handle resume button click
   */
  function handleResume(): void {
    onResume(session.qraftAiSessionId);
  }

  /**
   * Handle view button click
   */
  function handleView(): void {
    if (onView !== undefined) {
      onView(session.qraftAiSessionId);
    }
  }
</script>

<!-- Session Card -->
<article
  class="session-card p-4 rounded-lg border border-bg-border
         bg-bg-primary hover:bg-bg-secondary hover:border-accent-emphasis/30
         transition-all duration-150 group"
  aria-label={`Claude session: ${truncate(session.firstPrompt, 100)}`}
>
  <!-- Header: Source Badge + Title + Time -->
  <div class="flex items-start gap-3 mb-3">
    <!-- Source Badge -->
    <span
      class="source-badge inline-flex items-center px-2 py-1 rounded-md
             text-xs font-bold border shrink-0
             {sourceBadgeClasses}"
      aria-label={`Session source: ${session.source}`}
    >
      {sourceBadgeText}
    </span>

    <!-- Title (First Prompt) -->
    <h3
      class="flex-1 text-sm font-medium text-text-primary line-clamp-2
             group-hover:text-accent-fg transition-colors"
      title={session.firstPrompt}
    >
      {truncate(session.firstPrompt, 120)}
    </h3>

    <!-- Relative Time -->
    <time
      datetime={session.modified}
      class="text-xs text-text-tertiary shrink-0 whitespace-nowrap"
      title={new Date(session.modified).toLocaleString()}
    >
      {relativeTime}
    </time>
  </div>

  <!-- Summary (if available) -->
  {#if session.summary && session.summary !== session.firstPrompt}
    <p
      class="text-sm text-text-secondary mb-3 line-clamp-2"
      title={session.summary}
    >
      {truncate(session.summary, 200)}
    </p>
  {/if}

  <!-- Metadata: Project + Branch + Message Count -->
  <div
    class="metadata flex flex-wrap items-center gap-x-4 gap-y-1 mb-3
           text-xs text-text-tertiary"
  >
    <!-- Project Path -->
    <div class="flex items-center gap-1.5" title={session.projectPath}>
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
          d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
        />
      </svg>
      <span class="truncate max-w-[200px]">{projectName}</span>
    </div>

    <!-- Git Branch -->
    {#if session.gitBranch}
      <div class="flex items-center gap-1.5">
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
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        <span>{session.gitBranch}</span>
      </div>
    {/if}

    <!-- Message Count -->
    <div class="flex items-center gap-1.5">
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
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        />
      </svg>
      <span
        >{session.messageCount} message{session.messageCount !== 1
          ? "s"
          : ""}</span
      >
    </div>

    <!-- Sidechain Badge -->
    {#if session.isSidechain}
      <span
        class="inline-flex items-center px-1.5 py-0.5 rounded
               text-[10px] font-medium
               bg-attention-emphasis/20 text-attention-fg border border-attention-emphasis"
        title="Sidechain session"
      >
        SIDECHAIN
      </span>
    {/if}
  </div>

  <!-- Actions: Resume + View Buttons -->
  <div class="actions flex gap-2">
    <!-- Resume Button -->
    <button
      type="button"
      onclick={handleResume}
      class="flex-1 px-3 py-2 rounded-md text-sm font-medium
             bg-bg-tertiary hover:bg-bg-hover text-text-primary border border-border-default
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-2 focus:ring-offset-bg-primary
             transition-colors duration-150"
      aria-label={`Resume session: ${truncate(session.firstPrompt, 50)}`}
    >
      Resume
    </button>

    <!-- View Details Button (Optional) -->
    {#if onView !== undefined}
      <button
        type="button"
        onclick={handleView}
        class="px-3 py-2 rounded-md text-sm font-medium
               bg-bg-tertiary hover:bg-bg-hover text-text-primary
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-2 focus:ring-offset-bg-primary
               transition-colors duration-150"
        aria-label={`View session details: ${truncate(session.firstPrompt, 50)}`}
      >
        View
      </button>
    {/if}
  </div>
</article>
