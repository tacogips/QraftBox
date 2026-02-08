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
    const baseClasses =
      "min-h-[44px] px-4 py-2 text-sm font-medium rounded-md transition-colors";
    const activeClasses = "bg-bg-emphasis text-text-on-emphasis";
    const inactiveClasses =
      "bg-bg-secondary text-text-secondary hover:bg-bg-hover";

    if (mode === viewMode) {
      return `${baseClasses} ${activeClasses}`;
    }
    return `${baseClasses} ${inactiveClasses}`;
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
      class="flex items-center gap-2 flex-shrink-0"
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
