<script lang="ts">
  import type { Comment, Author } from "../src/stores/comments";
  import CommentThread from "./CommentThread.svelte";

  /**
   * CommentsPanel Component
   *
   * Side panel displaying all comments for a file, grouped by line range.
   *
   * Props:
   * - filePath: Path of the file whose comments are displayed
   * - comments: Array of comments for the file
   * - currentUser: Current user's email for edit/delete permissions
   * - defaultAuthor: Default author for new comments/replies
   * - onClose: Callback when panel is closed
   * - onJumpToLine: Callback when user clicks to jump to a line
   * - onReply: Callback when a reply is submitted
   * - onEdit: Callback when a comment is edited
   * - onDelete: Callback when a comment is deleted
   *
   * Design:
   * - Slide-in panel from right side
   * - Comments grouped by line range
   * - Click on line range to jump to that location
   * - Keyboard accessible (Escape to close)
   */

  interface Props {
    filePath: string;
    comments: readonly Comment[];
    currentUser?: string;
    defaultAuthor?: Author;
    onClose: () => void;
    onJumpToLine?: (lineNumber: number) => void;
    onReply?: (parentId: string, content: string, author: Author) => void;
    onEdit?: (commentId: string, content: string, isReply: boolean) => void;
    onDelete?: (commentId: string, isReply: boolean) => void;
  }

  // Svelte 5 props syntax
  const {
    filePath,
    comments,
    currentUser = undefined,
    defaultAuthor = undefined,
    onClose,
    onJumpToLine = undefined,
    onReply = undefined,
    onEdit = undefined,
    onDelete = undefined,
  }: Props = $props();

  /**
   * Group comments by their starting line
   */
  const groupedComments = $derived.by(() => {
    const groups = new Map<number, Comment[]>();

    for (const comment of comments) {
      const existing = groups.get(comment.lineStart);
      if (existing !== undefined) {
        existing.push(comment);
      } else {
        groups.set(comment.lineStart, [comment]);
      }
    }

    // Sort groups by line number
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  });

  /**
   * Total comment count (including replies)
   */
  const totalCount = $derived(
    comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0),
  );

  /**
   * Handle line range click to jump to line
   */
  function handleJumpToLine(lineNumber: number): void {
    if (onJumpToLine !== undefined) {
      onJumpToLine(lineNumber);
    }
  }

  /**
   * Handle keyboard events
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  /**
   * Get display file name from path
   */
  const fileName = $derived(filePath.split("/").pop() ?? filePath);
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="comments-panel fixed inset-y-0 right-0 w-full sm:w-96 max-w-full
         flex flex-col bg-bg-primary border-l border-border-default
         shadow-2xl z-50"
  role="dialog"
  aria-modal="true"
  aria-label="Comments for {fileName}"
>
  <!-- Header -->
  <div
    class="flex items-center justify-between px-4 py-3 min-h-[56px]
           bg-bg-secondary border-b border-border-default"
  >
    <div class="flex flex-col min-w-0">
      <h2 class="text-sm font-medium text-text-primary truncate">Comments</h2>
      <span class="text-xs text-text-secondary truncate">
        {fileName} ({totalCount} comment{totalCount === 1 ? "" : "s"})
      </span>
    </div>

    <button
      type="button"
      onclick={onClose}
      class="p-2 min-w-[44px] min-h-[44px] -mr-2
             text-text-secondary hover:text-text-primary
             hover:bg-bg-hover rounded
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
      aria-label="Close comments panel"
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
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>

  <!-- Comments List -->
  <div class="flex-1 overflow-y-auto">
    {#if groupedComments.length === 0}
      <!-- Empty State -->
      <div
        class="flex flex-col items-center justify-center h-64 px-4 text-center"
      >
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
          class="text-text-tertiary mb-4"
          aria-hidden="true"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        <p class="text-sm text-text-secondary">No comments yet</p>
        <p class="text-xs text-text-tertiary mt-1">
          Select a line and add a comment to start a discussion
        </p>
      </div>
    {:else}
      <!-- Grouped Comments -->
      {#each groupedComments as [lineNumber, lineComments] (lineNumber)}
        <div class="comment-group">
          <!-- Line Header (clickable to jump) -->
          <button
            type="button"
            onclick={() => handleJumpToLine(lineNumber)}
            class="w-full px-4 py-2 min-h-[40px] text-left
                   bg-bg-tertiary text-xs font-medium text-text-secondary
                   hover:bg-bg-hover hover:text-text-primary
                   border-b border-border-default
                   focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis
                   transition-colors duration-150"
            disabled={onJumpToLine === undefined}
            aria-label="Jump to line {lineNumber}"
          >
            <span class="flex items-center gap-2">
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
                <line x1="4" y1="9" x2="20" y2="9" />
                <line x1="4" y1="15" x2="20" y2="15" />
                <line x1="10" y1="3" x2="8" y2="21" />
                <line x1="16" y1="3" x2="14" y2="21" />
              </svg>
              Line {lineNumber}
              <span class="text-text-tertiary">
                ({lineComments.length} thread{lineComments.length === 1
                  ? ""
                  : "s"})
              </span>
            </span>
          </button>

          <!-- Comment Threads for this line -->
          {#each lineComments as comment (comment.id)}
            <CommentThread
              {comment}
              {currentUser}
              {defaultAuthor}
              {onReply}
              {onEdit}
              {onDelete}
            />
          {/each}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Footer hint -->
  <div
    class="px-4 py-2 text-xs text-text-tertiary text-center
           bg-bg-secondary border-t border-border-default"
  >
    Press Escape to close
  </div>
</div>

<style>
  .comments-panel {
    animation: slide-in 200ms ease-out;
  }

  @keyframes slide-in {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  /* On mobile, take full width */
  @media (max-width: 640px) {
    .comments-panel {
      width: 100%;
    }
  }
</style>
