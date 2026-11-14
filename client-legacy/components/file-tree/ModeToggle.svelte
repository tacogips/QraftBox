<script lang="ts">
  /**
   * ModeToggle Component
   *
   * Allows switching between "Diff Only" and "All Files" view modes.
   * Uses Primer SegmentedControl pattern: raised pill on inset trough.
   *
   * Props:
   * - mode: Current mode ('diff' or 'all')
   * - changedCount: Number of files with changes
   * - totalCount: Total number of files
   * - onChange: Callback when mode changes
   */

  interface Props {
    mode: "diff" | "all";
    changedCount: number;
    totalCount: number;
    onChange: (mode: "diff" | "all") => void;
  }

  const { mode, changedCount, totalCount, onChange }: Props = $props();

  function handleDiffClick(): void {
    if (mode !== "diff") {
      onChange("diff");
    }
  }

  function handleAllClick(): void {
    if (mode !== "all") {
      onChange("all");
    }
  }
</script>

<div
  class="p-4 border-b border-border-default"
  role="group"
  aria-label="View mode toggle"
>
  <div class="segmented-control">
    <button
      type="button"
      class="segmented-control-item"
      class:segmented-control-item--active={mode === "diff"}
      onclick={handleDiffClick}
      aria-label="Show only files with changes"
      aria-pressed={mode === "diff"}
    >
      <span>Diff Only</span>
      <span
        class="segmented-control-badge"
        class:segmented-control-badge--active={mode === "diff"}
      >
        {changedCount}
      </span>
    </button>

    <button
      type="button"
      class="segmented-control-item"
      class:segmented-control-item--active={mode === "all"}
      onclick={handleAllClick}
      aria-label="Show all files"
      aria-pressed={mode === "all"}
    >
      <span>All Files</span>
      <span
        class="segmented-control-badge"
        class:segmented-control-badge--active={mode === "all"}
      >
        {totalCount}
      </span>
    </button>
  </div>
</div>

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
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 6px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
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

  .segmented-control-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    padding: 1px 7px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 500;
    background-color: var(--color-neutral-muted);
    color: var(--color-text-secondary);
  }

  .segmented-control-badge--active {
    background-color: var(--color-neutral-emphasis);
    color: var(--color-text-on-emphasis);
  }
</style>
