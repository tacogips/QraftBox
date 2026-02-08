<script lang="ts">
  /**
   * QuickActions Component
   *
   * Displays a popup menu with quick actions for a file (copy path, open in editor).
   * Appears as an absolutely positioned dropdown menu.
   * Keyboard accessible with Escape to close.
   *
   * Props:
   * - path: File path to operate on
   * - visible: Whether the menu is visible
   * - onCopyPath: Callback when "Copy Path" is clicked
   * - onOpenInEditor: Optional callback when "Open in Editor" is clicked
   * - onClose: Callback to close the menu
   *
   * Design: Touch-friendly 44px minimum tap targets, positioned absolutely
   */

  interface Props {
    /**
     * File path to operate on
     */
    path: string;

    /**
     * Whether the quick actions menu is visible
     */
    visible: boolean;

    /**
     * Callback when "Copy Path" action is selected
     */
    onCopyPath: () => void;

    /**
     * Optional callback when "Open in Editor" action is selected
     */
    onOpenInEditor?: () => void;

    /**
     * Callback to close the menu
     */
    onClose: () => void;
  }

  const { path, visible, onCopyPath, onOpenInEditor, onClose }: Props =
    $props();

  /**
   * Handle Copy Path action
   */
  function handleCopyPath(): void {
    onCopyPath();
    onClose();
  }

  /**
   * Handle Open in Editor action
   */
  function handleOpenInEditor(): void {
    if (onOpenInEditor !== undefined) {
      onOpenInEditor();
    }
    onClose();
  }

  /**
   * Handle Escape key to close menu
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  /**
   * Handle click outside to close menu
   */
  function handleBackdropClick(event: MouseEvent): void {
    // Close menu when clicking on the backdrop (not the menu itself)
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

<!-- Quick Actions Menu -->
{#if visible}
  <!-- Backdrop overlay for click-outside detection -->
  <div
    class="quick-actions-backdrop fixed inset-0 z-40"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="presentation"
    aria-hidden="true"
  >
    <!-- Quick Actions Menu Popup -->
    <div
      class="quick-actions-menu absolute bg-bg-primary border border-border-default rounded-lg shadow-lg py-2 min-w-[200px] z-50"
      role="menu"
      aria-label="Quick actions for {path}"
    >
      <!-- Copy Path Action -->
      <button
        type="button"
        class="quick-action-item w-full text-left px-4 py-2.5 hover:bg-bg-secondary focus:bg-bg-secondary focus:outline-none transition-colors min-h-[44px] flex items-center gap-3"
        onclick={handleCopyPath}
        role="menuitem"
      >
        <!-- Copy Icon -->
        <svg
          class="w-5 h-5 text-text-secondary shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          ></path>
        </svg>

        <!-- Label -->
        <span class="text-text-primary text-text-tertiary text-sm">Copy Path</span>
      </button>

      <!-- Open in Editor Action (if callback provided) -->
      {#if onOpenInEditor !== undefined}
        <button
          type="button"
          class="quick-action-item w-full text-left px-4 py-2.5 hover:bg-bg-secondary focus:bg-bg-secondary focus:outline-none transition-colors min-h-[44px] flex items-center gap-3"
          onclick={handleOpenInEditor}
          role="menuitem"
        >
          <!-- External Link Icon -->
          <svg
            class="w-5 h-5 text-text-secondary shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            ></path>
          </svg>

          <!-- Label -->
          <span class="text-text-primary text-text-tertiary text-sm"
            >Open in Editor</span
          >
        </button>
      {/if}

      <!-- Close Button (visible alternative for accessibility) -->
      <div class="border-t border-border-default mt-2 pt-2">
        <button
          type="button"
          class="quick-action-item w-full text-left px-4 py-2.5 hover:bg-bg-secondary focus:bg-bg-secondary focus:outline-none transition-colors min-h-[44px] flex items-center gap-3"
          onclick={onClose}
          role="menuitem"
        >
          <!-- Close Icon -->
          <svg
            class="w-5 h-5 text-text-secondary shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>

          <!-- Label -->
          <span class="text-text-secondary text-sm">Close</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /**
 * Quick actions styling
 * - Touch-friendly 44px minimum height for all items
 * - Clear visual feedback on hover/focus
 * - Smooth transitions
 * - Accessible keyboard navigation
 */
  .quick-actions-backdrop {
    /* Invisible backdrop for click-outside detection */
    background-color: transparent;
  }

  .quick-actions-menu {
    /* Position menu near trigger (managed by parent component) */
    top: 100%;
    right: 0;
    margin-top: 4px;
  }

  .quick-action-item {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .quick-action-item:focus-visible {
    outline: 2px solid var(--color-accent-fg);
    outline-offset: -2px;
  }

  .quick-action-item:active {
    transform: scale(0.98);
  }
</style>
