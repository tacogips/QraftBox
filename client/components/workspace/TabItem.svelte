<script lang="ts">
  /**
   * TabItem Component
   *
   * Individual tab item for workspace tabs.
   * Shows directory name, active state, and close button.
   *
   * Props:
   * - tab: WorkspaceTab object
   * - active: Whether this tab is active
   * - onSelect: Callback when tab is clicked
   * - onClose: Callback when close button is clicked
   *
   * Design:
   * - Touch-friendly (48px height)
   * - Active tab indicator (bottom border)
   * - Close button (X) on hover/active
   * - Git repo indicator (optional icon)
   */

  import type { WorkspaceTab, ContextId } from "../../../src/types/workspace";

  interface Props {
    tab: WorkspaceTab;
    active: boolean;
    onSelect: (id: ContextId) => void;
    onClose: (id: ContextId) => void;
  }

  const { tab, active, onSelect, onClose }: Props = $props();

  /**
   * Handle tab click
   */
  function handleClick(): void {
    onSelect(tab.id);
  }

  /**
   * Handle close button click
   */
  function handleClose(event: MouseEvent): void {
    event.stopPropagation();
    onClose(tab.id);
  }
</script>

<!-- Tab Item -->
<div
  class="tab-item relative flex items-center gap-2 px-4 h-12
         border-r border-bg-border
         {active
    ? 'bg-bg-primary text-text-primary border-b-2 border-b-accent-fg'
    : 'bg-bg-secondary text-text-secondary hover:bg-bg-hover'}
         transition-colors duration-150 cursor-pointer
         min-w-[120px] max-w-[200px] shrink-0"
  onclick={handleClick}
  role="tab"
  aria-selected={active}
  aria-label="Tab {tab.name}"
  tabindex={active ? 0 : -1}
>
  <!-- Git Repo Indicator -->
  {#if tab.isGitRepo}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="shrink-0 opacity-60"
      aria-hidden="true"
      title="Git repository"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  {:else}
    <!-- Folder Icon for non-git directories -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="shrink-0 opacity-60"
      aria-hidden="true"
      title="Directory"
    >
      <path
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      ></path>
    </svg>
  {/if}

  <!-- Directory Name -->
  <span class="tab-name truncate flex-1 text-sm font-medium">
    {tab.name}
  </span>

  <!-- Close Button -->
  <button
    type="button"
    class="close-btn shrink-0 w-5 h-5 flex items-center justify-center
           rounded hover:bg-bg-tertiary focus:bg-bg-tertiary
           focus:outline-none focus:ring-2 focus:ring-accent-emphasis
           transition-colors duration-150"
    onclick={handleClose}
    aria-label="Close tab {tab.name}"
    title="Close tab"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  </button>
</div>

<style>
  /**
   * Tab item styling
   * - Touch-friendly 48px height
   * - Active state with bottom border
   * - Hover state for inactive tabs
   * - Close button shows on hover/active
   */
  .tab-item {
    -webkit-tap-highlight-color: transparent;
  }

  .tab-item:active {
    opacity: 0.9;
  }

  .close-btn {
    opacity: 0;
    pointer-events: none;
  }

  .tab-item:hover .close-btn,
  .tab-item:focus-within .close-btn,
  .tab-item[aria-selected="true"] .close-btn {
    opacity: 1;
    pointer-events: auto;
  }

  /* On touch devices, always show close button for active tab */
  @media (hover: none) {
    .tab-item[aria-selected="true"] .close-btn {
      opacity: 1;
      pointer-events: auto;
    }
  }
</style>
