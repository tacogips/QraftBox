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
  }

  const { sessionId, contextId }: Props = $props();

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

  let loadingState: LoadingState = $state({ status: "idle" });
  let viewMode: ViewMode = $state("chat");
  let currentIndex = $state(0);
  let expandedMessages = $state<Set<string>>(new Set());

  /**
   * Filter events to only show user and assistant messages
   */
  const chatEvents = $derived(
    loadingState.status === "success"
      ? loadingState.data.filter(
          (event) => event.type === "user" || event.type === "assistant",
        )
      : [],
  );

  /**
   * Fetch transcript events from API
   */
  async function fetchTranscript(): Promise<void> {
    loadingState = { status: "loading" };

    try {
      const response = await fetch(
        `/api/ctx/${contextId}/claude-sessions/sessions/${sessionId}/transcript?limit=1000`,
      );

      if (!response.ok) {
        const errorData = (await response.json()) as { error: string };
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
      loadingState = {
        status: "error",
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Initial fetch on mount
   */
  $effect(() => {
    fetchTranscript();
  });

  /**
   * Reset carousel index when switching modes
   */
  $effect(() => {
    if (viewMode === "carousel") {
      currentIndex = 0;
    }
  });

  /**
   * Extract text content from event
   * Handles user/assistant messages, tool_use, tool_result, and summary events
   */
  function extractTextContent(event: TranscriptEvent): string {
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
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="session-transcript-inline px-4 py-3">
  <!-- View mode toggle -->
  <div class="flex justify-center mb-3">
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
  </div>

  <!-- Content area -->
  {#if loadingState.status === "loading"}
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
  {:else if loadingState.status === "error"}
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
  {:else if loadingState.status === "success"}
    {#if chatEvents.length === 0}
      <div class="flex items-center justify-center py-12">
        <p class="text-sm text-text-tertiary">
          No user or assistant messages found
        </p>
      </div>
    {:else if viewMode === "chat"}
      <!-- Chat mode: vertical scrollable list -->
      <div class="max-h-[600px] overflow-y-auto space-y-2">
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
              <span class="text-xs text-text-tertiary">
                {formatTimestamp(event.timestamp)}
              </span>
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
      </div>
    {:else if viewMode === "carousel"}
      <!-- Carousel mode: one card at a time with navigation -->
      {@const currentEvent = chatEvents[currentIndex]}
      {@const textContent =
        currentEvent !== undefined ? extractTextContent(currentEvent) : ""}

      <div class="relative flex items-center min-h-[200px]">
        <!-- Left arrow -->
        <button
          type="button"
          onclick={handlePrevious}
          disabled={currentIndex === 0}
          class="absolute left-0 w-8 h-8 flex items-center justify-center rounded-full bg-bg-tertiary hover:bg-bg-hover text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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

        <!-- Right arrow -->
        <button
          type="button"
          onclick={handleNext}
          disabled={currentIndex === chatEvents.length - 1}
          class="absolute right-0 w-8 h-8 flex items-center justify-center rounded-full bg-bg-tertiary hover:bg-bg-hover text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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

        <!-- Center card -->
        {#if currentEvent !== undefined}
          <div class="flex-1 mx-10">
            <div
              class="rounded-lg border border-border-default bg-bg-secondary p-4 shadow-sm"
            >
              <!-- Card header -->
              <div class="flex items-center justify-between mb-3">
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded {getBadgeColor(
                    currentEvent.type,
                  )}"
                >
                  {currentEvent.type}
                </span>
                <span class="text-xs text-text-tertiary">
                  {formatTimestamp(currentEvent.timestamp)}
                </span>
              </div>

              <!-- Card content -->
              <div
                class="max-h-[400px] overflow-y-auto text-xs font-mono whitespace-pre-wrap break-words text-text-primary"
              >
                {textContent}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Counter -->
      <div class="text-xs text-text-tertiary text-center mt-2">
        {currentIndex + 1} / {chatEvents.length}
      </div>
    {/if}
  {/if}
</div>
