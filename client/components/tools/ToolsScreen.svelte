<script lang="ts">
/**
 * ToolsScreen Component
 *
 * Screen for browsing and managing registered tools (builtin and plugin).
 *
 * Props:
 * - onBack: Callback to navigate back to previous screen
 *
 * Features:
 * - Lists all registered tools with type badges
 * - Expandable tool details with schema info
 * - Reload plugins button for hot-reloading from disk
 * - Loading, error, and empty states
 */

interface RegisteredToolInfo {
  readonly name: string;
  readonly description: string;
  readonly source: "builtin" | "plugin";
  readonly pluginName?: string | undefined;
  readonly inputSchema: {
    readonly type: string;
    readonly properties?: Record<string, { readonly type: string; readonly description?: string | undefined }> | undefined;
    readonly required?: readonly string[] | undefined;
    readonly description?: string | undefined;
  };
}

interface ToolsListResponse {
  readonly tools: readonly RegisteredToolInfo[];
  readonly counts: {
    readonly total: number;
    readonly builtin: number;
    readonly plugin: number;
  };
}

interface ToolsReloadResponse {
  readonly success: boolean;
  readonly toolCount: number;
  readonly errors: readonly {
    readonly source: string;
    readonly toolName?: string | undefined;
    readonly message: string;
  }[];
}

interface Props {
  onBack: () => void;
}

const { onBack }: Props = $props();

/**
 * Component state
 */
let tools = $state<RegisteredToolInfo[]>([]);
let counts = $state<{ total: number; builtin: number; plugin: number }>({
  total: 0,
  builtin: 0,
  plugin: 0,
});
let loading = $state(true);
let error = $state<string | null>(null);
let expandedTool = $state<string | null>(null);
let reloading = $state(false);
let reloadMessage = $state<string | null>(null);
let reloadError = $state<string | null>(null);

/**
 * Sort tools: builtin first, then plugin, alphabetically within each group
 */
const sortedTools = $derived(
  [...tools].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === "builtin" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  }),
);

/**
 * Fetch tools from the server
 */
async function fetchTools(): Promise<void> {
  try {
    loading = true;
    error = null;
    const resp = await fetch("/api/tools");
    if (!resp.ok) {
      throw new Error(`Failed to fetch tools: ${resp.status}`);
    }
    const data = (await resp.json()) as ToolsListResponse;
    tools = [...data.tools];
    counts = { ...data.counts };
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load tools";
    console.error("Failed to fetch tools:", e);
  } finally {
    loading = false;
  }
}

/**
 * Reload plugin tools from disk
 */
async function handleReload(): Promise<void> {
  try {
    reloading = true;
    reloadError = null;
    reloadMessage = null;
    const resp = await fetch("/api/tools/reload", { method: "POST" });
    if (!resp.ok) {
      throw new Error(`Reload failed: ${resp.status}`);
    }
    const data = (await resp.json()) as ToolsReloadResponse;
    if (data.success) {
      reloadMessage = `Plugins reloaded (${data.toolCount} tools)`;
    } else {
      const errorMessages = data.errors.map((e) => e.message).join("; ");
      reloadError = `Reload completed with errors: ${errorMessages}`;
    }
    // Refresh the tool list after reload
    await fetchTools();
    // Clear success message after a delay
    if (reloadMessage !== null) {
      setTimeout(() => {
        reloadMessage = null;
      }, 3000);
    }
  } catch (e) {
    reloadError = e instanceof Error ? e.message : "Failed to reload plugins";
    console.error("Failed to reload plugins:", e);
  } finally {
    reloading = false;
  }
}

/**
 * Toggle tool detail expansion
 */
function toggleExpand(toolName: string): void {
  expandedTool = expandedTool === toolName ? null : toolName;
}

/**
 * Load tools on mount
 */
$effect(() => {
  void fetchTools();
});
</script>

<div
  class="tools-screen flex flex-col h-full bg-bg-primary"
  role="main"
  aria-label="Tools management"
