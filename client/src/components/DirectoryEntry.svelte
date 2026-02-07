<script lang="ts">
  /**
   * DirectoryEntry Component
   *
   * Individual directory or file entry in the directory picker.
   *
   * Features:
   * - 60px touch-friendly height
   * - Icon for directory/file
   * - Git repository indicator
   * - Hidden file dimmed appearance
   * - Selected state highlighting
   * - Double-click to navigate (directories) or select (files)
   *
   * Props:
   * - entry: Directory entry data
   * - selected: Whether this entry is currently selected
   * - onClick: Callback when entry is clicked (navigate for directories)
   * - onSelect: Callback when entry is selected for highlighting
   */

  import type { DirectoryEntry } from "../../../src/types/workspace";

  interface Props {
    entry: DirectoryEntry;
    selected: boolean;
    onClick: () => void;
    onSelect: () => void;
  }

  const { entry, selected, onClick, onSelect }: Props = $props();

  /**
   * Click timer for double-click detection
   */
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Handle single click - select entry
   */
  function handleClick(): void {
    if (clickTimer !== null) {
      // Double-click detected
      clearTimeout(clickTimer);
      clickTimer = null;
      onClick();
    } else {
      // Single click - select entry
      onSelect();
      clickTimer = setTimeout(() => {
        clickTimer = null;
      }, 300);
    }
  }

  /**
   * Handle Enter key - navigate
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      onClick();
    }
  }

  /**
   * Get icon for entry type
   */
  const iconPath = $derived.by(() => {
    if (entry.isDirectory) {
      if (entry.isGitRepo) {
        // Git repository icon (folder with git mark)
        return "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z";
      } else {
        // Regular folder icon
        return "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z";
      }
    } else {
      // File icon
      return "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";
    }
  });

  /**
   * Get icon color class
   */
  const iconColorClass = $derived.by(() => {
    if (entry.isDirectory) {
      if (entry.isGitRepo) {
        return "text-accent-fg";
      } else {
        return "text-attention-fg";
      }
    } else {
      return "text-text-tertiary";
    }
  });

  /**
   * Get text color class based on hidden state
   */
  const textColorClass = $derived.by(() => {
    if (entry.isHidden) {
      return "text-text-tertiary opacity-60";
    } else {
      return "text-text-primary";
    }
  });
</script>

<div
  role="option"
  aria-selected={selected}
  tabindex="0"
  class="directory-entry px-6 py-3 min-h-[60px]
         flex items-center gap-3
         border-b border-border-default
         hover:bg-bg-hover
         cursor-pointer
         transition-colors
         {selected
    ? 'bg-accent-subtle border-l-4 border-l-blue-600'
    : 'border-l-4 border-l-transparent'}"
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <!-- Icon -->
  <div class="flex-shrink-0">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={iconColorClass}
      aria-hidden="true"
    >
      <path d={iconPath} />
    </svg>
  </div>

  <!-- Entry Name -->
  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2">
      <span class="text-base truncate {textColorClass}">
        {entry.name}
      </span>

      <!-- Git Repository Badge -->
      {#if entry.isGitRepo && entry.isDirectory}
        <span
          class="px-2 py-0.5 text-xs font-medium
                 bg-accent-subtle text-accent-fg rounded
                 flex-shrink-0"
          title="Git repository"
        >
          Git
        </span>
      {/if}

      <!-- Hidden Indicator -->
      {#if entry.isHidden}
        <span
          class="px-2 py-0.5 text-xs font-medium
                 bg-bg-secondary text-text-secondary rounded
                 flex-shrink-0"
          title="Hidden file"
        >
          Hidden
        </span>
      {/if}

      <!-- Symlink Indicator -->
      {#if entry.isSymlink}
        <span
          class="text-text-tertiary text-xs flex-shrink-0"
          title="Symbolic link"
        >
          →
        </span>
      {/if}
    </div>
  </div>

  <!-- Directory Indicator (Chevron) -->
  {#if entry.isDirectory}
    <div class="flex-shrink-0">
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
        class="text-text-tertiary"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  {/if}
</div>

<style>
  /**
 * Directory Entry Styling
 *
 * - 60px minimum height for touch-friendliness
 * - Selected state with left border highlight
 * - Hover feedback
 * - Smooth transitions
 */
  .directory-entry {
    -webkit-tap-highlight-color: transparent;
  }

  .directory-entry:focus {
    outline: 2px solid rgb(59 130 246);
    outline-offset: -2px;
  }

  .directory-entry:active {
    background-color: rgb(243 244 246);
  }
</style>
