<script lang="ts">
  /**
   * ModeToggle Component
   *
   * Allows switching between "Diff Only" and "All Files" view modes.
   * Displays file counts for each mode and provides touch-friendly buttons.
   *
   * Props:
   * - mode: Current mode ('diff' or 'all')
   * - changedCount: Number of files with changes
   * - totalCount: Total number of files
   * - onChange: Callback when mode changes
   *
   * Design: Touch-friendly with 44px minimum tap targets, segmented button group appearance
   */

  interface Props {
    /**
     * Current view mode
     */
    mode: "diff" | "all";

    /**
     * Number of files with changes
     */
    changedCount: number;

    /**
     * Total number of files
     */
    totalCount: number;

    /**
     * Callback when mode changes
     */
    onChange: (mode: "diff" | "all") => void;
  }

  const { mode, changedCount, totalCount, onChange }: Props = $props();

  /**
   * Handle Diff Only button click
   */
  function handleDiffClick(): void {
    if (mode !== "diff") {
      onChange("diff");
    }
  }

  /**
   * Handle All Files button click
   */
  function handleAllClick(): void {
    if (mode !== "all") {
      onChange("all");
    }
  }
</script>

<!-- Mode Toggle Container -->
<div
  class="mode-toggle p-4 border-b border-border-default"
  role="group"
  aria-label="View mode toggle"
>
  <div
    class="flex gap-0 rounded-lg overflow-hidden border border-border-default bg-bg-secondary"
  >
    <!-- Diff Only Button -->
    <button
      type="button"
      class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center gap-2"
      class:bg-blue-600={mode === "diff"}
      class:text-white={mode === "diff"}
      class:hover:bg-blue-700={mode === "diff"}
      class:bg-transparent={mode !== "diff"}
      class:text-text-primary={mode !== "diff"}
      class:hover:bg-bg-hover={mode !== "diff"}
      onclick={handleDiffClick}
      aria-label="Show only files with changes"
      aria-pressed={mode === "diff"}
    >
      <span>Diff Only</span>
      <span
        class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium min-w-[28px]"
        class:bg-blue-500={mode === "diff"}
        class:text-white={mode === "diff"}
        class:bg-bg-tertiary={mode !== "diff"}
        class:text-text-secondary={mode !== "diff"}
      >
        {changedCount}
      </span>
    </button>

    <!-- All Files Button -->
    <button
      type="button"
      class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center gap-2 border-l border-border-default"
      class:bg-blue-600={mode === "all"}
      class:text-white={mode === "all"}
      class:hover:bg-blue-700={mode === "all"}
      class:bg-transparent={mode !== "all"}
      class:text-text-primary={mode !== "all"}
      class:hover:bg-bg-hover={mode !== "all"}
      onclick={handleAllClick}
      aria-label="Show all files"
      aria-pressed={mode === "all"}
    >
      <span>All Files</span>
      <span
        class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium min-w-[28px]"
        class:bg-blue-500={mode === "all"}
        class:text-white={mode === "all"}
        class:bg-bg-tertiary={mode !== "all"}
        class:text-text-secondary={mode !== "all"}
      >
        {totalCount}
      </span>
    </button>
  </div>
</div>

<style>
  /**
 * Mode toggle styling
 * - Segmented button group appearance
 * - Touch-friendly 44px minimum height
 * - Clear active/inactive states
 * - Smooth transitions
 */
  .mode-toggle button {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .mode-toggle button:focus-visible {
    outline: 2px solid rgb(37 99 235); /* blue-600 */
    outline-offset: -2px;
    z-index: 1;
  }

  .mode-toggle button:active {
    transform: scale(0.98);
  }
</style>
