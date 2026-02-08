<script lang="ts">
  /**
   * SessionTranscriptViewer Component
   *
   * Displays Claude session transcript events from a transcript.jsonl file.
   *
   * Props:
   * - sessionId: string - the session ID to display
   * - sessionTitle: string - title for the header
   * - contextId: string - context ID for API calls
   * - onBack: () => void - callback to navigate back
   *
   * Design:
   * - Vertical scrolling layout with event cards
   * - Color-coded left borders for event types
   * - Collapsible tool_result content
   * - Auto-scroll to bottom option
   * - Loading and error states
   */

  interface Props {
    sessionId: string;
    sessionTitle: string;
    contextId: string;
    onBack: () => void;
  }

  const { sessionId, sessionTitle, contextId, onBack }: Props = $props();

  /**
   * Transcript event structure
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
   * Loading state
   */
  type LoadingState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: TranscriptEvent[]; total: number }
    | { status: "error"; error: string };

  let loadingState: LoadingState = $state({ status: "idle" });
  let scrollContainer: HTMLDivElement | null = $state(null);
  let autoScroll = $state(true);
  let expandedEvents = $state<Set<string>>(new Set());

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
   * Auto-scroll to bottom when new events arrive
   */
  $effect(() => {
    if (
      loadingState.status === "success" &&
      autoScroll &&
      scrollContainer !== null
    ) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  });

  /**
   * Initial fetch
   */
  $effect(() => {
    fetchTranscript();
  });

  /**
   * Toggle event expansion (for collapsible content)
   */
  function toggleExpanded(eventId: string): void {
    const newSet = new Set(expandedEvents);
    if (newSet.has(eventId)) {
      newSet.delete(eventId);
    } else {
      newSet.add(eventId);
    }
    expandedEvents = newSet;
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
      case "tool_use":
      case "tool_result":
        return "border-border-default";
      default:
        return "border-border-muted";
    }
  }

  /**
   * Get badge background color based on event type
   */
  function getBadgeColor(eventType: string): string {
    switch (eventType) {
      case "user":
        return "bg-accent-muted text-accent-fg";
      case "assistant":
        return "bg-success-muted text-success-fg";
      case "tool_use":
      case "tool_result":
        return "bg-bg-tertiary text-text-secondary";
      default:
        return "bg-bg-tertiary text-text-tertiary";
    }
  }

  /**
   * Format timestamp for display
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
   * Extract text content from event.
   *
   * Claude Code transcript JSONL events store content at raw.message.content
   * for user/assistant types. The top-level `content` field from TranscriptEvent
   * is typically undefined. This function looks into `raw` for the actual data.
   */
  function extractTextContent(event: TranscriptEvent): string {
    const raw = event.raw as Record<string, unknown>;

    // User/assistant: content is at raw.message.content
    if (event.type === "user" || event.type === "assistant") {
      const message = raw["message"] as
        | Record<string, unknown>
        | undefined;
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
   * Check if event content is long (for collapsible display)
   */
  function isLongContent(text: string): boolean {
    return text.length > 500 || text.split("\n").length > 15;
  }

  /**
   * Get event ID for expansion tracking
   */
  function getEventId(event: TranscriptEvent, index: number): string {
    return event.uuid ?? `${event.type}-${index}`;
  }
</script>

<div class="session-transcript-viewer flex flex-col h-full">
  <!-- Header -->
  <div
    class="px-4 py-3 bg-bg-secondary border-b border-border-default flex items-center justify-between"
  >
    <div class="flex items-center gap-3">
      <button
        type="button"
        onclick={onBack}
        class="text-text-secondary hover:text-text-primary transition-colors"
        aria-label="Go back"
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
      <h2 class="text-lg font-semibold text-text-primary">
        {sessionTitle}
      </h2>
    </div>

    <!-- Auto-scroll toggle -->
    <label class="flex items-center gap-2 text-sm text-text-secondary">
      <input
        type="checkbox"
        bind:checked={autoScroll}
        class="rounded border-border-default"
      />
      <span>Auto-scroll</span>
    </label>
  </div>

  <!-- Content area -->
  <div
    bind:this={scrollContainer}
    class="flex-1 overflow-y-auto px-4 py-4"
    role="log"
    aria-label="Session transcript"
    aria-live="polite"
  >
    {#if loadingState.status === "loading"}
      <div class="flex items-center justify-center h-full">
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
      <div class="flex items-center justify-center h-full">
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
      {#if loadingState.data.length === 0}
        <div class="flex items-center justify-center h-full">
          <p class="text-sm text-text-tertiary">No transcript events found</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each loadingState.data as event, index (getEventId(event, index))}
            {@const eventId = getEventId(event, index)}
            {@const textContent = extractTextContent(event)}
            {@const isLong = isLongContent(textContent)}
            {@const isExpanded = expandedEvents.has(eventId)}

            <div
              class="border-l-4 {getBorderColor(
                event.type,
              )} bg-bg-secondary rounded-r-lg overflow-hidden"
            >
              <!-- Event header -->
              <div
                class="px-4 py-2 bg-bg-tertiary/50 flex items-center justify-between"
              >
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

              <!-- Event content -->
              <div class="p-4">
                <div
                  class="text-sm text-text-primary whitespace-pre-wrap break-words font-mono"
                >
                  {#if isLong && !isExpanded}
                    {textContent.slice(0, 500)}...
                  {:else}
                    {textContent}
                  {/if}
                </div>

                <!-- Expand/collapse button for long content -->
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

        <!-- Event count footer -->
        <div class="mt-4 text-center text-xs text-text-tertiary">
          Showing {loadingState.data.length} of {loadingState.total} events
        </div>
      {/if}
    {/if}
  </div>
</div>
