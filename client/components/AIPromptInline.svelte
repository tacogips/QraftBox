<script lang="ts">
/**
 * AIPromptInline Component
 *
 * Inline prompt input that appears after line selection in the diff viewer.
 * Supports @ file references with autocomplete.
 *
 * Props:
 * - lineStart: Start line of selection
 * - lineEnd: End line of selection
 * - filePath: Path of the file
 * - selectedContent: Content of selected lines
 * - changedFiles: List of changed files for autocomplete
 * - allFiles: List of all files for autocomplete
 * - onSubmit: Callback when prompt is submitted
 * - onCancel: Callback when prompt is cancelled
 *
 * Design:
 * - Appears inline after line selection
 * - @ file reference autocomplete
 * - Split button: Submit (queue) + dropdown "Submit & Run Now"
 * - Touch-friendly (bottom sheet on tablet)
 */

import type { FileReference } from "../../src/types/ai";
import FileAutocomplete from "./FileAutocomplete.svelte";

interface Props {
  lineStart: number;
  lineEnd: number;
  filePath: string;
  selectedContent?: string | undefined;
  changedFiles: readonly string[];
  allFiles: readonly string[];
  onSubmit: (prompt: string, immediate: boolean, refs: readonly FileReference[]) => void;
  onCancel: () => void;
}

// Svelte 5 props syntax
const {
  lineStart,
  lineEnd,
  filePath,
  selectedContent = undefined,
  changedFiles,
  allFiles,
  onSubmit,
  onCancel,
}: Props = $props();

/**
 * Current prompt text
 */
let prompt = $state("");

/**
 * Dropdown state for split button
 */
let showDropdown = $state(false);

/**
 * File references added via @
 */
let fileRefs = $state<FileReference[]>([]);

/**
 * Autocomplete state
 */
let showAutocomplete = $state(false);
let autocompleteQuery = $state("");

/**
 * Get line range text
 */
const lineRangeText = $derived(
  lineStart === lineEnd
    ? `Line ${lineStart}`
    : `Lines ${lineStart}-${lineEnd}`
);

/**
 * Handle input changes and detect @ mentions
 */
function handleInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement;
  prompt = target.value;

  // Check for @ trigger
  const cursorPos = target.selectionStart;
  const textBeforeCursor = prompt.slice(0, cursorPos);
  const atMatch = textBeforeCursor.match(/@([\w./-]*)$/);

  if (atMatch !== null) {
    showAutocomplete = true;
    autocompleteQuery = atMatch[1] ?? "";
  } else {
    showAutocomplete = false;
    autocompleteQuery = "";
  }
}

/**
 * Handle file selection from autocomplete
 */
function handleFileSelect(
  path: string,
  lineRange?: { start: number; end: number } | undefined
): void {
  // Add file reference
  const ref: FileReference = { path };
  if (lineRange !== undefined) {
    fileRefs = [...fileRefs, { ...ref, startLine: lineRange.start, endLine: lineRange.end }];
  } else {
    fileRefs = [...fileRefs, ref];
  }

  // Replace @query with @path in prompt
  const cursorPos = prompt.length;
  const textBeforeCursor = prompt.slice(0, cursorPos);
  const atIndex = textBeforeCursor.lastIndexOf("@");
  if (atIndex !== -1) {
    const lineRangeStr =
      lineRange !== undefined ? `:L${lineRange.start}-L${lineRange.end}` : "";
    prompt = prompt.slice(0, atIndex) + `@${path}${lineRangeStr} `;
  }

  showAutocomplete = false;
  autocompleteQuery = "";
}

/**
 * Remove a file reference
 */
function removeFileRef(path: string): void {
  fileRefs = fileRefs.filter((r) => r.path !== path);
}

/**
 * Handle close autocomplete
 */
function handleCloseAutocomplete(): void {
  showAutocomplete = false;
  autocompleteQuery = "";
}

/**
 * Handle keyboard shortcuts
 */
function handleKeydown(event: KeyboardEvent): void {
  // Ctrl/Cmd + Enter to submit
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    handleSubmit();
  }
  // Escape to cancel (or close dropdown first)
  if (event.key === "Escape") {
    if (showDropdown) {
      event.preventDefault();
      showDropdown = false;
    } else if (!showAutocomplete) {
      event.preventDefault();
      onCancel();
    }
  }
}

/**
 * Handle form submission (default: queue)
 */
function handleSubmit(): void {
  if (prompt.trim().length === 0) return;
  onSubmit(prompt, false, fileRefs);
  showDropdown = false;
}

/**
 * Handle submit and run now (immediate)
 */
function handleSubmitAndRun(): void {
  if (prompt.trim().length === 0) return;
  onSubmit(prompt, true, fileRefs);
  showDropdown = false;
}

/**
 * Toggle dropdown menu
 */
function toggleDropdown(): void {
  showDropdown = !showDropdown;
}

/**
 * Handle clicks outside dropdown to close it
 */
function handleWindowClick(event: MouseEvent): void {
  if (showDropdown) {
    const target = event.target as HTMLElement;
    if (!target.closest(".split-button-container")) {
      showDropdown = false;
    }
  }
}

