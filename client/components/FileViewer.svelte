<script lang="ts">
  /**
   * FileViewer Component
   *
   * Displays plain file content with line numbers and AI comment support.
   * Used when a file has no diff changes but the user still wants to view
   * and annotate it. Supports shift+click range selection like DiffView.
   */

  interface CommentRange {
    startLine: number;
    endLine: number;
  }

  interface Props {
    path: string;
    content: string;
    language: string;
    onCommentSubmit?: (
      startLine: number,
      endLine: number,
      side: "old" | "new",
      filePath: string,
      prompt: string,
      immediate: boolean,
    ) => void;
  }

  let { path, content, language, onCommentSubmit = undefined }: Props =
    $props();

  let activeComment = $state<CommentRange | null>(null);
  let commentText = $state("");

  const lines = $derived(content.split("\n"));

  function handleCommentOpen(lineNumber: number, shiftKey: boolean): void {
    if (shiftKey && activeComment !== null) {
      const start = Math.min(activeComment.startLine, lineNumber);
      const end = Math.max(activeComment.endLine, lineNumber);
      activeComment = { startLine: start, endLine: end };
    } else {
      activeComment = { startLine: lineNumber, endLine: lineNumber };
    }
  }

  function handleCommentSubmit(prompt: string, immediate: boolean): void {
    if (activeComment !== null && onCommentSubmit !== undefined) {
      onCommentSubmit(
        activeComment.startLine,
        activeComment.endLine,
        "new",
        path,
        prompt,
        immediate,
      );
    }
    activeComment = null;
    commentText = "";
  }

  function handleCommentCancel(): void {
    activeComment = null;
    commentText = "";
  }

  const commentPlaceholder = $derived.by(() => {
    if (activeComment === null) return "";
    const lineInfo =
      activeComment.startLine === activeComment.endLine
        ? `L${activeComment.startLine}`
        : `L${activeComment.startLine}-L${activeComment.endLine}`;
    return `Ask AI about ${path}:${lineInfo} ...`;
  });

  const commentRangeLines = $derived.by(() => {
    if (activeComment === null) return [] as number[];
    const result: number[] = [];
    for (let i = activeComment.startLine; i <= activeComment.endLine; i++) {
      result.push(i);
    }
    return result;
  });
</script>

<div class="file-viewer w-full h-full overflow-auto font-mono text-sm">
  {#if lines.length === 0}
    <div
      class="flex items-center justify-center py-12 text-text-secondary text-sm"
    >
      Empty file
    </div>
  {:else}
    {#each lines as line, index}
      {@const lineNumber = index + 1}
      {@const inRange = commentRangeLines.includes(lineNumber)}
      <div class="flex group/line {inRange ? 'bg-blue-900/20' : ''}">
        <!-- Line number gutter with "+" button -->
        <div
          class="w-16 flex-shrink-0 px-2 flex items-start justify-end text-text-secondary bg-bg-secondary border-r border-border-default relative"
        >
          {#if onCommentSubmit !== undefined}
            <button
              type="button"
              class="absolute left-0 top-1 w-6 h-6 flex items-center justify-center
                     rounded bg-blue-600 text-white text-xs font-bold
                     opacity-0 group-hover/line:opacity-100
                     hover:bg-blue-500 transition-opacity z-10 cursor-pointer"
              onclick={(e) => {
                e.stopPropagation();
                handleCommentOpen(lineNumber, e.shiftKey);
              }}
              aria-label="Add comment on line {lineNumber}"
            >+</button>
          {/if}
          <span class="pt-2 min-h-[28px] flex items-start select-none"
            >{lineNumber}</span
          >
        </div>

        <!-- Line content -->
        <div class="flex-1 px-3 py-1 overflow-x-auto">
          <pre class="m-0 p-0">{line}</pre>
        </div>
      </div>

      <!-- Inline comment box after endLine -->
      {#if activeComment !== null && activeComment.endLine === lineNumber}
        <div class="border-t-2 border-b-2 border-blue-500 bg-bg-secondary p-3">
          <textarea
            class="w-full min-h-[80px] p-2 text-sm font-sans bg-bg-primary border border-border-default rounded resize-y
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={commentPlaceholder}
            bind:value={commentText}
            onkeydown={(e) => {
              if (
                e.key === "Enter" &&
                e.ctrlKey &&
                onCommentSubmit !== undefined
              ) {
                e.preventDefault();
                handleCommentSubmit(commentText, true);
              }
              if (e.key === "Escape") {
                handleCommentCancel();
              }
            }}
          ></textarea>
          <div class="flex items-center gap-2 mt-2">
            <button
              type="button"
              class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-500"
              onclick={() => handleCommentSubmit(commentText, true)}
            >Submit</button>
            <button
              type="button"
              class="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
              onclick={() => handleCommentCancel()}
            >Cancel</button>
            <span class="text-xs text-text-tertiary ml-auto"
              >Ctrl+Enter to submit</span
            >
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  pre {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
