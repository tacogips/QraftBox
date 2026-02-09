<script lang="ts">
/**
 * ConversationCarousel Component
 *
 * Displays conversation turns in a horizontal card carousel.
 *
 * Props:
 * - turns: Array of conversation turns
 * - currentIndex: Current visible card index
 * - onIndexChange: Callback when index changes
 *
 * Design:
 * - Horizontal swipeable carousel
 * - Arrow navigation buttons
 * - Pagination dots
 * - Keyboard navigation (left/right)
 */

import type { ConversationTurn } from "../../../src/types/ai";
import MessageCard from "./MessageCard.svelte";

interface Props {
  turns: readonly ConversationTurn[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

// Svelte 5 props syntax
const { turns, currentIndex, onIndexChange }: Props = $props();

/**
 * Reference to carousel container
 */
let carouselContainer: HTMLDivElement | null = $state(null);

/**
 * Touch start X position
 */
let touchStartX: number | null = $state(null);

/**
 * Navigate to previous card
 */
function goToPrevious(): void {
  if (currentIndex > 0) {
    onIndexChange(currentIndex - 1);
  }
}

/**
 * Navigate to next card
 */
function goToNext(): void {
  if (currentIndex < turns.length - 1) {
    onIndexChange(currentIndex + 1);
  }
}

/**
 * Navigate to specific index
 */
function goToIndex(index: number): void {
  if (index >= 0 && index < turns.length) {
    onIndexChange(index);
  }
}

/**
 * Handle keyboard navigation
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    goToPrevious();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    goToNext();
  }
}

/**
 * Handle touch start
 */
function handleTouchStart(event: TouchEvent): void {
  const touch = event.touches[0];
  if (touch !== undefined) {
    touchStartX = touch.clientX;
  }
}

/**
 * Handle touch end (swipe detection)
 */
function handleTouchEnd(event: TouchEvent): void {
  if (touchStartX === null) return;

  const touch = event.changedTouches[0];
  if (touch === undefined) return;

  const touchEndX = touch.clientX;
  const diff = touchStartX - touchEndX;
  const threshold = 50; // Minimum swipe distance

  if (diff > threshold) {
    // Swiped left -> go to next
    goToNext();
  } else if (diff < -threshold) {
    // Swiped right -> go to previous
    goToPrevious();
  }

  touchStartX = null;
}

/**
 * Check if can navigate to previous
 */
const canGoPrevious = $derived(currentIndex > 0);

/**
 * Check if can navigate to next
 */
const canGoNext = $derived(currentIndex < turns.length - 1);

/**
 * Scroll to current card when index changes
 */
$effect(() => {
  if (carouselContainer === null) return;

  const cards = carouselContainer.querySelectorAll(".carousel-card");
  const currentCard = cards[currentIndex];
  if (currentCard !== undefined) {
    currentCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }
});
</script>

<div
  class="conversation-carousel flex flex-col h-full"
  role="region"
  aria-label="Conversation carousel"
  aria-roledescription="carousel"
  onkeydown={handleKeydown}
  tabindex="0"
>
  {#if turns.length === 0}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-sm text-text-tertiary">
        No messages yet
      </p>
    </div>
  {:else}
    <!-- Carousel container -->
    <div
      bind:this={carouselContainer}
      class="flex-1 flex overflow-x-hidden relative"
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
    >
      <!-- Cards wrapper -->
      <div
        class="flex transition-transform duration-300 ease-out"
        style="transform: translateX(-{currentIndex * 100}%);"
      >
        {#each turns as turn, index (turn.id)}
          <div
            class="carousel-card flex-shrink-0 w-full px-2 py-2"
            role="tabpanel"
            aria-roledescription="slide"
            aria-label="Message {index + 1} of {turns.length}"
            aria-hidden={index !== currentIndex}
          >
            <div class="max-w-lg mx-auto h-full overflow-y-auto">
              <MessageCard {turn} />
            </div>
          </div>
        {/each}
      </div>

      <!-- Navigation arrows -->
      {#if turns.length > 1}
        <!-- Previous button -->
        <button
          type="button"
          onclick={goToPrevious}
          disabled={!canGoPrevious}
          class="absolute left-2 top-1/2 -translate-y-1/2
                 p-2 min-w-[44px] min-h-[44px]
                 bg-bg-secondary/80 backdrop-blur
                 border border-border-default rounded-full
                 text-text-secondary
                 hover:bg-bg-hover hover:text-text-primary
                 disabled:opacity-30 disabled:cursor-not-allowed
                 transition-all
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
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
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <!-- Next button -->
        <button
          type="button"
          onclick={goToNext}
          disabled={!canGoNext}
          class="absolute right-2 top-1/2 -translate-y-1/2
                 p-2 min-w-[44px] min-h-[44px]
                 bg-bg-secondary/80 backdrop-blur
                 border border-border-default rounded-full
                 text-text-secondary
                 hover:bg-bg-hover hover:text-text-primary
                 disabled:opacity-30 disabled:cursor-not-allowed
                 transition-all
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
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
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Pagination dots -->
    {#if turns.length > 1}
      <div
        class="flex items-center justify-center gap-1.5 py-2"
        role="tablist"
        aria-label="Message navigation"
      >
        {#each turns as turn, index (turn.id)}
          <button
            type="button"
            onclick={() => goToIndex(index)}
            class="w-2 h-2 rounded-full transition-all
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:ring-offset-2
                   {index === currentIndex
                     ? 'bg-accent-emphasis scale-110'
                     : 'bg-text-quaternary hover:bg-text-tertiary'}"
            role="tab"
            aria-selected={index === currentIndex}
            aria-label="Go to message {index + 1}"
          />
        {/each}
      </div>
    {/if}
  {/if}
</div>