/**
 * Focus textarea on mount
 */
function handleTextareaMount(element: HTMLTextAreaElement): void {
  setTimeout(() => {
    element.focus();
  }, 100);
}
</script>

<svelte:window on:click={handleWindowClick} />

<div
  class="ai-prompt-inline bg-bg-secondary border border-border-default rounded-lg
         shadow-lg p-4 relative"
  role="dialog"
  aria-label="AI Prompt for {lineRangeText}"
>
  <!-- Header -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <!-- AI Icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-accent-fg"
        aria-hidden="true"
      >
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54" />
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54" />
      </svg>
      <span class="text-sm font-medium text-text-primary">
        Ask AI about {lineRangeText}
      </span>
    </div>
    <button
      type="button"
      onclick={onCancel}
      class="p-1.5 min-w-[32px] min-h-[32px]
             text-text-tertiary hover:text-text-primary
             hover:bg-bg-hover rounded
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
      aria-label="Close"
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
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>

  <!-- Context preview -->
  <div class="mb-3 p-2 bg-bg-tertiary rounded border border-border-default">
    <div class="text-xs text-text-tertiary mb-1">
      {filePath} ({lineRangeText})
    </div>
    {#if selectedContent !== undefined}
      <pre
        class="text-xs text-text-secondary font-mono max-h-20 overflow-y-auto"
      >{selectedContent.slice(0, 500)}{selectedContent.length > 500 ? "..." : ""}</pre>
    {/if}
  </div>

  <!-- Prompt input -->
  <div class="relative mb-3">
    <textarea
      bind:value={prompt}
      oninput={handleInput}
      onkeydown={handleKeydown}
      use:handleTextareaMount
      placeholder="Ask about this code... (Use @ to reference files)"
      rows="3"
      class="w-full px-3 py-2 min-h-[80px]
             bg-bg-primary text-text-primary text-sm
             border border-border-default rounded
             placeholder:text-text-tertiary
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis
             resize-y"
      aria-label="AI prompt"
    ></textarea>

    <!-- Autocomplete dropdown -->
    <div class="absolute left-0 right-0 top-full mt-1">
      <FileAutocomplete
        query={autocompleteQuery}
        {changedFiles}
        {allFiles}
        visible={showAutocomplete}
        onSelect={handleFileSelect}
        onClose={handleCloseAutocomplete}
      />
    </div>
  </div>

  <!-- File references -->
  {#if fileRefs.length > 0}
    <div class="flex flex-wrap gap-2 mb-3">
      {#each fileRefs as ref (ref.path)}
        <span
          class="inline-flex items-center gap-1 px-2 py-1
                 bg-accent-muted text-accent-fg text-xs rounded"
        >
          <span class="truncate max-w-[150px]">@{ref.path}</span>
          {#if ref.startLine !== undefined}
            <span class="text-accent-fg">
              :L{ref.startLine}{ref.endLine !== ref.startLine ? `-L${ref.endLine}` : ""}
            </span>
          {/if}
          <button
            type="button"
            onclick={() => removeFileRef(ref.path)}
            class="ml-1 hover:text-danger-fg"
            aria-label="Remove reference"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
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
        </span>
      {/each}
    </div>
  {/if}

  <!-- Footer with split submit button -->
  <div class="flex items-center justify-end">
    <!-- Split submit button -->
    <div class="split-button-container relative flex">
      <div class="flex min-h-[44px]">
        <!-- Main Submit button -->
        <button
          type="button"
          onclick={handleSubmit}
          disabled={prompt.trim().length === 0}
          class="px-4 py-2 min-h-[44px]
                 bg-success-emphasis hover:brightness-110
                 text-white text-sm font-medium rounded-l
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-all duration-150
                 focus:outline-none focus:ring-2 focus:ring-success-emphasis focus:ring-offset-2 focus:ring-offset-bg-secondary"
        >
          Submit
        </button>
        <!-- Dropdown trigger -->
        <button
          type="button"
          onclick={toggleDropdown}
          disabled={prompt.trim().length === 0}
          class="px-2 min-h-[44px]
                 bg-success-emphasis hover:brightness-110
                 text-white rounded-r
                 border-l border-white/20
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-all duration-150
                 focus:outline-none focus:ring-2 focus:ring-success-emphasis focus:ring-offset-2 focus:ring-offset-bg-secondary"
          aria-label="More submit options"
          aria-haspopup="true"
          aria-expanded={showDropdown}
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
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <!-- Dropdown menu -->
      {#if showDropdown}
        <div
          class="absolute bottom-full right-0 mb-1 w-48
                 bg-bg-secondary border border-border-default rounded-lg shadow-lg z-50"
        >
          <button
            type="button"
            onclick={handleSubmitAndRun}
            class="w-full px-3 py-2 text-left text-sm text-text-primary
                   hover:bg-bg-tertiary rounded-lg
                   transition-colors duration-150
                   focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
          >
            Submit & Run Now
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Keyboard hint -->
  <div class="mt-2 text-xs text-text-tertiary text-right">
    <kbd class="px-1 py-0.5 bg-bg-tertiary rounded">Ctrl+Enter</kbd> to submit
  </div>
</div>
