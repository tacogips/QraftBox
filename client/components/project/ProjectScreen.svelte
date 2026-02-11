<script lang="ts">
  /**
   * ProjectScreen Component
   *
   * Main screen for project directory management.
   * Shows current project info and allows selecting/loading a different project directory.
   *
   * Props:
   * - contextId: Current workspace context ID
   * - projectPath: Current project directory path
   * - onProjectChanged: Callback when project directory is changed
   */

  interface DirectoryEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    isGitRepo: boolean;
    isSymlink: boolean;
    isHidden: boolean;
    modifiedAt: number;
  }

  interface DirectoryListing {
    path: string;
    parentPath: string | null;
    entries: DirectoryEntry[];
    canGoUp: boolean;
  }

  interface Props {
    contextId: string;
    projectPath: string;
    onProjectChanged?: () => void;
  }

  const { contextId, projectPath, onProjectChanged }: Props = $props();

  // State
  let showBrowser = $state(false);
  let browserPath = $state("");
  let browserEntries = $state<DirectoryEntry[]>([]);
  let browserParentPath = $state<string | null>(null);
  let browserCanGoUp = $state(false);
  let browserLoading = $state(false);
  let browserError = $state<string | null>(null);
  let showHidden = $state(false);
  let pathInput = $state("");
  let navigating = $state(false);
  let successMessage = $state<string | null>(null);

  /**
   * Visible entries filtered by hidden toggle
   */
  const visibleEntries = $derived(
    showHidden
      ? browserEntries.filter((e) => e.isDirectory)
      : browserEntries.filter((e) => e.isDirectory && !e.isHidden),
  );

  /**
   * Open the directory browser starting from the current project path
   */
  async function openBrowser(): Promise<void> {
    showBrowser = true;
    await browseTo(projectPath);
  }

  /**
   * Browse to a specific directory path
   */
  async function browseTo(dirPath: string): Promise<void> {
    try {
      browserLoading = true;
      browserError = null;

      const resp = await fetch(
        `/api/browse?path=${encodeURIComponent(dirPath)}`,
      );
      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }

      const data = (await resp.json()) as DirectoryListing;
      browserPath = data.path;
      browserEntries = data.entries;
      browserParentPath = data.parentPath;
      browserCanGoUp = data.canGoUp;
      pathInput = data.path;
    } catch (e) {
      browserError =
        e instanceof Error ? e.message : "Failed to browse directory";
    } finally {
      browserLoading = false;
    }
  }

  /**
   * Navigate to a path entered in the input field
   */
  async function handlePathInputSubmit(): Promise<void> {
    const trimmed = pathInput.trim();
    if (trimmed.length === 0) return;
    await browseTo(trimmed);
  }

  /**
   * Select the current browser path as the project directory
   */
  async function selectCurrentPath(): Promise<void> {
    if (browserPath === projectPath) {
      showBrowser = false;
      return;
    }

    try {
      navigating = true;
      browserError = null;

      // Open the new directory via workspace tabs API
      const resp = await fetch("/api/workspace/tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: browserPath }),
      });

      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }

      successMessage = `Project opened: ${browserPath}`;
      showBrowser = false;

      // Notify parent to refresh
      if (onProjectChanged !== undefined) {
        onProjectChanged();
      }
    } catch (e) {
      browserError =
        e instanceof Error ? e.message : "Failed to open project directory";
    } finally {
      navigating = false;
    }
  }

  /**
   * Navigate to home directory
   */
  async function goHome(): Promise<void> {
    try {
      const resp = await fetch("/api/browse/home");
      if (!resp.ok) throw new Error("Failed to get home directory");
      const data = (await resp.json()) as { path: string };
      await browseTo(data.path);
    } catch (e) {
      browserError =
        e instanceof Error ? e.message : "Failed to navigate to home";
    }
  }

  /**
   * Navigate to filesystem root
   */
  async function goRoot(): Promise<void> {
    await browseTo("/");
  }

  /**
   * Truncate long paths for display
   */
  function truncatePath(path: string, maxLen: number): string {
    if (path.length <= maxLen) return path;
    return "..." + path.slice(path.length - maxLen + 3);
  }

  /**
   * Format the directory name from path
   */
  function dirName(dirPath: string): string {
    const parts = dirPath.replace(/\/$/, "").split("/");
    const last = parts[parts.length - 1];
    return last !== undefined && last.length > 0 ? last : "/";
  }
</script>

<div
  class="project-screen flex flex-col h-full bg-bg-primary"
  role="main"
  aria-label="Project management"
