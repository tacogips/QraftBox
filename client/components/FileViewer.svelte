<script lang="ts">
  import type { ViewMode } from "../src/types/diff";
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
    isBinary?: boolean;
    isImage?: boolean;
    isVideo?: boolean;
    isPdf?: boolean;
    mimeType?: string;
    rawFileUrl?: string;
    viewMode?: ViewMode;
    selectedHasDiff?: boolean;
    isIphone?: boolean;
    onSetViewMode?: (mode: ViewMode) => void;
    onCommentSubmit?: (
      startLine: number,
      endLine: number,
      side: "old" | "new",
      filePath: string,
      prompt: string,
      immediate: boolean,
    ) => void;
    submittedSessionId?: string | null;
    submittedSessionHistoryHref?: string | null;
    onDismissSubmittedSession?: () => void;
    onNavigatePrev?: (() => void) | undefined;
    onNavigateNext?: (() => void) | undefined;
  }

  let {
    path,
    content,
    language,
    isBinary = undefined,
    isImage = undefined,
    isVideo = undefined,
    isPdf = undefined,
    mimeType = undefined,
    rawFileUrl = undefined,
    viewMode = "full-file",
    selectedHasDiff = true,
    isIphone = false,
    onSetViewMode = undefined,
    onCommentSubmit = undefined,
    submittedSessionId = null,
    submittedSessionHistoryHref = null,
    onDismissSubmittedSession = undefined,
    onNavigatePrev = undefined,
    onNavigateNext = undefined,
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

  function handleLineNumberSelect(lineNumber: number): void {
    if (activeComment !== null) {
      const start = Math.min(activeComment.startLine, lineNumber);
      const end = Math.max(activeComment.endLine, lineNumber);
      activeComment = { startLine: start, endLine: end };
      return;
    }

    activeComment = { startLine: lineNumber, endLine: lineNumber };
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
    <div class="flex items-center gap-1">
      <div
        class="flex items-center border border-border-default rounded-md overflow-hidden"
      >
        <button
          type="button"
          class="p-1 transition-colors
                 {viewMode === 'full-file'
            ? 'bg-bg-emphasis text-text-on-emphasis'
            : 'text-text-secondary hover:bg-bg-hover'}"
          onclick={() => onSetViewMode?.("full-file")}
          title="Full File"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V13.5A1.5 1.5 0 0112 15H4.5A1.5 1.5 0 013 13.5v-11z"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <line
              x1="5.5"
              y1="6"
              x2="11"
              y2="6"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <line
              x1="5.5"
              y1="8.5"
              x2="11"
              y2="8.5"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <line
              x1="5.5"
              y1="11"
              x2="9"
              y2="11"
              stroke="currentColor"
              stroke-width="1.2"
            />
          </svg>
        </button>
        {#if !isIphone}
          <button
            type="button"
            class="p-1 border-l border-border-default transition-colors
                   {!selectedHasDiff
              ? 'text-text-disabled cursor-not-allowed opacity-40'
              : viewMode === 'side-by-side'
                ? 'bg-bg-emphasis text-text-on-emphasis'
                : 'text-text-secondary hover:bg-bg-hover'}"
            onclick={() => {
              if (selectedHasDiff) onSetViewMode?.("side-by-side");
            }}
            disabled={!selectedHasDiff}
            title="Side by Side"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect
                x="1"
                y="2"
                width="6"
                height="12"
                rx="1"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <rect
                x="9"
                y="2"
                width="6"
                height="12"
                rx="1"
                stroke="currentColor"
                stroke-width="1.5"
              />
            </svg>
          </button>
        {/if}
        <button
          type="button"
          class="p-1 border-l border-border-default transition-colors
                 {!selectedHasDiff
            ? 'text-text-disabled cursor-not-allowed opacity-40'
            : viewMode === 'inline'
              ? 'bg-bg-emphasis text-text-on-emphasis'
              : 'text-text-secondary hover:bg-bg-hover'}"
          onclick={() => {
            if (selectedHasDiff) onSetViewMode?.("inline");
          }}
          disabled={!selectedHasDiff}
          title={isIphone ? "Stack" : "Inline"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect
              x="1"
              y="2"
              width="14"
              height="12"
              rx="1"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <line
              x1="4"
              y1="5.5"
              x2="12"
              y2="5.5"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <line
              x1="4"
              y1="8"
              x2="12"
              y2="8"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <line
              x1="4"
              y1="10.5"
              x2="10"
              y2="10.5"
              stroke="currentColor"
              stroke-width="1.2"
            />
          </svg>
        </button>
        <button
          type="button"
          class="p-1 border-l border-border-default transition-colors
                 {!selectedHasDiff
            ? 'text-text-disabled cursor-not-allowed opacity-40'
            : viewMode === 'current-state'
              ? 'bg-bg-emphasis text-text-on-emphasis'
              : 'text-text-secondary hover:bg-bg-hover'}"
          onclick={() => {
            if (selectedHasDiff) onSetViewMode?.("current-state");
          }}
          disabled={!selectedHasDiff}
          title="Current"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V13.5A1.5 1.5 0 0112 15H4.5A1.5 1.5 0 013 13.5v-11z"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>
      </div>
      <button
        type="button"
        class="p-1 rounded transition-colors {onNavigatePrev !== undefined
          ? 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer'
          : 'text-text-disabled cursor-default'}"
        onclick={() => onNavigatePrev?.()}
        disabled={onNavigatePrev === undefined}
        title="Previous file"
        aria-label="Previous file"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"
          />
        </svg>
      </button>
      <button
        type="button"
        class="p-1 rounded transition-colors {onNavigateNext !== undefined
          ? 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer'
          : 'text-text-disabled cursor-default'}"
        onclick={() => onNavigateNext?.()}
        disabled={onNavigateNext === undefined}
        title="Next file"
        aria-label="Next file"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M8.22 3.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.19 9H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.53a.75.75 0 0 1 0-1.06Z"
          />
        </svg>
      </button>
    </div>
  </div>

  {#if isBinary === true && isImage === true}
    <!-- Image File -->
    <div class="flex items-center justify-center p-8">
      {#if rawFileUrl !== undefined}
        <img
          src={rawFileUrl}
          alt={path}
          class="max-w-full max-h-[80vh] object-contain"
        />
      {:else}
        <img
          src="data:{mimeType ?? 'image/png'};base64,{content}"
          alt={path}
          class="max-w-full max-h-[80vh] object-contain"
        />
      {/if}
    </div>
  {:else if isBinary === true && isVideo === true && rawFileUrl !== undefined}
    <!-- Video File -->
    <div class="flex items-center justify-center p-8">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video controls class="max-w-full max-h-[80vh]" src={rawFileUrl}> </video>
    </div>
  {:else if isBinary === true && isPdf === true && rawFileUrl !== undefined}
    <!-- PDF File -->
    <div class="w-full h-full min-h-[80vh] p-2">
      <iframe
        src={rawFileUrl}
        title={path}
        class="w-full h-full min-h-[80vh] border border-border-default rounded"
      ></iframe>
    </div>
  {:else if isBinary === true}
    <!-- Non-previewable Binary File -->
    <div
      class="flex flex-col items-center justify-center py-12 text-text-secondary text-sm gap-2"
    >
      <div class="text-base font-medium">Binary file</div>
      <div class="text-xs">{mimeType ?? "unknown type"}</div>
      <div class="text-xs text-text-tertiary">{path}</div>
    </div>
  {:else if lines.length === 0}
    <div
      class="flex items-center justify-center py-12 text-text-secondary text-sm"
    >
      Empty file
    </div>
  {:else}
    {#each lines as line, lineIndex}
      {@const lineNumber = lineIndex + 1}
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
              onclick={(clickEvent) => {
                clickEvent.stopPropagation();
                handleCommentOpen(lineNumber, clickEvent.shiftKey);
              }}
              aria-label="Add comment on line {lineNumber}">+</button
            >
          {/if}
          <button
            type="button"
            class="select-none cursor-pointer px-1 -mx-1 rounded hover:bg-bg-tertiary/50"
            onclick={() => handleLineNumberSelect(lineNumber)}
            aria-label="Select line {lineNumber} for AI prompt"
          >
            {lineNumber}
          </button>
        </div>

        <!-- Line content -->
        <div class="flex-1 px-2 overflow-x-auto">
          {#if highlightedHtml[lineIndex] !== undefined}
            <span class="highlighted-line"
              >{@html highlightedHtml[lineIndex]}</span
            >
          {:else}
            <pre class="m-0 p-0">{line}</pre>
          {/if}
        </div>
      </div>

      <!-- Inline comment box after endLine -->
      {#if activeComment !== null && activeComment.endLine === lineNumber}
        <div
          class="max-w-4xl border-t-2 border-b-2 border-accent-emphasis bg-bg-secondary p-3"
        >
          <textarea
            class="w-full min-h-28 resize-y rounded border border-border-default bg-bg-primary
                   px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
            placeholder={commentPlaceholder}
            bind:value={commentText}
            onkeydown={(keyEvent) => {
              if (
                keyEvent.key === "Enter" &&
                keyEvent.ctrlKey &&
                onCommentSubmit !== undefined
              ) {
                keyEvent.preventDefault();
                handleCommentSubmit(commentText, true);
              }
              if (keyEvent.key === "Escape") {
                handleCommentCancel();
              }
            }}
          ></textarea>
          <div class="flex items-center gap-2 mt-2">
            <button
              type="button"
              class="px-3 py-1.5 text-xs rounded bg-accent-muted text-accent-fg
                     border border-accent-emphasis/40 hover:bg-accent-muted/80 font-medium"
              onclick={() => handleCommentSubmit(commentText, true)}
              >Submit</button
            >
            <button
              type="button"
              class="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
              onclick={() => handleCommentCancel()}>Cancel</button
            >
          </div>
          {#if submittedSessionId !== null && submittedSessionHistoryHref !== null}
            <div
              class="mt-2 flex items-center justify-between gap-3 rounded border border-accent-emphasis/40 bg-accent-muted/10 px-2 py-1 text-xs text-text-secondary"
            >
              <span class="truncate">AI session submitted.</span>
              <div class="flex items-center gap-2">
                <a
                  class="text-accent-fg underline underline-offset-2 hover:opacity-80"
                  href={submittedSessionHistoryHref}
                >
                  View session history
                </a>
                <button
                  type="button"
                  class="text-text-secondary hover:text-text-primary"
                  onclick={() => {
                    onDismissSubmittedSession?.();
                    handleCommentCancel();
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          {/if}
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
