<script lang="ts">
/**
 * MessageCard Component
 *
 * Displays a single conversation turn (user or assistant message).
 *
 * Props:
 * - turn: The conversation turn to display
 *
 * Design:
 * - Role header (USER/ASSISTANT)
 * - Content display (plain text, markdown supported in future)
 * - Tool calls section (collapsed by default)
 */

import type { ConversationTurn } from "../../../src/types/ai";
import ToolCallDisplay from "./ToolCallDisplay.svelte";

interface Props {
  turn: ConversationTurn;
}

// Svelte 5 props syntax
const { turn }: Props = $props();

/**
 * Whether tool calls are expanded
 */
let toolsExpanded = $state(false);

/**
 * Get border color based on role
 */
const borderColor = $derived(
  turn.role === "user" ? "border-accent-emphasis" : "border-success-emphasis"
);

/**
 * Get role display text
 */
const roleText = $derived(turn.role === "user" ? "USER" : "ASSISTANT");

/**
 * Get role text color
 */
const roleTextColor = $derived(
  turn.role === "user" ? "text-accent-fg" : "text-success-fg"
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
</script>

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
    <span class="text-xs text-text-tertiary">
      {formatTime(turn.timestamp)}
    </span>
  </div>

  <!-- Content -->
  <div class="px-3 py-1.5">
    <div class="text-xs text-text-primary whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
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
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
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
          class="text-text-tertiary transition-transform {toolsExpanded ? 'rotate-180' : ''}"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <!-- Tool calls list -->
      {#if toolsExpanded && turn.toolCalls !== undefined}
        <div
          id="tool-calls-{turn.id}"
          class="px-3 py-1.5 space-y-1.5"
        >
          {#each turn.toolCalls as toolCall (toolCall.id)}
            <ToolCallDisplay {toolCall} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
