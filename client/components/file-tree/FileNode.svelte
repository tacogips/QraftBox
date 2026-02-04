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
        return "text-green-600";
      case "modified":
        return "text-yellow-600";
      case "deleted":
        return "text-red-600";
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
  class="file-node w-full text-left px-4 py-3 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none transition-colors min-h-[48px] flex items-center gap-2"
  class:bg-blue-50={selected}
  class:border-l-4={selected}
  class:border-blue-600={selected}
  style="padding-left: {leftPadding}rem"
  onclick={onSelect}
  aria-label="Select file {node.name}"
  aria-selected={selected}
>
  <!-- File Icon -->
  <svg
    class="file-icon w-5 h-5 text-gray-400 shrink-0"
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
  <span class="file-name text-gray-900 truncate flex-1">
    {node.name}
  </span>

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

  .file-node:active {
    background-color: rgb(243 244 246); /* gray-100 */
  }
</style>
