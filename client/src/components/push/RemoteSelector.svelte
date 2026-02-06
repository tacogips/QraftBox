<script lang="ts">
  /**
   * RemoteSelector Component
   *
   * Dropdown selector for choosing git remote.
   *
   * Features:
   * - Dropdown to select remote
   * - Display URL for selected remote
   * - Touch-friendly 44px height
   * - Disabled state support
   *
   * Props:
   * - remotes: Array of available remotes
   * - selectedRemote: Currently selected remote name
   * - onchange: Callback when selection changes
   * - disabled: Whether selector is disabled
   */

  import type { RemoteTracking } from "../../../../src/types/push-context";

  interface Props {
    remotes: readonly RemoteTracking[];
    selectedRemote: string;
    onchange: (remoteName: string) => void;
    disabled?: boolean | undefined;
  }

  const {
    remotes,
    selectedRemote,
    onchange,
    disabled = false,
  }: Props = $props();

  /**
   * Get currently selected remote object
   */
  const selected = $derived(
    remotes.find((r) => r.name === selectedRemote) ?? remotes[0] ?? null,
  );

  /**
   * Handle select change
   */
  function handleChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (!disabled && target.value) {
      onchange(target.value);
    }
  }
</script>

<div class="remote-selector">
  <!-- Remote Dropdown -->
  <label
    for="remote-select"
    class="block text-sm font-medium text-gray-700 mb-2"
  >
    Remote
  </label>

  <select
    id="remote-select"
    value={selectedRemote}
    onchange={handleChange}
    {disabled}
    class="remote-select w-full min-h-[44px] px-3 py-2
           border border-gray-300 rounded-lg
           text-base text-gray-900
           focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500
           disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
           transition-colors"
    aria-label="Select remote repository"
  >
    {#if remotes.length === 0}
      <option value="">No remotes available</option>
    {:else}
      {#each remotes as remote (remote.name)}
        <option value={remote.name}>
          {remote.name} ({remote.branch})
        </option>
      {/each}
    {/if}
  </select>

  <!-- Remote URL Display -->
  {#if selected}
    <div
      class="remote-url mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 font-mono truncate"
    >
      {selected.url}
    </div>
  {/if}
</div>

<style>
  /**
   * RemoteSelector Styling
   *
   * - 44px minimum height for touch-friendly interaction
   * - Full width dropdown
   * - URL display with monospace font
   */
  .remote-selector {
    width: 100%;
  }

  .remote-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M6 9L1.5 4.5h9L6 9z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
  }

  .remote-select:disabled {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%9CA3AF' d='M6 9L1.5 4.5h9L6 9z'/%3E%3C/svg%3E");
  }

  .remote-url {
    word-break: break-all;
  }
</style>
