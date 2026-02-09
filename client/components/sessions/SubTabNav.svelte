<script lang="ts">
  /**
   * SubTabNav Component
   *
   * Sub-tab navigation for the unified sessions screen.
   * Switches between "Active" and "History" views with badge counts.
   *
   * Props:
   * - activeTab: Currently selected tab ("active" | "history")
   * - onTabChange: Callback when tab selection changes
   * - runningCount: Number of running sessions
   * - queuedCount: Number of queued sessions
   * - historyCount: Total history sessions count
   */

  interface Props {
    activeTab: "active" | "history";
    onTabChange: (tab: "active" | "history") => void;
    runningCount: number;
    queuedCount: number;
    historyCount: number;
  }

  const {
    activeTab,
    onTabChange,
    runningCount,
    queuedCount,
    historyCount,
  }: Props = $props();

  const isIdle = $derived(runningCount === 0 && queuedCount === 0);

  const activeBadgeLabel = $derived.by(() => {
    if (isIdle) return "(idle)";
    const parts: string[] = [];
    if (runningCount > 0) parts.push(`${runningCount} running`);
    if (queuedCount > 0) parts.push(`${queuedCount} queued`);
    return `(${parts.join(", ")})`;
  });

  const historyBadgeLabel = $derived(
    `(${historyCount} session${historyCount !== 1 ? "s" : ""})`,
  );
</script>

<nav
  class="flex items-center gap-0 border-b border-border-default bg-bg-secondary px-4"
  role="tablist"
  aria-label="Sessions sub-navigation"
>
  <button
    type="button"
    role="tab"
    aria-selected={activeTab === "active"}
    class="px-3 py-2 text-sm transition-colors border-b-2
           {activeTab === 'active'
      ? 'text-text-primary font-semibold border-accent-emphasis'
      : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
    onclick={() => onTabChange("active")}
  >
    Active
    <span
      class="ml-1 text-xs {activeTab === 'active'
        ? 'text-text-secondary'
        : 'text-text-tertiary'}"
    >
      {activeBadgeLabel}
    </span>
  </button>

  <button
    type="button"
    role="tab"
    aria-selected={activeTab === "history"}
    class="px-3 py-2 text-sm transition-colors border-b-2
           {activeTab === 'history'
      ? 'text-text-primary font-semibold border-accent-emphasis'
      : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
    onclick={() => onTabChange("history")}
  >
    History
    <span
      class="ml-1 text-xs {activeTab === 'history'
        ? 'text-text-secondary'
        : 'text-text-tertiary'}"
    >
      {historyBadgeLabel}
    </span>
  </button>
</nav>
