<script lang="ts">
  /**
   * ToolCallDisplay Component
   *
   * Displays a single tool call with name, status, and expandable details.
   *
   * Props:
   * - toolCall: The tool call to display
   *
   * Design:
   * - Tool name and status icon
   * - Collapsed by default
   * - Expand to see input/output
   * - Truncate long output
   */

  import type { ToolCall } from "../../../src/types/ai";

  interface Props {
    toolCall: ToolCall;
  }

  // Svelte 5 props syntax
  const { toolCall }: Props = $props();

  /**
   * Whether details are expanded
   */
  let expanded = $state(false);

  /**
   * Maximum length for displaying output before truncation
   */
  const MAX_OUTPUT_LENGTH = 500;

  /**
   * Get status icon and color
   */
  const statusDisplay = $derived.by(() => {
    switch (toolCall.status) {
      case "pending":
        return { icon: "clock", color: "text-attention-fg", label: "Pending" };
      case "running":
        return { icon: "loader", color: "text-accent-fg", label: "Running" };
      case "completed":
        return { icon: "check", color: "text-success-fg", label: "Completed" };
      case "failed":
        return { icon: "x", color: "text-danger-fg", label: "Failed" };
      default:
        return {
          icon: "circle",
          color: "text-text-tertiary",
          label: "Unknown",
        };
    }
  });

  /**
   * Format JSON for display
   */
  function formatJson(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  /**
   * Truncate long output
   */
  function truncateOutput(value: unknown): {
    text: string;
    truncated: boolean;
  } {
    const formatted = formatJson(value);
    if (formatted.length <= MAX_OUTPUT_LENGTH) {
      return { text: formatted, truncated: false };
    }
    return {
      text: formatted.slice(0, MAX_OUTPUT_LENGTH) + "...",
      truncated: true,
    };
  }

  /**
   * Toggle expanded state
   */
  function toggle(): void {
    expanded = !expanded;
  }

  /**
   * Calculate duration if timing is available
   */
  const duration = $derived.by(() => {
    if (
      toolCall.startedAt === undefined ||
      toolCall.completedAt === undefined
    ) {
      return null;
    }
    const start = new Date(toolCall.startedAt).getTime();
    const end = new Date(toolCall.completedAt).getTime();
    const ms = end - start;
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  });
</script>

<div
  class="tool-call border border-border-default rounded-lg overflow-hidden
         bg-bg-tertiary/30"
  role="region"
  aria-label="Tool call: {toolCall.name}"
>
  <!-- Header (clickable) -->
  <button
    type="button"
    onclick={toggle}
    class="w-full px-3 py-2 flex items-center justify-between
           hover:bg-bg-tertiary/50 transition-colors
           focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-emphasis"
    aria-expanded={expanded}
  >
    <div class="flex items-center gap-2">
      <!-- Status icon -->
      {#if statusDisplay.icon === "clock"}
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
          class={statusDisplay.color}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      {:else if statusDisplay.icon === "loader"}
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
          class="{statusDisplay.color} animate-spin"
          aria-hidden="true"
        >
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
        </svg>
      {:else if statusDisplay.icon === "check"}
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
          class={statusDisplay.color}
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      {:else if statusDisplay.icon === "x"}
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
          class={statusDisplay.color}
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      {:else}
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
          class={statusDisplay.color}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
        </svg>
      {/if}

      <!-- Tool name -->
      <span class="text-xs font-mono text-text-primary">
        {toolCall.name}
      </span>

      <!-- Duration badge -->
      {#if duration !== null}
        <span class="text-xs text-text-tertiary">
          ({duration})
        </span>
      {/if}
    </div>

    <!-- Chevron indicator -->
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
      class="text-text-tertiary transition-transform {expanded
        ? 'rotate-180'
        : ''}"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  <!-- Expanded details -->
  {#if expanded}
    <div class="border-t border-border-default">
      <!-- Input section -->
      <div class="p-3">
        <h4 class="text-xs font-semibold text-text-secondary mb-1">Input</h4>
        <pre
          class="text-xs font-mono text-text-tertiary bg-bg-primary
                 rounded p-2 overflow-x-auto max-h-40">{formatJson(
            toolCall.input,
          )}</pre>
      </div>

      <!-- Output section (if available) -->
      {#if toolCall.output !== undefined}
        {@const outputDisplay = truncateOutput(toolCall.output)}
        <div class="p-3 pt-0">
          <h4 class="text-xs font-semibold text-text-secondary mb-1">Output</h4>
          <pre
            class="text-xs font-mono text-text-tertiary bg-bg-primary
                   rounded p-2 overflow-x-auto max-h-40">{outputDisplay.text}</pre>
          {#if outputDisplay.truncated}
            <p class="text-xs text-text-tertiary mt-1 italic">
              Output truncated ({MAX_OUTPUT_LENGTH} characters shown)
            </p>
          {/if}
        </div>
      {/if}

      <!-- Error section (if failed) -->
      {#if toolCall.error !== undefined}
        <div class="p-3 pt-0">
          <h4 class="text-xs font-semibold text-danger-fg mb-1">Error</h4>
          <pre
            class="text-xs font-mono text-danger-fg bg-danger-subtle
                   rounded p-2 overflow-x-auto">{toolCall.error}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>
