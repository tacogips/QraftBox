<script lang="ts">
  import type { DiffFile, ViewMode } from "../../src/types/diff";
  import StatusBadge from "../file-tree/StatusBadge.svelte";

  /**
   * DiffHeader Component
   *
   * Displays file path, status badge, addition/deletion stats,
   * and view mode toggle buttons for a diff file.
   *
   * Props:
   * - file: DiffFile containing path, status, additions, deletions, oldPath
   * - viewMode: Current view mode ('side-by-side' | 'inline' | 'current-state')
   * - onModeChange: Optional callback when view mode is changed
   *
   * Design: Tablet-first with sticky positioning and touch-friendly controls
   */

  interface Props {
    file: DiffFile;
    viewMode: ViewMode;
    onModeChange?: (mode: ViewMode) => void;
  }

  // Svelte 5 props syntax
  let { file, viewMode, onModeChange = undefined }: Props = $props();

  /**
   * Handle view mode button click
   */
  function handleModeClick(mode: ViewMode): void {
    if (onModeChange !== undefined) {
      onModeChange(mode);
    }
  }

  /**
   * Get file display path
   * For renamed files, show "oldPath → newPath"
   * Otherwise, show just the path
   */
  const displayPath = $derived.by((): string => {
    if (file.status === "renamed" && file.oldPath !== undefined) {
      return `${file.oldPath} → ${file.path}`;
    }
    return file.path;
  });

  /**
   * Get button class based on whether it's the active mode
   */
  function getButtonClass(mode: ViewMode): string {
    const base = "segmented-control-item";
    if (mode === viewMode) {
      return `${base} segmented-control-item--active`;
    }
    return base;
  }

  /**
   * Get status for StatusBadge component
   * Map DiffStatus to StatusBadge status type
   */
  function getStatusBadgeStatus(
    status: "added" | "modified" | "deleted" | "renamed",
  ): "added" | "modified" | "deleted" | undefined {
    switch (status) {
      case "added":
        return "added";
      case "modified":
        return "modified";
      case "deleted":
        return "deleted";
      case "renamed":
        return "modified"; // Treat renamed as modified for badge display
      default: {
        const _exhaustive: never = status;
        throw new Error(`Unhandled status: ${_exhaustive}`);
      }
    }
  }
</script>

<!-- Sticky header that stays visible during scroll -->
<header class="sticky top-0 z-10 bg-bg-primary border-b border-border-default">
  <div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4">
    <!-- Left side: File path and status -->
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <StatusBadge status={getStatusBadgeStatus(file.status)} />
      <span
        class="font-mono text-sm text-text-primary truncate"
        title={displayPath}
      >
        {displayPath}
      </span>
    </div>

    <!-- Middle: Stats -->
    <div class="flex items-center gap-4 flex-shrink-0">
      <span class="text-sm font-medium text-success-fg" aria-label="Additions">
        +{file.additions}
      </span>
      <span class="text-sm font-medium text-danger-fg" aria-label="Deletions">
        -{file.deletions}
      </span>
    </div>

    <!-- Right side: View mode toggle -->
    <div
      class="segmented-control flex-shrink-0"
      role="group"
      aria-label="View mode selection"
    >
      <button
        type="button"
        class={getButtonClass("side-by-side")}
        onclick={() => handleModeClick("side-by-side")}
        aria-label="Side-by-side view"
        aria-pressed={viewMode === "side-by-side"}
      >
        Side-by-side
      </button>
      <button
        type="button"
        class={getButtonClass("inline")}
        onclick={() => handleModeClick("inline")}
        aria-label="Inline view"
        aria-pressed={viewMode === "inline"}
      >
        Inline
      </button>
      <button
        type="button"
        class={getButtonClass("current-state")}
        onclick={() => handleModeClick("current-state")}
        aria-label="Current state view"
        aria-pressed={viewMode === "current-state"}
      >
        Current State
      </button>
    </div>
  </div>
</header>

<style>
  .segmented-control {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    border: 1px solid var(--color-border-muted);
    background-color: var(--color-bg-inset);
  }

  .segmented-control-item {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 4px 14px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
    background-color: transparent;
    color: var(--color-text-secondary);
  }

  .segmented-control-item:hover:not(.segmented-control-item--active) {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .segmented-control-item--active {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-segmented-active);
  }

  .segmented-control-item:focus-visible {
    outline: 2px solid var(--color-accent-fg);
    outline-offset: -2px;
    z-index: 1;
  }

  .segmented-control-item:active {
    transform: scale(0.98);
  }
</style>
