<script lang="ts">
import type { Author, NewComment } from "../src/stores/comments";

/**
 * CommentForm Component
 *
 * Form for adding or editing comments on lines.
 *
 * Props:
 * - filePath: Path of the file being commented on
 * - lineStart: Starting line number for the comment
 * - lineEnd: Optional ending line number for multi-line comments
 * - defaultAuthor: Pre-filled author information
 * - initialContent: Initial content for editing existing comments
 * - onSubmit: Callback when form is submitted
 * - onCancel: Callback when form is cancelled
 *
 * Design:
 * - Large touch-friendly textarea
 * - Author name/email fields (pre-filled, editable)
 * - Keyboard shortcuts (Ctrl+Enter to submit, Escape to cancel)
 * - Slides up as bottom sheet on tablet
 */

interface Props {
  filePath: string;
  lineStart: number;
  lineEnd?: number | undefined;
  defaultAuthor: Author;
  initialContent?: string;
  onSubmit: (comment: NewComment) => void;
  onCancel: () => void;
}

// Svelte 5 props syntax
const {
  filePath,
  lineStart,
  lineEnd = undefined,
  defaultAuthor,
  initialContent = "",
  onSubmit,
  onCancel,
}: Props = $props();

// Form state
let content = $state(initialContent);
let authorName = $state(defaultAuthor.name);
let authorEmail = $state(defaultAuthor.email);
let isSubmitting = $state(false);

// Derived state
const lineRangeText = $derived(
  lineEnd !== undefined && lineEnd !== lineStart
    ? `Lines ${lineStart}-${lineEnd}`
    : `Line ${lineStart}`
);

const canSubmit = $derived(
  content.trim().length > 0 &&
    authorName.trim().length > 0 &&
    authorEmail.trim().length > 0 &&
    !isSubmitting
);

/**
 * Handle form submission
 */
async function handleSubmit(event?: Event): Promise<void> {
  event?.preventDefault();

  if (!canSubmit) {
    return;
  }

  isSubmitting = true;

  try {
    const comment: NewComment = {
      filePath,
      lineStart,
      lineEnd,
      author: {
        name: authorName.trim(),
        email: authorEmail.trim(),
      },
      content: content.trim(),
    };

    onSubmit(comment);
  } finally {
    isSubmitting = false;
  }
}

/**
 * Handle keyboard shortcuts
 */
function handleKeydown(event: KeyboardEvent): void {
  // Ctrl+Enter or Cmd+Enter to submit
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    handleSubmit();
  }
  // Escape to cancel
  else if (event.key === "Escape") {
    event.preventDefault();
    onCancel();
  }
}

/**
 * Focus the textarea on mount
 */
function handleTextareaMount(element: HTMLTextAreaElement): void {
  // Focus after a short delay to ensure animations complete
  setTimeout(() => {
    element.focus();
  }, 100);
}
</script>

<svelte:window onkeydown={handleKeydown} />

<form
  class="comment-form flex flex-col gap-3 p-4 bg-bg-secondary border border-border-default rounded-lg shadow-lg"
  onsubmit={handleSubmit}
  aria-label="Add comment form"
>
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-medium text-text-primary">
      Add Comment
    </h3>
    <span class="text-xs text-text-secondary">
      {lineRangeText}
    </span>
  </div>

  <!-- Comment Content -->
  <div class="flex flex-col gap-1">
    <label for="comment-content" class="text-xs text-text-secondary">
      Comment
    </label>
    <textarea
      id="comment-content"
      bind:value={content}
      use:handleTextareaMount
      placeholder="Write your comment..."
      class="w-full min-h-[120px] px-3 py-2 text-sm
             bg-bg-primary text-text-primary
             border border-border-default rounded
             placeholder:text-text-tertiary
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis
             resize-y"
      aria-describedby="comment-hint"
      disabled={isSubmitting}
    ></textarea>
    <span id="comment-hint" class="text-xs text-text-tertiary">
      Tip: Ctrl+Enter to submit, Escape to cancel
    </span>
  </div>

  <!-- Author Fields -->
  <div class="flex flex-col sm:flex-row gap-3">
    <div class="flex-1 flex flex-col gap-1">
      <label for="author-name" class="text-xs text-text-secondary">
        Name
      </label>
      <input
        id="author-name"
        type="text"
        bind:value={authorName}
        placeholder="Your name"
        class="w-full px-3 py-2 min-h-[44px] text-sm
               bg-bg-primary text-text-primary
               border border-border-default rounded
               placeholder:text-text-tertiary
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis"
        disabled={isSubmitting}
      />
    </div>
    <div class="flex-1 flex flex-col gap-1">
      <label for="author-email" class="text-xs text-text-secondary">
        Email
      </label>
      <input
        id="author-email"
        type="email"
        bind:value={authorEmail}
        placeholder="your@email.com"
        class="w-full px-3 py-2 min-h-[44px] text-sm
               bg-bg-primary text-text-primary
               border border-border-default rounded
               placeholder:text-text-tertiary
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis"
        disabled={isSubmitting}
      />
    </div>
  </div>

  <!-- Actions -->
  <div class="flex items-center justify-end gap-2 pt-2">
    <button
      type="button"
      onclick={onCancel}
      disabled={isSubmitting}
      class="px-4 py-2 min-h-[44px] text-sm font-medium
             text-text-primary
             hover:bg-bg-hover active:bg-bg-pressed
             rounded transition-colors duration-150
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-1
             disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Cancel
    </button>
    <button
      type="submit"
      disabled={!canSubmit}
      class="px-4 py-2 min-h-[44px] text-sm font-medium
             {canSubmit
        ? 'bg-accent-emphasis text-white hover:bg-accent-emphasis active:bg-accent-emphasis'
        : 'bg-bg-disabled text-text-disabled cursor-not-allowed'}
             rounded transition-colors duration-150
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-1"
    >
      {isSubmitting ? "Submitting..." : "Submit"}
    </button>
  </div>
</form>

<style>
.comment-form {
  /* Ensure form doesn't exceed viewport on mobile */
  max-height: 80vh;
  overflow-y: auto;
}

/* Tablet bottom sheet behavior would be added via parent component positioning */
@media (max-width: 768px) {
  .comment-form {
    border-radius: 1rem 1rem 0 0;
  }
}
</style>
