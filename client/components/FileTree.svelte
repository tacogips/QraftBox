<script lang="ts">
  import type { FileNode } from "../src/stores/files";
  import FileNodeComponent from "./file-tree/FileNode.svelte";
  import StatusBadge from "./file-tree/StatusBadge.svelte";

  /**
   * FileTree component properties
   */
  interface Props {
    /**
     * Root file tree node
     */
    tree: FileNode;

    /**
     * Display mode: 'diff' shows only changed files, 'all' shows all files
     */
    mode: "diff" | "all";

    /**
     * Currently selected file path (null if none)
     */
    selectedPath: string | null;

    /**
     * Callback when a file is selected
     */
    onFileSelect: (path: string) => void;

    /**
     * Callback when display mode changes
     */
    onModeChange: (mode: "diff" | "all") => void;
  }

  const { tree, mode, selectedPath, onFileSelect, onModeChange }: Props =
    $props();

  /**
   * Track expanded directories (path -> expanded state)
   */
  let expandedPaths = $state<Set<string>>(new Set());

  /**
   * Toggle directory expansion
   */
  function toggleDirectory(path: string): void {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    expandedPaths = newExpanded;
  }

  /**
   * Check if a directory is expanded
   */
  function isExpanded(path: string): boolean {
    return expandedPaths.has(path);
  }

  /**
   * Filter tree based on mode (recursive)
   * In 'diff' mode, only show files/directories with changes
   */
  function filterTree(node: FileNode): FileNode | null {
    if (mode === "all") {
      return node;
    }

    // In 'diff' mode, show files with status or directories with changed children
    if (node.isDirectory) {
      if (!node.children) {
        return null;
      }

      const filteredChildren = node.children
        .map((child) => filterTree(child))
        .filter((child): child is FileNode => child !== null);

      if (filteredChildren.length === 0) {
        return null;
      }

      return {
        ...node,
        children: filteredChildren,
      };
    } else {
      // Show files with status
      return node.status !== undefined ? node : null;
    }
  }

  /**
   * Check if a directory has any changed children (recursive)
   */
  function hasChangedChildren(node: FileNode): boolean {
    if (!node.isDirectory || !node.children) {
      return false;
    }

    for (const child of node.children) {
      if (child.status !== undefined) {
        return true;
      }
      if (child.isDirectory && hasChangedChildren(child)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Count files by status (recursive)
   */
  function countFiles(node: FileNode): { changed: number; total: number } {
    let changed = 0;
    let total = 0;

    function traverse(n: FileNode): void {
      if (n.isDirectory && n.children) {
        for (const child of n.children) {
          traverse(child);
        }
      } else {
        total++;
        if (n.status !== undefined) {
          changed++;
        }
      }
    }

    traverse(node);
    return { changed, total };
  }

  /**
   * Render a tree node (file or directory) recursively
   */
  function renderNode(node: FileNode, depth: number): void {
    // This is handled by the template
  }

  /**
   * Get filtered tree for display
   */
  const filteredTree = $derived.by(() => filterTree(tree));

  /**
   * Get file counts
   */
  const fileCounts = $derived.by(() => countFiles(tree));
</script>

<!-- File Tree Container -->
<div class="file-tree flex flex-col h-full bg-white" role="tree">
  <!-- Mode Toggle Header -->
  <div
    class="file-tree-header border-b border-gray-200 p-4 flex items-center justify-between"
  >
    <h2 class="text-lg font-semibold text-gray-900">Files</h2>

    <div
      class="mode-toggle flex gap-2"
      role="group"
      aria-label="File display mode"
    >
      <!-- Diff Only Button -->
      <button
        type="button"
        class="px-3 py-2 text-sm font-medium rounded-md transition-colors min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        class:bg-blue-600={mode === "diff"}
        class:text-white={mode === "diff"}
        class:bg-gray-100={mode !== "diff"}
        class:text-gray-700={mode !== "diff"}
        class:hover:bg-gray-200={mode !== "diff"}
        onclick={() => onModeChange("diff")}
        aria-pressed={mode === "diff"}
        aria-label="Show only changed files"
      >
        Diff Only ({fileCounts.changed})
      </button>

      <!-- All Files Button -->
      <button
        type="button"
        class="px-3 py-2 text-sm font-medium rounded-md transition-colors min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        class:bg-blue-600={mode === "all"}
        class:text-white={mode === "all"}
        class:bg-gray-100={mode !== "all"}
        class:text-gray-700={mode !== "all"}
        class:hover:bg-gray-200={mode !== "all"}
        onclick={() => onModeChange("all")}
        aria-pressed={mode === "all"}
        aria-label="Show all files"
      >
        All Files ({fileCounts.total})
      </button>
    </div>
  </div>

  <!-- Tree Content -->
  <div class="file-tree-content flex-1 overflow-y-auto">
    {#if filteredTree === null}
      <!-- Empty State -->
      <div
        class="empty-state flex flex-col items-center justify-center h-full p-8 text-center"
      >
        <svg
          class="w-16 h-16 text-gray-300 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          ></path>
        </svg>
        <p class="text-gray-500 text-sm">No files to display</p>
      </div>
    {:else}
      <!-- Render Tree Nodes -->
      {#each filteredTree.children ?? [] as node (node.path)}
        {@render treeNode(node, 0)}
      {/each}
    {/if}
  </div>
</div>

<!-- Recursive Tree Node Snippet -->
{#snippet treeNode(node: FileNode, depth: number)}
  {#if node.isDirectory}
    <!-- Directory Node -->
    <div
      class="directory-node"
      role="treeitem"
      aria-expanded={isExpanded(node.path)}
    >
      <button
        type="button"
        class="directory-button w-full text-left px-4 py-3 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none transition-colors min-h-[48px] flex items-center gap-2"
        style="padding-left: {1 + depth * 1.5}rem"
        onclick={() => toggleDirectory(node.path)}
        aria-label="Toggle directory {node.name}"
      >
        <!-- Chevron Icon -->
        <svg
          class="chevron w-4 h-4 text-gray-400 shrink-0 transition-transform"
          class:rotate-90={isExpanded(node.path)}
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
          class="folder-icon w-5 h-5 text-gray-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          ></path>
        </svg>

        <!-- Directory Name -->
        <span class="directory-name text-gray-900 truncate flex-1">
          {node.name}
        </span>

        <!-- Changed Indicator -->
        {#if hasChangedChildren(node)}
          <span
            class="changed-indicator text-xs text-blue-600 shrink-0"
            aria-label="Contains changed files"
          >
            •
          </span>
        {/if}
      </button>

      <!-- Children (if expanded) -->
      {#if isExpanded(node.path) && node.children}
        {#each node.children as child (child.path)}
          {@render treeNode(child, depth + 1)}
        {/each}
      {/if}
    </div>
  {:else}
    <!-- File Node -->
    <FileNodeComponent
      {node}
      {depth}
      selected={selectedPath === node.path}
      onSelect={() => onFileSelect(node.path)}
    />
  {/if}
{/snippet}

<style>
  /**
   * File tree styling
   * - Touch-friendly 48px minimum heights for interactive elements
   * - Clear visual feedback on hover/focus
   * - Smooth transitions for expand/collapse
   */
  .file-tree {
    -webkit-tap-highlight-color: transparent;
  }

  .chevron {
    transition: transform 0.2s ease-in-out;
  }

  .directory-button {
    cursor: pointer;
  }

  .directory-button:active {
    background-color: rgb(243 244 246); /* gray-100 */
  }
</style>
