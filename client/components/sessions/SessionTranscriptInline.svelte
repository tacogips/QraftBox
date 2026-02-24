<script lang="ts">
  /**
   * SessionTranscriptInline Component
   *
   * Inline transcript viewer for Claude sessions with Chat and Carousel view modes.
   * Designed to be embedded inside an accordion list of sessions.
   *
   * Props:
   * - sessionId: string - the session ID to fetch transcript for
   * - contextId: string - context ID for API calls
   */

  interface Props {
    sessionId: string;
    contextId: string;
    /** When set, only show the last N messages (compact mode) */
    maxMessages?: number | undefined;
    /** Auto-refresh interval for live transcript updates (0 = disabled) */
    autoRefreshMs?: number | undefined;
    /** Keep the viewport anchored to the latest message while refreshing */
    followLatest?: boolean | undefined;
    /** Increment to explicitly focus the latest rendered message */
    focusTailNonce?: number | undefined;
    /** Optimistic user message shown before transcript persistence */
    optimisticUserMessage?: string | undefined;
    /** Status for optimistic user message */
    optimisticUserStatus?: "queued" | "running" | undefined;
    /** Optimistic assistant message shown before transcript persistence */
    optimisticAssistantMessage?: string | undefined;
    /** Show assistant thinking placeholder while waiting for first response */
    showAssistantThinking?: boolean | undefined;
    /** Queued user prompts not yet persisted to transcript */
    pendingUserMessages?:
      | readonly {
          message: string;
          status: "queued" | "running";
        }[]
      | undefined;
  }

  import {
    isInjectedSessionSystemPrompt,
    stripSystemTags,
  } from "../../../src/utils/strip-system-tags";
  import DOMPurify from "dompurify";
  import { marked } from "marked";

  const {
    sessionId,
    contextId,
    maxMessages = undefined,
    autoRefreshMs = 0,
    followLatest = false,
    focusTailNonce = 0,
    optimisticUserMessage = undefined,
    optimisticUserStatus = "queued",
    optimisticAssistantMessage = undefined,
    showAssistantThinking = false,
    pendingUserMessages = [],
  }: Props = $props();

  /**
   * Transcript event structure (matches server response)
   */
  interface TranscriptEvent {
    readonly type: string;
    readonly uuid?: string | undefined;
    readonly timestamp?: string | undefined;
    readonly content?: unknown;
    readonly raw: object;
  }

  /**
   * Transcript API response
   */
  interface TranscriptResponse {
    readonly events: TranscriptEvent[];
    readonly sessionId: string;
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
  }

  /**
   * Loading state (discriminated union for type safety)
   */
  type LoadingState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: TranscriptEvent[]; total: number }
    | { status: "error"; error: string };

  /**
   * View mode type
   */
  type ViewMode = "chat" | "carousel";

  const VIEW_MODE_STORAGE_KEY = "qraftbox:session-transcript-view-mode";
  const SHOW_SYSTEM_PROMPTS_STORAGE_KEY =
    "qraftbox:session-transcript-show-system-prompts";

  function renderMarkdown(text: string): string {
    const parsed = marked.parse(text, {
      async: false,
      breaks: true,
      gfm: true,
    });
    const html = typeof parsed === "string" ? parsed : "";
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
    });
  }

  function loadViewMode(): ViewMode {
    try {
      const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === "chat" || stored === "carousel") return stored;
    } catch {
      // localStorage unavailable
    }
    return "chat";
  }

  function loadShowSystemPrompts(): boolean {
    try {
      return localStorage.getItem(SHOW_SYSTEM_PROMPTS_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  let loadingState: LoadingState = $state({ status: "idle" });
  let viewMode: ViewMode = $state(loadViewMode());
  let showSystemPrompts = $state(loadShowSystemPrompts());
  let currentIndex = $state(0);
  let expandedMessages = $state<Set<string>>(new Set());
  let chatScrollContainer: HTMLDivElement | null = $state(null);
  let copiedEventId: string | null = $state(null);
  let lastInitializedSessionId: string | null = $state(null);

  /**
   * Copy event content to clipboard
   */
  async function copyToClipboard(text: string, eventId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copiedEventId = eventId;
      setTimeout(() => {
        copiedEventId = null;
      }, 1500);
    } catch {
      // Silently fail if clipboard API is unavailable
    }
  }

  /**
   * Filter events to only show user and assistant messages.
   * Excludes user messages that consist entirely of system tags
   * (e.g., local-command-caveat, command-name, system-reminder).
   */
  const allChatEvents = $derived(
    loadingState.status === "success"
      ? loadingState.data.filter((event) => {
          if (event.type !== "user" && event.type !== "assistant") return false;
          const text = extractTextContent(event);
          if (text.trim().length === 0) return false;
          if (
            !showSystemPrompts &&
            event.type === "user" &&
            isInjectedSessionSystemPrompt(extractTextContentRaw(event))
          ) {
            return false;
          }
          return true;
        })
      : [],
  );

  const hiddenSystemPromptCount = $derived.by(() => {
    if (loadingState.status !== "success" || showSystemPrompts) {
      return 0;
    }
    let count = 0;
    for (const event of loadingState.data) {
      if (event.type !== "user") {
        continue;
      }
      if (isInjectedSessionSystemPrompt(extractTextContentRaw(event))) {
        count += 1;
      }
    }
    return count;
  });

  /** When maxMessages is set, only show the last N messages */
  const chatEvents = $derived(
    maxMessages !== undefined && allChatEvents.length > maxMessages
      ? allChatEvents.slice(-maxMessages)
      : allChatEvents,
  );

  const isCompact = $derived(maxMessages !== undefined);

  $effect(() => {
    try {
      localStorage.setItem(
        SHOW_SYSTEM_PROMPTS_STORAGE_KEY,
        showSystemPrompts ? "true" : "false",
      );
    } catch {
      // localStorage unavailable
    }
  });

  function normalizeMessageText(rawText: string): string {
    return stripSystemTags(rawText).replace(/\s+/g, " ").trim();
  }

  const normalizedOptimisticUser = $derived(
    normalizeMessageText(optimisticUserMessage ?? ""),
  );

  const normalizedOptimisticAssistant = $derived(
    normalizeMessageText(optimisticAssistantMessage ?? ""),
  );

  const normalizedChatTextSet = $derived.by(() => {
    const textSet = new Set<string>();
    for (const transcriptEvent of chatEvents) {
      const normalizedText = normalizeMessageText(
        extractTextContent(transcriptEvent),
      );
      if (normalizedText.length > 0) {
        textSet.add(normalizedText);
      }
    }
    return textSet;
  });

  interface PendingUserMessage {
    readonly raw: string;
    readonly normalized: string;
    readonly status: "queued" | "running";
  }

  const pendingQueuedUserMessages = $derived.by(() => {
    const items: PendingUserMessage[] = [];
    const seenNormalized = new Set<string>();
    for (const pendingMessage of pendingUserMessages) {
      const rawText = stripSystemTags(pendingMessage.message).trim();
      const normalizedText = normalizeMessageText(rawText);
      if (normalizedText.length === 0) {
        continue;
      }
      if (normalizedChatTextSet.has(normalizedText)) {
        continue;
      }
      if (seenNormalized.has(normalizedText)) {
        continue;
      }
      seenNormalized.add(normalizedText);
      items.push({
        raw: rawText,
        normalized: normalizedText,
        status: pendingMessage.status,
      });
    }
    return items;
  });

  const pendingQueuedNormalizedSet = $derived.by(() => {
    const normalizedSet = new Set<string>();
    for (const pendingMessage of pendingQueuedUserMessages) {
      normalizedSet.add(pendingMessage.normalized);
    }
    return normalizedSet;
  });

  const showOptimisticUser = $derived(
    normalizedOptimisticUser.length > 0 &&
      !normalizedChatTextSet.has(normalizedOptimisticUser) &&
      !pendingQueuedNormalizedSet.has(normalizedOptimisticUser),
  );

  const showOptimisticAssistant = $derived(
    normalizedOptimisticAssistant.length > 0 &&
      !normalizedChatTextSet.has(normalizedOptimisticAssistant),
  );

  const showAssistantThinkingPlaceholder = $derived(
    showAssistantThinking &&
      !showOptimisticAssistant &&
      (chatEvents.length > 0 ||
        showOptimisticUser ||
        pendingQueuedUserMessages.length > 0),
  );

  const optimisticTailCount = $derived(
    (showOptimisticUser ? 1 : 0) +
      (showOptimisticAssistant ? 1 : 0) +
      (showAssistantThinkingPlaceholder ? 1 : 0),
  );

  /**
   * Whether we have optimistic messages to show as fallback when transcript
   * is not yet available (e.g. new session where CLI session file hasn't
   * been created yet).
   */
  const hasOptimisticContent = $derived(
    (optimisticUserMessage ?? "").length > 0 ||
      (optimisticAssistantMessage ?? "").length > 0 ||
      pendingQueuedUserMessages.length > 0 ||
      showAssistantThinkingPlaceholder,
  );

  /**
   * Fetch transcript events from API
   */
  async function fetchTranscript(options?: {
    silent?: boolean;
    contextId?: string;
    sessionId?: string;
  }): Promise<void> {
    const isSilentRefresh = options?.silent === true;
    const targetContextId = options?.contextId ?? contextId;
    const targetSessionId = options?.sessionId ?? sessionId;
    if (!isSilentRefresh) {
      loadingState = { status: "loading" };
    }

    try {
      const response = await fetch(
        `/api/ctx/${targetContextId}/claude-sessions/sessions/${targetSessionId}/transcript?limit=1000`,
      );

      if (!response.ok) {
        const errorData = (await response.json()) as { error: string };
        const errorMessage = errorData.error ?? "Failed to fetch transcript";
        const isTransientSessionNotFound =
          errorMessage.startsWith("Session not found:") &&
          targetSessionId.startsWith("qs_");

        // Qraft session IDs can become visible in UI before the underlying
        // Claude transcript is indexable. Keep UI usable during that window.
        if (isTransientSessionNotFound) {
          loadingState = {
            status: "success",
            data: [],
            total: 0,
          };
          return;
        }

        // Keep existing data on silent refresh (don't regress from success)
        if (isSilentRefresh && loadingState.status === "success") {
          return;
        }
        // On silent refresh from error state, stay in error silently
        // (auto-refresh will retry and recover once session is created)
        if (isSilentRefresh && loadingState.status === "error") {
          return;
        }
        loadingState = {
          status: "error",
          error: errorMessage,
        };
        return;
      }

      const data = (await response.json()) as TranscriptResponse;
      loadingState = {
        status: "success",
        data: data.events,
        total: data.total,
      };
    } catch (error: unknown) {
      if (
        isSilentRefresh &&
        (loadingState.status === "success" || loadingState.status === "error")
      ) {
        return;
      }
      loadingState = {
        status: "error",
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Persist view mode to localStorage
   */
  $effect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // localStorage unavailable
    }
  });

  /**
   * Initial fetch on mount
   */
  $effect(() => {
    const activeContextId = contextId;
    const activeSessionId = sessionId;
    void fetchTranscript({
      contextId: activeContextId,
      sessionId: activeSessionId,
    });
  });

  /**
   * Optional polling for live transcript updates.
   * Uses silent refresh so existing content stays visible while fetching.
   */
  $effect(() => {
    const activeContextId = contextId;
    const activeSessionId = sessionId;
    if (autoRefreshMs <= 0) return;
    const pollTimerId = setInterval(() => {
      void fetchTranscript({
        silent: true,
        contextId: activeContextId,
        sessionId: activeSessionId,
      });
    }, autoRefreshMs);
    return () => clearInterval(pollTimerId);
  });

  /**
   * Default to last message when switching to carousel mode
   */
  $effect(() => {
    if (viewMode === "carousel" && chatEvents.length > 0) {
      currentIndex = chatEvents.length - 1;
    }
  });

  /**
   * In chat mode, initialize to the latest message when opening a session.
   */
  $effect(() => {
    if (
      viewMode === "chat" &&
      loadingState.status === "success" &&
      chatScrollContainer !== null
    ) {
      const liveTailCount = optimisticTailCount;

      const targetIndex = chatEvents.length - 1;
      const isSessionSwitch = lastInitializedSessionId !== sessionId;
      const shouldFollowTail = followLatest || isSessionSwitch;
      if (!shouldFollowTail) {
        return;
      }

      lastInitializedSessionId = sessionId;
      if (liveTailCount > 0) {
        requestAnimationFrame(() => {
          focusLatestRenderedMessage("auto");
        });
        return;
      }

      if (chatEvents.length === 0) {
        return;
      }

      focusChatIndex(targetIndex, "auto");
    }
  });

  $effect(() => {
    const nonce = focusTailNonce;
    if (nonce === 0 || viewMode !== "chat" || chatScrollContainer === null) {
      return;
    }
    requestAnimationFrame(() => {
      focusLatestRenderedMessage("auto");
    });
  });

  /**
   * Extract text content from event
   * Handles user/assistant messages, tool_use, tool_result, and summary events
   */
  function extractTextContent(event: TranscriptEvent): string {
    return stripSystemTags(extractTextContentRaw(event));
  }

  /**
   * Extract raw text content from event (before system tag stripping)
   */
  function extractTextContentRaw(event: TranscriptEvent): string {
    const raw = event.raw as Record<string, unknown>;

    // User/assistant: content is at raw.message.content
    if (event.type === "user" || event.type === "assistant") {
      const message = raw["message"] as Record<string, unknown> | undefined;
      if (message !== undefined) {
        const msgContent = message["content"];
        if (typeof msgContent === "string") {
          return msgContent;
        }
        if (Array.isArray(msgContent)) {
          return extractContentBlocks(msgContent);
        }
      }
    }

    // Tool use events: raw.name and raw.input
    if (event.type === "tool_use") {
      const toolName =
        typeof raw["name"] === "string" ? raw["name"] : "unknown";
      const input = raw["input"];
      return `Tool: ${toolName}\n${input !== undefined ? JSON.stringify(input, null, 2) : ""}`;
    }

    // Tool result events: raw.content
    if (event.type === "tool_result") {
      const resultContent = raw["content"];
      if (typeof resultContent === "string") {
        return resultContent;
      }
      if (resultContent !== undefined) {
        return JSON.stringify(resultContent, null, 2);
      }
    }

    // Summary events
    if (event.type === "summary") {
      const summary = raw["summary"];
      if (typeof summary === "string") {
        return summary;
      }
    }

    // Fall back to top-level content if present
    if (event.content !== undefined && event.content !== null) {
      if (typeof event.content === "string") {
        return event.content;
      }
      return JSON.stringify(event.content, null, 2);
    }

    return "";
  }

  /**
   * Extract text from an array of content blocks (Claude message format)
   */
  function extractContentBlocks(blocks: unknown[]): string {
    const textParts: string[] = [];
    for (const block of blocks) {
      if (typeof block === "string") {
        textParts.push(block);
      } else if (
        typeof block === "object" &&
        block !== null &&
        "type" in block
      ) {
        const obj = block as Record<string, unknown>;
        if (obj["type"] === "text" && typeof obj["text"] === "string") {
          textParts.push(obj["text"]);
        } else if (obj["type"] === "tool_use") {
          const toolName =
            typeof obj["name"] === "string" ? obj["name"] : "unknown";
          textParts.push(`[Tool: ${toolName}]`);
        } else if (obj["type"] === "tool_result") {
          const content = obj["content"];
          if (typeof content === "string") {
            textParts.push(content);
          }
        }
      }
    }
    return textParts.join("\n\n");
  }

  /**
   * Get border color based on event type
   */
  function getBorderColor(eventType: string): string {
    switch (eventType) {
      case "user":
        return "border-accent-emphasis";
      case "assistant":
        return "border-success-emphasis";
      default:
        return "border-border-muted";
    }
  }

  function getMessageRowAlignment(eventType: string): string {
    return eventType === "user" ? "justify-end" : "justify-start";
  }

  function getMessageBubbleShape(eventType: string): string {
    return eventType === "user"
      ? "border-r-4 border-l-0 rounded-l"
      : "border-l-4 border-r-0 rounded-r";
  }

  /**
   * Get badge color based on event type
   */
  function getBadgeColor(eventType: string): string {
    switch (eventType) {
      case "user":
        return "bg-accent-muted text-accent-fg";
      case "assistant":
        return "bg-success-muted text-success-fg";
      default:
        return "bg-bg-tertiary text-text-tertiary";
    }
  }

  /**
   * Format timestamp for display (HH:MM:SS)
   */
  function formatTimestamp(timestamp: string | undefined): string {
    if (timestamp === undefined) return "";
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return timestamp;
    }
  }

  /**
   * Get event ID for expansion tracking
   */
  function getEventId(event: TranscriptEvent, index: number): string {
    return event.uuid ?? `${event.type}-${index}`;
  }

  /**
   * Check if content is long (for truncation in chat mode)
   */
  function isLongContent(text: string): boolean {
    return text.length > 500 || text.split("\n").length > 15;
  }

  /**
   * Toggle message expansion
   */
  function toggleExpanded(eventId: string): void {
    const newSet = new Set(expandedMessages);
    if (newSet.has(eventId)) {
      newSet.delete(eventId);
    } else {
      newSet.add(eventId);
    }
    expandedMessages = newSet;
  }

  function getChatItemElement(index: number): HTMLElement | null {
    if (chatScrollContainer === null) {
      return null;
    }
    return chatScrollContainer.querySelector<HTMLElement>(
      `[data-chat-index="${index}"]`,
    );
  }

  function focusChatIndex(index: number, behavior: ScrollBehavior): void {
    if (chatEvents.length === 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(index, chatEvents.length - 1));
    currentIndex = boundedIndex;

    const targetElement = getChatItemElement(boundedIndex);
    if (targetElement !== null) {
      targetElement.scrollIntoView({ block: "nearest", behavior });
      targetElement.focus({ preventScroll: true });
      return;
    }

    requestAnimationFrame(() => {
      const deferredTargetElement = getChatItemElement(boundedIndex);
      if (deferredTargetElement === null) {
        return;
      }
      deferredTargetElement.scrollIntoView({ block: "nearest", behavior });
      deferredTargetElement.focus({ preventScroll: true });
    });
  }

  function focusLatestRenderedMessage(behavior: ScrollBehavior): void {
    if (chatScrollContainer === null) {
      return;
    }
    const anchors = chatScrollContainer.querySelectorAll<HTMLElement>(
      "[data-chat-tail-anchor='true']",
    );
    if (anchors.length === 0) {
      return;
    }
    const latest = anchors[anchors.length - 1];
    if (latest === undefined) {
      return;
    }
    latest.scrollIntoView({ block: "nearest", behavior });
    latest.focus({ preventScroll: true });
  }

  /**
   * Navigate to previous carousel item
   */
  function handlePrevious(): void {
    if (viewMode === "chat") {
      focusChatIndex(currentIndex - 1, "auto");
    } else if (currentIndex > 0) {
      currentIndex = currentIndex - 1;
    }
  }

  /**
   * Navigate to next carousel item
   */
  function handleNext(): void {
    if (viewMode === "chat") {
      focusChatIndex(currentIndex + 1, "auto");
    } else if (currentIndex < chatEvents.length - 1) {
      currentIndex = currentIndex + 1;
    }
  }

  /**
   * Navigate to a specific carousel card by index
   */
  function handleGoToIndex(index: number): void {
    currentIndex = index;
  }

  /**
   * Navigate to the first message
   */
  function handleGoToFirst(): void {
    if (viewMode === "carousel") {
      currentIndex = 0;
    } else if (chatScrollContainer !== null) {
      focusChatIndex(0, "auto");
    }
  }

  /**
   * Navigate to the last message
   */
  function handleGoToLast(): void {
    if (viewMode === "carousel") {
      currentIndex = chatEvents.length - 1;
    } else if (chatScrollContainer !== null) {
      focusChatIndex(chatEvents.length - 1, "auto");
    }
  }

  /**
   * Swipe / drag state for carousel
   */
  let dragStartX: number | null = $state(null);
  let isDragging = $state(false);

  const SWIPE_THRESHOLD = 50;

  function handleTouchStart(e: TouchEvent): void {
    const touch = e.touches[0];
    if (touch !== undefined) {
      dragStartX = touch.clientX;
    }
  }

  function handleTouchEnd(e: TouchEvent): void {
    if (dragStartX === null) return;
    const touch = e.changedTouches[0];
    if (touch === undefined) return;
    const diff = dragStartX - touch.clientX;
    if (diff > SWIPE_THRESHOLD) {
      handleNext();
    } else if (diff < -SWIPE_THRESHOLD) {
      handlePrevious();
    }
    dragStartX = null;
  }

  function handlePointerDown(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    dragStartX = e.clientX;
    isDragging = true;
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!isDragging) return;
    e.preventDefault();
  }

  function handlePointerUp(e: PointerEvent): void {
    if (!isDragging || dragStartX === null) return;
    const diff = dragStartX - e.clientX;
    if (diff > SWIPE_THRESHOLD) {
      handleNext();
    } else if (diff < -SWIPE_THRESHOLD) {
      handlePrevious();
    }
    dragStartX = null;
    isDragging = false;
  }

  /**
   * Handle keyboard navigation in carousel mode
   */
  function handleKeyDown(e: KeyboardEvent): void {
    if (viewMode === "carousel") {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "Home") {
        e.preventDefault();
        handleGoToFirst();
      } else if (e.key === "End") {
        e.preventDefault();
        handleGoToLast();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
  class="session-transcript-inline {isCompact ? 'px-4 py-1.5' : 'px-4 py-3'}"
>
  <!-- View mode toggle with navigation (hidden in compact mode) -->
  {#if !isCompact}
    <div class="flex items-center justify-center gap-2 mb-3">
      <div class="flex bg-bg-tertiary rounded-md p-0.5">
        <button
          type="button"
          class="px-3 py-1 text-xs font-medium rounded transition-all {viewMode ===
          'chat'
            ? 'bg-bg-primary text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => (viewMode = "chat")}
          aria-pressed={viewMode === "chat"}
        >
          Chat
        </button>
        <button
          type="button"
          class="px-3 py-1 text-xs font-medium rounded transition-all {viewMode ===
          'carousel'
            ? 'bg-bg-primary text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => (viewMode = "carousel")}
          aria-pressed={viewMode === "carousel"}
        >
          Carousel
        </button>
      </div>

      <button
        type="button"
        class="px-2 py-1 text-xs font-medium rounded border transition-colors
               {showSystemPrompts
          ? 'border-accent-emphasis/50 bg-accent-muted text-accent-fg'
          : 'border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-hover'}"
        onclick={() => {
          showSystemPrompts = !showSystemPrompts;
        }}
        aria-pressed={showSystemPrompts}
        title={showSystemPrompts
          ? "Hide injected system prompts"
          : "Show injected system prompts"}
      >
        {showSystemPrompts
          ? "System Prompts: Shown"
          : `System Prompts: Hidden${
              hiddenSystemPromptCount > 0 ? ` (${hiddenSystemPromptCount})` : ""
            }`}
      </button>

      <!-- Navigation buttons: previous/next + jump to first/last -->
      {#if chatEvents.length > 0}
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            onclick={handlePrevious}
            disabled={currentIndex === 0}
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous message"
            title="Previous message"
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
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onclick={handleNext}
            disabled={currentIndex >= chatEvents.length - 1}
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next message"
            title="Next message"
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
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            type="button"
            onclick={handleGoToFirst}
            disabled={currentIndex === 0}
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Jump to first message"
            title="Jump to first message"
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
            >
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </button>
          <button
            type="button"
            onclick={handleGoToLast}
            disabled={currentIndex >= chatEvents.length - 1}
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Jump to last message"
            title="Jump to last message"
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
            >
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Content area -->
  {#if loadingState.status === "loading" && !hasOptimisticContent}
    <div class="flex items-center justify-center py-12">
      <div class="flex items-center gap-2 text-text-tertiary">
        <svg
          class="animate-spin h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span class="text-sm">Loading transcript...</span>
      </div>
    </div>
  {:else if loadingState.status === "error" && !hasOptimisticContent}
    <div class="flex items-center justify-center py-12">
      <div
        class="max-w-md p-4 bg-danger-muted border border-danger-emphasis rounded-lg"
      >
        <h3 class="text-sm font-semibold text-danger-fg mb-2">
          Error loading transcript
        </h3>
        <p class="text-sm text-text-secondary">
          {loadingState.error}
        </p>
      </div>
    </div>
  {:else if loadingState.status === "success" || hasOptimisticContent}
    {#if chatEvents.length === 0 && !hasOptimisticContent}
      <div class="flex items-center justify-center py-12">
        <p class="text-sm text-text-tertiary">
          No user or assistant messages found
        </p>
      </div>
    {:else if viewMode === "chat" || (chatEvents.length === 0 && hasOptimisticContent)}
      <!-- Chat mode: vertical scrollable list, scrolled to bottom by default -->
      <div
        bind:this={chatScrollContainer}
        class="{isCompact
          ? 'max-h-[120px]'
          : 'max-h-[600px]'} chat-scroll overflow-y-auto space-y-2"
      >
        {#each chatEvents as event, index (getEventId(event, index))}
          {@const eventId = getEventId(event, index)}
          {@const textContent = extractTextContent(event)}
          {@const isLong = isLongContent(textContent)}
          {@const isExpanded = expandedMessages.has(eventId)}

          <div
            class="flex w-full {getMessageRowAlignment(event.type)}"
            data-chat-index={index}
            data-chat-tail-anchor="true"
            tabindex={currentIndex === index ? 0 : -1}
          >
            <div
              class="w-fit max-w-[92%] md:max-w-[85%] {getMessageBubbleShape(
                event.type,
              )} {getBorderColor(event.type)} bg-bg-secondary
                     {currentIndex === index
                ? 'ring-1 ring-accent-emphasis/55'
                : ''}"
            >
              <!-- Message header -->
              <div class="px-3 py-1.5 flex items-center justify-between">
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded {getBadgeColor(
                    event.type,
                  )}"
                >
                  {event.type}
                </span>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-text-tertiary">
                    {formatTimestamp(event.timestamp)}
                  </span>
                  <!-- Copy to clipboard button -->
                  <button
                    type="button"
                    onclick={(e: MouseEvent) => {
                      e.stopPropagation();
                      copyToClipboard(textContent, eventId);
                    }}
                    class="p-0.5 hover:bg-bg-hover rounded transition-colors
                           focus:outline-none focus:ring-1 focus:ring-accent-emphasis"
                    aria-label="Copy message to clipboard"
                    title="Copy to clipboard"
                  >
                    {#if copiedEventId === eventId}
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
                        class="text-success-fg"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    {:else}
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
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        />
                        <path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        />
                      </svg>
                    {/if}
                  </button>
                </div>
              </div>

              <!-- Message content -->
              <div class="px-3 py-2">
                <div
                  class="transcript-markdown text-sm leading-6 break-words text-text-primary {isLong &&
                  !isExpanded
                    ? 'transcript-markdown-collapsed'
                    : ''}"
                >
                  {@html renderMarkdown(textContent)}
                </div>

                {#if isLong}
                  <button
                    type="button"
                    onclick={() => toggleExpanded(eventId)}
                    class="mt-2 text-xs text-accent-fg hover:underline"
                  >
                    {isExpanded ? "Show less" : "Show more"}
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}

        {#each pendingQueuedUserMessages as pendingMessage}
          <div
            class="flex w-full justify-end"
            data-chat-tail-anchor="true"
            tabindex="-1"
          >
            <div
              class="w-fit max-w-[92%] md:max-w-[85%] border-r-4 border-l-0 rounded-l
                     {pendingMessage.status === 'running'
                ? 'border-accent-emphasis'
                : 'border-attention-emphasis'} bg-bg-secondary"
            >
              <div class="px-3 py-1.5 flex items-center justify-between">
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded {pendingMessage.status ===
                  'running'
                    ? 'bg-accent-muted text-accent-fg'
                    : 'bg-attention-muted text-attention-fg'}"
                >
                  user ({pendingMessage.status})
                </span>
              </div>
              <div class="px-3 py-2">
                <div
                  class="transcript-markdown text-sm leading-6 break-words text-text-primary"
                >
                  {@html renderMarkdown(pendingMessage.raw)}
                </div>
              </div>
            </div>
          </div>
        {/each}

        {#if showOptimisticUser}
          <div
            class="flex w-full justify-end"
            data-chat-tail-anchor="true"
            tabindex="-1"
          >
            <div
              class="w-fit max-w-[92%] md:max-w-[85%] border-r-4 border-l-0 rounded-l
                     {optimisticUserStatus === 'running'
                ? 'border-accent-emphasis'
                : 'border-attention-emphasis'} bg-bg-secondary"
            >
              <div class="px-3 py-1.5 flex items-center justify-between">
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded {optimisticUserStatus ===
                  'running'
                    ? 'bg-accent-muted text-accent-fg'
                    : 'bg-attention-muted text-attention-fg'}"
                >
                  user ({optimisticUserStatus})
                </span>
              </div>
              <div class="px-3 py-2">
                <div
                  class="transcript-markdown text-sm leading-6 break-words text-text-primary"
                >
                  {@html renderMarkdown(
                    stripSystemTags(optimisticUserMessage ?? ""),
                  )}
                </div>
              </div>
            </div>
          </div>
        {/if}

        {#if showOptimisticAssistant}
          <div
            class="flex w-full justify-start"
            data-chat-tail-anchor="true"
            tabindex="-1"
          >
            <div
              class="w-fit max-w-[92%] md:max-w-[85%] border-l-4 border-r-0 rounded-r border-success-emphasis bg-bg-secondary"
            >
              <div class="px-3 py-1.5 flex items-center justify-between">
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded bg-success-muted text-success-fg"
                >
                  assistant (live)
                </span>
              </div>
              <div class="px-3 py-2">
                <div
                  class="transcript-markdown text-sm leading-6 break-words text-text-primary"
                >
                  {@html renderMarkdown(
                    stripSystemTags(optimisticAssistantMessage ?? ""),
                  )}
                </div>
              </div>
            </div>
          </div>
        {/if}

        {#if showAssistantThinkingPlaceholder}
          <div
            class="flex w-full justify-start"
            data-chat-tail-anchor="true"
            tabindex="-1"
          >
            <div
              class="w-fit max-w-[92%] md:max-w-[85%] border-l-4 border-r-0 rounded-r border-success-emphasis bg-bg-secondary"
            >
              <div class="px-3 py-1.5 flex items-center justify-between">
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded bg-success-muted text-success-fg"
                >
                  assistant (thinking)
                </span>
              </div>
              <div class="px-3 py-2">
                <div class="text-sm leading-6 font-mono text-text-secondary">
                  Thinking...
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {:else if viewMode === "carousel"}
      <!-- Carousel mode: narrower cards with neighbors visible on sides -->
      <div class="relative min-h-[200px]">
        <!-- Navigation arrows (overlaid on top of cards) -->
        <button
          type="button"
          onclick={handlePrevious}
          disabled={currentIndex === 0}
          class="absolute left-1 top-1/2 -translate-y-1/2 z-10
                 w-8 h-8 flex items-center justify-center rounded-full
                 bg-bg-tertiary/80 hover:bg-bg-hover text-text-secondary hover:text-text-primary
                 disabled:opacity-30 disabled:cursor-not-allowed
                 transition-all shadow-sm"
          aria-label="Previous message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          type="button"
          onclick={handleNext}
          disabled={currentIndex === chatEvents.length - 1}
          class="absolute right-1 top-1/2 -translate-y-1/2 z-10
                 w-8 h-8 flex items-center justify-center rounded-full
                 bg-bg-tertiary/80 hover:bg-bg-hover text-text-secondary hover:text-text-primary
                 disabled:opacity-30 disabled:cursor-not-allowed
                 transition-all shadow-sm"
          aria-label="Next message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <!-- Horizontal card track (swipe + drag enabled) -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="overflow-hidden select-none"
          ontouchstart={handleTouchStart}
          ontouchend={handleTouchEnd}
          onpointerdown={handlePointerDown}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
          onpointerleave={handlePointerUp}
        >
          <div
            class="flex gap-3 transition-transform duration-150 ease-in-out"
            style="transform: translateX(calc(27.5% - {currentIndex *
              45}% - {currentIndex * 12}px))"
          >
            {#each chatEvents as event, index (getEventId(event, index))}
              {@const textContent = extractTextContent(event)}
              {@const isCurrent = index === currentIndex}

              <!-- Each card: 45% width, neighbors peek from sides -->
              <button
                type="button"
                onclick={() => handleGoToIndex(index)}
                class="w-[45%] shrink-0 text-left transition-all duration-150
                       {isCurrent
                  ? 'opacity-100 scale-100'
                  : 'opacity-40 scale-95'}"
                aria-label="Message {index + 1}: {event.type}"
              >
                <div
                  class="rounded-lg border bg-bg-secondary p-4 shadow-sm h-full
                         {isCurrent
                    ? 'border-accent-emphasis/40'
                    : 'border-border-default'}"
                >
                  <!-- Card header -->
                  <div class="flex items-center justify-between mb-3">
                    <span
                      class="text-xs font-semibold px-2 py-0.5 rounded {getBadgeColor(
                        event.type,
                      )}"
                    >
                      {event.type}
                    </span>
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-text-tertiary">
                        {formatTimestamp(event.timestamp)}
                      </span>
                      <!-- Copy to clipboard (div+role to avoid nested button) -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        role="button"
                        tabindex="0"
                        onclick={(e: MouseEvent) => {
                          e.stopPropagation();
                          copyToClipboard(
                            textContent,
                            getEventId(event, index),
                          );
                        }}
                        onkeydown={(e: KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            copyToClipboard(
                              textContent,
                              getEventId(event, index),
                            );
                          }
                        }}
                        class="p-0.5 hover:bg-bg-hover rounded transition-colors cursor-pointer
                               focus:outline-none focus:ring-1 focus:ring-accent-emphasis"
                        aria-label="Copy message to clipboard"
                        title="Copy to clipboard"
                      >
                        {#if copiedEventId === getEventId(event, index)}
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
                            class="text-success-fg"
                            aria-hidden="true"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        {:else}
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
                            <rect
                              x="9"
                              y="9"
                              width="13"
                              height="13"
                              rx="2"
                              ry="2"
                            />
                            <path
                              d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                            />
                          </svg>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <!-- Card content -->
                  <div
                    class="transcript-markdown max-h-[300px] overflow-y-auto text-xs leading-5 break-words text-text-primary"
                  >
                    {@html renderMarkdown(textContent)}
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Counter -->
        <div class="text-xs text-text-tertiary text-center mt-2">
          {currentIndex + 1} / {chatEvents.length}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .chat-scroll {
    scrollbar-width: auto;
    scrollbar-color: var(--color-border-emphasis) transparent;
  }

  .chat-scroll::-webkit-scrollbar {
    width: 12px;
  }

  .chat-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .chat-scroll::-webkit-scrollbar-thumb {
    background-color: var(--color-border-default);
    border-radius: 9999px;
    border: 2px solid transparent;
    background-clip: content-box;
  }

  .chat-scroll::-webkit-scrollbar-thumb:hover {
    background-color: var(--color-border-emphasis);
  }

  .transcript-markdown :global(p) {
    margin: 0.4rem 0;
  }

  .transcript-markdown :global(ul),
  .transcript-markdown :global(ol) {
    margin: 0.4rem 0;
    padding-left: 1.25rem;
  }

  .transcript-markdown :global(li + li) {
    margin-top: 0.15rem;
  }

  .transcript-markdown :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
    font-size: 0.9em;
    background: var(--color-bg-tertiary);
    padding: 0.12rem 0.35rem;
    border-radius: 0.25rem;
  }

  .transcript-markdown :global(pre) {
    margin: 0.5rem 0;
    padding: 0.55rem 0.65rem;
    overflow-x: auto;
    border-radius: 0.35rem;
    background: var(--color-bg-tertiary);
  }

  .transcript-markdown :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .transcript-markdown :global(blockquote) {
    margin: 0.45rem 0;
    padding-left: 0.7rem;
    border-left: 3px solid var(--color-border-emphasis);
    color: var(--color-text-secondary);
  }

  .transcript-markdown :global(a) {
    color: var(--color-accent-fg);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .transcript-markdown-collapsed {
    max-height: 12rem;
    overflow: hidden;
    position: relative;
  }

  .transcript-markdown-collapsed::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2.5rem;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0%,
      var(--color-bg-secondary) 100%
    );
    pointer-events: none;
  }
</style>
