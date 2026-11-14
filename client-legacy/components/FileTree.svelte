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

    /**
     * Context ID for fetching git status (uncommitted count)
     */
    contextId?: string | null;

    /**
     * Whether git-ignored files are currently shown
     */
    showIgnored?: boolean;

    /**
     * Whether all files (including non-git) are currently shown
     */
    showAllFiles?: boolean;

    /**
     * Callback when show-ignored toggle changes
     */
    onShowIgnoredChange?: (value: boolean) => void;

    /**
     * Callback when show-all-files toggle changes
     */
    onShowAllFilesChange?: (value: boolean) => void;

    /**
     * Callback to narrow the sidebar width
     */
    onNarrow?: () => void;

    /**
     * Callback to widen the sidebar width
     */
    onWiden?: () => void;

    /**
     * Whether the sidebar can be narrowed further
     */
    canNarrow?: boolean;

    /**
     * Whether the sidebar can be widened further
     */
    canWiden?: boolean;

    /**
     * Callback to load children of a directory (lazy loading)
     */
    onDirectoryExpand?: (path: string) => Promise<void>;

    /**
     * Callback to load the full tree (for expand-all and filtering).
     * Returns the full tree for immediate use.
     */
    onLoadFullTree?: () => Promise<FileNode | undefined>;

    /**
     * Callback to reload/refresh the file tree data
     */
    onReload?: () => void;

    /**
     * Current project directory path shown above file tree
     */
    currentDirectory?: string;

    /**
     * Increment this value to force one-shot expand-all behavior.
     */
    expandAllTrigger?: number;
  }

  const {
    tree,
    mode,
    selectedPath,
    onFileSelect,
    onModeChange,
    changedCount = undefined,
    contextId = null,
    showIgnored = false,
    showAllFiles = false,
    onShowIgnoredChange = undefined,
    onShowAllFilesChange = undefined,
    onNarrow = undefined,
    onWiden = undefined,
    canNarrow = true,
    canWiden = true,
    onDirectoryExpand = undefined,
    onLoadFullTree = undefined,
    onReload = undefined,
    currentDirectory = "",
    expandAllTrigger = 0,
  }: Props = $props();

  const MAX_TRUNCATED_DIRECTORY_CHARS = 52;

  let showFullCurrentDirectory = $state(false);
  let copyStatus = $state<"idle" | "copied" | "failed">("idle");
  let copyStatusResetTimer: ReturnType<typeof setTimeout> | null = null;

  function truncateFromLeft(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }
    return `...${value.slice(-(maxChars - 3))}`;
  }

  const hasCurrentDirectory = $derived(currentDirectory.trim().length > 0);
  const isDirectoryLong = $derived(
    currentDirectory.length > MAX_TRUNCATED_DIRECTORY_CHARS,
  );
  const truncatedCurrentDirectory = $derived.by(() =>
    truncateFromLeft(currentDirectory, MAX_TRUNCATED_DIRECTORY_CHARS),
  );

  async function copyCurrentDirectory(): Promise<void> {
    if (!hasCurrentDirectory) {
      return;
    }

    try {
      if (
        typeof navigator.clipboard !== "undefined" &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(currentDirectory);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = currentDirectory;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "absolute";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!copied) {
          throw new Error("Copy command failed");
        }
      }

      copyStatus = "copied";
    } catch {
      copyStatus = "failed";
    }

    if (copyStatusResetTimer !== null) {
      clearTimeout(copyStatusResetTimer);
    }

    copyStatusResetTimer = setTimeout(() => {
      copyStatus = "idle";
      copyStatusResetTimer = null;
    }, 1200);
  }

  $effect(() => {
    return () => {
      if (copyStatusResetTimer !== null) {
        clearTimeout(copyStatusResetTimer);
      }
    };
  });

  /**
   * Track expanded directories (path -> expanded state)
   */
  let expandedPaths = $state<Set<string>>(new Set());

  /**
   * Filename filter text
   */
  let filterText = $state("");

  /**
   * Status filter (null means no status filter)
   */
  let statusFilter = $state<"added" | "modified" | "deleted" | null>(null);

  /**
   * Status dropdown open state
   */
  let statusDropdownOpen = $state(false);

  /**
   * Paths of directories currently being loaded
   */
  let loadingPaths = $state<Set<string>>(new Set());

  /**
   * Uncommitted file count from git status
   */
  let uncommittedCount = $state(0);

  /**
   * Fetch git status for uncommitted count
   */
  async function fetchUncommittedCount(): Promise<void> {
    if (contextId === null || contextId === undefined) return;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/status`);
      if (resp.ok) {
        const data = (await resp.json()) as {
          staged: readonly string[];
          modified: readonly string[];
          untracked: readonly string[];
          conflicts: readonly string[];
        };
        uncommittedCount =
          data.staged.length +
          data.modified.length +
          data.untracked.length +
          data.conflicts.length;
      }
    } catch {
      // Non-critical
    }
  }

  /**
   * Clear status filter when switching to "all" mode
   * In "all" mode, status filters would hide most files (unchanged files have no status)
   */
  let prevMode: "diff" | "all" = mode;
  $effect(() => {
    if (mode !== prevMode) {
      if (mode === "all") {
        statusFilter = null;
      }
      prevMode = mode;
    }
  });

  $effect(() => {
    void fetchUncommittedCount();
    const intervalId = setInterval(() => {
      void fetchUncommittedCount();
    }, 30000);
    return () => {
      clearInterval(intervalId);
    };
  });

  /**
   * Toggle directory expansion, triggering lazy load if children are not yet loaded
   */
  function toggleDirectory(path: string): void {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
      expandedPaths = newExpanded;
    } else {
      newExpanded.add(path);
      expandedPaths = newExpanded;

      // Check if this directory needs lazy loading
      if (onDirectoryExpand !== undefined) {
        const node = findNodeInTree(tree, path);
        if (node !== null && node.isDirectory && node.children === undefined) {
          const newLoading = new Set(loadingPaths);
          newLoading.add(path);
          loadingPaths = newLoading;

          void onDirectoryExpand(path).finally(() => {
            const updated = new Set(loadingPaths);
            updated.delete(path);
            loadingPaths = updated;
          });
        }
      }
    }
  }

  /**
   * Find a node in the tree by path
   */
  function findNodeInTree(node: FileNode, targetPath: string): FileNode | null {
    if (node.path === targetPath) return node;
    if (!node.isDirectory || node.children === undefined) return null;
    for (const child of node.children) {
      const found = findNodeInTree(child, targetPath);
      if (found !== null) return found;
    }
    return null;
  }

  /**
   * Check if the tree has any directories with unloaded children
   */
  function hasUnloadedDirectories(node: FileNode): boolean {
    if (node.isDirectory) {
      if (node.children === undefined) return true;
      for (const child of node.children) {
        if (hasUnloadedDirectories(child)) return true;
      }
    }
    return false;
  }

  /**
   * Collect all directory paths from a tree node (recursive)
   */
  function collectDirectoryPaths(node: FileNode): string[] {
    const paths: string[] = [];
    if (node.isDirectory && node.children) {
      if (node.path !== "") {
        paths.push(node.path);
      }
      for (const child of node.children) {
        paths.push(...collectDirectoryPaths(child));
      }
    }
    return paths;
  }

  /**
   * Expand all directories in the current tree.
   * If tree has unloaded directories, loads the full tree first.
   */
  async function expandAll(): Promise<void> {
    let treeForExpand: FileNode | undefined;
    if (onLoadFullTree !== undefined && hasUnloadedDirectories(tree)) {
      treeForExpand = await onLoadFullTree();
    }
    const source = treeForExpand ?? filteredTree ?? tree;
    expandedPaths = new Set(collectDirectoryPaths(source));
  }

  let prevExpandAllTrigger = expandAllTrigger;
  $effect(() => {
    if (expandAllTrigger === prevExpandAllTrigger) {
      return;
    }
    prevExpandAllTrigger = expandAllTrigger;
    void expandAll();
  });

  /**
   * Collapse all directories
   */
  function collapseAll(): void {
    expandedPaths = new Set();
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
      // If directory name itself matches, mark it and all ancestors
      if (matchesFilter(node)) {
        for (const a of ancestors) {
          result.add(a);
        }
        result.add(node.path);
      }

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
   * When filter text is entered and tree has unloaded directories,
   * load the full tree so filtering works across all files.
   */
  $effect(() => {
    if (
      filterText !== "" &&
      hasUnloadedDirectories(tree) &&
      onLoadFullTree !== undefined
    ) {
      void onLoadFullTree();
    }
  });

  /**
   * Filter tree based on mode and filename filter (recursive)
   */
  function filterTree(
    node: FileNode,
    ancestorMatched: boolean = false,
  ): FileNode | null {
    if (node.isDirectory) {
      if (node.children === undefined) {
        // Not loaded yet (lazy loading) - keep in "all" mode with no active filters
        if (mode === "diff" || filterText !== "" || statusFilter !== null) {
          return null;
        }
        return node;
      }

      if (node.children.length === 0) {
        // Empty directory - keep visible in "all" mode with no active filters
        if (mode === "diff" || filterText !== "" || statusFilter !== null) {
          return null;
        }
        return node;
      }

      const dirNameMatches = filterText !== "" && matchesFilter(node);
      const skipNameFilter = ancestorMatched || dirNameMatches;

      const filteredChildren = node.children
        .map((child) => filterTree(child, skipNameFilter))
        .filter((child): child is FileNode => child !== null);

      if (filteredChildren.length === 0) {
        return null;
      }

      return {
        ...node,
        children: filteredChildren,
      };
    } else {
      // Apply mode filter: in diff mode, show only files with change status
      if (
        mode === "diff" &&
        (node.status === undefined || node.status === "ignored")
      ) {
        return null;
      }
      // Apply status filter
      if (statusFilter !== null && node.status !== statusFilter) {
        return null;
      }
      // Apply filename filter (skip if an ancestor directory matched)
      if (!ancestorMatched && filterText !== "" && !matchesFilter(node)) {
        return null;
      }
      return node;
    }
  }

  /**
   * Check if a directory has any changed children (recursive).
   * For lazy-loaded directories (children undefined), checks if the directory
   * itself was marked with a status by annotateTreeWithStatus.
   */
  function hasChangedChildren(node: FileNode): boolean {
    if (!node.isDirectory) {
      return false;
    }

    // Lazy-loaded directory marked by annotateTreeWithStatus
    if (node.children === undefined) {
      return node.status !== undefined;
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
    function countMatches(node: FileNode): number {
      let count = 0;
      if (matchesFilter(node)) {
        count = 1;
      }
      if (node.isDirectory && node.children) {
        for (const child of node.children) {
          count += countMatches(child);
        }
      }
      return count;
    }
    return countMatches(tree);
  });

  /**
   * Get file counts
   */
  const fileCounts = $derived.by(() => countFiles(tree));

  /**
   * Calculate status counts from the tree
   */
  const statusCounts = $derived.by(() => {
    let added = 0;
    let modified = 0;
    let deleted = 0;
    function traverse(n: FileNode): void {
      if (n.isDirectory && n.children) {
        for (const child of n.children) {
          traverse(child);
        }
      } else {
        if (n.status === "added") {
          added++;
        } else if (n.status === "modified") {
          modified++;
        } else if (n.status === "deleted") {
          deleted++;
        }
      }
    }
    traverse(tree);
    return { added, modified, deleted };
  });

  /**
   * Auto-expand ancestor directories when selectedPath changes
   * so that the selected file is always visible in the tree.
   * Only runs when selectedPath actually changes (not on expandedPaths changes).
   * Skips the first change so the tree starts fully collapsed on load.
   */
  let prevSelectedPath: string | null = null;
  let initialSelectionSkipped = false;
  $effect(() => {
    const current = selectedPath;
    if (current === prevSelectedPath) return;
    prevSelectedPath = current;
    if (current === null) return;
    if (!initialSelectionSkipped) {
      initialSelectionSkipped = true;
      return;
    }
    const segments = current.split("/");
    if (segments.length <= 1) return;
    const newExpanded = new Set(expandedPaths);
    let changed = false;
    for (let i = 1; i < segments.length; i++) {
      const ancestor = segments.slice(0, i).join("/");
      if (!newExpanded.has(ancestor)) {
        newExpanded.add(ancestor);
        changed = true;
      }
    }
    if (changed) {
      expandedPaths = newExpanded;
    }
  });

  /**
   * Click outside handler to close dropdown
   */
  $effect(() => {
    if (!statusDropdownOpen) return;

    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as HTMLElement;
      if (!target.closest(".status-filter-container")) {
        statusDropdownOpen = false;
      }
    }

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  });
</script>

<!-- File Tree Container -->
<div class="file-tree flex flex-col h-full bg-bg-secondary" role="tree">
  {#if hasCurrentDirectory}
    <div
      class="px-2 py-1.5 border-b border-border-default flex items-start gap-1.5"
    >
      <div class="min-w-0 flex-1">
        <div
          class="text-xs text-text-secondary font-mono leading-4"
          class:truncate={!showFullCurrentDirectory}
          class:break-all={showFullCurrentDirectory}
          title={currentDirectory}
        >
          {showFullCurrentDirectory
            ? currentDirectory
            : truncatedCurrentDirectory}
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0 pt-0.5">
        <button
          type="button"
          class="w-5 h-5 flex items-center justify-center rounded transition-colors text-text-tertiary hover:text-text-primary"
          onclick={copyCurrentDirectory}
          aria-label="Copy current directory"
          title={copyStatus === "copied"
            ? "Copied"
            : copyStatus === "failed"
              ? "Copy failed"
              : "Copy current directory"}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M0 4.75C0 3.784.784 3 1.75 3h7.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 019.25 14h-7.5A1.75 1.75 0 010 12.25v-7.5zM1.75 4.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"
            />
            <path
              d="M4.75 1A1.75 1.75 0 003 2.75V3h1.5v-.25a.25.25 0 01.25-.25h7.5a.25.25 0 01.25.25v7.5a.25.25 0 01-.25.25H12V12h.25A1.75 1.75 0 0014 10.25v-7.5A1.75 1.75 0 0012.25 1h-7.5z"
            />
          </svg>
        </button>
        {#if isDirectoryLong}
          <button
            type="button"
            class="w-5 h-5 flex items-center justify-center rounded transition-colors text-text-tertiary hover:text-text-primary"
            onclick={() => {
              showFullCurrentDirectory = !showFullCurrentDirectory;
            }}
            aria-label={showFullCurrentDirectory
              ? "Collapse directory path"
              : "Show full directory path"}
            title={showFullCurrentDirectory
              ? "Collapse path"
              : "Show full path"}
            aria-pressed={showFullCurrentDirectory}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              {#if showFullCurrentDirectory}
                <path
                  d="M8.5 3.5a.75.75 0 00-1.5 0v2.75A.75.75 0 007.75 7h2.75a.75.75 0 000-1.5H9.56l2.22-2.22a.75.75 0 00-1.06-1.06L8.5 4.44V3.5zM7.5 12.5a.75.75 0 001.5 0V9.75A.75.75 0 008.25 9H5.5a.75.75 0 000 1.5h.94l-2.22 2.22a.75.75 0 101.06 1.06l2.22-2.22v.94z"
                />
              {:else}
                <path
                  d="M6.44 4.44L4.22 2.22a.75.75 0 10-1.06 1.06L5.38 5.5H4.5a.75.75 0 000 1.5h2.75A.75.75 0 008 6.25V3.5a.75.75 0 00-1.5 0v.94zM9.56 11.56l2.22 2.22a.75.75 0 001.06-1.06L10.62 10.5h.88a.75.75 0 000-1.5H8.75a.75.75 0 00-.75.75v2.75a.75.75 0 001.5 0v-.94z"
                />
              {/if}
            </svg>
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Filter Bar with Mode Toggle -->
  <div
    class="px-2 py-1.5 border-b border-border-default flex items-center gap-1.5"
  >
    <!-- Filter Input -->
    <div class="relative flex-1 min-w-0">
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
        onkeydown={(e) => {
          if (e.key === "Escape") {
            filterText = "";
          }
        }}
      />
      {#if filterText !== ""}
        <button
          type="button"
          class="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center
                 text-text-tertiary hover:text-text-primary rounded"
          onclick={() => {
            filterText = "";
          }}
          aria-label="Clear filter"
        >
          <svg
            class="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </button>
      {/if}
    </div>
    <!-- Mode Toggle (split button) -->
    <div class="status-filter-container relative flex-shrink-0">
      <div class="flex items-center">
        <button
          type="button"
          class="mode-toggle-btn"
          class:mode-toggle-btn--diff={mode === "diff"}
          class:mode-toggle-btn--filtered={statusFilter !== null}
          onclick={() => onModeChange(mode === "diff" ? "all" : "diff")}
          aria-label={mode === "diff"
            ? `Diff only (${changedCount ?? fileCounts.changed} changed) - click for all`
            : `All files - click for diff only`}
          title={mode === "diff"
            ? `Diff (${changedCount ?? fileCounts.changed})`
            : "All"}
        >
          {#if mode === "diff"}
            <!-- Diff icon: file with +/- -->
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M2 1.75C2 .784 2.784 0 3.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H3.75zM8 7.25a.75.75 0 01.75.75v1.25H10a.75.75 0 010 1.5H8.75V12a.75.75 0 01-1.5 0v-1.25H6a.75.75 0 010-1.5h1.25V8A.75.75 0 018 7.25zM6 4.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z"
              />
            </svg>
            <span class="mode-toggle-label">
              {#if statusFilter === "added"}
                <span class="text-success-fg">+{statusCounts.added}</span>
              {:else if statusFilter === "modified"}
                <span class="text-attention-fg">M{statusCounts.modified}</span>
              {:else if statusFilter === "deleted"}
                <span class="text-danger-fg">-{statusCounts.deleted}</span>
              {:else}
                {changedCount ?? fileCounts.changed}
              {/if}
            </span>
          {:else}
            <!-- All files icon: list -->
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M2 2.75A.75.75 0 012.75 2h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 2.75zm0 5A.75.75 0 012.75 7h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 7.75zM2.75 12h10.5a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5z"
              />
            </svg>
            <span class="mode-toggle-label">All</span>
          {/if}
        </button>
        <button
          type="button"
          class="status-filter-arrow"
          class:status-filter-arrow--open={statusDropdownOpen}
          class:status-filter-arrow--filtered={statusFilter !== null}
          onclick={() => (statusDropdownOpen = !statusDropdownOpen)}
          aria-label="Filter by status"
          aria-expanded={statusDropdownOpen}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"
            />
          </svg>
        </button>
      </div>

      <!-- Status Filter Dropdown -->
      {#if statusDropdownOpen}
        <div class="status-filter-dropdown">
          <button
            type="button"
            class="status-filter-option"
            class:status-filter-option--active={statusFilter === null}
            onclick={() => {
              statusFilter = null;
              statusDropdownOpen = false;
            }}
          >
            <span class="status-filter-option-check">
              {#if statusFilter === null}✓{/if}
            </span>
            <span class="status-filter-option-label">All</span>
            <span class="status-filter-option-count">{fileCounts.changed}</span>
          </button>
          <button
            type="button"
            class="status-filter-option"
            class:status-filter-option--active={statusFilter === "added"}
            onclick={() => {
              statusFilter = "added";
              statusDropdownOpen = false;
            }}
          >
            <span class="status-filter-option-check">
              {#if statusFilter === "added"}✓{/if}
            </span>
            <span class="status-filter-option-label text-success-fg"
              >Added (+)</span
            >
            <span class="status-filter-option-count">{statusCounts.added}</span>
          </button>
          <button
            type="button"
            class="status-filter-option"
            class:status-filter-option--active={statusFilter === "modified"}
            onclick={() => {
              statusFilter = "modified";
              statusDropdownOpen = false;
            }}
          >
            <span class="status-filter-option-check">
              {#if statusFilter === "modified"}✓{/if}
            </span>
            <span class="status-filter-option-label text-attention-fg"
              >Modified (M)</span
            >
            <span class="status-filter-option-count"
              >{statusCounts.modified}</span
            >
          </button>
          <button
            type="button"
            class="status-filter-option"
            class:status-filter-option--active={statusFilter === "deleted"}
            onclick={() => {
              statusFilter = "deleted";
              statusDropdownOpen = false;
            }}
          >
            <span class="status-filter-option-check">
              {#if statusFilter === "deleted"}✓{/if}
            </span>
            <span class="status-filter-option-label text-danger-fg"
              >Deleted (-)</span
            >
            <span class="status-filter-option-count"
              >{statusCounts.deleted}</span
            >
          </button>
        </div>
      {/if}
    </div>
    <div class="flex items-center gap-0.5 shrink-0">
      <!-- Expand all directories -->
      <button
        type="button"
        class="w-5 h-5 flex items-center justify-center text-text-tertiary hover:text-text-primary rounded transition-colors"
        onclick={expandAll}
        title="Expand all directories"
        aria-label="Expand all directories"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1" />
          <path d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8z" />
          <path d="M12 12v6" />
          <path d="M9 15h6" />
        </svg>
      </button>
      <!-- Collapse all directories -->
      <button
        type="button"
        class="w-5 h-5 flex items-center justify-center text-text-tertiary hover:text-text-primary rounded transition-colors"
        onclick={collapseAll}
        title="Collapse all directories"
        aria-label="Collapse all directories"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1" />
          <path d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8z" />
          <path d="M9 15h6" />
        </svg>
      </button>
    </div>
    {#if filterText !== ""}
      <span class="text-[10px] text-text-tertiary whitespace-nowrap"
        >{filterMatchCount}</span
      >
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

  <!-- Bottom Status Panel -->
  <div
    class="shrink-0 h-6 border-t border-border-default flex items-center px-2 bg-bg-tertiary gap-1 min-w-0 overflow-hidden"
  >
    {#if onReload}
      <button
        type="button"
        class="w-5 h-5 flex items-center justify-center rounded transition-colors text-text-tertiary hover:text-text-primary shrink-0"
        onclick={onReload}
        title="Reload file tree"
        aria-label="Reload file tree"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0114.95 7.16a.75.75 0 11-1.49.178A5.501 5.501 0 008 2.5zM1.705 8.005a.75.75 0 01.834.656 5.501 5.501 0 009.592 2.97l-1.204-1.204a.25.25 0 01.177-.427h3.646a.25.25 0 01.25.25v3.646a.25.25 0 01-.427.177l-1.38-1.38A7.001 7.001 0 011.05 8.84a.75.75 0 01.656-.834z"
          />
        </svg>
      </button>
    {/if}
    {#if uncommittedCount > 0}
      <span class="text-[11px] text-attention-fg font-medium truncate min-w-0">
        {uncommittedCount} uncommitted
      </span>
    {/if}
    <div class="ml-auto flex items-center gap-0.5 shrink-0">
      <!-- Narrow sidebar -->
      {#if onNarrow}
        <button
          type="button"
          class="w-5 h-5 flex items-center justify-center rounded transition-colors {canNarrow
            ? 'text-text-tertiary hover:text-text-primary cursor-pointer'
            : 'text-text-quaternary cursor-default'}"
          onclick={onNarrow}
          disabled={!canNarrow}
          title="Narrow panel"
          aria-label="Narrow file tree panel"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M9.78 4.22a.75.75 0 010 1.06L7.56 7.5h6.69a.75.75 0 010 1.5H7.56l2.22 2.22a.75.75 0 11-1.06 1.06l-3.5-3.5a.75.75 0 010-1.06l3.5-3.5a.75.75 0 011.06 0zM2.75 3a.75.75 0 01.75.75v8.5a.75.75 0 01-1.5 0v-8.5A.75.75 0 012.75 3z"
            />
          </svg>
        </button>
      {/if}
      <!-- Widen sidebar -->
      {#if onWiden}
        <button
          type="button"
          class="w-5 h-5 flex items-center justify-center rounded transition-colors {canWiden
            ? 'text-text-tertiary hover:text-text-primary cursor-pointer'
            : 'text-text-quaternary cursor-default'}"
          onclick={onWiden}
          disabled={!canWiden}
          title="Widen panel"
          aria-label="Widen file tree panel"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M6.22 4.22a.75.75 0 011.06 0l3.5 3.5a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06-1.06L8.44 9H1.75a.75.75 0 010-1.5h6.69L6.22 5.28a.75.75 0 010-1.06zM13.25 3a.75.75 0 01.75.75v8.5a.75.75 0 01-1.5 0v-8.5a.75.75 0 01.75-.75z"
            />
          </svg>
        </button>
      {/if}
      <!-- Toggle show ignored files -->
      {#if onShowIgnoredChange}
        <button
          type="button"
          class="w-5 h-5 flex items-center justify-center rounded transition-colors {showIgnored
            ? 'text-text-primary'
            : 'text-text-tertiary hover:text-text-primary'}"
          onclick={() => onShowIgnoredChange?.(!showIgnored)}
          title={showIgnored ? "Hide ignored files" : "Show ignored files"}
          aria-label={showIgnored ? "Hide ignored files" : "Show ignored files"}
          aria-pressed={showIgnored}
        >
          <!-- Eye icon (open when showing, slashed when hiding) -->
          {#if showIgnored}
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 010 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.899a1.62 1.62 0 010-1.798c.45-.678 1.367-1.932 2.637-3.023C4.33 2.992 6.019 2 8 2zM1.679 7.932a.12.12 0 000 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 000-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.824.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717zM8 10a2 2 0 11-.001-3.999A2 2 0 018 10z"
              />
            </svg>
          {:else}
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M.143 2.31a.75.75 0 011.047-.167l14 10a.75.75 0 11-.88 1.214l-2.248-1.606C11.346 12.076 10.259 12.5 9 12.5c-1.981 0-3.671-.992-4.933-2.078C2.797 9.331 1.88 8.077 1.43 7.399a1.62 1.62 0 010-1.798c.353-.533 1.063-1.46 2.025-2.347L.31 1.357A.75.75 0 01.143 2.31zm4.653 3.324c-.676.58-1.236 1.206-1.617 1.684a.12.12 0 000 .136c.412.621 1.242 1.75 2.366 2.717C6.676 11.258 8.027 12 9.5 12c.74 0 1.463-.214 2.145-.554L4.796 5.634zM16.57 7.399c-.45.678-1.367 1.932-2.637 3.023l-1.142-.816c1.03-.89 1.784-1.917 2.166-2.488a.12.12 0 000-.136c-.412-.621-1.242-1.75-2.366-2.717C11.46 3.242 10.11 2.5 8.636 2.5c-.96 0-1.886.28-2.748.747L4.667 2.37C5.734 1.712 6.887 1 8.636 1c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 010 1.798z"
              />
            </svg>
          {/if}
        </button>
      {/if}
    </div>
  </div>
</div>

<!-- Recursive Tree Node Snippet -->
{#snippet treeNode(node: FileNode, depth: number)}
  {#if node.isDirectory}
    <!-- Directory Node -->
    <div
      class="directory-node"
      class:opacity-50={node.status === "ignored"}
      role="treeitem"
      aria-expanded={isExpanded(node.path)}
    >
      <button
        type="button"
        class="directory-button w-full text-left px-4 py-1 hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none transition-colors min-h-[28px] flex items-center gap-1.5"
        style="padding-left: {1 + depth * 1.5}rem"
        onclick={() => toggleDirectory(node.path)}
        draggable="true"
        ondragstart={(e: DragEvent) => {
          e.dataTransfer?.setData("application/x-qraftbox-path", node.path);
          e.dataTransfer?.setData("text/plain", node.path);
        }}
        aria-label="Toggle directory {node.name}"
      >
        <!-- Chevron Icon -->
        <svg
          class="chevron w-3 h-3 text-text-tertiary shrink-0 transition-transform"
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
          class="folder-icon w-3.5 h-3.5 text-text-tertiary shrink-0"
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
        <span class="directory-name text-text-primary text-xs truncate flex-1">
          {node.name}
        </span>

        <!-- Ignored Indicator -->
        {#if node.status === "ignored"}
          <span
            class="text-[10px] font-medium text-text-quaternary shrink-0"
            aria-label="Ignored by git"
          >
            [I]
          </span>
        {:else if hasChangedChildren(node)}
          <!-- Changed Indicator -->
          <span
            class="changed-indicator text-xs text-accent-fg shrink-0"
            aria-label="Contains changed files"
          >
            •
          </span>
        {/if}
      </button>

      <!-- Children (if expanded) -->
      {#if isExpanded(node.path)}
        {#if node.children !== undefined}
          {#each node.children as child (child.path)}
            {@render treeNode(child, depth + 1)}
          {/each}
        {:else if loadingPaths.has(node.path)}
          <div
            class="flex items-center gap-1.5 py-1 text-xs text-text-tertiary"
            style="padding-left: {1 + (depth + 1) * 1.5}rem"
          >
            <svg
              class="animate-spin w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="3"
                opacity="0.25"
              />
              <path
                d="M4 12a8 8 0 018-8"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
              />
            </svg>
            <span>Loading...</span>
          </div>
        {/if}
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

  .mode-toggle-btn--filtered {
    border-right: none;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  /* Status filter container */
  .status-filter-container {
    position: relative;
  }

  /* Status filter arrow button */
  .status-filter-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    width: 18px;
    padding: 0;
    border: 1px solid var(--color-border-muted);
    border-left: none;
    border-top-right-radius: 4px;
    border-bottom-right-radius: 4px;
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

  .status-filter-arrow:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .status-filter-arrow:focus-visible {
    outline: 2px solid var(--color-accent-fg);
    outline-offset: -1px;
    z-index: 1;
  }

  .status-filter-arrow--open {
    background-color: var(--color-bg-hover);
  }

  .status-filter-arrow--filtered {
    border-color: var(--color-accent-muted);
    color: var(--color-accent-fg);
  }

  /* Status filter dropdown */
  .status-filter-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 100;
    min-width: 180px;
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    overflow: hidden;
  }

  /* Status filter option */
  .status-filter-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background-color: transparent;
    border: none;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 0.15s ease;
    text-align: left;
    font-size: 13px;
  }

  .status-filter-option:hover {
    background-color: var(--color-bg-hover);
  }

  .status-filter-option--active {
    background-color: var(--color-bg-tertiary);
  }

  .status-filter-option-check {
    width: 14px;
    text-align: center;
    font-size: 12px;
    color: var(--color-accent-fg);
  }

  .status-filter-option-label {
    flex: 1;
  }

  .status-filter-option-count {
    color: var(--color-text-tertiary);
    font-size: 11px;
    font-weight: 600;
  }
</style>