>
  <!-- Header -->
  <header
    class="flex items-center justify-between px-4 py-3
           bg-bg-secondary border-b border-border-default"
  >
    <div class="flex items-center gap-3">
      <!-- Back button -->
      <button
        type="button"
        onclick={onBack}
        class="p-2 min-w-[44px] min-h-[44px]
               text-text-secondary hover:text-text-primary
               hover:bg-bg-hover rounded-lg
               transition-colors
               focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Back to previous screen"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <h1 class="text-lg font-semibold text-text-primary">Tools</h1>
    </div>

    <!-- Reload Plugins button -->
    <button
      type="button"
      onclick={() => void handleReload()}
      disabled={reloading}
      class="px-3 py-1.5 text-sm font-medium
             bg-bg-secondary hover:bg-bg-hover text-text-primary
             border border-border-default hover:border-blue-500/30
             disabled:opacity-50 disabled:cursor-not-allowed
             rounded-lg transition-colors
             focus:outline-none focus:ring-2 focus:ring-blue-500
             flex items-center gap-2"
      aria-label="Reload plugin tools from disk"
    >
      {#if reloading}
        <svg
          class="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        Reloading...
      {:else}
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
          aria-hidden="true"
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        Reload Plugins
      {/if}
    </button>
  </header>

  <!-- Summary bar -->
  {#if !loading && error === null}
    <div class="px-4 py-2 border-b border-border-default bg-bg-secondary text-sm text-text-secondary">
      <span class="font-medium text-text-primary">{counts.total}</span>
      tool{counts.total !== 1 ? "s" : ""}
      <span class="text-text-tertiary ml-1">
        ({counts.builtin} builtin, {counts.plugin} plugin)
      </span>
    </div>
  {/if}

  <!-- Reload success message -->
  {#if reloadMessage !== null}
    <div
      class="mx-4 mt-3 p-3 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 text-sm"
      role="status"
    >
      {reloadMessage}
    </div>
  {/if}

  <!-- Reload error message -->
  {#if reloadError !== null}
    <div
      class="mx-4 mt-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm"
      role="alert"
    >
      <div class="flex items-start gap-2">
        <span class="flex-1">{reloadError}</span>
        <button
          type="button"
          onclick={() => { reloadError = null; }}
          class="p-1 rounded hover:bg-red-500/20 transition-colors shrink-0"
          aria-label="Dismiss error"
        >
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
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Content Area -->
  <div class="flex-1 overflow-y-auto px-4 py-4">
    {#if loading}
      <!-- Loading State -->
      <div
        class="flex items-center justify-center py-12"
        role="status"
        aria-live="polite"
      >
        <svg
          class="animate-spin h-6 w-6 text-blue-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span class="ml-2 text-sm text-text-secondary">Loading tools...</span>
      </div>
    {:else if error !== null}
      <!-- Error State -->
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-red-400 mb-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p class="text-text-secondary mb-2">{error}</p>
        <button
          type="button"
          onclick={() => void fetchTools()}
          class="px-4 py-2 text-sm font-medium
                 bg-bg-secondary hover:bg-bg-hover text-text-primary
                 border border-border-default rounded-lg
                 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Retry
        </button>
      </div>
    {:else if sortedTools.length === 0}
      <!-- Empty State -->
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-text-tertiary mb-4"
          aria-hidden="true"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <p class="text-text-secondary mb-1">No tools registered</p>
        <p class="text-sm text-text-tertiary">
          Tools will appear here once registered.
        </p>
      </div>
    {:else}
      <!-- Tool List -->
      <div class="space-y-2" role="list">
        {#each sortedTools as tool (tool.name)}
          <div
            class="tool-card rounded-lg border border-border-default bg-bg-secondary
                   hover:border-blue-500/20 transition-colors"
            role="listitem"
          >
            <!-- Tool row (clickable) -->
            <button
              type="button"
              onclick={() => toggleExpand(tool.name)}
              class="w-full px-4 py-3 flex items-center gap-3 text-left
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset
                     rounded-lg"
              aria-expanded={expandedTool === tool.name}
            >
              <!-- Expand/collapse indicator -->
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
                class="shrink-0 text-text-tertiary transition-transform
                       {expandedTool === tool.name ? 'rotate-90' : ''}"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>

              <!-- Tool name -->
              <span class="font-mono text-sm text-text-primary">{tool.name}</span>

              <!-- Type badge -->
              {#if tool.source === "builtin"}
                <span
                  class="px-2 py-0.5 text-xs rounded-full
                         bg-neutral-600/30 text-text-secondary"
                >
                  builtin
                </span>
              {:else}
                <span
                  class="px-2 py-0.5 text-xs rounded-full
                         bg-blue-600/30 text-blue-300"
                >
                  plugin
                </span>
              {/if}

              <!-- Description (truncated) -->
              {#if tool.description}
                <span class="text-sm text-text-tertiary truncate flex-1 ml-2">
                  {tool.description}
                </span>
              {/if}
            </button>

            <!-- Expanded details -->
            {#if expandedTool === tool.name}
              <div class="px-4 pb-4 pt-0 border-t border-border-default mx-4 mt-0">
                <div class="pt-3 space-y-3">
                  <!-- Full description -->
                  {#if tool.description}
                    <div>
                      <h3 class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                        Description
                      </h3>
                      <p class="text-sm text-text-secondary">{tool.description}</p>
                    </div>
                  {/if}

                  <!-- Source info -->
                  <div>
                    <h3 class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                      Source
                    </h3>
                    <p class="text-sm text-text-secondary">
                      {tool.source}
                      {#if tool.pluginName !== undefined}
                        <span class="text-text-tertiary">({tool.pluginName})</span>
                      {/if}
                    </p>
                  </div>

                  <!-- Input schema -->
                  {#if tool.inputSchema?.properties !== undefined}
                    <div>
                      <h3 class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                        Parameters
                      </h3>
                      <div class="space-y-1">
                        {#each Object.entries(tool.inputSchema.properties) as [paramName, paramSchema]}
                          <div class="flex items-start gap-2 text-sm">
                            <span class="font-mono text-text-primary shrink-0">{paramName}</span>
                            <span class="text-text-tertiary">({paramSchema.type})</span>
                            {#if tool.inputSchema.required?.includes(paramName)}
                              <span class="text-xs text-red-400">required</span>
                            {/if}
                            {#if paramSchema.description !== undefined}
                              <span class="text-text-secondary">- {paramSchema.description}</span>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
