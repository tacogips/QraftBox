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

    /**
     * Number of changed files (always from diff, independent of tree)
     */
    changedCount?: number;
  }

  const { tree, mode, selectedPath, onFileSelect, onModeChange, changedCount = undefined }: Props =
    $props();

  /**
   * Track expanded directories (path -> expanded state)
   */
  let expandedPaths = $state<Set<string>>(new Set());

  /**
   * Filename filter text
   */
  let filterText = $state("");

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
    if (filterText !== "") {
      // When filter is active, auto-expand directories that contain matching files
      return filterMatchPaths.has(path);
    }
    return expandedPaths.has(path);
  }

  /**
   * Check if a file node matches the filter (case-insensitive partial match on name)
   */
  function matchesFilter(node: FileNode): boolean {
    if (filterText === "") return true;
    const lower = filterText.toLowerCase();
    return node.name.toLowerCase().includes(lower);
  }

  /**
   * Collect directory paths that contain matching files (for auto-expand)
   */
  function collectMatchPaths(node: FileNode, ancestors: string[]): Set<string> {
    const result = new Set<string>();
    if (node.isDirectory && node.children) {
      for (const child of node.children) {
        const childResult = collectMatchPaths(child, [...ancestors, node.path]);
        for (const p of childResult) {
          result.add(p);
        }
      }
      // If any descendant matched, mark this directory
      if (result.size > 0) {
        result.add(node.path);
      }
    } else {
      if (matchesFilter(node)) {
        // Mark all ancestor directories for expansion
        for (const a of ancestors) {
          result.add(a);
        }
        result.add(node.path);
      }
    }
    return result;
  }

  const filterMatchPaths = $derived.by(() => {
    if (filterText === "") return new Set<string>();
    return collectMatchPaths(tree, []);
  });

  /**
   * Filter tree based on mode and filename filter (recursive)
   */
  function filterTree(node: FileNode): FileNode | null {
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
      // Apply mode filter
      if (mode === "diff" && node.status === undefined) {
        return null;
      }
      // Apply filename filter
      if (filterText !== "" && !matchesFilter(node)) {
        return null;
      }
      return node;
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
   * Count matching files in the filtered tree
   */
  const filterMatchCount = $derived.by(() => {
    if (filterText === "") return 0;
    function countFiles(node: FileNode | null): number {
      if (node === null) return 0;
      if (node.isDirectory && node.children) {
        let sum = 0;
        for (const child of node.children) {
          sum += countFiles(filterTree(child));
        }
        return sum;
      }
      return 1;
    }
    return countFiles(filteredTree);
  });

  /**
   * Get file counts
   */
  const fileCounts = $derived.by(() => countFiles(tree));
</script>

<!-- File Tree Container -->
<div class="file-tree flex flex-col h-full bg-bg-secondary" role="tree">
  <!-- Filter Bar with Mode Toggle -->
  <div class="px-2 py-1.5 border-b border-border-default flex items-center gap-1.5">
    <!-- Mode Toggle (single button) -->
    <button
      type="button"
      class="mode-toggle-btn"
      class:mode-toggle-btn--diff={mode === "diff"}
      onclick={() => onModeChange(mode === "diff" ? "all" : "diff")}
      aria-label={mode === "diff" ? `Diff only (${changedCount ?? fileCounts.changed} changed) - click for all` : `All files - click for diff only`}
      title={mode === "diff" ? `Diff (${changedCount ?? fileCounts.changed})` : "All"}
    >
      {#if mode === "diff"}
        <!-- Diff icon: file with +/- -->
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 1.75C2 .784 2.784 0 3.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H3.75zM8 7.25a.75.75 0 01.75.75v1.25H10a.75.75 0 010 1.5H8.75V12a.75.75 0 01-1.5 0v-1.25H6a.75.75 0 010-1.5h1.25V8A.75.75 0 018 7.25zM6 4.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z"/>
        </svg>
        <span class="mode-toggle-label">{changedCount ?? fileCounts.changed}</span>
      {:else}
        <!-- All files icon: list -->
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 2.75A.75.75 0 012.75 2h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 2.75zm0 5A.75.75 0 012.75 7h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 7.75zM2.75 12h10.5a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5z"/>
        </svg>
        <span class="mode-toggle-label">All</span>
      {/if}
    </button>

    <!-- Filter Input -->
    <div class="relative flex-1">
      <svg
        class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        ></path>
      </svg>
      <input
        type="text"
        class="w-full pl-7 pr-7 py-1 text-xs bg-bg-primary text-text-primary border border-border-default rounded
               placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-emphasis focus:border-accent-emphasis"
        placeholder="Filter files..."
        bind:value={filterText}
        onkeydown={(e) => { if (e.key === "Escape") { filterText = ""; } }}
      />
      {#if filterText !== ""}
        <button
          type="button"
          class="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center
                 text-text-tertiary hover:text-text-primary rounded"
          onclick={() => { filterText = ""; }}
          aria-label="Clear filter"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      {/if}
    </div>
    {#if filterText !== ""}
      <span class="text-[10px] text-text-tertiary whitespace-nowrap">{filterMatchCount}</span>
    {/if}
  </div>

  <!-- Tree Content -->
  <div class="file-tree-content flex-1 overflow-y-auto">
    {#if filteredTree === null}
      <!-- Empty State -->
      <div
        class="empty-state flex flex-col items-center justify-center h-full p-8 text-center"
      >
        <svg
          class="w-16 h-16 text-text-tertiary mb-4"
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
        <p class="text-text-secondary text-sm">No files to display</p>
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
        class="directory-button w-full text-left px-4 py-3 hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none transition-colors min-h-[48px] flex items-center gap-2"
        style="padding-left: {1 + depth * 1.5}rem"
        onclick={() => toggleDirectory(node.path)}
        aria-label="Toggle directory {node.name}"
      >
        <!-- Chevron Icon -->
        <svg
          class="chevron w-4 h-4 text-text-tertiary shrink-0 transition-transform"
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
          class="folder-icon w-5 h-5 text-text-tertiary shrink-0"
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
        <span class="directory-name text-text-primary truncate flex-1">
          {node.name}
        </span>

        <!-- Changed Indicator -->
        {#if hasChangedChildren(node)}
          <span
            class="changed-indicator text-xs text-accent-fg shrink-0"
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
    background-color: var(--color-bg-tertiary);
  }

  /* Single toggle button */
  .mode-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--color-border-muted);
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .mode-toggle-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .mode-toggle-btn--diff {
    border-color: var(--color-accent-muted);
    color: var(--color-accent-fg);
  }

  .mode-toggle-btn--diff:hover {
    color: var(--color-accent-fg);
  }

  .mode-toggle-btn:focus-visible {
    outline: 2px solid var(--color-accent-fg);
    outline-offset: -1px;
    z-index: 1;
  }

  .mode-toggle-label {
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
  }
</style>
