<script lang="ts">
  /**
   * DirectoryPicker Component
   *
   * Full-screen modal for directory selection with iPad-friendly touch UI.
   *
   * Features:
   * - Modal overlay with touch-friendly dismissal
   * - Current path display with navigation
   * - Quick access bar (Home, Recent)
   * - Directory listing with 60px touch-friendly rows
   * - Select and Cancel buttons
   * - API integration with /api/browse
   *
   * Props:
   * - isOpen: Whether the picker is visible
   * - onClose: Callback when picker is dismissed
   * - onSelect: Callback when a directory is selected
   * - recentDirectories: List of recently opened directories
   */

  import type {
    DirectoryEntry,
    DirectoryListingResponse,
    RecentDirectory,
  } from "../../../src/types/workspace";
  import DirectoryEntryComponent from "./DirectoryEntry.svelte";
  import QuickAccessBar from "./QuickAccessBar.svelte";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (path: string) => void;
    recentDirectories: readonly RecentDirectory[];
  }

  const { isOpen, onClose, onSelect, recentDirectories }: Props = $props();

  /**
   * Current directory path
   */
  let currentPath = $state<string>("");

  /**
   * Directory entries for current path
   */
  let entries = $state<readonly DirectoryEntry[]>([]);

  /**
   * Whether directory listing is loading
   */
  let loading = $state<boolean>(false);

  /**
   * Error message if loading failed
   */
  let error = $state<string | null>(null);

  /**
   * Currently selected directory path (for Select button)
   */
  let selectedPath = $state<string | null>(null);

  /**
   * Parent path for navigation
   */
  let parentPath = $state<string | null>(null);

  /**
   * Whether we can navigate up
   */
  let canGoUp = $state<boolean>(false);

  /**
   * Load directory listing from API
   */
  async function loadDirectory(path: string): Promise<void> {
    loading = true;
    error = null;

    try {
      const encodedPath = encodeURIComponent(path);
      const response = await fetch(`/api/browse?path=${encodedPath}`);

      if (!response.ok) {
        throw new Error(`Failed to load directory: ${response.statusText}`);
      }

      const data = (await response.json()) as DirectoryListingResponse;

      currentPath = data.path;
      entries = data.entries;
      parentPath = data.parentPath;
      canGoUp = data.canGoUp;
      selectedPath = data.path;
      loading = false;
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to load directory";
      error = errorMessage;
      loading = false;
    }
  }

  /**
   * Load home directory
   */
  async function loadHome(): Promise<void> {
    try {
      const response = await fetch("/api/browse/home");

      if (!response.ok) {
        throw new Error(`Failed to get home directory: ${response.statusText}`);
      }

      const data = (await response.json()) as { path: string };
      await loadDirectory(data.path);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to load home directory";
      error = errorMessage;
    }
  }

  /**
   * Navigate to parent directory
   */
  async function navigateUp(): Promise<void> {
    if (parentPath !== null && canGoUp) {
      await loadDirectory(parentPath);
    }
  }

  /**
   * Handle directory entry click
   */
  async function handleEntryClick(entry: DirectoryEntry): Promise<void> {
    if (entry.isDirectory) {
      await loadDirectory(entry.path);
    } else {
      // Files cannot be selected, only directories
      selectedPath = currentPath;
    }
  }

  /**
   * Handle directory entry selection (for highlighting)
   */
  function handleEntrySelect(entry: DirectoryEntry): void {
    if (entry.isDirectory) {
      selectedPath = entry.path;
    }
  }

  /**
   * Handle Select button click
   */
  function handleSelect(): void {
    if (selectedPath !== null) {
      onSelect(selectedPath);
    }
  }

  /**
   * Handle Cancel button click
   */
  function handleCancel(): void {
    onClose();
  }

  /**
   * Handle quick access home click
   */
  async function handleQuickHome(): Promise<void> {
    await loadHome();
  }

  /**
   * Handle quick access recent directory click
   */
  async function handleQuickRecent(path: string): Promise<void> {
    await loadDirectory(path);
  }

  /**
   * Handle keyboard events for modal
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    } else if (event.key === "Enter" && selectedPath !== null) {
      event.preventDefault();
      handleSelect();
    }
  }

  /**
   * Load home directory when modal opens
   */
  $effect(() => {
    if (isOpen && currentPath === "") {
      void loadHome();
    }
  });

  /**
   * Handle clicking outside modal to close
   */
  function handleOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }
</script>

