<script lang="ts">
  import type { FileNode } from "../../src/stores/files";

  /**
   * DirectoryNode component properties
   */
  interface Props {
    /**
     * Directory node to render
     */
    node: FileNode;

    /**
     * Indentation depth level (0-based)
     */
    depth: number;

    /**
     * Whether this directory is currently expanded
     */
    expanded: boolean;

    /**
     * Callback when the directory is toggled (expand/collapse)
     */
    onToggle: () => void;

    /**
     * Whether this directory contains any changed files in its subtree
     */
    hasChangedChildren: boolean;
  }

  const { node, depth, expanded, onToggle, hasChangedChildren }: Props =
    $props();

  /**
   * Calculate left padding based on depth
   * Each depth level adds 1.5rem (24px)
   */
  const leftPadding = $derived.by(() => {
    // Base padding: 1rem
    const basePadding = 1;
    // Each depth level adds 1.5rem (24px)
    const depthPadding = depth * 1.5;
    return basePadding + depthPadding;
  });

  /**
   * Calculate rotation for chevron icon based on expanded state
   */
  const chevronRotation = $derived(expanded ? "rotate-90" : "rotate-0");
</script>

<!-- Directory Node Button -->
<button
  type="button"
  class="directory-node w-full text-left px-4 py-3 hover:bg-bg-secondary focus:bg-bg-secondary focus:outline-none transition-colors min-h-[48px] flex items-center gap-2"
  style="padding-left: {leftPadding}rem"
  onclick={onToggle}
  aria-label="{expanded ? 'Collapse' : 'Expand'} directory {node.name}"
  aria-expanded={expanded}
>
  <!-- Chevron Icon (expand/collapse indicator) -->
  <svg
    class="chevron-icon w-4 h-4 text-text-secondary shrink-0 transition-transform duration-200 {chevronRotation}"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M9 5l7 7-7 7"
    ></path>
  </svg>

  <!-- Folder Icon -->
  <svg
    class="folder-icon w-5 h-5 text-text-tertiary shrink-0"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    {#if expanded}
      <!-- Open folder icon -->
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
      ></path>
    {:else}
      <!-- Closed folder icon -->
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      ></path>
    {/if}
  </svg>

  <!-- Directory Name -->
  <span class="directory-name text-text-primary truncate flex-1">
    {node.name}
  </span>

  <!-- Change Indicator Dot (shown when directory contains changed files) -->
  {#if hasChangedChildren}
    <span
      class="change-indicator w-2 h-2 rounded-full bg-accent-emphasis shrink-0"
      aria-label="Contains changed files"
      title="Contains changed files"
    ></span>
  {/if}
</button>

<style>
  /**
 * Directory node styling
 * - Touch-friendly 48px minimum height
 * - Clear visual feedback on hover/focus
 * - Smooth chevron rotation animation
 * - Change indicator for directories with modified files
 */
  .directory-node {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .directory-node:active {
    background-color: var(--color-bg-pressed);
  }

  /**
 * Chevron animation handled via transform transition
 * Rotation classes applied dynamically via $derived
 */
  .chevron-icon {
    transform-origin: center;
  }
</style>
