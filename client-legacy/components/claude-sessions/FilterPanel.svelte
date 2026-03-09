<script lang="ts">
  /**
   * FilterPanel Component
   *
   * Filter controls for Claude session browser.
   * Allows filtering by project directory (primary) and source.
   *
   * Props:
   * - filters: Current filter state
   * - projects: Available projects for filtering
   * - onFilterChange: Callback when filters change
   * - onClearFilters: Callback to clear all filters
   *
   * Design:
   * - Expanded by default
   * - Project Directory filter with searchable list (primary)
   * - Source filter (dropdown: All / QraftBox / Claude CLI / Codex CLI)
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

  const { filters, projects, onFilterChange, onClearFilters }: Props = $props();

  /**
   * Whether filter panel is expanded
   */
  let isExpanded = $state(true);

  /**
   * Project search query for filtering the project list
   */
  let projectSearchQuery = $state("");

  /**
   * Whether any filters are active
   */
  const hasActiveFilters = $derived.by(() => {
    return (
      filters.source !== undefined ||
      filters.workingDirectoryPrefix !== undefined ||
      filters.searchQuery !== undefined ||
      filters.dateRange !== undefined
    );
  });

  /**
   * Filtered project list based on search query
   */
  const filteredProjects = $derived.by(() => {
    if (projectSearchQuery.trim() === "") {
      return projects;
    }
    const query = projectSearchQuery.toLowerCase();
    return projects.filter((project) =>
      project.path.toLowerCase().includes(query),
    );
  });

  /**
   * Get last segment of path for prominent display
   */
  function getLastPathSegment(path: string): string {
    const segments = path.split("/").filter((s) => s.length > 0);
    return segments[segments.length - 1] ?? path;
  }

  /**
   * Toggle panel expansion
   */
  function toggleExpanded(): void {
    isExpanded = !isExpanded;
  }

  /**
   * Handle project selection
   */
  function handleProjectSelect(projectPath: string): void {
    // Toggle selection: if already selected, deselect; otherwise select
    if (filters.workingDirectoryPrefix === projectPath) {
      onFilterChange({ workingDirectoryPrefix: undefined });
    } else {
      onFilterChange({ workingDirectoryPrefix: projectPath });
    }
  }

  /**
   * Handle source filter change
   */
  function handleSourceChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    onFilterChange({
      source: value === "all" ? undefined : (value as SessionSource),
    });
  }

  /**
   * Handle project search input change
   */
  function handleProjectSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    projectSearchQuery = target.value;
  }

  /**
   * Get source radio value
   */
  const sourceValue = $derived.by(() => {
    if (filters.source === undefined) return "all";
    return filters.source;
  });

  /**
   * Check if a project is currently selected
   */
  function isProjectSelected(projectPath: string): boolean {
    return filters.workingDirectoryPrefix === projectPath;
  }
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
             hover:text-accent-fg transition-colors
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis rounded"
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
        class="transition-transform duration-200 {isExpanded
          ? 'rotate-90'
          : ''}"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      <span>Filters</span>
      {#if hasActiveFilters}
        <span
          class="inline-flex items-center justify-center px-1.5 py-0.5
                 text-[10px] font-bold rounded-full
                 bg-accent-emphasis text-white"
          aria-label="Active filters"
        >
          {[
            filters.source,
            filters.workingDirectoryPrefix,
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
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis
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
      <!-- Project Directory Filter (Primary) -->
      {#if projects.length > 0}
        <div class="filter-group">
          <label
            for="project-search-input"
            class="block text-xs font-medium text-text-secondary mb-2"
          >
            Project Directory
          </label>

          <!-- Search input for filtering projects -->
          <input
            id="project-search-input"
            type="text"
            value={projectSearchQuery}
            oninput={handleProjectSearchChange}
            placeholder="Search projects..."
            class="w-full px-3 py-2 rounded-md text-sm mb-2
                   bg-bg-primary border border-bg-border text-text-primary
                   placeholder-text-tertiary
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-transparent
                   transition-all duration-150"
            aria-label="Search projects"
            autocomplete="off"
          />

          <!-- Scrollable project list -->
          <div
            class="project-list max-h-48 overflow-y-auto border border-bg-border rounded-md
                   bg-bg-primary divide-y divide-bg-border"
            role="listbox"
            aria-label="Available projects"
          >
            {#each filteredProjects as project (project.path)}
              <button
                type="button"
                role="option"
                aria-selected={isProjectSelected(project.path)}
                onclick={() => handleProjectSelect(project.path)}
                class="w-full px-3 py-2.5 text-left transition-colors duration-150
                       {isProjectSelected(project.path)
                  ? 'bg-accent-muted border-l-2 border-accent-emphasis'
                  : 'hover:bg-bg-hover border-l-2 border-transparent'}
                       focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <!-- Project name (last segment) -->
                    <div class="text-sm font-medium text-text-primary truncate">
                      {getLastPathSegment(project.path)}
                    </div>
                    <!-- Full path (muted) -->
                    <div class="text-xs text-text-secondary truncate mt-0.5">
                      {project.path}
                    </div>
                  </div>
                  <!-- Session count badge -->
                  <div
                    class="flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full
                           bg-bg-tertiary text-text-secondary"
                  >
                    {project.sessionCount}
                  </div>
                </div>
              </button>
            {/each}

            {#if filteredProjects.length === 0}
              <div class="px-3 py-4 text-sm text-text-secondary text-center">
                No projects found
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Source Filter -->
      <div class="filter-group">
        <label
          for="source-filter-select"
          class="block text-xs font-medium text-text-secondary mb-2"
        >
          Source
        </label>
        <select
          id="source-filter-select"
          value={sourceValue}
          onchange={handleSourceChange}
          class="w-full px-3 py-2 rounded-md text-sm
                 bg-bg-primary border border-bg-border text-text-primary
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-transparent
                 transition-all duration-150"
          aria-label="Filter by session source"
        >
          <option value="all">All</option>
          <option value="qraftbox">QraftBox</option>
          <option value="claude-cli">Claude CLI</option>
          <option value="codex-cli">Codex CLI</option>
        </select>
      </div>
    </div>
  {/if}
</aside>
