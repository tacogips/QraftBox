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
  import { tick } from "svelte";
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
  let lastFocusedTurnId: string | null = $state(null);

  /**
   * Auto-scroll to bottom when turns change
   */
  $effect(() => {
    const turnCount = turns.length;
    const lastTurnId = turns[turnCount - 1]?.id;
    if (
      scrollContainer === null ||
      lastTurnId === undefined ||
      lastTurnId === lastFocusedTurnId
    ) {
      return;
    }

    const container = scrollContainer;
    lastFocusedTurnId = lastTurnId;

    void tick().then(() => {
      requestAnimationFrame(() => {
        const target = container.querySelector<HTMLElement>(
          "[data-last-turn='true']",
        );
        if (target === null) {
          return;
        }
        container.scrollTop = container.scrollHeight;
        target.scrollIntoView({ block: "end", inline: "nearest" });
        target.focus({ preventScroll: true });
      });
    });
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
         px-4 py-3 space-y-3"
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
      <div
        class="flex w-full {turn.role === 'user'
          ? 'justify-end'
          : 'justify-start'}"
        data-last-turn={index === turns.length - 1 ? "true" : undefined}
        tabindex={index === turns.length - 1 ? -1 : undefined}
      >
        <div class="w-fit max-w-[85%] lg:max-w-3xl">
          <MessageCard {turn} isToolResponse={isToolResponse(index)} />
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .conversation-chat-view {
    scrollbar-width: auto;
    scrollbar-color: var(--color-border-emphasis) transparent;
  }

  .conversation-chat-view::-webkit-scrollbar {
    width: 12px;
  }

  .conversation-chat-view::-webkit-scrollbar-track {
    background: transparent;
  }

  .conversation-chat-view::-webkit-scrollbar-thumb {
    background-color: var(--color-border-default);
    border-radius: 9999px;
    border: 2px solid transparent;
    background-clip: content-box;
  }

  .conversation-chat-view::-webkit-scrollbar-thumb:hover {
    background-color: var(--color-border-emphasis);
  }
</style>
