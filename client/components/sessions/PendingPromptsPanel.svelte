<script lang="ts">
  /**
   * PendingPromptsPanel Component
   *
   * Displays prompts persisted to disk that are awaiting dispatch.
   * These include prompts recovered from server restarts and prompts
   * saved but not yet dispatched.
   *
   * Props:
   * - prompts: Array of pending local prompts
   * - onResume: Callback to dispatch (resume) a prompt
   * - onCancel: Callback to cancel a prompt
   * - onCancelAll: Callback to cancel all pending prompts
   * - onDelete: Callback to delete a prompt
   */

  import type { LocalPrompt } from "../../../src/types/local-prompt";

  const PAGE_SIZE = 10;

  interface Props {
    prompts: LocalPrompt[];
    onResume: (id: string) => void;
    onCancel: (id: string) => void;
    onCancelAll: () => void;
    onDelete: (id: string) => void;
  }

  const { prompts, onResume, onCancel, onCancelAll, onDelete }: Props =
    $props();

  const isEmpty = $derived(prompts.length === 0);

  /**
   * Number of items currently visible
   */
  let visibleCount = $state(PAGE_SIZE);

  /**
   * Visible slice of prompts
   */
  const visiblePrompts = $derived(prompts.slice(0, visibleCount));

  /**
   * Whether more items can be loaded
   */
  const hasMore = $derived(visibleCount < prompts.length);

  /**
   * Show next page
   */
  function loadMore(): void {
    visibleCount += PAGE_SIZE;
  }

  /**
   * Get relative time string
   */
  function getRelativeTime(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    return `${diffDays}d ago`;
  }
</script>

{#if !isEmpty}
  <section aria-labelledby="pending-heading" class="mb-6">
    <div class="flex items-center justify-between mb-2">
      <h2
        id="pending-heading"
        class="text-sm font-semibold text-text-secondary flex items-center gap-2"
      >
        <span class="inline-block w-2 h-2 rounded-full bg-accent-emphasis" />
        PENDING ({prompts.length})
      </h2>
      {#if prompts.length > 1}
        <button
          type="button"
          onclick={onCancelAll}
          class="px-3 py-1 text-xs font-medium rounded-md
                 bg-attention-emphasis/20 text-attention-fg hover:bg-attention-emphasis/30
                 border border-attention-emphasis/30
                 transition-colors duration-150
                 focus:outline-none focus:ring-2 focus:ring-attention-emphasis"
          aria-label="Cancel all pending prompts"
        >
          Cancel All
        </button>
      {/if}
    </div>
    <div class="space-y-1">
      {#each visiblePrompts as prompt (prompt.id)}
        <div
          class="flex items-center gap-2 px-3 py-1.5 rounded-md
                 bg-bg-secondary border border-border-default
                 hover:border-accent-emphasis/50 hover:bg-bg-hover
                 transition-colors duration-150"
          role="article"
          aria-label={`Pending prompt: ${prompt.description || prompt.prompt}`}
        >
          <!-- Status dot -->
          <span
            class="shrink-0 w-1.5 h-1.5 rounded-full bg-accent-emphasis"
            aria-hidden="true"
          />

          <!-- Recovered badge -->
          {#if prompt.error !== null}
            <span class="shrink-0 text-[10px] font-medium text-attention-fg"
              >(recovered)</span
            >
          {/if}

          <!-- Prompt text (single line, truncated) -->
          <span class="flex-1 text-xs text-text-primary truncate min-w-0">
            {prompt.description || prompt.prompt}
          </span>

          <!-- Time -->
          <span class="shrink-0 text-[10px] text-text-tertiary">
            {getRelativeTime(prompt.createdAt)}
          </span>

          <!-- Action buttons -->
          <button
            type="button"
            onclick={(e: MouseEvent) => {
              e.stopPropagation();
              onResume(prompt.id);
            }}
            class="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded
                   bg-accent-muted/60 hover:bg-accent-muted text-accent-fg
                   border border-accent-emphasis/30 hover:border-accent-emphasis/60
                   transition-colors"
            title="Resume this prompt"
          >
            Resume
          </button>
          <button
            type="button"
            onclick={(e: MouseEvent) => {
              e.stopPropagation();
              onCancel(prompt.id);
            }}
            class="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded
                   bg-attention-muted/60 hover:bg-attention-muted text-attention-fg
                   border border-attention-emphasis/30 hover:border-attention-emphasis/60
                   transition-colors"
            title="Cancel this prompt"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={(e: MouseEvent) => {
              e.stopPropagation();
              onDelete(prompt.id);
            }}
            class="shrink-0 px-1.5 py-0.5 text-[10px] rounded
                   text-text-tertiary hover:text-danger-fg hover:bg-danger-emphasis/20
                   transition-colors"
            title="Delete this prompt"
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
              <line x1="18" y1="6" x2="6" y2="18" /><line
                x1="6"
                y1="6"
                x2="18"
                y2="18"
              />
            </svg>
          </button>
        </div>
      {/each}
    </div>

    <!-- Load More -->
    {#if hasMore}
      <button
        type="button"
        onclick={loadMore}
        class="mt-2 w-full py-1.5 text-xs font-medium text-text-secondary
               hover:text-text-primary hover:bg-bg-hover rounded-md
               transition-colors duration-150"
      >
        Load More ({prompts.length - visibleCount} remaining)
      </button>
    {/if}
  </section>
{/if}
