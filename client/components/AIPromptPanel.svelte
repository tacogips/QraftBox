<script lang="ts">
/**
 * AIPromptPanel Component
 *
 * Global collapsible panel for AI prompts at the bottom of the screen.
 * Provides full prompt input with file references and queue status.
 *
 * Props:
 * - collapsed: Whether panel is collapsed
 * - queueStatus: Queue status for display
 * - changedFiles: List of changed files for autocomplete
 * - allFiles: List of all files for autocomplete
 * - onSubmit: Callback when prompt is submitted
 * - onToggle: Callback to toggle collapsed state
 *
 * Design:
 * - Collapsible panel at bottom
 * - File reference autocomplete
 * - Queue status indicator
 * - Keyboard shortcut 'A' to expand
 */

import type { QueueStatus, FileReference } from "../../src/types/ai";
import FileAutocomplete from "./FileAutocomplete.svelte";

interface Props {
  collapsed: boolean;
  queueStatus: QueueStatus;
  changedFiles: readonly string[];
  allFiles: readonly string[];
  onSubmit: (prompt: string, immediate: boolean, refs: readonly FileReference[]) => void;
  onToggle: () => void;
}

// Svelte 5 props syntax
const {
  collapsed,
  queueStatus,
  changedFiles,
  allFiles,
  onSubmit,
  onToggle,
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
 * File references
 */
let fileRefs = $state<FileReference[]>([]);

/**
 * Autocomplete state
 */
let showAutocomplete = $state(false);
let autocompleteQuery = $state("");

/**
 * Reference to textarea for focus management
 */
let textareaRef: HTMLTextAreaElement | null = null;

/**
 * Status text for queue indicator
 */
const queueStatusText = $derived.by(() => {
  if (queueStatus.runningCount > 0 && queueStatus.queuedCount > 0) {
    return `${queueStatus.runningCount} running, ${queueStatus.queuedCount} queued`;
  }
  if (queueStatus.runningCount > 0) {
    return `${queueStatus.runningCount} running`;
  }
  if (queueStatus.queuedCount > 0) {
    return `${queueStatus.queuedCount} queued`;
  }
  return "No active sessions";
});

/**
 * Handle global keyboard shortcuts
 */
function handleGlobalKeydown(event: KeyboardEvent): void {
  // 'A' key to toggle panel (when not in an input)
  if (
    event.key === "a" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    document.activeElement?.tagName !== "INPUT" &&
    document.activeElement?.tagName !== "TEXTAREA"
  ) {
    event.preventDefault();
    onToggle();
    // Focus textarea when expanding
    if (collapsed) {
      setTimeout(() => {
        textareaRef?.focus();
      }, 100);
    }
  }

  // Close dropdown on Escape
  if (event.key === "Escape" && showDropdown) {
    event.preventDefault();
    showDropdown = false;
  }
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
 * Handle keyboard shortcuts in textarea
 */
function handleKeydown(event: KeyboardEvent): void {
  // Ctrl/Cmd + Enter to submit
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    handleSubmit();
  }
  // Escape to collapse
  if (event.key === "Escape" && !showAutocomplete) {
    event.preventDefault();
    onToggle();
  }
}

/**
 * Handle form submission (default: queue)
 */
function handleSubmit(): void {
  if (prompt.trim().length === 0) return;
  onSubmit(prompt, false, fileRefs);

  // Clear form after submission
  prompt = "";
  fileRefs = [];
  showDropdown = false;
}

/**
 * Handle submit and run now (immediate)
 */
function handleSubmitAndRun(): void {
  if (prompt.trim().length === 0) return;
  onSubmit(prompt, true, fileRefs);

  // Clear form after submission
  prompt = "";
  fileRefs = [];
  showDropdown = false;
}

/**
 * Toggle dropdown menu
 */
function toggleDropdown(): void {
  showDropdown = !showDropdown;
}

/**
 * Store textarea reference
 */
function setTextareaRef(element: HTMLTextAreaElement): void {
  textareaRef = element;
}
</script>

<svelte:window on:keydown={handleGlobalKeydown} on:click={handleWindowClick} />

<div
  class="ai-prompt-panel shrink-0
         bg-bg-secondary border-t border-border-default
         transition-all duration-300 ease-in-out
         {collapsed ? 'h-12' : 'h-64'}"
  role="region"
  aria-label="AI Prompt Panel"
>
  <!-- Collapsed bar (always visible) -->
  <button
    type="button"
    onclick={onToggle}
    class="w-full h-12 px-4 flex items-center justify-between
           hover:bg-bg-hover transition-colors duration-150
           focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
    aria-expanded={!collapsed}
    aria-label={collapsed ? "Expand AI prompt panel" : "Collapse AI prompt panel"}
  >
    <div class="flex items-center gap-3">
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
        {collapsed ? "Ask AI" : "AI Prompt"}
      </span>
      <kbd class="hidden sm:inline px-1.5 py-0.5 text-[10px] bg-bg-tertiary text-text-tertiary rounded">
        A
      </kbd>
    </div>

    <div class="flex items-center gap-3">
      <!-- Queue status -->
      <span class="text-xs text-text-tertiary">
        {queueStatusText}
      </span>

      <!-- Expand/collapse chevron -->
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
        class="text-text-tertiary transition-transform duration-300
               {collapsed ? '' : 'rotate-180'}"
        aria-hidden="true"
      >
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </div>
  </button>

  <!-- Expanded content -->
  {#if !collapsed}
    <div class="h-52 p-4 flex flex-col">
      <!-- Input area -->
      <div class="flex-1 flex gap-4 min-h-0">
        <!-- Prompt input -->
        <div class="flex-1 relative flex flex-col min-w-0">
          <textarea
            bind:this={textareaRef}
            bind:value={prompt}
            oninput={handleInput}
            onkeydown={handleKeydown}
            use:setTextareaRef
            placeholder="Ask AI about your code... (Use @ to reference files)"
            class="flex-1 w-full px-3 py-2
                   bg-bg-primary text-text-primary text-sm
                   border border-border-default rounded
                   placeholder:text-text-tertiary
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis
                   resize-none"
            aria-label="AI prompt"
          ></textarea>

          <!-- Autocomplete dropdown -->
          <div class="absolute left-0 right-0 bottom-full mb-1">
            <FileAutocomplete
              query={autocompleteQuery}
              {changedFiles}
              {allFiles}
              visible={showAutocomplete}
              onSelect={handleFileSelect}
              onClose={handleCloseAutocomplete}
            />
          </div>

          <!-- File references -->
          {#if fileRefs.length > 0}
            <div class="flex flex-wrap gap-2 mt-2">
              {#each fileRefs as ref (ref.path)}
                <span
                  class="inline-flex items-center gap-1 px-2 py-1
                         bg-accent-muted text-accent-fg text-xs rounded"
                >
                  <span class="truncate max-w-[120px]">@{ref.path}</span>
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
        </div>

        <!-- Controls: Split button -->
        <div class="flex flex-col gap-3 w-32">
          <div class="split-button-container relative flex-1 flex flex-col">
            <div class="flex min-h-[44px]">
              <!-- Main Submit button -->
              <button
                type="button"
                onclick={handleSubmit}
                disabled={prompt.trim().length === 0}
                class="flex-1 min-h-[44px]
                       bg-success-emphasis hover:brightness-110
                       text-white text-sm font-medium rounded-l
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-150
                       focus:outline-none focus:ring-2 focus:ring-success-emphasis"
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
                       focus:outline-none focus:ring-2 focus:ring-success-emphasis"
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
      </div>

    </div>
  {/if}
</div>
