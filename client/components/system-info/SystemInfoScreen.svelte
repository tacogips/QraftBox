<script lang="ts">
  /**
   * SystemInfoScreen Component
   *
   * Screen for displaying system information (git version, Claude Code version).
   *
   * Features:
   * - Fetches system info from API on mount
   * - Displays version information for installed tools
   * - Loading, error, and empty states
   */

  interface ModelUsageStats {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadInputTokens: number;
    readonly cacheCreationInputTokens: number;
  }

  interface DailyActivity {
    readonly date: string;
    readonly messageCount?: number;
    readonly sessionCount?: number;
    readonly toolCallCount?: number;
    readonly tokensByModel?: Record<string, number>;
  }

  interface ClaudeCodeUsage {
    readonly totalSessions: number;
    readonly totalMessages: number;
    readonly firstSessionDate: string | null;
    readonly lastComputedDate: string | null;
    readonly modelUsage: Record<string, ModelUsageStats>;
    readonly recentDailyActivity: DailyActivity[];
  }

  interface SystemInfo {
    readonly git: {
      readonly version: string | null;
      readonly error: string | null;
    };
    readonly claudeCode: {
      readonly version: string | null;
      readonly error: string | null;
    };
    readonly models: {
      readonly promptModel: string;
      readonly assistantModel: string;
    };
    readonly claudeCodeUsage: ClaudeCodeUsage | null;
  }

  /**
   * Component state
   */
  let systemInfo = $state<SystemInfo | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  /**
   * Helper functions
   */
  function formatNumber(n: number): string {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  function formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  function getModelShortName(modelId: string): string {
    if (modelId.includes("opus-4-6")) return "Opus 4.6";
    if (modelId.includes("opus-4-5")) return "Opus 4.5";
    if (modelId.includes("sonnet-4-5")) return "Sonnet 4.5";
    if (modelId.includes("haiku")) return "Haiku";
    return modelId;
  }

  /**
   * Fetch system info from the server
   */
  async function fetchSystemInfo(): Promise<void> {
    try {
      loading = true;
      error = null;
      const resp = await fetch("/api/system-info");
      if (!resp.ok) {
        throw new Error(`Failed to fetch system info: ${resp.status}`);
      }
      const data = (await resp.json()) as SystemInfo;
      systemInfo = data;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load system info";
      console.error("Failed to fetch system info:", e);
    } finally {
      loading = false;
    }
  }

  /**
   * Load system info on mount
   */
  $effect(() => {
    void fetchSystemInfo();
  });
</script>

<div
  class="system-info-screen flex flex-col h-full bg-bg-primary"
  role="main"
  aria-label="System information"
>
  <!-- Header -->
  <div class="px-4 py-3 border-b border-border-default bg-bg-secondary">
    <h2 class="text-lg font-semibold text-text-primary">System Information</h2>
  </div>

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
          class="animate-spin h-6 w-6 text-accent-fg"
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
        <span class="ml-2 text-sm text-text-secondary"
          >Loading system information...</span
        >
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
          class="text-danger-fg mb-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p class="text-text-secondary mb-2">{error}</p>
        <button
          type="button"
          onclick={() => void fetchSystemInfo()}
          class="px-4 py-2 text-sm font-medium
                 bg-bg-secondary hover:bg-bg-hover text-text-primary
                 border border-border-default rounded-lg
                 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
        >
          Retry
        </button>
      </div>
    {:else if systemInfo !== null}
      <!-- System Info Display -->
      <div class="space-y-4 max-w-2xl">
        <!-- Git -->
        <div
          class="rounded-lg border border-border-default bg-bg-secondary p-4"
        >
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <h3 class="text-sm font-semibold text-text-primary mb-1">Git</h3>
              {#if systemInfo.git.version !== null}
                <p class="text-sm text-success-fg font-mono">
                  {systemInfo.git.version}
                </p>
              {:else if systemInfo.git.error !== null}
                <p class="text-sm text-danger-fg">
                  {systemInfo.git.error}
                </p>
              {:else}
                <p class="text-sm text-text-tertiary">
                  Version information not available
                </p>
              {/if}
            </div>
          </div>
        </div>

        <!-- Claude Code -->
        <div
          class="rounded-lg border border-border-default bg-bg-secondary p-4"
        >
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <h3 class="text-sm font-semibold text-text-primary mb-1">
                Claude Code
              </h3>
              {#if systemInfo.claudeCode.version !== null}
                <p class="text-sm text-success-fg font-mono">
                  {systemInfo.claudeCode.version}
                </p>
              {:else if systemInfo.claudeCode.error !== null}
                <p class="text-sm text-danger-fg">
                  {systemInfo.claudeCode.error}
                </p>
              {:else}
                <p class="text-sm text-text-tertiary">
                  Version information not available
                </p>
              {/if}
            </div>
          </div>
        </div>

        <!-- Models -->
        <div
          class="rounded-lg border border-border-default bg-bg-secondary p-4"
        >
          <div class="flex-1">
            <h3 class="text-sm font-semibold text-text-primary mb-3">Models</h3>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-text-secondary">Prompt Model</span>
                <span class="text-sm text-text-primary font-mono">
                  {systemInfo.models.promptModel}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-text-secondary">Assistant Model</span>
                <span class="text-sm text-text-primary font-mono">
                  {systemInfo.models.assistantModel}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Claude Code Usage -->
        {#if systemInfo.claudeCodeUsage !== null}
          <div
            class="rounded-lg border border-border-default bg-bg-secondary p-4"
          >
            <div class="flex-1">
              <h3 class="text-sm font-semibold text-text-primary mb-3">
                Claude Code Usage
              </h3>

              <!-- Overview Stats -->
              <div class="space-y-2 mb-4 pb-4 border-b border-border-default">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-text-secondary">Total Sessions</span
                  >
                  <span
                    class="text-sm text-text-primary font-mono tabular-nums"
                  >
                    {formatNumber(systemInfo.claudeCodeUsage.totalSessions)}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-text-secondary">Total Messages</span
                  >
                  <span
                    class="text-sm text-text-primary font-mono tabular-nums"
                  >
                    {formatNumber(systemInfo.claudeCodeUsage.totalMessages)}
                  </span>
                </div>
                {#if systemInfo.claudeCodeUsage.firstSessionDate !== null}
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-text-secondary"
                      >First Session</span
                    >
                    <span class="text-sm text-text-primary font-mono">
                      {formatDate(systemInfo.claudeCodeUsage.firstSessionDate)}
                    </span>
                  </div>
                {/if}
                {#if systemInfo.claudeCodeUsage.lastComputedDate !== null}
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-text-secondary"
                      >Last Computed</span
                    >
                    <span class="text-sm text-text-primary font-mono">
                      {formatDate(systemInfo.claudeCodeUsage.lastComputedDate)}
                    </span>
                  </div>
                {/if}
              </div>

              <!-- Model Usage -->
              {#if Object.keys(systemInfo.claudeCodeUsage.modelUsage).length > 0}
                <div class="mb-4 pb-4 border-b border-border-default">
                  <h4 class="text-sm font-semibold text-text-primary mb-2">
                    Model Usage
                  </h4>
                  <div class="space-y-3">
                    {#each Object.entries(systemInfo.claudeCodeUsage.modelUsage) as [modelId, stats]}
                      <div class="space-y-1">
                        <div class="text-sm font-medium text-text-primary">
                          {getModelShortName(modelId)}
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                          <div class="flex justify-between">
                            <span class="text-text-secondary">Input:</span>
                            <span
                              class="text-text-primary font-mono tabular-nums"
                              >{formatNumber(stats.inputTokens)}</span
                            >
                          </div>
                          <div class="flex justify-between">
                            <span class="text-text-secondary">Output:</span>
                            <span
                              class="text-text-primary font-mono tabular-nums"
                              >{formatNumber(stats.outputTokens)}</span
                            >
                          </div>
                          <div class="flex justify-between">
                            <span class="text-text-secondary">Cache Read:</span>
                            <span
                              class="text-text-primary font-mono tabular-nums"
                              >{formatNumber(stats.cacheReadInputTokens)}</span
                            >
                          </div>
                          <div class="flex justify-between">
                            <span class="text-text-secondary">Cache Write:</span
                            >
                            <span
                              class="text-text-primary font-mono tabular-nums"
                              >{formatNumber(
                                stats.cacheCreationInputTokens,
                              )}</span
                            >
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Recent Activity -->
              {#if systemInfo.claudeCodeUsage.recentDailyActivity.length > 0}
                <div>
                  <h4 class="text-sm font-semibold text-text-primary mb-2">
                    Recent Activity (Last 14 Days)
                  </h4>
                  <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                      <thead>
                        <tr class="border-b border-border-default">
                          <th
                            class="text-left py-2 pr-4 text-text-secondary font-medium"
                            >Date</th
                          >
                          <th
                            class="text-right py-2 px-2 text-text-secondary font-medium"
                            >Messages</th
                          >
                          <th
                            class="text-right py-2 px-2 text-text-secondary font-medium"
                            >Sessions</th
                          >
                          <th
                            class="text-right py-2 pl-2 text-text-secondary font-medium"
                            >Tool Calls</th
                          >
                        </tr>
                      </thead>
                      <tbody>
                        {#each systemInfo.claudeCodeUsage.recentDailyActivity as activity}
                          <tr class="border-b border-border-default/50">
                            <td class="py-2 pr-4 text-text-primary font-mono">
                              {formatDate(activity.date)}
                            </td>
                            <td
                              class="py-2 px-2 text-right text-text-primary font-mono tabular-nums"
                            >
                              {activity.messageCount ?? 0}
                            </td>
                            <td
                              class="py-2 px-2 text-right text-text-primary font-mono tabular-nums"
                            >
                              {activity.sessionCount ?? 0}
                            </td>
                            <td
                              class="py-2 pl-2 text-right text-text-primary font-mono tabular-nums"
                            >
                              {activity.toolCallCount ?? 0}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