>
  <div class="flex-1 overflow-y-auto px-6 py-4">
    <!-- Success Banner -->
    {#if successMessage !== null}
      <div
        class="mb-4 p-4 rounded-lg border border-success-muted bg-success-subtle text-success-fg"
        role="status"
      >
        <div class="flex items-start gap-3">
          <p class="flex-1">{successMessage}</p>
          <button
            type="button"
            onclick={() => {
              successMessage = null;
            }}
            class="p-1 rounded hover:bg-success-subtle transition-colors text-sm"
            aria-label="Dismiss message"
          >
            x
          </button>
        </div>
      </div>
    {/if}

    <!-- Current Project Info -->
    <div class="mb-6">
      <h2
        class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3"
      >
        Current Project
      </h2>
      <div class="p-4 rounded-lg border border-border-default bg-bg-secondary">
        <div class="flex items-center gap-3">
          <!-- Folder icon -->
          <div class="shrink-0">
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="text-accent-fg"
            >
              <path
                d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
              />
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-text-primary">
              {dirName(projectPath)}
            </p>
            <p
              class="text-xs text-text-tertiary font-mono truncate mt-0.5"
              title={projectPath}
            >
              {projectPath}
            </p>
          </div>

          <!-- Open / Change button -->
          <button
            type="button"
            onclick={() => void openBrowser()}
            class="px-3 py-1.5 rounded-lg text-sm font-medium
                   bg-bg-tertiary hover:bg-border-default text-text-primary
                   border border-border-default hover:border-accent-muted
                   transition-all shrink-0"
          >
            Change
          </button>
        </div>
      </div>
    </div>

    <!-- Directory Browser -->
    {#if showBrowser}
      <div class="mb-6">
        <div
          class="rounded-lg border border-border-default bg-bg-secondary overflow-hidden"
        >
          <!-- Browser Header -->
          <div
            class="p-3 border-b border-border-default bg-bg-tertiary flex items-center gap-2"
          >
            <h3 class="text-sm font-semibold text-text-primary shrink-0">
              Select Project Directory
            </h3>
            <div class="flex-1"></div>
            <button
              type="button"
              onclick={() => {
                showBrowser = false;
              }}
              class="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
              aria-label="Close browser"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path
                  d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
                />
              </svg>
            </button>
          </div>

          <!-- Path Input -->
          <div class="p-3 border-b border-border-default">
            <div class="flex items-center gap-2">
              <!-- Quick nav buttons -->
              <button
                type="button"
                onclick={() => void goHome()}
                class="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                title="Home directory"
              >
                ~
              </button>
              <button
                type="button"
                onclick={() => void goRoot()}
                class="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                title="Root directory"
              >
                /
              </button>
              {#if browserCanGoUp && browserParentPath !== null}
                <button
                  type="button"
                  onclick={() => {
                    if (browserParentPath !== null)
                      void browseTo(browserParentPath);
                  }}
                  class="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                  title="Parent directory"
                >
                  ..
                </button>
              {/if}

              <!-- Path input -->
              <form
                class="flex-1 flex items-center gap-2"
                onsubmit={(e) => {
                  e.preventDefault();
                  void handlePathInputSubmit();
                }}
              >
                <input
                  type="text"
                  bind:value={pathInput}
                  class="flex-1 px-3 py-1.5 text-sm rounded border border-border-default
                         bg-bg-primary text-text-primary font-mono
                         focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                         placeholder:text-text-tertiary"
                  placeholder="Enter path..."
                />
                <button
                  type="submit"
                  class="px-3 py-1.5 rounded text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary border border-border-default transition-colors"
                >
                  Go
                </button>
              </form>
            </div>
          </div>

          <!-- Error -->
          {#if browserError !== null}
            <div
              class="mx-3 mt-3 p-3 rounded border border-danger-muted bg-danger-subtle text-danger-fg text-sm"
              role="alert"
            >
              {browserError}
            </div>
          {/if}

          <!-- Directory List -->
          <div class="max-h-80 overflow-y-auto">
            {#if browserLoading}
              <div class="flex items-center justify-center py-8">
                <svg
                  class="animate-spin h-5 w-5 text-accent-fg"
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
              </div>
            {:else if visibleEntries.length === 0}
              <div class="text-center py-8 text-text-tertiary text-sm">
                No subdirectories
              </div>
            {:else}
              {#each visibleEntries as entry (entry.path)}
                <button
                  type="button"
                  onclick={() => void browseTo(entry.path)}
                  class="w-full text-left px-4 py-2 flex items-center gap-3
                           hover:bg-bg-tertiary transition-colors border-b border-border-default last:border-b-0"
                >
                  <!-- Folder icon -->
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    class={entry.isGitRepo
                      ? "text-accent-fg"
                      : "text-text-tertiary"}
                  >
                    <path
                      d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
                    />
                  </svg>
                  <span
                    class="text-sm text-text-primary truncate"
                    class:font-medium={entry.isGitRepo}
                  >
                    {entry.name}
                  </span>
                  {#if entry.isGitRepo}
                    <span
                      class="px-1.5 py-0.5 text-xs rounded bg-accent-subtle text-accent-fg shrink-0"
                    >
                      git
                    </span>
                  {/if}
                  {#if entry.isSymlink}
                    <span
                      class="px-1.5 py-0.5 text-xs rounded bg-bg-tertiary text-text-tertiary shrink-0"
                    >
                      link
                    </span>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>

          <!-- Browser Footer -->
          <div
            class="p-3 border-t border-border-default bg-bg-tertiary flex items-center gap-3"
          >
            <!-- Show hidden toggle -->
            <label
              class="flex items-center gap-1.5 text-xs text-text-secondary"
            >
              <input
                type="checkbox"
                bind:checked={showHidden}
                class="rounded border-border-default"
              />
              Show hidden
            </label>

            <div class="flex-1"></div>

            <!-- Current path display -->
            <span
              class="text-xs text-text-tertiary font-mono truncate max-w-[300px]"
              title={browserPath}
            >
              {truncatePath(browserPath, 40)}
            </span>

            <!-- Select button -->
            <button
              type="button"
              disabled={navigating || browserPath === projectPath}
              onclick={() => void selectCurrentPath()}
              class="px-4 py-1.5 rounded-lg text-sm font-medium
                     bg-success-emphasis hover:brightness-110 text-white
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
            >
              {#if navigating}
                Opening...
              {:else if browserPath === projectPath}
                Current Project
              {:else}
                Open This Directory
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
