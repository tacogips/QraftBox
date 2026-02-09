<script lang="ts">
  /**
   * ConversationChatView Component
   *
   * Displays conversation turns in a vertical scrolling chat layout.
   *
   * Props:
   * - turns: Array of conversation turns
   *
   * Design:
   * - Vertical scrolling layout
   * - User messages with blue border
   * - Assistant messages with green border
   * - Tool calls displayed inline
   * - Auto-scroll to bottom on new messages
   */

  import type { ConversationTurn } from "../../../src/types/ai";
  import MessageCard from "./MessageCard.svelte";

  interface Props {
    turns: readonly ConversationTurn[];
  }

  // Svelte 5 props syntax
  const { turns }: Props = $props();

  /**
   * Reference to scroll container
   */
  let scrollContainer: HTMLDivElement | null = $state(null);

  /**
   * Auto-scroll to bottom when turns change
   */
  $effect(() => {
    // Access turns.length to create dependency
    const _count = turns.length;
    if (scrollContainer !== null) {
      // Scroll to bottom smoothly
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  });

  /**
   * Check if a turn is a tool response
   * A turn is a tool response if:
   * - The turn is a user message AND
   * - The previous turn exists AND
   * - The previous turn is an assistant message AND
   * - The previous turn has tool calls
   */
  function isToolResponse(index: number): boolean {
    if (index <= 0) return false;

    const currentTurn = turns[index];
    const previousTurn = turns[index - 1];

    if (currentTurn === undefined || previousTurn === undefined) {
      return false;
    }

    return (
      currentTurn.role === "user" &&
      previousTurn.role === "assistant" &&
      previousTurn.toolCalls !== undefined &&
      previousTurn.toolCalls.length > 0
    );
  }
</script>

<div
  bind:this={scrollContainer}
  class="conversation-chat-view flex-1 overflow-y-auto
         px-3 py-2 space-y-2"
  role="log"
  aria-label="Conversation history"
  aria-live="polite"
>
  {#if turns.length === 0}
    <div class="flex items-center justify-center h-full">
      <p class="text-sm text-text-tertiary">No messages yet</p>
    </div>
  {:else}
    {#each turns as turn, index (turn.id)}
      <MessageCard {turn} isToolResponse={isToolResponse(index)} />
    {/each}
  {/if}
</div>
