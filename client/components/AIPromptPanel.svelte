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
  import SessionSearchPopup from "./SessionSearchPopup.svelte";

  interface Props {
    contextId: string | null;
    projectPath: string;
    collapsed: boolean;
    queueStatus: QueueStatus;
    changedFiles: readonly string[];
    allFiles: readonly string[];
    onSubmit: (
      prompt: string,
      immediate: boolean,
      refs: readonly FileReference[],
    ) => void;
    onToggle: () => void;
    onNewSession?: () => void;
    onResumeSession?: (sessionId: string) => void;
  }

  // Svelte 5 props syntax
  const {
    contextId,
    projectPath,
    collapsed,
    queueStatus,
    changedFiles,
    allFiles,
    onSubmit,
    onToggle,
    onNewSession,
    onResumeSession,
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
   * Draft persistence (multi-draft, stored as array in localStorage)
   */
  const DRAFT_STORAGE_KEY = "qraftbox-ai-prompt-drafts";
  const DRAFT_PREVIEW_LEN = 50;

  interface DraftData {
    id: string;
    prompt: string;
    fileRefs: FileReference[];
    savedAt: string;
  }

  let showDraftDropdown = $state(false);
  let drafts = $state<DraftData[]>([]);

  let isSessionPopupOpen = $state(false);
  let sessionPopupRef: HTMLDivElement | null = $state(null);

  function loadDraftsFromStorage(): void {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw !== null) {
        drafts = JSON.parse(raw) as DraftData[];
      } else {
        drafts = [];
      }
    } catch {
      drafts = [];
    }
  }

  function persistDrafts(): void {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  }

  loadDraftsFromStorage();

  /**
   * Reference to textarea for focus management (expanded mode)
   */
  let textareaRef: HTMLTextAreaElement | null = null;

  /**
   * Reference to input for focus management (collapsed mode)
   */
  let inputRef: HTMLInputElement | null = null;

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
    return "";
  });

  /**
   * Handle global keyboard shortcuts
   */
  function handleGlobalKeydown(event: KeyboardEvent): void {
    const activeEl = document.activeElement;
    const isInTextBox =
      activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";

    // Close dropdowns on Escape (always)
    if (event.key === "Escape" && showDropdown) {
      event.preventDefault();
      showDropdown = false;
      return;
    }
    if (event.key === "Escape" && showDraftDropdown) {
      event.preventDefault();
      showDraftDropdown = false;
      return;
    }
    if (event.key === "Escape" && isSessionPopupOpen) {
      event.preventDefault();
      closeSessionPopup();
      return;
    }

    // Skip shortcuts while typing in any text box
    if (isInTextBox) {
      return;
    }

    // 'A' key: focus collapsed input or toggle expanded panel
    if (
      event.key === "a" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      if (collapsed) {
        setTimeout(() => {
          inputRef?.focus();
        }, 100);
      } else {
        onToggle();
      }
    }
  }

  /**
   * Handle clicks outside dropdown to close it
   */
  function handleWindowClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (showDropdown && !target.closest(".split-button-container")) {
      showDropdown = false;
    }
    if (showDraftDropdown && !target.closest(".draft-button-container")) {
      showDraftDropdown = false;
    }
    if (
      isSessionPopupOpen &&
      sessionPopupRef !== null &&
      !sessionPopupRef.contains(target) &&
      target.closest("[data-ai-search-button]") === null
    ) {
      closeSessionPopup();
    }
  }

  function toggleSessionPopup(): void {
    isSessionPopupOpen = !isSessionPopupOpen;
  }

  function closeSessionPopup(): void {
    isSessionPopupOpen = false;
  }

  function handleCollapsePanel(): void {
    closeSessionPopup();
    showDropdown = false;
    showDraftDropdown = false;
    showAutocomplete = false;
    onToggle();
  }

  function handleResumeFromSearch(qraftAiSessionId: string): void {
    if (onResumeSession === undefined) return;
    onResumeSession(qraftAiSessionId);
    closeSessionPopup();
  }

  /**
   * Handle input changes and detect @ mentions (textarea)
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
   * Handle input changes and detect @ mentions (single-line input)
   */
  function handleInputSingleLine(event: Event): void {
    const target = event.target as HTMLInputElement;
    prompt = target.value;

    // Check for @ trigger
    const cursorPos = target.selectionStart ?? 0;
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
    lineRange?: { start: number; end: number } | undefined,
  ): void {
    // Add file reference
    const ref: FileReference = { path };
    if (lineRange !== undefined) {
      fileRefs = [
        ...fileRefs,
        { ...ref, startLine: lineRange.start, endLine: lineRange.end },
      ];
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
   * Handle keyboard shortcuts in textarea (expanded mode)
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
      handleCollapsePanel();
    }
  }

  /**
   * Handle keyboard shortcuts in single-line input (collapsed mode)
   */
  function handleKeydownSingleLine(event: KeyboardEvent): void {
    // Enter to submit (queue)
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      handleSubmit();
    }
    // Ctrl/Cmd + Enter to submit and run immediately
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      handleSubmitAndRun();
    }
    // Escape to blur (do NOT toggle, keep panel visible)
    if (event.key === "Escape" && !showAutocomplete) {
      event.preventDefault();
      inputRef?.blur();
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
   * Save current prompt as a new draft
   */
  function saveDraft(): void {
    if (prompt.trim().length === 0) return;
    const entry: DraftData = {
      id: crypto.randomUUID(),
      prompt,
      fileRefs: [...fileRefs],
      savedAt: new Date().toISOString(),
    };
    drafts = [entry, ...drafts];
    persistDrafts();
    showDraftDropdown = false;
  }

  /**
   * Load a draft by id into the prompt and remove it from the list
   */
  function loadDraftById(id: string): void {
    const target = drafts.find((d) => d.id === id);
    if (target === undefined) return;
    prompt = target.prompt;
    fileRefs = target.fileRefs;
    drafts = drafts.filter((d) => d.id !== id);
    persistDrafts();
    showDraftDropdown = false;
  }

  /**
   * Toggle draft dropdown
   */
  function toggleDraftDropdown(): void {
    showDraftDropdown = !showDraftDropdown;
  }

  /**
   * Preview text for a draft entry
   */
  function draftPreview(d: DraftData): string {
    const text = d.prompt.replaceAll("\n", " ");
    if (text.length <= DRAFT_PREVIEW_LEN) return text;
    return text.slice(0, DRAFT_PREVIEW_LEN) + "...";
  }

  /**
   * Store textarea reference
   */
  function setTextareaRef(element: HTMLTextAreaElement): void {
    textareaRef = element;
  }

  /**
   * Store input reference
   */
  function setInputRef(element: HTMLInputElement): void {
    inputRef = element;
  }
</script>

<svelte:window on:keydown={handleGlobalKeydown} on:click={handleWindowClick} />

<div
  class="ai-prompt-panel shrink-0
         bg-bg-secondary border-t border-border-default
         transition-all duration-300 ease-in-out
         {collapsed ? 'h-14' : 'h-64'}"
  role="region"
  aria-label="AI Prompt Panel"
>
  <!-- Collapsed single-line input bar -->
  {#if collapsed}
    <div class="h-14 px-4 flex items-center gap-2">
      <!-- Expand button -->
      <button
        type="button"
        onclick={onToggle}
        class="shrink-0 h-6 w-6 flex items-center justify-center
               hover:bg-bg-hover rounded transition-colors duration-150
               focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
        aria-expanded={!collapsed}
        aria-label="Expand to multi-line mode"
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
          class="text-text-tertiary"
          aria-hidden="true"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {#if onNewSession !== undefined}
        <button
          type="button"
          onclick={onNewSession}
          class="shrink-0 h-6 w-6 flex items-center justify-center
                 hover:bg-bg-hover rounded transition-colors duration-150
                 text-text-tertiary hover:text-text-primary
                 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
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

      <div class="relative shrink-0">
        <button
          type="button"
          data-ai-search-button
          onclick={toggleSessionPopup}
          class="h-6 w-6 flex items-center justify-center
                 hover:bg-bg-hover rounded transition-colors duration-150
                 text-text-tertiary hover:text-text-primary
                 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis
                 {isSessionPopupOpen ? 'bg-bg-hover text-text-primary' : ''}"
          title="Search Sessions"
          aria-label="Search and browse sessions"
          aria-expanded={isSessionPopupOpen}
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

        {#if isSessionPopupOpen}
          <div
            bind:this={sessionPopupRef}
            class="absolute left-0 bottom-full z-50 mb-2 w-[420px]
                   bg-bg-primary border border-border-default rounded-lg shadow-lg
                   max-h-[400px] flex flex-col"
            role="dialog"
            aria-label="Session search"
          >
            <SessionSearchPopup
              {contextId}
              {projectPath}
              onResumeSession={handleResumeFromSearch}
              onClose={closeSessionPopup}
            />
          </div>
        {/if}
      </div>

      <!-- Single-line input -->
      <div class="flex-1 relative min-w-0">
        <input
          type="text"
          bind:this={inputRef}
          bind:value={prompt}
          oninput={handleInputSingleLine}
          onkeydown={handleKeydownSingleLine}
          use:setInputRef
          placeholder="Ask AI about your code... (Use @ to reference files)"
          class="w-full h-9 px-3 py-1.5
                 bg-bg-primary text-text-primary text-sm
                 border border-border-default rounded
                 placeholder:text-text-tertiary
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis"
          aria-label="AI prompt (single-line)"
        />

        <!-- Autocomplete dropdown for single-line input -->
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
      </div>

      <!-- File refs count badge -->
      {#if fileRefs.length > 0}
        <span
          class="shrink-0 px-2 py-1 text-xs bg-accent-muted text-accent-fg rounded"
        >
          {fileRefs.length} ref{fileRefs.length !== 1 ? "s" : ""}
        </span>
      {/if}

      <!-- Queue status -->
      {#if queueStatusText}
        <span class="shrink-0 text-xs text-text-tertiary hidden sm:inline">
          {queueStatusText}
        </span>
      {/if}

      <!-- Draft button for collapsed mode -->
      <div class="draft-button-container relative shrink-0">
        <button
          type="button"
          onclick={toggleDraftDropdown}
          class="h-9 px-3
                 bg-bg-tertiary hover:bg-bg-hover
                 text-text-secondary text-sm font-medium rounded
                 border border-border-default
                 transition-all duration-150
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
          aria-label="Draft options"
          aria-haspopup="true"
          aria-expanded={showDraftDropdown}
        >
          Draft{drafts.length > 0 ? ` (${drafts.length})` : ""}
        </button>

        {#if showDraftDropdown}
          <div
            class="absolute bottom-full right-0 mb-1 w-64
                   bg-bg-secondary border border-border-default rounded-lg shadow-lg z-50
                   max-h-72 flex flex-col"
          >
            <!-- Save Draft -->
            <button
              type="button"
              onclick={saveDraft}
              disabled={prompt.trim().length === 0}
              class="shrink-0 w-full px-3 py-2 text-left text-sm text-text-primary
                     hover:bg-bg-tertiary
                     border-b border-border-default
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors duration-150
                     {drafts.length === 0 ? 'rounded-lg' : 'rounded-t-lg'}"
            >
              Save Draft
            </button>

            <!-- Draft list -->
            {#if drafts.length > 0}
              <div class="overflow-y-auto flex-1">
                {#each drafts as draft, i (draft.id)}
                  <button
                    type="button"
                    onclick={() => loadDraftById(draft.id)}
                    class="w-full px-3 py-2 text-left text-sm text-text-primary
                           hover:bg-bg-tertiary
                           transition-colors duration-150
                           {i === drafts.length - 1 ? 'rounded-b-lg' : ''}"
                  >
                    <span class="block truncate">{draftPreview(draft)}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Compact split button for collapsed mode -->
      <div class="split-button-container relative shrink-0 flex">
        <!-- Main Submit button -->
        <button
          type="button"
          onclick={handleSubmit}
          disabled={prompt.trim().length === 0}
          class="h-9 px-3
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
          class="h-9 px-2
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
  {/if}

  <!-- Expanded content -->
  {#if !collapsed}
    <!-- Header bar for expanded mode -->
    <div
      class="h-12 px-4 flex items-center justify-between border-b border-border-default"
    >
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-text-primary"> AI Prompt </span>

        <button
          type="button"
          onclick={handleCollapsePanel}
          class="h-6 w-6 flex items-center justify-center
                 hover:bg-bg-hover rounded transition-colors duration-150
                 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
          aria-expanded={!collapsed}
          aria-label="Collapse to single-line mode"
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
            class="text-text-tertiary transition-transform duration-300 rotate-180"
            aria-hidden="true"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        <kbd
          class="hidden sm:inline px-1.5 py-0.5 text-[10px] bg-bg-tertiary text-text-tertiary rounded"
        >
          A
        </kbd>

        {#if onNewSession !== undefined}
          <button
            type="button"
            onclick={onNewSession}
            class="h-6 w-6 flex items-center justify-center
                   hover:bg-bg-hover rounded transition-colors duration-150
                   text-text-tertiary hover:text-text-primary
                   focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
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

        <div class="relative">
          <button
            type="button"
            data-ai-search-button
            onclick={toggleSessionPopup}
            class="h-6 w-6 flex items-center justify-center
                   hover:bg-bg-hover rounded transition-colors duration-150
                   text-text-tertiary hover:text-text-primary
                   focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis
                   {isSessionPopupOpen ? 'bg-bg-hover text-text-primary' : ''}"
            title="Search Sessions"
            aria-label="Search and browse sessions"
            aria-expanded={isSessionPopupOpen}
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

          {#if isSessionPopupOpen}
            <div
              bind:this={sessionPopupRef}
              class="absolute left-0 bottom-full z-50 mb-2 w-[420px]
                     bg-bg-primary border border-border-default rounded-lg shadow-lg
                     max-h-[400px] flex flex-col"
              role="dialog"
              aria-label="Session search"
            >
              <SessionSearchPopup
                {contextId}
                {projectPath}
                {completedSessions}
                onResumeSession={handleResumeFromSearch}
                onClose={closeSessionPopup}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Queue status -->
        {#if queueStatusText}
          <span class="text-xs text-text-tertiary">
            {queueStatusText}
          </span>
        {/if}
      </div>
    </div>

    <div class="h-52 p-4 flex flex-col">
      <!-- Input area -->
      <div class="flex-1 flex gap-3 min-h-0">
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
                      :L{ref.startLine}{ref.endLine !== ref.startLine
                        ? `-L${ref.endLine}`
                        : ""}
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

        <!-- Controls: Draft + Split button -->
        <div class="flex flex-col gap-3 w-32">
          <!-- Draft button -->
          <div class="draft-button-container relative">
            <button
              type="button"
              onclick={toggleDraftDropdown}
              class="w-full min-h-[36px]
                     bg-bg-tertiary hover:bg-bg-hover
                     text-text-secondary text-sm font-medium rounded
                     border border-border-default
                     transition-all duration-150
                     focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
              aria-label="Draft options"
              aria-haspopup="true"
              aria-expanded={showDraftDropdown}
            >
              Draft{drafts.length > 0 ? ` (${drafts.length})` : ""}
            </button>

            {#if showDraftDropdown}
              <div
                class="absolute bottom-full right-0 mb-1 w-64
                       bg-bg-secondary border border-border-default rounded-lg shadow-lg z-50
                       max-h-72 flex flex-col"
              >
                <!-- Save Draft -->
                <button
                  type="button"
                  onclick={saveDraft}
                  disabled={prompt.trim().length === 0}
                  class="shrink-0 w-full px-3 py-2 text-left text-sm text-text-primary
                         hover:bg-bg-tertiary
                         border-b border-border-default
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors duration-150
                         {drafts.length === 0 ? 'rounded-lg' : 'rounded-t-lg'}"
                >
                  Save Draft
                </button>

                <!-- Draft list -->
                {#if drafts.length > 0}
                  <div class="overflow-y-auto flex-1">
                    {#each drafts as draft, i (draft.id)}
                      <button
                        type="button"
                        onclick={() => loadDraftById(draft.id)}
                        class="w-full px-3 py-2 text-left text-sm text-text-primary
                               hover:bg-bg-tertiary
                               transition-colors duration-150
                               {i === drafts.length - 1 ? 'rounded-b-lg' : ''}"
                      >
                        <span class="block truncate">{draftPreview(draft)}</span
                        >
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

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
