<script lang="ts">
  /**
   * MessageCard Component
   *
   * Displays a single conversation turn (user or assistant message).
   *
   * Props:
   * - turn: The conversation turn to display
   * - isToolResponse: Whether this user message is a tool response (defaults to false)
   *
   * Design:
   * - Role header (USER/ASSISTANT)
   * - Content display (plain text, markdown supported in future)
   * - Tool calls section (collapsed by default)
   * - Tool response messages can be collapsed to a single line
   */

  import type { ConversationTurn } from "../../../src/types/ai";
  import ToolCallDisplay from "./ToolCallDisplay.svelte";

  interface Props {
    turn: ConversationTurn;
    isToolResponse?: boolean | undefined;
  }

  // Svelte 5 props syntax
  const { turn, isToolResponse = false }: Props = $props();

  /**
   * Whether tool calls are expanded
   */
  let toolsExpanded = $state(false);

  /**
   * Whether the tool response message is expanded
   */
  let toolResponseExpanded = $state(false);

  /**
   * Whether the copy feedback is shown
   */
  let copied = $state(false);

  /**
   * Copy message content to clipboard
   */
  async function copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(turn.content);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1500);
    } catch {
      // Silently fail if clipboard API is unavailable
    }
  }

  /**
   * Get border color based on role
   */
  const borderColor = $derived(
    turn.role === "user" ? "border-accent-emphasis" : "border-success-emphasis",
  );

  /**
   * Get role display text
   */
  const roleText = $derived(turn.role === "user" ? "USER" : "ASSISTANT");

  /**
   * Get role text color
   */
  const roleTextColor = $derived(
    turn.role === "user" ? "text-accent-fg" : "text-success-fg",
  );

  /**
   * Format timestamp for display
   */
  function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  /**
   * Count of tool calls
   */
  const toolCallCount = $derived(turn.toolCalls?.length ?? 0);

  /**
   * Toggle tool calls section
   */
  function toggleTools(): void {
    toolsExpanded = !toolsExpanded;
  }

  /**
   * Toggle tool response expansion
   */
  function toggleToolResponse(): void {
    toolResponseExpanded = !toolResponseExpanded;
  }

  /**
   * Whether to show the collapsed tool response view
   */
  const showCollapsedToolResponse = $derived(
    isToolResponse && turn.role === "user" && !toolResponseExpanded,
  );
</script>

{#if showCollapsedToolResponse}
  <!-- Collapsed tool response view -->
  <button
    type="button"
    onclick={toggleToolResponse}
    class="message-card border-l-2 {borderColor} bg-bg-secondary/50 rounded-r-lg
           py-1 px-3 flex items-center justify-between gap-2
           hover:bg-bg-hover transition-colors
           focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
    role="article"
    aria-label="Tool response message (collapsed)"
    aria-expanded={false}
  >
    <span class="text-xs text-text-tertiary"> user: tool response </span>
    <div class="flex items-center gap-2">
      <span class="text-xs text-text-quaternary">
        {formatTime(turn.timestamp)}
      </span>
      <!-- Chevron down indicator -->
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
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  </button>
{:else}
  <!-- Full message card view (normal or expanded tool response) -->
  <div
    class="message-card border-l-4 {borderColor} bg-bg-secondary rounded-r-lg
           overflow-hidden"
    role="article"
    aria-label="{roleText} message"
  >
    <!-- Header -->
    <div class="px-3 py-1 bg-bg-tertiary/50 flex items-center justify-between">
      <span class="text-xs font-semibold tracking-wide {roleTextColor}">
        {roleText}
      </span>
      <div class="flex items-center gap-2">
        <span class="text-xs text-text-tertiary">
          {formatTime(turn.timestamp)}
        </span>
        <!-- Copy to clipboard button -->
        <button
          type="button"
          onclick={copyToClipboard}
          class="p-0.5 hover:bg-bg-hover rounded transition-colors
                 focus:outline-none focus:ring-1 focus:ring-accent-emphasis"
          aria-label="Copy message to clipboard"
          title="Copy to clipboard"
        >
          {#if copied}
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
        {#if isToolResponse && turn.role === "user"}
          <!-- Collapse button for tool responses -->
          <button
            type="button"
            onclick={toggleToolResponse}
            class="p-0.5 hover:bg-bg-hover rounded transition-colors
                   focus:outline-none focus:ring-1 focus:ring-accent-emphasis"
            aria-label="Collapse tool response"
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
        {/if}
      </div>
    </div>

    <!-- Content -->
    <div class="px-3 py-2">
      <div
        class="text-sm leading-6 text-text-primary whitespace-pre-wrap break-words"
      >
        {turn.content}
      </div>
    </div>

    <!-- Tool Calls Section -->
    {#if toolCallCount > 0}
      <div class="border-t border-border-default">
        <!-- Toggle header -->
        <button
          type="button"
          onclick={toggleTools}
          class="w-full px-3 py-1 flex items-center justify-between
                 bg-bg-tertiary/30 hover:bg-bg-tertiary/50
                 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
          aria-expanded={toolsExpanded}
          aria-controls="tool-calls-{turn.id}"
        >
          <div class="flex items-center gap-2">
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
              class="text-text-tertiary"
              aria-hidden="true"
            >
              <path
                d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
              />
            </svg>
            <span class="text-xs text-text-secondary">
              {toolCallCount} tool call{toolCallCount !== 1 ? "s" : ""}
            </span>
          </div>

          <!-- Chevron indicator -->
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
            class="text-text-tertiary transition-transform {toolsExpanded
              ? 'rotate-180'
              : ''}"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <!-- Tool calls list -->
        {#if toolsExpanded && turn.toolCalls !== undefined}
          <div id="tool-calls-{turn.id}" class="px-3 py-1.5 space-y-1.5">
            {#each turn.toolCalls as toolCall (toolCall.id)}
              <ToolCallDisplay {toolCall} />
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
