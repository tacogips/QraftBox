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
  import type { ModelProfile } from "../../src/types/model-config";
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
      modelProfileId?: string,
    ) => void;
    modelProfiles?: readonly ModelProfile[];
    selectedModelProfileId?: string | undefined;
    onSelectModelProfile?: (profileId: string) => void;
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
    modelProfiles = [],
    selectedModelProfileId = undefined,
    onSelectModelProfile = undefined,
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
  const MAX_ATTACHMENT_COUNT = 8;
  const MAX_ATTACHMENT_SIZE_BYTES = 512 * 1024;
  const UPLOAD_REF_PREFIX = "upload/";
  const TEXT_FILE_EXTENSIONS = new Set([
    "txt",
    "md",
    "markdown",
    "json",
    "yaml",
    "yml",
    "toml",
    "xml",
    "csv",
    "tsv",
    "ini",
    "conf",
    "log",
    "js",
    "jsx",
    "ts",
    "tsx",
    "mjs",
    "cjs",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "kt",
    "swift",
    "php",
    "c",
    "h",
    "cc",
    "cpp",
    "hpp",
    "cs",
    "sh",
    "bash",
    "zsh",
    "fish",
    "sql",
    "css",
    "scss",
    "less",
    "html",
    "htm",
    "svelte",
    "vue",
    "graphql",
    "gql",
    "env",
  ]);

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
  let isIphone = $state(false);
  let fileInputRef: HTMLInputElement | null = $state(null);
  let uploadError = $state<string | null>(null);
  let isDraggingFiles = $state(false);

  function detectIphone(): boolean {
    const ua = navigator.userAgent;
    const isIphoneUa =
      /iPhone|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) &&
        "maxTouchPoints" in navigator &&
        navigator.maxTouchPoints > 1);
    return isIphoneUa && window.innerWidth <= 430;
  }

  $effect(() => {
    const update = (): void => {
      isIphone = detectIphone();
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  });

  const collapsedDraftButtonClass = $derived(
    isIphone ? "h-8 px-2 text-xs" : "h-9 px-3 text-sm",
  );
  const collapsedSubmitButtonClass = $derived(
    isIphone ? "h-8 px-2 text-xs" : "h-9 px-3 text-sm",
  );
  const collapsedSubmitMoreButtonClass = $derived(
    isIphone ? "h-8 px-1.5" : "h-9 px-2",
  );
  const expandedControlColumnClass = $derived(
    isIphone ? "flex flex-col gap-2 w-24" : "flex flex-col gap-3 w-32",
  );
  const expandedDraftButtonClass = $derived(
    isIphone ? "w-full min-h-[32px] text-xs" : "w-full min-h-[36px] text-sm",
  );
  const expandedSubmitButtonClass = $derived(
    isIphone ? "flex-1 min-h-[36px] text-xs" : "flex-1 min-h-[44px] text-sm",
  );
  const expandedSubmitMoreButtonClass = $derived(
    isIphone ? "px-1.5 min-h-[36px]" : "px-2 min-h-[44px]",
  );

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

  function isUploadedRef(ref: FileReference): boolean {
    return ref.path.startsWith(UPLOAD_REF_PREFIX);
  }

  function displayRefLabel(ref: FileReference): string {
    if (isUploadedRef(ref)) {
      return ref.path.slice(UPLOAD_REF_PREFIX.length);
    }
    return `@${ref.path}`;
  }

  function nextUploadPath(fileName: string): string {
    const existingPaths = new Set(fileRefs.map((ref) => ref.path));
    let candidate = `${UPLOAD_REF_PREFIX}${fileName}`;
    let sequence = 2;
    while (existingPaths.has(candidate)) {
      candidate = `${UPLOAD_REF_PREFIX}${fileName} (${sequence})`;
      sequence += 1;
    }
    return candidate;
  }

  async function appendUploadedFiles(files: readonly File[]): Promise<void> {
    if (files.length === 0) return;
    uploadError = null;

    const uploadRefCount = fileRefs.filter(isUploadedRef).length;
    const remainingSlots = Math.max(0, MAX_ATTACHMENT_COUNT - uploadRefCount);
    if (remainingSlots <= 0) {
      uploadError = `You can attach up to ${MAX_ATTACHMENT_COUNT} files.`;
      return;
    }

    const selected = files.slice(0, remainingSlots);
    const nextRefs: FileReference[] = [];
    const oversizedFiles: string[] = [];

    for (const file of selected) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        oversizedFiles.push(file.name);
        continue;
      }
      const isText =
        isTextMimeType(file.type) ||
        (file.type.length === 0 && isTextFile(file.name));
      if (isText) {
        const content = await file.text();
        nextRefs.push({
          path: nextUploadPath(file.name),
          content,
          fileName: file.name,
          mimeType: file.type.length > 0 ? file.type : "text/plain",
          encoding: "utf8",
          attachmentKind: "text",
        });
        continue;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      nextRefs.push({
        path: nextUploadPath(file.name),
        content: toBase64(bytes),
        fileName: file.name,
        mimeType:
          file.type.length > 0
            ? file.type
            : (inferMimeTypeFromName(file.name) ?? "application/octet-stream"),
        encoding: "base64",
        attachmentKind: file.type.startsWith("image/") ? "image" : "binary",
      });
    }

    if (nextRefs.length > 0) {
      fileRefs = [...fileRefs, ...nextRefs];
    }

    if (oversizedFiles.length > 0) {
      uploadError = `Some files were skipped (max ${Math.floor(MAX_ATTACHMENT_SIZE_BYTES / 1024)} KB each): ${oversizedFiles.join(", ")}`;
      return;
    }
    if (files.length > remainingSlots) {
      uploadError = `Only ${remainingSlots} file${remainingSlots !== 1 ? "s" : ""} attached.`;
    }
  }

  function openFilePicker(): void {
    uploadError = null;
    fileInputRef?.click();
  }

  function handleFileInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files !== null) {
      void appendUploadedFiles(Array.from(target.files));
    }
    target.value = "";
  }

  function isTextFile(fileName: string): boolean {
    const normalized = fileName.trim().toLowerCase();
    const lastDot = normalized.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === normalized.length - 1) {
      return false;
    }
    const extension = normalized.slice(lastDot + 1);
    return TEXT_FILE_EXTENSIONS.has(extension);
  }

  function inferMimeTypeFromName(fileName: string): string | undefined {
    const normalized = fileName.toLowerCase();
    if (normalized.endsWith(".png")) return "image/png";
    if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
      return "image/jpeg";
    }
    if (normalized.endsWith(".gif")) return "image/gif";
    if (normalized.endsWith(".webp")) return "image/webp";
    if (normalized.endsWith(".svg")) return "image/svg+xml";
    if (normalized.endsWith(".pdf")) return "application/pdf";
    return undefined;
  }

  function isTextMimeType(mimeType: string): boolean {
    if (mimeType.length === 0) return false;
    if (mimeType.startsWith("text/")) return true;
    return (
      mimeType === "application/json" ||
      mimeType === "application/xml" ||
      mimeType === "application/javascript" ||
      mimeType === "application/typescript" ||
      mimeType === "application/x-sh" ||
      mimeType === "application/x-httpd-php"
    );
  }

  function toBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
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
    onSubmit(prompt, false, fileRefs, selectedModelProfileId);

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
    onSubmit(prompt, true, fileRefs, selectedModelProfileId);

    // Clear form after submission
    prompt = "";
    fileRefs = [];
    showDropdown = false;
  }

  function handleSubmitAndRunWithProfile(profileId: string): void {
    if (prompt.trim().length === 0) return;
    onSelectModelProfile?.(profileId);
    onSubmit(prompt, true, fileRefs, profileId);

    // Clear form after submission
    prompt = "";
    fileRefs = [];
    showDropdown = false;
  }

  function profileLabel(profile: ModelProfile): string {
    return `${profile.name} (${profile.vendor}/${profile.model})`;
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
   * Handle dragover to allow file path drops from the file tree
   */
  function handleFileDragOver(event: DragEvent): void {
    const hasPathDrop =
      event.dataTransfer?.types.includes("application/x-qraftbox-path") ===
      true;
    const hasFileDrop = event.dataTransfer?.types.includes("Files") === true;

    if (hasPathDrop || hasFileDrop) {
      event.preventDefault();
      if (event.dataTransfer !== null) {
        event.dataTransfer.dropEffect = "copy";
      }
      isDraggingFiles = hasFileDrop;
    }
  }

  function handleFileDragEnter(event: DragEvent): void {
    if (event.dataTransfer?.types.includes("Files") === true) {
      isDraggingFiles = true;
      event.preventDefault();
    }
  }

  function handleFileDragLeave(event: DragEvent): void {
    if (event.currentTarget === event.target) {
      isDraggingFiles = false;
    }
  }

  /**
   * Handle drop of file paths from the file tree.
   * Inserts @{path} at cursor position with spaces to avoid concatenation.
   */
  function handleFileDrop(event: DragEvent): void {
    isDraggingFiles = false;
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles !== undefined && droppedFiles.length > 0) {
      event.preventDefault();
      void appendUploadedFiles(Array.from(droppedFiles));
      return;
    }

    const filePath =
      event.dataTransfer?.getData("application/x-qraftbox-path") ?? "";
    if (filePath === "") return;
    event.preventDefault();

    const insertion = `@${filePath}`;
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    const cursorPos = target.selectionStart ?? prompt.length;

    const before = prompt.slice(0, cursorPos);
    const after = prompt.slice(cursorPos);

    let prefix = "";
    let suffix = "";

    if (before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n")) {
      prefix = " ";
    }
    if (after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n")) {
      suffix = " ";
    }

    prompt = before + prefix + insertion + suffix + after;
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
  class="ai-prompt-panel bg-bg-secondary border-t border-border-default
         {collapsed ? 'shrink-0 h-14' : 'flex-1 min-h-0 flex flex-col'}"
  role="region"
  aria-label="AI Prompt Panel"
>
  <input
    type="file"
    bind:this={fileInputRef}
    onchange={handleFileInputChange}
    class="hidden"
    multiple
    aria-label="Attach files to AI prompt"
  />

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

      <button
        type="button"
        onclick={openFilePicker}
        class="shrink-0 h-6 w-6 flex items-center justify-center
               hover:bg-bg-hover rounded transition-colors duration-150
               text-text-tertiary hover:text-text-primary
               focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
        title="Attach files"
        aria-label="Attach files"
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
            d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l8.48-8.49a4 4 0 0 1 5.66 5.66l-8.49 8.48a2 2 0 1 1-2.83-2.83l7.78-7.78"
          />
        </svg>
      </button>

      <!-- Single-line input -->
      <div class="flex-1 relative min-w-0">
        <input
          type="text"
          bind:this={inputRef}
          bind:value={prompt}
          oninput={handleInputSingleLine}
          onkeydown={handleKeydownSingleLine}
          ondragenter={handleFileDragEnter}
          ondragleave={handleFileDragLeave}
          ondragover={handleFileDragOver}
          ondrop={handleFileDrop}
          use:setInputRef
          placeholder="Ask AI about your code... (Use @ to reference files)"
          class="w-full h-9 px-3 py-1.5
                 bg-bg-primary text-text-primary text-sm
                 border border-border-default rounded
                 placeholder:text-text-tertiary
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis
                 {isDraggingFiles
            ? 'ring-2 ring-accent-emphasis border-accent-emphasis'
            : ''}"
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

      {#if uploadError !== null}
        <span class="shrink-0 text-xs text-danger-fg hidden md:inline">
          {uploadError}
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
          class="{collapsedDraftButtonClass}
                 bg-bg-tertiary hover:bg-bg-hover
                 text-text-secondary font-medium rounded
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
          class="{collapsedSubmitButtonClass}
                 bg-success-emphasis hover:brightness-110
                 text-white font-medium rounded-l
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
          class="{collapsedSubmitMoreButtonClass}
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
            class="absolute bottom-full right-0 mb-1 w-72
                   bg-bg-secondary border border-border-default rounded-lg shadow-lg z-50"
          >
            <button
              type="button"
              onclick={handleSubmitAndRun}
              class="w-full px-3 py-2 text-left text-sm text-text-primary
                     hover:bg-bg-tertiary transition-colors duration-150
                     focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis
                     {modelProfiles.length === 0
                ? 'rounded-lg'
                : 'rounded-t-lg'}"
            >
              Submit & Run Now
            </button>
            {#if modelProfiles.length > 0}
              <div class="border-t border-border-default">
                {#each modelProfiles as profile (profile.id)}
                  <button
                    type="button"
                    onclick={() => handleSubmitAndRunWithProfile(profile.id)}
                    class="w-full px-3 py-2 text-left text-sm text-text-primary
                           hover:bg-bg-tertiary transition-colors duration-150
                           focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
                  >
                    <span class="flex items-center justify-between gap-2">
                      <span class="truncate"
                        >Run with {profileLabel(profile)}</span
                      >
                      {#if selectedModelProfileId === profile.id}
                        <span class="text-xs text-accent-fg">Selected</span>
                      {/if}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
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
                onResumeSession={handleResumeFromSearch}
                onClose={closeSessionPopup}
              />
            </div>
          {/if}
        </div>

        {#if projectPath}
          <span
            class="text-xs text-text-tertiary overflow-hidden text-ellipsis whitespace-nowrap max-w-xs"
            style="direction: rtl; text-align: left;"
            title={projectPath}>&lrm;{projectPath}</span
          >
        {/if}
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={openFilePicker}
          class="h-7 w-7 flex items-center justify-center text-text-secondary border border-border-default rounded
                 hover:bg-bg-hover transition-colors duration-150
                 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
          title="Attach files"
          aria-label="Attach files"
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
              d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l8.48-8.49a4 4 0 0 1 5.66 5.66l-8.49 8.48a2 2 0 1 1-2.83-2.83l7.78-7.78"
            />
          </svg>
        </button>

        <!-- Queue status -->
        {#if queueStatusText}
          <span class="text-xs text-text-tertiary">
            {queueStatusText}
          </span>
        {/if}
      </div>
    </div>

    <div class="flex-1 min-h-0 p-4 flex flex-col overflow-hidden">
      <!-- Input area -->
      <div class="flex-1 flex gap-3 min-h-0">
        <!-- Prompt input -->
        <div class="flex-1 relative flex flex-col min-w-0">
          <textarea
            bind:this={textareaRef}
            bind:value={prompt}
            oninput={handleInput}
            onkeydown={handleKeydown}
            ondragenter={handleFileDragEnter}
            ondragleave={handleFileDragLeave}
            ondragover={handleFileDragOver}
            ondrop={handleFileDrop}
            use:setTextareaRef
            placeholder="Ask AI about your code... (Use @ to reference files)"
            class="flex-1 w-full px-3 py-2
                   bg-bg-primary text-text-primary text-sm
                   border border-border-default rounded
                   placeholder:text-text-tertiary
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis
                   {isDraggingFiles
              ? 'ring-2 ring-accent-emphasis border-accent-emphasis'
              : ''}
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

          {#if isDraggingFiles}
            <div class="mt-2 text-xs text-accent-fg">
              Drop files to attach to this prompt
            </div>
          {/if}

          <!-- File references -->
          {#if fileRefs.length > 0}
            <div class="flex flex-wrap gap-2 mt-2">
              {#each fileRefs as ref (ref.path)}
                <span
                  class="inline-flex items-center gap-1 px-2 py-1
                         bg-accent-muted text-accent-fg text-xs rounded"
                >
                  <span class="truncate max-w-[140px]"
                    >{displayRefLabel(ref)}</span
                  >
                  {#if isUploadedRef(ref)}
                    <span
                      class="inline-flex items-center justify-center text-accent-fg"
                      title="Attached file"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path
                          d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l8.48-8.49a4 4 0 0 1 5.66 5.66l-8.49 8.48a2 2 0 1 1-2.83-2.83l7.78-7.78"
                        />
                      </svg>
                    </span>
                  {/if}
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

          {#if uploadError !== null}
            <div class="mt-2 text-xs text-danger-fg">{uploadError}</div>
          {/if}
        </div>

        <!-- Controls: Draft + Split button -->
        <div class={expandedControlColumnClass}>
          <!-- Draft button -->
          <div class="draft-button-container relative">
            <button
              type="button"
              onclick={toggleDraftDropdown}
              class="{expandedDraftButtonClass}
                     bg-bg-tertiary hover:bg-bg-hover
                     text-text-secondary font-medium rounded
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
            <div class={isIphone ? "flex min-h-[36px]" : "flex min-h-[44px]"}>
              <!-- Main Submit button -->
              <button
                type="button"
                onclick={handleSubmit}
                disabled={prompt.trim().length === 0}
                class="{expandedSubmitButtonClass}
                       bg-success-emphasis hover:brightness-110
                       text-white font-medium rounded-l
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
                class="{expandedSubmitMoreButtonClass}
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
                class="absolute bottom-full right-0 mb-1 w-72
                       bg-bg-secondary border border-border-default rounded-lg shadow-lg z-50"
              >
                <button
                  type="button"
                  onclick={handleSubmitAndRun}
                  class="w-full px-3 py-2 text-left text-sm text-text-primary
                         hover:bg-bg-tertiary transition-colors duration-150
                         focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis
                         {modelProfiles.length === 0
                    ? 'rounded-lg'
                    : 'rounded-t-lg'}"
                >
                  Submit & Run Now
                </button>
                {#if modelProfiles.length > 0}
                  <div class="border-t border-border-default">
                    {#each modelProfiles as profile (profile.id)}
                      <button
                        type="button"
                        onclick={() =>
                          handleSubmitAndRunWithProfile(profile.id)}
                        class="w-full px-3 py-2 text-left text-sm text-text-primary
                               hover:bg-bg-tertiary transition-colors duration-150
                               focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
                      >
                        <span class="flex items-center justify-between gap-2">
                          <span class="truncate"
                            >Run with {profileLabel(profile)}</span
                          >
                          {#if selectedModelProfileId === profile.id}
                            <span class="text-xs text-accent-fg">Selected</span>
                          {/if}
                        </span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
