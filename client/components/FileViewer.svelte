<script lang="ts">
  import { highlightLines } from "../src/lib/highlighter";

  /**
   * FileViewer Component
   *
   * Displays file content with syntax highlighting, line numbers,
   * and AI comment support. Used when a file has no diff changes
   * but the user still wants to view and annotate it.
   * Supports shift+click range selection like DiffView.
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

  let {
    path,
    content,
    language,
    onCommentSubmit = undefined,
  }: Props = $props();

  let activeComment = $state<CommentRange | null>(null);
  let commentText = $state("");
  let highlightedHtml = $state<string[]>([]);

  const lines = $derived(content.split("\n"));

  $effect(() => {
    const currentContent = content;
    const currentPath = path;
    void highlightLines(currentContent, currentPath).then((result) => {
      highlightedHtml = result;
    });
  });

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

<div
  class="file-viewer w-full h-full overflow-auto font-mono text-xs leading-5"
>
  <!-- Sticky file name header -->
  <div
    class="flex items-center justify-between px-2 min-h-[32px] bg-bg-secondary border-b border-border-default sticky top-0 z-10"
  >
    <div class="flex items-center gap-2">
      <span
        class="text-xs font-medium text-text-primary truncate max-w-[300px]"
      >
        {path}
      </span>
    </div>
  </div>

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
      <div class="flex group/line {inRange ? 'bg-accent-muted' : ''}">
        <!-- Line number gutter with "+" button -->
        <div
          class="w-12 flex-shrink-0 px-1 flex items-start justify-end text-text-secondary bg-bg-secondary border-r border-border-default relative"
        >
          {#if onCommentSubmit !== undefined}
            <button
              type="button"
              class="absolute left-0 top-1 w-6 h-6 flex items-center justify-center
                     rounded bg-accent-emphasis text-white text-xs font-bold
                     opacity-0 group-hover/line:opacity-100
                     hover:bg-accent-fg transition-opacity z-10 cursor-pointer"
              onclick={(e) => {
                e.stopPropagation();
                handleCommentOpen(lineNumber, e.shiftKey);
              }}
              aria-label="Add comment on line {lineNumber}">+</button
            >
          {/if}
          <span class="select-none">{lineNumber}</span>
        </div>

        <!-- Line content -->
        <div class="flex-1 px-2 overflow-x-auto">
          {#if highlightedHtml[index] !== undefined}
            <span class="highlighted-line">{@html highlightedHtml[index]}</span>
          {:else}
            <pre class="m-0 p-0">{line}</pre>
          {/if}
        </div>
      </div>

      <!-- Inline comment box after endLine -->
      {#if activeComment !== null && activeComment.endLine === lineNumber}
        <div
          class="border-t-2 border-b-2 border-accent-emphasis bg-bg-secondary p-3"
        >
          <textarea
            class="w-full min-h-[80px] p-2 text-sm font-sans bg-bg-primary border border-border-default rounded resize-y
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
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
              class="px-3 py-1 text-sm bg-success-emphasis text-white rounded hover:brightness-110"
              onclick={() => handleCommentSubmit(commentText, true)}
              >Submit</button
            >
            <button
              type="button"
              class="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
              onclick={() => handleCommentCancel()}>Cancel</button
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

  .highlighted-line {
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
