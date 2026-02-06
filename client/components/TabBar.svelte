<script lang="ts">
  /**
   * TabBar Component
   *
   * Container for workspace tabs with horizontal scrolling.
   * Shows list of tabs with active tab indicator, close buttons, and new tab button.
   *
   * Props:
   * - tabs: Array of workspace tabs
   * - activeTabId: Currently active tab ID (or null)
   * - onTabSelect: Callback when a tab is selected
   * - onTabClose: Callback when a tab is closed
   * - onNewTab: Callback when new tab button is clicked
   *
   * Design:
   * - Touch-friendly (48px minimum height)
   * - Horizontal scrolling if many tabs
   * - New Tab button on the right
   * - Sticky position at top of workspace
   */

  import type { WorkspaceTab, ContextId } from "../../src/types/workspace";
  import TabItem from "./workspace/TabItem.svelte";

  interface Props {
    tabs: readonly WorkspaceTab[];
    activeTabId: ContextId | null;
    onTabSelect: (id: ContextId) => void;
    onTabClose: (id: ContextId) => void;
    onNewTab: () => void;
  }

  const { tabs, activeTabId, onTabSelect, onTabClose, onNewTab }: Props =
    $props();

  /**
   * Check if a tab is active
   */
  function isActive(tabId: ContextId): boolean {
    return activeTabId === tabId;
  }
</script>

<!-- Tab Bar Container -->
<div
  class="tab-bar flex items-center bg-bg-secondary border-b border-bg-border
         overflow-x-auto overflow-y-hidden h-12 shrink-0"
  role="tablist"
  aria-label="Workspace tabs"
>
  <!-- Tab List (Scrollable) -->
  <div class="tab-list flex flex-1 overflow-x-auto overflow-y-hidden">
    {#if tabs.length === 0}
      <!-- Empty State -->
      <div class="empty-tabs flex items-center px-4 text-sm text-text-tertiary">
        No open directories
      </div>
    {:else}
      <!-- Render Tabs -->
      {#each tabs as tab (tab.id)}
        <TabItem
          {tab}
          active={isActive(tab.id)}
          onSelect={onTabSelect}
          onClose={onTabClose}
        />
      {/each}
    {/if}
  </div>

  <!-- New Tab Button -->
  <button
    type="button"
    class="new-tab-btn shrink-0 h-12 px-4 flex items-center justify-center
           border-l border-bg-border
           bg-bg-secondary hover:bg-bg-hover
           text-text-secondary hover:text-text-primary
           transition-colors duration-150
           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
    onclick={onNewTab}
    aria-label="Open new directory"
    title="Open new directory"
  >
    <!-- Plus Icon -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
    <span class="ml-2 text-sm font-medium hidden md:inline">New Tab</span>
  </button>
</div>

<style>
  /**
   * Tab bar styling
   * - Fixed height (48px for touch-friendliness)
   * - Horizontal scrolling for many tabs
   * - Smooth scrolling behavior
   * - Hide scrollbar for cleaner appearance
   */
  .tab-bar {
    -webkit-tap-highlight-color: transparent;
  }

  .tab-list {
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE and Edge */
  }

  .tab-list::-webkit-scrollbar {
    display: none; /* Chrome, Safari, Opera */
  }

  .new-tab-btn {
    min-width: 48px;
  }

  .new-tab-btn:active {
    background-color: var(--bg-hover);
  }
</style>
