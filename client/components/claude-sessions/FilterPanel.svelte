<script lang="ts">
  /**
   * FilterPanel Component
   *
   * Filter controls for Claude session browser.
   * Allows filtering by source, working directory, branch, and date range.
   *
   * Props:
   * - filters: Current filter state
   * - projects: Available projects for filtering
   * - onFilterChange: Callback when filters change
   * - onClearFilters: Callback to clear all filters
   *
   * Design:
   * - Collapsible filter panel
   * - Source filter (radio buttons: All / QRAFTBOX / CLI)
   * - Working directory selector (dropdown)
   * - Branch filter (text input with autocomplete suggestions)
   * - Clear all filters button
   * - Accessible with proper ARIA labels
   */

  import type {
    SessionFilters,
    ProjectInfo,
    SessionSource,
  } from "../../../src/types/claude-session";

  interface Props {
    filters: SessionFilters;
    projects: readonly ProjectInfo[];
    onFilterChange: (filters: Partial<SessionFilters>) => void;
    onClearFilters: () => void;
  }

  const { filters, projects, onFilterChange, onClearFilters }: Props =
    $props();

  /**
   * Whether filter panel is expanded
   */
  let isExpanded = $state(true);

  /**
   * Whether any filters are active
   */
  const hasActiveFilters = $derived.by(() => {
    return (
      filters.source !== undefined ||
      filters.workingDirectoryPrefix !== undefined ||
      filters.branch !== undefined ||
      filters.searchQuery !== undefined ||
      filters.dateRange !== undefined
    );
  });

  /**
   * Toggle panel expansion
   */
  function toggleExpanded(): void {
    isExpanded = !isExpanded;
  }

  /**
   * Handle source filter change
   */
  function handleSourceChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    onFilterChange({
      source: value === "all" ? undefined : (value as SessionSource),
    });
  }

  /**
   * Handle working directory change
   */
  function handleWorkingDirectoryChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    onFilterChange({
      workingDirectoryPrefix: value === "" ? undefined : value,
    });
  }

  /**
   * Handle branch filter change
   */
  function handleBranchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value.trim();
    onFilterChange({
      branch: value === "" ? undefined : value,
    });
  }

  /**
   * Get source radio value
   */
  const sourceValue = $derived.by(() => {
    if (filters.source === undefined) return "all";
    return filters.source;
  });

  /**
   * Get working directory select value
   */
  const workingDirValue = $derived(
    filters.workingDirectoryPrefix ?? ""
  );

  /**
   * Get branch input value
   */
  const branchValue = $derived(filters.branch ?? "");
</script>

<!-- Filter Panel Container -->
<aside
  class="filter-panel border-b border-bg-border bg-bg-secondary"
  role="region"
  aria-label="Filter options"
>
  <!-- Panel Header -->
  <div class="panel-header flex items-center justify-between px-4 py-3">
    <button
      type="button"
      onclick={toggleExpanded}
      class="flex items-center gap-2 text-sm font-medium text-text-primary
             hover:text-blue-400 transition-colors
             focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
      aria-expanded={isExpanded}
      aria-controls="filter-panel-content"
    >
      <!-- Chevron Icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="transition-transform duration-200 {isExpanded ? 'rotate-90' : ''}"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      <span>Filters</span>
      {#if hasActiveFilters}
        <span
          class="inline-flex items-center justify-center px-1.5 py-0.5
                 text-[10px] font-bold rounded-full
                 bg-blue-600 text-white"
          aria-label="Active filters"
        >
          {[
            filters.source,
            filters.workingDirectoryPrefix,
            filters.branch,
            filters.searchQuery,
            filters.dateRange,
          ].filter((f) => f !== undefined).length}
        </span>
      {/if}
    </button>

    <!-- Clear Filters Button -->
    {#if hasActiveFilters}
      <button
        type="button"
        onclick={onClearFilters}
        class="px-3 py-1.5 text-xs font-medium rounded-md
               bg-bg-tertiary hover:bg-bg-hover text-text-secondary hover:text-text-primary
               focus:outline-none focus:ring-2 focus:ring-blue-500
               transition-colors duration-150"
        aria-label="Clear all filters"
      >
        Clear All
      </button>
    {/if}
  </div>

  <!-- Panel Content (Collapsible) -->
  {#if isExpanded}
    <div id="filter-panel-content" class="panel-content px-4 pb-4 space-y-4">
      <!-- Source Filter -->
      <div class="filter-group">
        <label class="block text-xs font-medium text-text-secondary mb-2">
          Source
        </label>
        <div
          class="flex gap-4"
          role="radiogroup"
          aria-label="Filter by session source"
        >
          <label class="inline-flex items-center cursor-pointer">
            <input
              type="radio"
              name="source-filter"
              value="all"
              checked={sourceValue === "all"}
              onchange={handleSourceChange}
              class="mr-2 w-4 h-4 text-blue-600
                     focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-text-primary">All</span>
          </label>
          <label class="inline-flex items-center cursor-pointer">
            <input
              type="radio"
              name="source-filter"
              value="qraftbox"
              checked={sourceValue === "qraftbox"}
              onchange={handleSourceChange}
              class="mr-2 w-4 h-4 text-blue-600
                     focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-text-primary">QRAFTBOX</span>
          </label>
          <label class="inline-flex items-center cursor-pointer">
            <input
              type="radio"
              name="source-filter"
              value="claude-cli"
              checked={sourceValue === "claude-cli"}
              onchange={handleSourceChange}
              class="mr-2 w-4 h-4 text-blue-600
                     focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-text-primary">CLI</span>
          </label>
        </div>
      </div>

      <!-- Working Directory Filter -->
      {#if projects.length > 0}
        <div class="filter-group">
          <label
            for="working-directory-select"
            class="block text-xs font-medium text-text-secondary mb-2"
          >
            Project Directory
          </label>
          <select
            id="working-directory-select"
            value={workingDirValue}
            onchange={handleWorkingDirectoryChange}
            class="w-full px-3 py-2 rounded-md text-sm
                   bg-bg-primary border border-bg-border text-text-primary
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   transition-all duration-150"
            aria-label="Filter by project directory"
          >
            <option value="">All Projects</option>
            {#each projects as project (project.path)}
              <option value={project.path}>
                {project.path} ({project.sessionCount} session{project.sessionCount !== 1 ? "s" : ""})
              </option>
            {/each}
          </select>
        </div>
      {/if}

      <!-- Branch Filter -->
      <div class="filter-group">
        <label
          for="branch-filter-input"
          class="block text-xs font-medium text-text-secondary mb-2"
        >
          Git Branch
        </label>
        <input
          id="branch-filter-input"
          type="text"
          value={branchValue}
          oninput={handleBranchChange}
          placeholder="e.g., main, feature/auth"
          class="w-full px-3 py-2 rounded-md text-sm
                 bg-bg-primary border border-bg-border text-text-primary
                 placeholder-text-tertiary
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                 transition-all duration-150"
          aria-label="Filter by git branch"
          autocomplete="off"
        />
      </div>
    </div>
  {/if}
</aside>
