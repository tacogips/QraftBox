<script lang="ts">
  /**
   * AIPromptPanel Component
   *
   * Bottom panel for AI prompt submission.
   *
   * Features:
   * - Collapsed state: Single-line input (default)
   * - Expanded state: Multi-line textarea
   * - File reference autocomplete (@file syntax)
   * - Submit with immediate or queue options
   * - Queue status display
   *
   * Props:
   * - collapsed: Whether panel is in single-line mode
   * - queueStatus: Current AI queue status
   * - changedFiles: Changed file paths for autocomplete
   * - allFiles: All file paths for autocomplete
   * - onSubmit: Callback when prompt is submitted
   * - onToggle: Callback to toggle collapsed state
   */

  import type { QueueStatus, FileReference } from "../../../src/types/ai";

  interface Props {
    collapsed: boolean;
    queueStatus: QueueStatus;
    changedFiles: readonly string[];
    allFiles: readonly string[];
    onSubmit: (
      prompt: string,
      immediate: boolean,
      refs: readonly FileReference[],
    ) => Promise<void>;
    onToggle: () => void;
    onNewSession?: () => void;
    onSearchSession?: () => void;
    onChangePage?: () => void;
  }

  const {
    collapsed,
    queueStatus,
    changedFiles,
    allFiles,
    onSubmit,
    onToggle,
    onNewSession,
    onSearchSession,
    onChangePage,
  }: Props = $props();

  /**
   * Current prompt text
   */
  let promptText = $state<string>("");

  /**
   * File references parsed from prompt
   */
  let fileReferences = $state<FileReference[]>([]);

  /**
   * Whether submit is in progress
   */
  let submitting = $state<boolean>(false);

  /**
   * Parse file references from prompt text (simple @file syntax)
   */
  function parseFileReferences(text: string): FileReference[] {
    const refs: FileReference[] = [];
    const pattern = /@([\w\-/.]+)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match[1] !== undefined) {
        refs.push({ path: match[1] });
      }
    }

    return refs;
  }

  /**
   * Update file references when prompt changes
   */
  $effect(() => {
    fileReferences = parseFileReferences(promptText);
  });

  /**
   * Submit prompt immediately
   */
  async function handleSubmitImmediate(): Promise<void> {
    if (promptText.trim().length === 0 || submitting) return;

    submitting = true;
    try {
      await onSubmit(promptText, true, fileReferences);
      promptText = "";
      fileReferences = [];
    } catch (error) {
      console.error("Failed to submit prompt:", error);
    } finally {
      submitting = false;
    }
  }

  /**
   * Submit prompt to queue
   */
  async function handleSubmitQueue(): Promise<void> {
    if (promptText.trim().length === 0 || submitting) return;

    submitting = true;
    try {
      await onSubmit(promptText, false, fileReferences);
      promptText = "";
      fileReferences = [];
    } catch (error) {
      console.error("Failed to queue prompt:", error);
    } finally {
      submitting = false;
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  function handleKeydown(event: KeyboardEvent): void {
    // Ctrl+Enter or Cmd+Enter: Submit immediately
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSubmitImmediate();
    }
  }

  /**
   * Toggle collapsed/expanded state
   */
  function handleToggle(): void {
    onToggle();
  }
</script>

<div
  class="ai-prompt-panel shrink-0 border-t border-border-default bg-bg-secondary
         {collapsed ? 'h-24' : 'h-64'} transition-all duration-200"
>
  <div class="h-full flex flex-col">
    <!-- Header with toggle button and queue status -->
    <div
      class="flex items-center justify-between px-4 py-2 border-b border-border-default"
    >
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={handleToggle}
          class="p-1 text-text-secondary hover:text-text-primary transition-colors"
          title={collapsed ? "Expand (a)" : "Collapse (a)"}
          aria-label={collapsed
            ? "Expand prompt panel"
            : "Collapse prompt panel"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="transition-transform {collapsed ? '' : 'rotate-180'}"
          >
            <polyline points="4 6 8 10 12 6" />
          </svg>
        </button>

        <span class="text-xs font-medium text-text-secondary">Ask AI</span>

        <!-- Session Management Icons -->
        <div class="flex items-center gap-1 ml-2">
          {#if onNewSession !== undefined}
            <button
              type="button"
              onclick={onNewSession}
              class="p-1 rounded hover:bg-bg-hover transition-colors
                     text-text-tertiary hover:text-text-primary"
              title="New Session"
              aria-label="Create new session"
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          {/if}

          {#if onSearchSession !== undefined}
            <button
              type="button"
              onclick={onSearchSession}
              class="p-1 rounded hover:bg-bg-hover transition-colors
                     text-text-tertiary hover:text-text-primary"
              title="Search Sessions"
              aria-label="Search and browse sessions"
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
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>
          {/if}

          {#if onChangePage !== undefined}
            <button
              type="button"
              onclick={onChangePage}
              class="p-1 rounded hover:bg-bg-hover transition-colors
                     text-text-tertiary hover:text-text-primary"
              title="Change Page"
              aria-label="Navigate to different page"
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
                <path
                  d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
                />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M10 9H8" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
            </button>
          {/if}
        </div>

        {#if queueStatus.runningCount > 0 || queueStatus.queuedCount > 0}
          <span
            class="px-2 py-0.5 text-xs rounded-full bg-accent-subtle text-accent-fg"
          >
            {queueStatus.runningCount} running, {queueStatus.queuedCount} queued
          </span>
        {/if}
      </div>

      <div class="text-xs text-text-tertiary">Ctrl+Enter to submit</div>
    </div>

    <!-- Input area -->
    <div class="flex-1 flex items-stretch gap-2 p-2">
      {#if collapsed}
        <!-- Single-line input (collapsed) -->
        <input
          type="text"
          bind:value={promptText}
          onkeydown={handleKeydown}
          placeholder="Ask AI about the diff... (Press 'a' to expand)"
          class="flex-1 px-3 py-2 text-sm
                 bg-bg-primary border border-border-default rounded-lg
                 text-text-primary placeholder:text-text-tertiary
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 transition-colors"
        />
      {:else}
        <!-- Multi-line textarea (expanded) -->
        <textarea
          bind:value={promptText}
          onkeydown={handleKeydown}
          placeholder="Ask AI about the diff...

Use @filename to reference files
Ctrl+Enter to submit immediately"
          class="flex-1 px-3 py-2 text-sm resize-none
                 bg-bg-primary border border-border-default rounded-lg
                 text-text-primary placeholder:text-text-tertiary
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 transition-colors"
        ></textarea>
      {/if}

      <!-- Submit buttons -->
      <div class="flex flex-col gap-2">
        <button
          type="button"
          onclick={handleSubmitImmediate}
          disabled={promptText.trim().length === 0 || submitting}
          class="px-4 py-2 text-sm font-medium
                 bg-accent-emphasis text-white rounded-lg
                 hover:brightness-110
                 disabled:opacity-50 disabled:cursor-not-allowed
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 transition-all
                 whitespace-nowrap"
          title="Submit immediately (Ctrl+Enter)"
        >
          {submitting ? "Sending..." : "Submit"}
        </button>

        {#if !collapsed}
          <button
            type="button"
            onclick={handleSubmitQueue}
            disabled={promptText.trim().length === 0 || submitting}
            class="px-4 py-2 text-sm font-medium
                   bg-bg-tertiary text-text-primary border border-border-default rounded-lg
                   hover:bg-bg-hover
                   disabled:opacity-50 disabled:cursor-not-allowed
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                   transition-all
                   whitespace-nowrap"
            title="Add to queue"
          >
            Queue
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  /**
   * AIPromptPanel Styling
   *
   * - Smooth height transitions
   * - Single-line and multi-line input modes
   */
  .ai-prompt-panel {
    -webkit-overflow-scrolling: touch;
  }

  textarea {
    font-family: inherit;
  }
</style>
