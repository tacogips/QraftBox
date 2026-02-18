<script lang="ts">
  /**
   * AIPromptPanel Component
   *
   * Always-visible panel for AI prompts at the bottom of the screen.
   * Provides full prompt input with file references and queue status.
   * Height is controlled by the parent via a resize drag handle.
   */

  import type { QueueStatus, FileReference } from "../../src/types/ai";
  import type { ModelProfile } from "../../src/types/model-config";
  import {
    getAIPromptCompletionNotificationsEnabled,
    setAIPromptCompletionNotificationsEnabled,
  } from "../src/lib/browser-notifications";
  import FileAutocomplete from "./FileAutocomplete.svelte";
  import SessionSearchPopup from "./SessionSearchPopup.svelte";

  interface Props {
    contextId: string | null;
    projectPath: string;
    queueStatus: QueueStatus;
    isFirstMessage?: boolean;
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
    onNewSession?: () => void;
    onResumeSession?: (sessionId: string) => void;
  }

  // Svelte 5 props syntax
  const {
    contextId,
    projectPath,
    queueStatus,
    isFirstMessage = true,
    changedFiles,
    allFiles,
    onSubmit,
    modelProfiles = [],
    selectedModelProfileId = undefined,
    onSelectModelProfile = undefined,
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
  let aiCompletionNotificationsEnabled = $state(
    getAIPromptCompletionNotificationsEnabled(),
  );

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
  let sessionSearchBtnRef: HTMLButtonElement | null = $state(null);
  let sessionPopupStyle = $state("");
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

    // 'A' key: focus the textarea
    if (
      event.key === "a" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      textareaRef?.focus();
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

  function computeSessionPopupPosition(): void {
    if (sessionSearchBtnRef === null) {
      sessionPopupStyle = "";
      return;
    }
    const rect = sessionSearchBtnRef.getBoundingClientRect();
    const popupWidth = 420;
    const popupMaxHeight = 400;
    const top = Math.max(8, rect.top - popupMaxHeight - 8);
    const left = Math.min(rect.left, window.innerWidth - popupWidth - 8);
    sessionPopupStyle = `position:fixed;top:${top}px;left:${Math.max(8, left)}px;width:${popupWidth}px;max-height:${popupMaxHeight}px;`;
  }

  function toggleSessionPopup(): void {
    isSessionPopupOpen = !isSessionPopupOpen;
    if (isSessionPopupOpen) {
      computeSessionPopupPosition();
    }
  }

  function toggleAIPromptCompletionNotifications(): void {
    const nextEnabledState = !aiCompletionNotificationsEnabled;
    aiCompletionNotificationsEnabled = nextEnabledState;
    setAIPromptCompletionNotificationsEnabled(nextEnabledState);
  }

  function closeSessionPopup(): void {
    isSessionPopupOpen = false;
  }

  function handleClosePopups(): void {
    closeSessionPopup();
    showDropdown = false;
    showDraftDropdown = false;
    showAutocomplete = false;
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
    // Escape to blur
    if (event.key === "Escape" && !showAutocomplete) {
      event.preventDefault();
      textareaRef?.blur();
      handleClosePopups();
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
</script>

<svelte:window on:keydown={handleGlobalKeydown} on:click={handleWindowClick} />

<div
  class="ai-prompt-panel bg-bg-secondary border-t border-border-default
         flex-1 min-h-0 flex flex-col"
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

  <!-- Header bar -->
  <div
    class="min-h-12 px-4 py-2 flex flex-wrap items-center justify-between gap-y-1 border-b border-border-default"
  >
    <div class="flex items-center gap-3">
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

      <button
        bind:this={sessionSearchBtnRef}
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
          class="z-50 bg-bg-primary border border-border-default rounded-lg shadow-lg flex flex-col"
          style={sessionPopupStyle}
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

      {#if projectPath}
        <span
          class="text-xs text-text-tertiary overflow-hidden text-ellipsis whitespace-nowrap max-w-xs"
          style="direction: rtl; text-align: left;"
          title={projectPath}>&lrm;{projectPath}</span
        >
      {/if}

      <button
        type="button"
        onclick={toggleAIPromptCompletionNotifications}
        class="h-6 px-2 flex items-center gap-1
                 hover:bg-bg-hover rounded transition-colors duration-150
                 text-text-tertiary hover:text-text-primary
                 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
        title={aiCompletionNotificationsEnabled
          ? "AI completion notifications: on"
          : "AI completion notifications: off"}
        aria-label={aiCompletionNotificationsEnabled
          ? "Disable AI completion notifications"
          : "Enable AI completion notifications"}
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
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          {#if !aiCompletionNotificationsEnabled}
            <line x1="4" y1="4" x2="20" y2="20" />
          {/if}
        </svg>
        <span class="text-xs">
          {aiCompletionNotificationsEnabled ? "Notify on" : "Notify off"}
        </span>
      </button>
    </div>

    <div class="flex items-center gap-2 sm:gap-3">
      {#if modelProfiles.length > 0}
        <select
          class="rounded border border-border-default bg-bg-primary px-2 py-1 text-xs text-text-primary max-w-[180px]"
          value={selectedModelProfileId}
          onchange={(e) => {
            const target = e.target as HTMLSelectElement;
            onSelectModelProfile?.(target.value);
          }}
          aria-label="AI model profile"
        >
          {#each modelProfiles as profile (profile.id)}
            <option value={profile.id}>{profileLabel(profile)}</option>
          {/each}
        </select>
      {/if}

      <button
        type="button"
        onclick={openFilePicker}
        class="shrink-0 h-7 w-7 flex items-center justify-center text-text-secondary border border-border-default rounded
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
        <span class="text-xs text-text-tertiary whitespace-nowrap">
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
                      <span class="block truncate">{draftPreview(draft)}</span>
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
                       text-white font-medium
                       {isFirstMessage ? 'rounded-l' : 'rounded'}
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-150
                       focus:outline-none focus:ring-2 focus:ring-success-emphasis"
            >
              Submit
            </button>
            {#if isFirstMessage}
              <!-- Dropdown trigger (first message only) -->
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
            {/if}
          </div>

          {#if isFirstMessage}
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
                           hover:bg-bg-tertiary rounded-lg transition-colors duration-150
                           focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
                >
                  Submit & Run Now
                </button>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
