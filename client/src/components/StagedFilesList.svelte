<script lang="ts">
  /**
   * StagedFilesList Component
   *
   * Display list of staged files with status badges and change statistics.
   *
   * Features:
   * - Touch-friendly 60px minimum row height
   * - Status badges (Added, Modified, Deleted, Renamed)
   * - Addition/deletion counters
   * - File path display with truncation
   * - Empty state when no files
   *
   * Props:
   * - files: List of staged files to display
   */

  import type { StagedFile } from "../../../src/types/commit-context";

  interface Props {
    files: readonly StagedFile[];
  }

  const { files }: Props = $props();

  /**
   * Get badge text for file status
   */
  function getStatusBadge(status: StagedFile["status"]): string {
    switch (status) {
      case "A":
        return "Added";
      case "M":
        return "Modified";
      case "D":
        return "Deleted";
      case "R":
        return "Renamed";
      default:
        return "Unknown";
    }
  }

  /**
   * Get badge CSS classes for file status
   */
  function getStatusBadgeClass(status: StagedFile["status"]): string {
    switch (status) {
      case "A":
        return "bg-green-100 text-green-700";
      case "M":
        return "bg-blue-100 text-blue-700";
      case "D":
        return "bg-red-100 text-red-700";
      case "R":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  /**
   * Extract filename from path for display
   */
  function extractFilename(path: string): string {
    const parts = path.split("/");
    const last = parts[parts.length - 1];
    return last !== undefined && last.length > 0 ? last : path;
  }

  /**
   * Get directory path without filename
   */
  function getDirectory(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1) {
      return "";
    }
    return path.substring(0, lastSlash);
  }
</script>

{#if files.length === 0}
  <!-- Empty State -->
  <div
    class="empty-state py-8 px-4
           flex flex-col items-center justify-center
           text-text-tertiary"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="mb-3 opacity-50"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
    <p class="text-sm">No staged files</p>
    <p class="text-xs mt-1">Stage files to commit changes</p>
  </div>
{:else}
  <!-- Files List -->
  <div
    class="staged-files-list border border-border-default rounded-lg
           bg-bg-secondary divide-y divide-border-default
           max-h-[300px] overflow-y-auto"
    role="list"
  >
    {#each files as file (file.path)}
      <div
        class="file-item px-4 py-3 min-h-[60px]
               flex items-center gap-3
               hover:bg-bg-hover transition-colors"
        role="listitem"
      >
        <!-- Status Badge -->
        <span
          class="status-badge px-2 py-1 text-xs font-medium rounded
                 flex-shrink-0 {getStatusBadgeClass(file.status)}"
          title={`Status: ${getStatusBadge(file.status)}`}
        >
          {file.status}
        </span>

        <!-- File Info -->
        <div class="file-info flex-1 min-w-0">
          <!-- Filename -->
          <div class="filename text-sm font-medium text-text-primary truncate">
            {extractFilename(file.path)}
          </div>

          <!-- Directory Path -->
          {#if getDirectory(file.path).length > 0}
            <div
              class="directory text-xs text-text-tertiary font-mono truncate"
              title={file.path}
            >
              {getDirectory(file.path)}
            </div>
          {/if}
        </div>

        <!-- Change Stats -->
        <div class="change-stats flex items-center gap-2 flex-shrink-0">
          {#if file.additions > 0}
            <span
              class="additions text-xs font-mono text-green-600"
              title={`${file.additions} additions`}
            >
              +{file.additions}
            </span>
          {/if}

          {#if file.deletions > 0}
            <span
              class="deletions text-xs font-mono text-red-600"
              title={`${file.deletions} deletions`}
            >
              -{file.deletions}
            </span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  /**
 * StagedFilesList Styling
 *
 * - Touch-friendly 60px rows
 * - Smooth scrolling for long lists
 * - Status badge colors
 */
  .staged-files-list {
    -webkit-overflow-scrolling: touch;
  }

  .file-item {
    -webkit-tap-highlight-color: transparent;
  }
</style>
