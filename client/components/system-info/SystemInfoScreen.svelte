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
  }

  /**
   * Component state
   */
  let systemInfo = $state<SystemInfo | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

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
            <h3 class="text-sm font-semibold text-text-primary mb-3">
              Models
            </h3>
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
      </div>
    {/if}
  </div>
</div>
