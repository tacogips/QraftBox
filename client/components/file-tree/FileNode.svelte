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
  }

  const { node, depth, selected, onSelect }: Props = $props();

  let buttonEl = $state<HTMLButtonElement | null>(null);

  /**
   * Scroll the selected file node into view when selection changes
   */
  $effect(() => {
    if (selected && buttonEl !== null) {
      buttonEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });

  type FileStatus =
    | "added"
    | "modified"
    | "deleted"
    | "untracked"
    | "ignored"
    | undefined;

  /**
   * Get status badge text based on file status
   */
  function getStatusBadge(status: FileStatus): string {
    if (status === undefined) return "";

    switch (status) {
      case "added":
        return "[+]";
      case "modified":
        return "[M]";
      case "deleted":
        return "[-]";
      case "untracked":
        return "[?]";
      case "ignored":
        return "[I]";
      default:
        return "";
    }
  }

  /**
   * Get status badge color class based on file status
   */
  function getStatusBadgeColor(status: FileStatus): string {
    if (status === undefined) return "";

    switch (status) {
      case "added":
        return "text-success-fg";
      case "modified":
        return "text-attention-fg";
      case "deleted":
        return "text-danger-fg";
      case "untracked":
        return "text-success-fg";
      case "ignored":
        return "text-text-quaternary";
      default:
        return "";
    }
  }

  /**
   * Get background class for the entire file-node row based on diff status
   */
  function getStatusBackgroundClass(status: FileStatus): string {
    if (status === undefined) return "";

    switch (status) {
      case "added":
        return "status-added";
      case "modified":
        return "status-modified";
      case "deleted":
        return "status-deleted";
      case "untracked":
        return "status-untracked";
      case "ignored":
        return "status-ignored";
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
  bind:this={buttonEl}
  type="button"
  class="file-node group/filenode w-full text-left px-4 py-1 focus:outline-none transition-colors min-h-[28px] flex items-center gap-1.5 {getStatusBackgroundClass(
    node.status,
  )}"
  class:bg-accent-subtle={selected && !node.status}
  class:border-l-4={selected}
  class:border-accent-emphasis={selected}
  style="padding-left: {leftPadding}rem"
  onclick={onSelect}
  draggable="true"
  ondragstart={(e: DragEvent) => {
    e.dataTransfer?.setData("application/x-qraftbox-path", node.path);
    e.dataTransfer?.setData("text/plain", node.path);
  }}
  aria-label="Select file {node.name}"
  aria-current={selected ? "true" : undefined}
>
  <!-- File Icon -->
  <svg
    class="file-icon w-3.5 h-3.5 text-text-tertiary shrink-0"
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
  <span class="file-name text-text-primary text-xs truncate flex-1">
    {node.name}
  </span>

  <!-- Binary Badge -->
  {#if node.isBinary === true}
    <span
      class="text-[10px] font-medium text-text-tertiary bg-bg-tertiary px-1 rounded shrink-0"
      aria-label="Binary file"
    >
      BIN
    </span>
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

  .file-node:not(.status-added):not(.status-modified):not(.status-deleted):not(
      .status-untracked
    ):not(.status-ignored):hover {
    background-color: var(--color-bg-tertiary);
  }

  .file-node:not(.status-added):not(.status-modified):not(.status-deleted):not(
      .status-untracked
    ):not(.status-ignored):active {
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

  .file-node.status-untracked {
    background-color: var(--color-diff-add-bg);
  }

  .file-node.status-untracked:hover,
  .file-node.status-untracked:active {
    background-color: var(--color-diff-add-word);
  }

  .file-node.status-ignored {
    opacity: 0.5;
  }

  .file-node.status-ignored:hover,
  .file-node.status-ignored:active {
    background-color: var(--color-bg-tertiary);
    opacity: 0.7;
  }
</style>
