<script lang="ts">
import type { Comment, CommentReply, Author } from "../src/stores/comments";

/**
 * CommentDisplay Component
 *
 * Displays a single comment with author info, timestamp, and action buttons.
 *
 * Props:
 * - comment: The Comment or CommentReply to display
 * - currentUser: Current user's email to determine if edit/delete is allowed
 * - isReply: Whether this is a reply (smaller, indented style)
 * - onReply: Callback when reply button is clicked
 * - onEdit: Callback when edit button is clicked
 * - onDelete: Callback when delete button is clicked
 *
 * Design:
 * - Compact display of comment content
 * - Touch-friendly action buttons (44px targets)
 * - Visual distinction between original comments and replies
 */

interface Props {
  comment: Comment | CommentReply;
  currentUser?: string;
  isReply?: boolean;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

// Svelte 5 props syntax
const {
  comment,
  currentUser = undefined,
  isReply = false,
  onReply = undefined,
  onEdit = undefined,
  onDelete = undefined,
}: Props = $props();

// Check if this is a full Comment (has filePath) or a CommentReply
const isFullComment = $derived("filePath" in comment);

// Check if current user owns this comment
const isOwner = $derived(
  currentUser !== undefined && comment.author.email === currentUser
);

/**
 * Format the timestamp for display
 */
const formattedTime = $derived.by(() => {
  const date = new Date(comment.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return "Just now";
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    return `${hours}h ago`;
  } else if (diffMins < 10080) {
    const days = Math.floor(diffMins / 1440);
    return `${days}d ago`;
  } else {
    return date.toLocaleDateString();
  }
});

/**
 * Get initials from author name for avatar
 */
const authorInitials = $derived.by(() => {
  const parts = comment.author.name.split(" ");
  if (parts.length >= 2) {
    return (
      (parts[0]?.[0] ?? "").toUpperCase() +
      (parts[1]?.[0] ?? "").toUpperCase()
    );
  }
  return (comment.author.name[0] ?? "?").toUpperCase();
});

/**
 * Handle long press for context menu on touch devices
 */
let longPressTimer: ReturnType<typeof setTimeout> | undefined =
  $state(undefined);
let showActions = $state(false);

function handlePointerDown(): void {
  longPressTimer = setTimeout(() => {
    showActions = true;
  }, 500);
}

function handlePointerUp(): void {
  if (longPressTimer !== undefined) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
}

function handlePointerLeave(): void {
  if (longPressTimer !== undefined) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
}
</script>

<div
  class="comment-display flex gap-3 p-3 {isReply
    ? 'pl-6 bg-bg-tertiary/50'
    : 'bg-bg-secondary'}"
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerLeave}
  role="article"
  aria-label="Comment by {comment.author.name}"
>
  <!-- Avatar -->
  <div
    class="flex-shrink-0 w-8 h-8 rounded-full
           bg-blue-600 text-white text-xs font-medium
           flex items-center justify-center"
    aria-hidden="true"
  >
    {authorInitials}
  </div>

  <!-- Content -->
  <div class="flex-1 min-w-0">
    <!-- Header: Author and Time -->
    <div class="flex items-baseline gap-2 mb-1">
      <span class="font-medium text-sm text-text-primary truncate">
        {comment.author.name}
      </span>
      <span class="text-xs text-text-tertiary flex-shrink-0">
        {formattedTime}
      </span>
    </div>

    <!-- Line Range (only for full comments) -->
    {#if isFullComment && "lineStart" in comment}
      <div class="text-xs text-text-secondary mb-1">
        {#if comment.lineEnd !== undefined && comment.lineEnd !== comment.lineStart}
          Lines {comment.lineStart}-{comment.lineEnd}
        {:else}
          Line {comment.lineStart}
        {/if}
      </div>
    {/if}

    <!-- Comment Content -->
    <div class="text-sm text-text-primary whitespace-pre-wrap break-words">
      {comment.content}
    </div>

    <!-- Actions -->
    <div
      class="flex items-center gap-1 mt-2 -ml-2
             {showActions ? 'opacity-100' : 'opacity-0 hover:opacity-100 focus-within:opacity-100'}
             transition-opacity duration-150"
    >
      <!-- Reply Button (only for non-replies) -->
      {#if !isReply && onReply !== undefined}
        <button
          type="button"
          onclick={onReply}
          class="px-2 py-1 min-h-[32px] text-xs text-text-secondary
                 hover:text-text-primary hover:bg-bg-hover
                 rounded transition-colors duration-150
                 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Reply to this comment"
        >
          Reply
        </button>
      {/if}

      <!-- Edit Button (only for owner) -->
      {#if isOwner && onEdit !== undefined}
        <button
          type="button"
          onclick={onEdit}
          class="px-2 py-1 min-h-[32px] text-xs text-text-secondary
                 hover:text-text-primary hover:bg-bg-hover
                 rounded transition-colors duration-150
                 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Edit this comment"
        >
          Edit
        </button>
      {/if}

      <!-- Delete Button (only for owner) -->
      {#if isOwner && onDelete !== undefined}
        <button
          type="button"
          onclick={onDelete}
          class="px-2 py-1 min-h-[32px] text-xs text-red-400
                 hover:text-red-300 hover:bg-red-900/20
                 rounded transition-colors duration-150
                 focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label="Delete this comment"
        >
          Delete
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
.comment-display {
  border-bottom: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.1));
}

.comment-display:last-child {
  border-bottom: none;
}
</style>
