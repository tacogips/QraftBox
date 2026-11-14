<script lang="ts">
  /**
   * QuickAccessBar Component
   *
   * Quick access buttons for common directory locations.
   *
   * Features:
   * - Home button (navigate to user home directory)
   * - Recent directories dropdown/list
   * - Touch-friendly 48px minimum height
   *
   * Props:
   * - recentDirectories: List of recently opened directories
   * - onHomeClick: Callback when Home button is clicked
   * - onRecentClick: Callback when a recent directory is clicked
   */

  import type { RecentDirectory } from "../../../src/types/workspace";

  interface Props {
    recentDirectories: readonly RecentDirectory[];
    onHomeClick: () => void;
    onRecentClick: (path: string) => void;
  }

  const { recentDirectories, onHomeClick, onRecentClick }: Props = $props();

  /**
   * Whether recent directories dropdown is open
   */
  let isRecentOpen = $state<boolean>(false);

  /**
   * Toggle recent directories dropdown
   */
  function toggleRecent(): void {
    isRecentOpen = !isRecentOpen;
  }

  /**
   * Handle recent directory click
   */
  function handleRecentClick(path: string): void {
    onRecentClick(path);
    isRecentOpen = false;
  }

  /**
   * Close dropdown when clicking outside
   */
  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest(".recent-dropdown")) {
      isRecentOpen = false;
    }
  }

  /**
   * Extract directory name from path for display
   */
  function extractName(path: string): string {
    const parts = path.split("/").filter((p) => p.length > 0);
    const last = parts[parts.length - 1];
    return last !== undefined && last.length > 0 ? last : "/";
  }

  /**
   * Format timestamp as relative time
   */
  function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return "Just now";
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div
  class="quick-access-bar px-6 py-3 border-b border-border-default
         bg-bg-secondary flex items-center gap-3"
>
  <!-- Home Button -->
  <button
    type="button"
    onclick={onHomeClick}
    class="px-4 py-2 min-h-[48px]
           flex items-center gap-2
           text-text-primary bg-bg-tertiary
           border border-border-default rounded-lg
           hover:bg-bg-hover
           focus:outline-none focus:ring-2 focus:ring-accent-emphasis
           transition-colors"
    title="Go to home directory"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
    <span class="text-sm font-medium">Home</span>
  </button>

  <!-- Recent Directories Dropdown -->
  {#if recentDirectories.length > 0}
    <div class="recent-dropdown relative">
      <button
        type="button"
        onclick={toggleRecent}
        class="px-4 py-2 min-h-[48px]
               flex items-center gap-2
               text-text-primary bg-bg-tertiary
               border border-border-default rounded-lg
               hover:bg-bg-hover
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis
               transition-colors"
        aria-expanded={isRecentOpen}
        aria-haspopup="true"
        title="Recent directories"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span class="text-sm font-medium">
          Recent ({recentDirectories.length})
        </span>
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
          class="transition-transform {isRecentOpen ? 'rotate-180' : ''}"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <!-- Dropdown Menu -->
      {#if isRecentOpen}
        <div
          class="absolute top-full left-0 mt-2 w-80
                 bg-bg-primary border border-border-default rounded-lg
                 shadow-xl z-10
                 max-h-96 overflow-y-auto"
          role="menu"
        >
          {#each recentDirectories as recent (recent.path)}
            <button
              type="button"
              onclick={() => handleRecentClick(recent.path)}
              class="w-full px-4 py-3 text-left
                     flex items-start gap-3
                     hover:bg-bg-hover
                     border-b border-border-default last:border-b-0
                     focus:outline-none focus:bg-bg-hover
                     transition-colors"
              role="menuitem"
            >
              <!-- Icon -->
              <div class="flex-shrink-0 pt-0.5">
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
                  class={recent.isGitRepo ? "text-accent-fg" : "text-attention-fg"}
                  aria-hidden="true"
                >
                  <path
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm font-medium text-text-primary truncate">
                    {recent.name}
                  </span>
                  {#if recent.isGitRepo}
                    <span
                      class="px-1.5 py-0.5 text-xs font-medium
                             bg-accent-subtle text-accent-fg rounded
                             flex-shrink-0"
                      title="Git repository"
                    >
                      Git
                    </span>
                  {/if}
                </div>
                <div class="flex items-center gap-2">
                  <code
                    class="text-xs text-text-tertiary font-mono truncate"
                    title={recent.path}
                  >
                    {recent.path}
                  </code>
                  <span class="text-xs text-text-tertiary flex-shrink-0">
                    {formatRelativeTime(recent.lastOpened)}
                  </span>
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /**
 * Quick Access Bar Styling
 *
 * - Touch-friendly 48px buttons
 * - Dropdown with smooth animation
 * - Scroll for long recent lists
 */
  .recent-dropdown button {
    -webkit-tap-highlight-color: transparent;
  }

  /* Dropdown animation */
  .recent-dropdown > div {
    animation: dropdown-slide 0.15s ease-out;
  }

  @keyframes dropdown-slide {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
