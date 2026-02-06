<script lang="ts">
  /**
   * UnpushedCommitsList Component
   *
   * Displays a list of commits that have not been pushed to remote.
   *
   * Features:
   * - Shows hash, message, and author for each commit
   * - Scrollable list for many commits
   * - Responsive layout
   * - Empty state when no commits
   *
   * Props:
   * - commits: Array of unpushed commits
   */

  import type { UnpushedCommit } from "../../../../src/types/push-context";

  interface Props {
    commits: readonly UnpushedCommit[];
  }

  const { commits }: Props = $props();

  /**
   * Format date to readable string
   */
  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
</script>

<div class="unpushed-commits-list">
  {#if commits.length === 0}
    <div class="empty-state p-4 text-center text-gray-500">
      <p>No unpushed commits</p>
    </div>
  {:else}
    <div class="commits-container max-h-[300px] overflow-y-auto">
      <ul class="divide-y divide-gray-200">
        {#each commits as commit (commit.hash)}
          <li class="commit-item p-3 hover:bg-gray-50 transition-colors">
            <div class="flex items-start gap-3">
              <!-- Commit Hash Badge -->
              <div
                class="commit-hash-badge px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-mono rounded"
              >
                {commit.shortHash}
              </div>

              <!-- Commit Details -->
              <div class="flex-1 min-w-0">
                <!-- Commit Message -->
                <p
                  class="commit-message text-sm font-medium text-gray-900 truncate"
                >
                  {commit.message}
                </p>

                <!-- Commit Metadata -->
                <div
                  class="commit-metadata flex items-center gap-2 mt-1 text-xs text-gray-500"
                >
                  <span class="author truncate">{commit.author}</span>
                  <span class="separator">•</span>
                  <span class="date">{formatDate(commit.date)}</span>
                </div>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  /**
   * UnpushedCommitsList Styling
   *
   * - Scrollable container with max height
   * - Hover effect on commit items
   * - Truncated text for long messages
   */
  .unpushed-commits-list {
    width: 100%;
  }

  .commits-container {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
  }

  .commits-container::-webkit-scrollbar {
    width: 6px;
  }

  .commits-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .commits-container::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
  }

  .commits-container::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.7);
  }

  .commit-item {
    cursor: default;
  }

  .commit-message {
    word-break: break-word;
  }

  .author {
    max-width: 150px;
  }
</style>