{#if isOpen}
  <!-- Modal Overlay -->
  <div
    class="directory-picker-overlay fixed inset-0 z-50 bg-black/50
           flex items-center justify-center p-2 sm:p-4
           backdrop-blur-sm"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="picker-title"
  >
    <!-- Modal Content -->
    <div
      class="directory-picker-modal w-full max-w-3xl
             h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)]
             sm:h-[90vh] sm:max-h-[90vh]
             bg-bg-primary rounded-lg shadow-2xl
             flex flex-col
             border border-border-default"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div
        class="picker-header px-6 py-4 border-b border-border-default
               flex items-center justify-between bg-bg-secondary"
      >
        <h2 id="picker-title" class="text-xl font-semibold text-text-primary">
          Select Directory
        </h2>

        <button
          type="button"
          onclick={handleCancel}
          class="p-2 min-w-[44px] min-h-[44px]
                 text-text-secondary hover:text-text-primary
                 hover:bg-bg-hover rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
          aria-label="Close directory picker"
          title="Close (Esc)"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- Quick Access Bar -->
      <QuickAccessBar
        {recentDirectories}
        onHomeClick={handleQuickHome}
        onRecentClick={handleQuickRecent}
      />

      <!-- Current Path Display -->
      <div
        class="current-path px-6 py-3 border-b border-border-default
               bg-bg-secondary flex items-center gap-2"
      >
        <!-- Up Button -->
        <button
          type="button"
          onclick={navigateUp}
          disabled={!canGoUp}
          class="p-2 min-w-[44px] min-h-[44px]
                 text-text-secondary hover:text-text-primary
                 hover:bg-bg-hover rounded
                 disabled:opacity-30 disabled:cursor-not-allowed
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
          aria-label="Go to parent directory"
          title="Up"
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
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        <!-- Path -->
        <div class="flex-1 min-w-0">
          <code
            class="text-sm text-text-primary font-mono truncate block"
            title={currentPath}
          >
            {currentPath || "/"}
          </code>
        </div>
      </div>

      <!-- Directory List -->
      <div class="directory-list flex-1 overflow-y-auto">
        {#if loading}
          <!-- Loading State -->
          <div
            class="flex items-center justify-center h-full text-text-tertiary"
          >
            <div class="flex flex-col items-center gap-3">
              <svg
                class="animate-spin h-8 w-8"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span class="text-sm">Loading...</span>
            </div>
          </div>
        {:else if error !== null}
          <!-- Error State -->
          <div
            class="flex items-center justify-center h-full text-danger-fg px-6"
          >
            <div class="text-center">
              <svg
                class="h-12 w-12 mx-auto mb-3"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p class="text-sm">{error}</p>
            </div>
          </div>
        {:else if entries.length === 0}
          <!-- Empty State -->
          <div
            class="flex items-center justify-center h-full text-text-tertiary"
          >
            <div class="text-center">
              <svg
                class="h-12 w-12 mx-auto mb-3"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <p class="text-sm">No entries in this directory</p>
            </div>
          </div>
        {:else}
          <!-- Directory Entries -->
          <div role="listbox" aria-label="Directory entries">
            {#each entries as entry (entry.path)}
              <DirectoryEntryComponent
                {entry}
                selected={selectedPath === entry.path}
                onClick={() => handleEntryClick(entry)}
                onSelect={() => handleEntrySelect(entry)}
              />
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer Buttons -->
      <div
        class="picker-footer px-6 py-4 border-t border-border-default
               pb-[calc(1rem+env(safe-area-inset-bottom,0px))]
               pr-[calc(1.5rem+env(safe-area-inset-right,0px))]
               pl-[calc(1.5rem+env(safe-area-inset-left,0px))]
               bg-bg-secondary flex items-center justify-end gap-3"
      >
        <button
          type="button"
          onclick={handleCancel}
          class="px-6 py-3 min-h-[52px] min-w-[100px]
                 text-text-primary bg-bg-tertiary
                 border border-border-default rounded-lg
                 hover:bg-bg-hover
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 font-medium transition-colors"
        >
          Cancel
        </button>

        <button
          type="button"
          onclick={handleSelect}
          disabled={selectedPath === null}
          class="px-6 py-3 min-h-[52px] min-w-[100px]
                 text-white bg-success-emphasis
                 rounded-lg
                 hover:brightness-110
                 disabled:opacity-50 disabled:cursor-not-allowed
                 focus:outline-none focus:ring-2 focus:ring-success-emphasis
                 font-medium transition-colors"
        >
          Select
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /**
 * Directory Picker Styling
 *
 * - Full-screen modal with backdrop
 * - Touch-friendly 60px rows for entries
 * - Smooth animations for modal appearance
 */
  .directory-picker-overlay {
    animation: fade-in 0.15s ease-out;
  }

  .directory-picker-modal {
    animation: slide-up 0.2s ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .directory-list {
    -webkit-overflow-scrolling: touch;
  }

  /* Loading spinner animation */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
