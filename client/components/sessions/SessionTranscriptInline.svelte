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
    /** Optimistic user message shown before transcript persistence */
    optimisticUserMessage?: string | undefined;
    /** Optimistic assistant message shown before transcript persistence */
    optimisticAssistantMessage?: string | undefined;
  }

  import { stripSystemTags } from "../../../src/utils/strip-system-tags";

  const {
    sessionId,
    contextId,
    maxMessages = undefined,
    autoRefreshMs = 0,
    followLatest = false,
    optimisticUserMessage = undefined,
    optimisticAssistantMessage = undefined,
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

  function loadViewMode(): ViewMode {
    try {
      const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === "chat" || stored === "carousel") return stored;
    } catch {
      // localStorage unavailable
    }
    return "chat";
  }

  let loadingState: LoadingState = $state({ status: "idle" });
  let viewMode: ViewMode = $state(loadViewMode());
  let currentIndex = $state(0);
  let expandedMessages = $state<Set<string>>(new Set());
  let chatScrollContainer: HTMLDivElement | null = $state(null);
  let copiedEventId: string | null = $state(null);

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
          return true;
        })
      : [],
  );

  /** When maxMessages is set, only show the last N messages */
  const chatEvents = $derived(
    maxMessages !== undefined && allChatEvents.length > maxMessages
      ? allChatEvents.slice(-maxMessages)
      : allChatEvents,
  );

  const isCompact = $derived(maxMessages !== undefined);

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

  const showOptimisticUser = $derived(
    normalizedOptimisticUser.length > 0 &&
      !normalizedChatTextSet.has(normalizedOptimisticUser),
  );

  const showOptimisticAssistant = $derived(
    normalizedOptimisticAssistant.length > 0 &&
      !normalizedChatTextSet.has(normalizedOptimisticAssistant),
  );

  const optimisticTailCount = $derived(
    (showOptimisticUser ? 1 : 0) + (showOptimisticAssistant ? 1 : 0),
  );

  /**
   * Whether we have optimistic messages to show as fallback when transcript
   * is not yet available (e.g. new session where CLI session file hasn't
   * been created yet).
   */
  const hasOptimisticContent = $derived(
    (optimisticUserMessage ?? "").length > 0 ||
      (optimisticAssistantMessage ?? "").length > 0,
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
          error: errorData.error ?? "Failed to fetch transcript",
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
   * Scroll chat view to bottom when data loads or when switching to chat mode
   */
  $effect(() => {
    if (
      viewMode === "chat" &&
      loadingState.status === "success" &&
      chatScrollContainer !== null
    ) {
      const _liveTail = optimisticTailCount;
      const container = chatScrollContainer;
      if (followLatest) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    }
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

  /**
   * Navigate to previous carousel item
   */
  function handlePrevious(): void {
    if (currentIndex > 0) {
      currentIndex = currentIndex - 1;
    }
  }

  /**
   * Navigate to next carousel item
   */
  function handleNext(): void {
    if (currentIndex < chatEvents.length - 1) {
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
      chatScrollContainer.scrollTop = 0;
    }
  }

  /**
   * Navigate to the last message
   */
  function handleGoToLast(): void {
    if (viewMode === "carousel") {
      currentIndex = chatEvents.length - 1;
    } else if (chatScrollContainer !== null) {
      chatScrollContainer.scrollTop = chatScrollContainer.scrollHeight;
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
          : 'max-h-[600px]'} overflow-y-auto space-y-1.5"
      >
        {#each chatEvents as event, index (getEventId(event, index))}
          {@const eventId = getEventId(event, index)}
          {@const textContent = extractTextContent(event)}
          {@const isLong = isLongContent(textContent)}
          {@const isExpanded = expandedMessages.has(eventId)}

          <div
            class="border-l-4 {getBorderColor(
              event.type,
            )} bg-bg-secondary rounded-r"
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
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
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
                class="text-xs font-mono whitespace-pre-wrap break-words text-text-primary"
              >
                {#if isLong && !isExpanded}
                  {textContent.slice(0, 500)}...
                {:else}
                  {textContent}
                {/if}
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
        {/each}

        {#if showOptimisticUser}
          <div
            class="border-l-4 border-accent-emphasis bg-bg-secondary rounded-r"
          >
            <div class="px-3 py-1.5 flex items-center justify-between">
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded bg-accent-muted text-accent-fg"
              >
                user (pending)
              </span>
            </div>
            <div class="px-3 py-2">
              <div
                class="text-xs font-mono whitespace-pre-wrap break-words text-text-primary"
              >
                {stripSystemTags(optimisticUserMessage ?? "")}
              </div>
            </div>
          </div>
        {/if}

        {#if showOptimisticAssistant}
          <div
            class="border-l-4 border-success-emphasis bg-bg-secondary rounded-r"
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
                class="text-xs font-mono whitespace-pre-wrap break-words text-text-primary"
              >
                {stripSystemTags(optimisticAssistantMessage ?? "")}
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
            class="flex gap-3 transition-transform duration-300 ease-in-out"
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
                class="w-[45%] shrink-0 text-left transition-all duration-300
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
                    class="max-h-[300px] overflow-y-auto text-xs font-mono whitespace-pre-wrap break-words text-text-primary"
                  >
                    {textContent}
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
