<script lang="ts">
  import type { CommitInfo } from "../../../src/types/commit";

  /**
   * CommitListItem component properties
   */
  interface Props {
    /**
     * Commit information to display
     */
    commit: CommitInfo;

    /**
     * Whether this commit is currently selected
     */
    selected: boolean;

    /**
     * Callback when the commit is selected
     */
    onSelect: () => void;
  }

  const { commit, selected, onSelect }: Props = $props();

  /**
   * Format timestamp to human-readable date
   */
  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Less than 24 hours: show relative time
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1 ? "just now" : `${minutes} minutes ago`;
      }
      return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    }

    // Less than 7 days: show days ago
    if (days < 7) {
      return days === 1 ? "yesterday" : `${days} days ago`;
    }

    // More than 7 days: show date
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Get first line of commit message
   */
  const messageFirstLine = $derived.by(() => {
    const firstLine = commit.message.split("\n")[0];
    return firstLine ?? commit.message;
  });
</script>

<!-- Commit List Item Button -->
<button
  type="button"
  class="commit-item w-full text-left px-4 py-3 hover:bg-bg-secondary focus:bg-bg-secondary focus:outline-none transition-colors min-h-[48px] flex flex-col gap-1"
  class:bg-accent-subtle={selected}
  class:border-l-4={selected}
  class:border-accent-emphasis={selected}
  onclick={onSelect}
  aria-label="Select commit {commit.shortHash}"
  aria-selected={selected}
>
  <!-- Commit Hash and Date -->
  <div class="commit-header flex items-center gap-2 text-xs text-text-secondary">
    <span class="commit-hash font-mono">{commit.shortHash}</span>
    <span class="commit-date">{formatDate(commit.date)}</span>
  </div>

  <!-- Commit Message -->
  <div class="commit-message text-sm text-text-primary truncate">
    {messageFirstLine}
  </div>

  <!-- Commit Author -->
  <div class="commit-author text-xs text-text-secondary">
    {commit.author.name}
  </div>
</button>

<style>
  /**
   * Commit list item styling
   * - Touch-friendly 48px minimum height
   * - Clear visual feedback on hover/focus
   * - Selected state with left border accent
   */
  .commit-item {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .commit-item:active {
    background-color: rgb(243 244 246); /* gray-100 */
  }

  .commit-hash {
    font-feature-settings: "tnum";
  }
</style>
