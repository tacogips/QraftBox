<script lang="ts">
  /**
   * BaseBranchSelector Component
   *
   * Dropdown selector for choosing base branch for PR.
   *
   * Features:
   * - Dropdown list of available branches
   * - Default to main/master
   * - Touch-friendly 44px minimum height
   * - Disabled state support
   *
   * Props:
   * - branches: Array of available branch names
   * - selected: Currently selected branch
   * - onchange: Callback when selection changes
   * - disabled: Whether selector is disabled
   */

  interface Props {
    branches: readonly string[];
    selected: string;
    onchange: (branch: string) => void;
    disabled?: boolean | undefined;
  }

  const { branches, selected, onchange, disabled = false }: Props = $props();

  /**
   * Handle branch selection change
   */
  function handleChange(event: Event): void {
    const target = event.currentTarget as HTMLSelectElement;
    onchange(target.value);
  }
</script>

<div class="base-branch-selector">
  <label
    for="base-branch"
    class="block text-sm font-medium text-text-primary mb-2"
  >
    Base Branch
  </label>

  <div class="relative">
    <select
      id="base-branch"
      value={selected}
      onchange={handleChange}
      {disabled}
      class="base-branch-select w-full px-4 py-2 min-h-[44px]
             border border-border-default rounded-lg
             bg-bg-primary
             appearance-none
             focus:outline-none focus:ring-2 focus:ring-accent-emphasis focus:border-accent-emphasis
             disabled:bg-bg-secondary disabled:cursor-not-allowed
             text-base font-medium text-text-primary
             pr-10"
      aria-label="Select base branch for pull request"
    >
      {#each branches as branch}
        <option value={branch}>{branch}</option>
      {/each}
    </select>

    <!-- Dropdown Icon -->
    <div
      class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3"
    >
      <svg
        class="w-5 h-5 text-text-tertiary"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
          clip-rule="evenodd"
        />
      </svg>
    </div>
  </div>

  <p class="mt-1 text-xs text-text-secondary">
    Select the target branch for this pull request
  </p>
</div>

<style>
  /**
   * BaseBranchSelector Styling
   *
   * - Custom dropdown styling
   * - Touch-friendly select
   * - Disabled state
   */
  .base-branch-select {
    cursor: pointer;
  }

  .base-branch-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .base-branch-select:focus {
    box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.1);
  }
</style>
