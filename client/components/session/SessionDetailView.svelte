<script lang="ts">
  /**
   * SessionDetailView Component
   *
   * Displays detailed session information with conversation history.
   *
   * Props:
   * - session: The AI session to display
   * - viewMode: Current view mode (chat or carousel)
   * - onViewModeChange: Callback when view mode changes
   * - onBack: Callback to navigate back to queue
   *
   * Design:
   * - Session header with prompt summary
   * - View mode toggle (chat/carousel)
   * - Conversation display
   * - Session stats footer
   */

  import type { AISession, ConversationViewMode } from "../../../src/types/ai";
  import ConversationChatView from "./ConversationChatView.svelte";
  import ConversationCarousel from "./ConversationCarousel.svelte";
  import SessionStats from "./SessionStats.svelte";

  interface Props {
    session: AISession;
    viewMode: ConversationViewMode;
    onViewModeChange: (mode: ConversationViewMode) => void;
    onBack: () => void;
  }

  // Svelte 5 props syntax
  const { session, viewMode, onViewModeChange, onBack }: Props = $props();

  /**
   * Current carousel index (for carousel mode)
   */
  let carouselIndex = $state(0);

  /**
   * Handle carousel index change
   */
  function handleCarouselIndexChange(index: number): void {
    carouselIndex = index;
  }

  /**
   * Get status badge info
   */
  const statusBadge = $derived.by(() => {
    switch (session.state) {
      case "running":
        return { text: "Running", color: "bg-accent-emphasis", animate: true };
      case "queued":
        return {
          text: "Queued",
          color: "bg-attention-emphasis",
          animate: false,
        };
      case "completed":
        return {
          text: "Completed",
          color: "bg-success-emphasis",
          animate: false,
        };
      case "failed":
        return { text: "Failed", color: "bg-danger-emphasis", animate: false };
      case "cancelled":
        return { text: "Cancelled", color: "bg-bg-emphasis", animate: false };
      default:
        return { text: "Unknown", color: "bg-bg-emphasis", animate: false };
    }
  });

  /**
   * Format prompt for display in header
   */
  function truncatePrompt(prompt: string, maxLength = 100): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.slice(0, maxLength) + "...";
  }
</script>

<div
  class="session-detail-view flex flex-col h-full bg-bg-primary"
  role="main"
  aria-label="Session Detail"
>
  <!-- Header -->
  <header class="flex-shrink-0 bg-bg-secondary border-b border-border-default">
    <!-- Top row with back button and view mode toggle -->
    <div class="flex items-center justify-between px-4 py-3">
      <div class="flex items-center gap-3">
        <!-- Back button -->
        <button
          type="button"
          onclick={onBack}
          class="p-2 min-w-[44px] min-h-[44px]
                 text-text-secondary hover:text-text-primary
                 hover:bg-bg-hover rounded-lg
                 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
          aria-label="Back to queue"
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

        <!-- Status badge -->
        <span
          class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full
                 text-xs font-medium text-white {statusBadge.color}"
        >
          {#if statusBadge.animate}
            <span
              class="w-1.5 h-1.5 rounded-full bg-bg-primary animate-pulse"
            />
          {/if}
          {statusBadge.text}
        </span>
      </div>

      <!-- View mode toggle -->
      <div
        class="flex items-center bg-bg-tertiary rounded-lg p-1"
        role="tablist"
        aria-label="Conversation view mode"
      >
        <button
          type="button"
          onclick={() => onViewModeChange("chat")}
          class="px-3 py-1.5 text-sm rounded-md transition-colors
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 {viewMode === 'chat'
            ? 'bg-bg-secondary text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          role="tab"
          aria-selected={viewMode === "chat"}
          aria-controls="conversation-content"
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
            class="inline-block mr-1"
            aria-hidden="true"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            />
          </svg>
          Chat
        </button>
        <button
          type="button"
          onclick={() => onViewModeChange("carousel")}
          class="px-3 py-1.5 text-sm rounded-md transition-colors
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 {viewMode === 'carousel'
            ? 'bg-bg-secondary text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          role="tab"
          aria-selected={viewMode === "carousel"}
          aria-controls="conversation-content"
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
            class="inline-block mr-1"
            aria-hidden="true"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          Cards
        </button>
      </div>
    </div>

    <!-- Prompt summary -->
    <div class="px-4 pb-3">
      <p class="text-sm text-text-primary">
        {truncatePrompt(session.prompt)}
      </p>
      {#if session.context.primaryFile !== undefined}
        <p class="text-xs text-text-tertiary mt-1">
          {session.context.primaryFile.path}:{session.context.primaryFile
            .startLine}-{session.context.primaryFile.endLine}
        </p>
      {/if}
    </div>
  </header>

  <!-- Conversation content -->
  <div id="conversation-content" class="flex-1 overflow-hidden" role="tabpanel">
    {#if viewMode === "chat"}
      <ConversationChatView turns={session.turns} />
    {:else}
      <ConversationCarousel
        turns={session.turns}
        currentIndex={carouselIndex}
        onIndexChange={handleCarouselIndexChange}
      />
    {/if}
  </div>

  <!-- Stats footer -->
  <SessionStats {session} />
</div>
