<script lang="ts">
  type RecentProject = {
    path: string;
    name: string;
    isGitRepo: boolean;
  };

  let {
    pickingDirectory,
    newProjectLoading,
    newProjectPath,
    newProjectError,
    chooseDirectoryLabel,
    availableRecentProjects,
    canManageProjects,
    onPickDirectory,
    onNewProjectPathChange,
    onOpenProject,
    onOpenRecentProject,
    onRemoveRecentProject,
  }: {
    pickingDirectory: boolean;
    newProjectLoading: boolean;
    newProjectPath: string;
    newProjectError: string | null;
    chooseDirectoryLabel: string;
    availableRecentProjects: RecentProject[];
    canManageProjects: boolean;
    onPickDirectory: () => Promise<void>;
    onNewProjectPathChange: (value: string) => void;
    onOpenProject: (path: string) => Promise<void>;
    onOpenRecentProject: (path: string) => Promise<void>;
    onRemoveRecentProject: (path: string) => Promise<void>;
  } = $props();
</script>

<div
  class="flex flex-col items-center justify-center h-full gap-6 text-text-secondary"
>
  <svg
    width="48"
    height="48"
    viewBox="0 0 16 16"
    fill="currentColor"
    class="text-text-tertiary"
  >
    <path
      d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
    />
  </svg>
  <p class="text-lg">No project open</p>
  <p class="text-sm text-text-tertiary">
    Open a project directory to get started.
  </p>

  <div class="w-full max-w-md flex flex-col gap-3">
    <button
      type="button"
      disabled={!canManageProjects || pickingDirectory || newProjectLoading}
      onclick={() => void onPickDirectory()}
      class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium
             bg-accent-emphasis hover:brightness-110 text-white
             disabled:opacity-50 disabled:cursor-not-allowed
             transition-all"
    >
      {#if pickingDirectory}
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
        Opening picker...
      {:else}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
          />
        </svg>
        {chooseDirectoryLabel}
      {/if}
    </button>

    <div class="flex items-center gap-2">
      <div class="h-px flex-1 bg-border-default"></div>
      <span class="text-xs text-text-tertiary">or enter path</span>
      <div class="h-px flex-1 bg-border-default"></div>
    </div>
    <form
      class="flex items-center gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        const path = newProjectPath.trim();
        if (path.length > 0) {
          void onOpenProject(path);
        }
      }}
    >
      <input
        type="text"
        value={newProjectPath}
        oninput={(e) =>
          onNewProjectPathChange((e.currentTarget as HTMLInputElement).value)}
        class="flex-1 px-3 py-2 text-sm rounded-lg border border-border-default
               bg-bg-secondary text-text-primary font-mono
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis
               placeholder:text-text-tertiary"
        placeholder="/path/to/project"
        disabled={!canManageProjects || newProjectLoading}
      />
      <button
        type="submit"
        disabled={!canManageProjects ||
          newProjectPath.trim().length === 0 ||
          newProjectLoading}
        class="px-4 py-2 rounded-lg text-sm font-medium
               bg-bg-tertiary hover:bg-border-default text-text-primary
               border border-border-default
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-colors"
      >
        {#if newProjectLoading}
          Opening...
        {:else}
          Open
        {/if}
      </button>
    </form>

    {#if newProjectError !== null}
      <div
        class="p-3 rounded-lg border border-danger-muted bg-danger-subtle text-danger-fg text-sm"
        role="alert"
      >
        {newProjectError}
      </div>
    {/if}
  </div>

  {#if availableRecentProjects.length > 0}
    <div class="w-full max-w-md">
      <h3
        class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-4"
      >
        Recent Projects
      </h3>
      <div
        class="border border-border-default rounded-lg bg-bg-secondary overflow-hidden"
      >
        {#each availableRecentProjects as recent (recent.path)}
          <div
            class="flex items-center border-b border-border-default last:border-b-0 hover:bg-bg-tertiary transition-colors"
          >
            <button
              type="button"
              disabled={!canManageProjects}
              class="flex-1 text-left px-4 py-2.5 text-sm flex items-center gap-3 min-w-0"
              onclick={() => void onOpenRecentProject(recent.path)}
              title={recent.path}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
                class="shrink-0 {recent.isGitRepo
                  ? 'text-accent-fg'
                  : 'text-text-tertiary'}"
              >
                <path
                  d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
                />
              </svg>
              <div class="flex-1 min-w-0">
                <span class="text-text-primary font-medium">{recent.name}</span>
                <span class="text-xs text-text-tertiary ml-2 truncate"
                  >{recent.path}</span
                >
              </div>
            </button>
            <button
              type="button"
              disabled={!canManageProjects}
              class="shrink-0 p-2 mr-2 rounded text-text-tertiary hover:text-danger-fg hover:bg-danger-subtle transition-colors"
              title="Remove from recent projects"
              onclick={() => void onRemoveRecentProject(recent.path)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path
                  d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
                />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if !canManageProjects}
    <p class="text-xs text-text-tertiary">
      Temporary project mode is active. Project add/change is disabled.
    </p>
  {/if}
</div>
