<script lang="ts">
  import type { FileNode } from "../../src/stores/files";

  /**
   * FileNode component properties
   */
  interface Props {
    /**
     * File node to render
     */
    node: FileNode;

    /**
     * Indentation depth level (0-based)
     */
    depth: number;

    /**
     * Whether this file is currently selected
     */
    selected: boolean;

    /**
     * Callback when the file is selected
     */
    onSelect: () => void;

    /**
     * Callback to view full file content (for files with diffs)
     */
    onViewFullFile?: () => void;
  }

  const { node, depth, selected, onSelect, onViewFullFile = undefined }: Props = $props();

  /**
   * Get status badge text based on file status
   */
  function getStatusBadge(
    status: "added" | "modified" | "deleted" | undefined,
  ): string {
    if (status === undefined) return "";

    switch (status) {
      case "added":
        return "[+]";
      case "modified":
        return "[M]";
      case "deleted":
        return "[-]";
      default:
        return "";
    }
  }

  /**
   * Get status badge color class based on file status
   */
  function getStatusBadgeColor(
    status: "added" | "modified" | "deleted" | undefined,
  ): string {
    if (status === undefined) return "";

    switch (status) {
      case "added":
        return "text-success-fg";
      case "modified":
        return "text-attention-fg";
      case "deleted":
        return "text-danger-fg";
      default:
        return "";
    }
  }

  /**
   * Get background class for the entire file-node row based on diff status
   */
  function getStatusBackgroundClass(
    status: "added" | "modified" | "deleted" | undefined,
  ): string {
    if (status === undefined) return "";

    switch (status) {
      case "added":
        return "status-added";
      case "modified":
        return "status-modified";
      case "deleted":
        return "status-deleted";
      default:
        return "";
    }
  }

  /**
   * Calculate left padding based on depth
   * Includes offset for no chevron (directory nodes have chevron, files don't)
   */
  const leftPadding = $derived.by(() => {
    // Base padding: 1rem
    // Each depth level adds 1.5rem (24px)
    // No chevron offset: 1rem (16px) to align with directory names
    const basePadding = 1;
    const depthPadding = depth * 1.5;
    const noChevronOffset = 1; // Align with directory node text
    return basePadding + depthPadding + noChevronOffset;
  });
</script>

<!-- File Node Button -->
<button
  type="button"
  class="file-node group/filenode w-full text-left px-4 py-1 focus:outline-none transition-colors min-h-[28px] flex items-center gap-1.5 {getStatusBackgroundClass(node.status)}"
  class:bg-accent-subtle={selected && !node.status}
  class:border-l-4={selected}
  class:border-accent-emphasis={selected}
  style="padding-left: {leftPadding}rem"
  onclick={onSelect}
  aria-label="Select file {node.name}"
  aria-selected={selected}
>
  <!-- File Icon -->
  <svg
    class="file-icon w-5 h-5 text-text-tertiary shrink-0"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
    ></path>
  </svg>

  <!-- File Name -->
  <span class="file-name text-text-primary truncate flex-1">
    {node.name}
  </span>

  <!-- View Full File Button (for files with diff status) -->
  {#if node.status !== undefined && onViewFullFile !== undefined}
    <button
      type="button"
      class="view-full-btn shrink-0 w-5 h-5 flex items-center justify-center
             rounded text-text-tertiary opacity-0 group-hover/filenode:opacity-100
             hover:text-text-primary hover:bg-bg-tertiary transition-opacity"
      onclick={(e) => { e.stopPropagation(); onViewFullFile?.(); }}
      aria-label="View full file {node.name}"
      title="View full file"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M2 1.75C2 .784 2.784 0 3.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H3.75z"/>
      </svg>
    </button>
  {/if}

  <!-- Status Badge -->
  {#if node.status !== undefined}
    <span
      class="status-badge text-xs font-medium shrink-0 {getStatusBadgeColor(
        node.status,
      )}"
      aria-label="{node.status} file"
    >
      {getStatusBadge(node.status)}
    </span>
  {/if}
</button>

<style>
  /**
 * File node styling
 * - Touch-friendly 48px minimum height
 * - Clear visual feedback on hover/focus
 * - Selected state with left border accent
 */
  .file-node {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .file-node:not(.status-added):not(.status-modified):not(.status-deleted):hover {
    background-color: var(--color-bg-tertiary);
  }

  .file-node:not(.status-added):not(.status-modified):not(.status-deleted):active {
    background-color: var(--color-bg-tertiary);
  }

  /* Status-based background colors for diff file nodes */
  .file-node.status-added {
    background-color: var(--color-diff-add-bg);
  }

  .file-node.status-added:hover,
  .file-node.status-added:active {
    background-color: var(--color-diff-add-word);
  }

  .file-node.status-modified {
    background-color: var(--color-attention-muted);
  }

  .file-node.status-modified:hover,
  .file-node.status-modified:active {
    background-color: var(--color-attention-emphasis);
  }

  .file-node.status-deleted {
    background-color: var(--color-diff-del-bg);
  }

  .file-node.status-deleted:hover,
  .file-node.status-deleted:active {
    background-color: var(--color-diff-del-word);
  }
</style>
