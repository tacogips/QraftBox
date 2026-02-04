<script lang="ts">
import type { Comment, Author } from "../src/stores/comments";
import CommentDisplay from "./CommentDisplay.svelte";
import CommentForm from "./CommentForm.svelte";

/**
 * CommentThread Component
 *
 * Displays a comment with its replies in a threaded view.
 * Supports one level of nesting (replies to comments, but not replies to replies).
 *
 * Props:
 * - comment: The parent Comment with its replies
 * - currentUser: Current user's email for edit/delete permissions
 * - defaultAuthor: Default author for new replies
 * - onReply: Callback when a reply is submitted
 * - onEdit: Callback when a comment/reply is edited
 * - onDelete: Callback when a comment/reply is deleted
 *
 * Design:
 * - Parent comment shown at full width
 * - Replies indented with visual connector line
 * - Inline reply form appears below replies when toggled
 */

interface Props {
  comment: Comment;
  currentUser?: string;
  defaultAuthor?: Author;
  onReply?: (parentId: string, content: string, author: Author) => void;
  onEdit?: (commentId: string, content: string, isReply: boolean) => void;
  onDelete?: (commentId: string, isReply: boolean) => void;
}

// Svelte 5 props syntax
const {
  comment,
  currentUser = undefined,
  defaultAuthor = undefined,
  onReply = undefined,
  onEdit = undefined,
  onDelete = undefined,
}: Props = $props();

// State for reply form visibility
let showReplyForm = $state(false);

/**
 * Toggle reply form visibility
 */
function toggleReplyForm(): void {
  showReplyForm = !showReplyForm;
}

/**
 * Handle reply submission
 */
function handleReplySubmit(newComment: {
  content: string;
  author: Author;
}): void {
  if (onReply !== undefined) {
    onReply(comment.id, newComment.content, newComment.author);
  }
  showReplyForm = false;
}

/**
 * Handle edit for parent comment
 */
function handleParentEdit(): void {
  if (onEdit !== undefined) {
    onEdit(comment.id, comment.content, false);
  }
}

/**
 * Handle delete for parent comment
 */
function handleParentDelete(): void {
  if (onDelete !== undefined) {
    onDelete(comment.id, false);
  }
}

/**
 * Handle edit for a reply
 */
function handleReplyEdit(replyId: string, content: string): void {
  if (onEdit !== undefined) {
    onEdit(replyId, content, true);
  }
}

/**
 * Handle delete for a reply
 */
function handleReplyDelete(replyId: string): void {
  if (onDelete !== undefined) {
    onDelete(replyId, true);
  }
}

/**
 * Check if there are replies
 */
const hasReplies = $derived(comment.replies.length > 0);

/**
 * Get default author for reply form
 */
const replyAuthor = $derived(
  defaultAuthor ?? { name: "", email: "" }
);
</script>

<div class="comment-thread" role="group" aria-label="Comment thread">
  <!-- Parent Comment -->
  <CommentDisplay
    {comment}
    {currentUser}
    isReply={false}
    onReply={onReply !== undefined ? toggleReplyForm : undefined}
    onEdit={onEdit !== undefined ? handleParentEdit : undefined}
    onDelete={onDelete !== undefined ? handleParentDelete : undefined}
  />

  <!-- Replies Section -->
  {#if hasReplies || showReplyForm}
    <div class="replies-container relative ml-4 pl-4 border-l-2 border-border-default">
      <!-- Replies -->
      {#each comment.replies as reply (reply.id)}
        <CommentDisplay
          comment={reply}
          {currentUser}
          isReply={true}
          onEdit={onEdit !== undefined
            ? () => handleReplyEdit(reply.id, reply.content)
            : undefined}
          onDelete={onDelete !== undefined
            ? () => handleReplyDelete(reply.id)
            : undefined}
        />
      {/each}

      <!-- Reply Form -->
      {#if showReplyForm}
        <div class="mt-2 ml-2">
          <CommentForm
            filePath={comment.filePath}
            lineStart={comment.lineStart}
            lineEnd={comment.lineEnd}
            defaultAuthor={replyAuthor}
            onSubmit={(newComment) =>
              handleReplySubmit({
                content: newComment.content,
                author: newComment.author,
              })}
            onCancel={() => (showReplyForm = false)}
          />
        </div>
      {/if}
    </div>
  {/if}

  <!-- Reply Button (always visible at bottom when collapsed) -->
  {#if !showReplyForm && !hasReplies && onReply !== undefined}
    <button
      type="button"
      onclick={toggleReplyForm}
      class="ml-11 mt-1 px-3 py-1.5 min-h-[36px] text-xs text-text-secondary
             hover:text-text-primary hover:bg-bg-hover
             rounded transition-colors duration-150
             focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <span class="flex items-center gap-1.5">
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
          <polyline points="9 17 4 12 9 7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
        Reply
      </span>
    </button>
  {/if}
</div>

<style>
.comment-thread {
  border-bottom: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.1));
}

.comment-thread:last-child {
  border-bottom: none;
}
</style>
