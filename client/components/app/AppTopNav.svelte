<script lang="ts">
  import type { ScreenType } from "../../src/lib/app-routing";
  import type { ServerTab, RecentProject } from "../../src/lib/app-api";
  import GitPushButton from "../git-actions/GitPushButton.svelte";
  import HeaderStatusBadges from "../HeaderStatusBadges.svelte";
  import WorktreeButton from "../worktree/WorktreeButton.svelte";

  let {
    currentScreen,
    workspaceTabs,
    contextId,
    projectPath,
    activeTabIsGitRepo,
    hasChanges,
    availableRecentProjects,
    newProjectPath,
    newProjectError,
    newProjectLoading,
    pickingDirectory,
    onNavigateToScreen,
    onSwitchProject,
    onCloseProjectTab,
    onFetchRecentProjects,
    onNewProjectPathChange,
    onOpenProjectByPath,
    onOpenRecentProject,
    onRemoveRecentProject,
    onPickDirectory,
    onWorktreeSwitch,
    onPushSuccess,
  }: {
    currentScreen: ScreenType;
    workspaceTabs: ServerTab[];
    contextId: string | null;
    projectPath: string;
    activeTabIsGitRepo: boolean;
    hasChanges: boolean;
    availableRecentProjects: RecentProject[];
    newProjectPath: string;
    newProjectError: string | null;
    newProjectLoading: boolean;
    pickingDirectory: boolean;
    onNavigateToScreen: (screen: ScreenType) => void;
    onSwitchProject: (tabId: string) => Promise<void>;
    onCloseProjectTab: (tabId: string, event: MouseEvent) => Promise<void>;
    onFetchRecentProjects: () => Promise<void>;
    onNewProjectPathChange: (value: string) => void;
    onOpenProjectByPath: (path: string) => Promise<void>;
    onOpenRecentProject: (path: string) => Promise<void>;
    onRemoveRecentProject: (path: string) => Promise<void>;
    onPickDirectory: () => Promise<void>;
    onWorktreeSwitch: () => Promise<void>;
    onPushSuccess: () => Promise<void>;
  } = $props();

  let headerMenuOpen = $state(false);
  let addProjectMenuOpen = $state(false);
  let addProjectBtnEl = $state<HTMLButtonElement | undefined>(undefined);
  let pathCopied = $state(false);

  function copyPath(): void {
    void navigator.clipboard.writeText(projectPath).then(() => {
      pathCopied = true;
      setTimeout(() => {
        pathCopied = false;
      }, 1500);
    });
  }

  function truncatePath(path: string, maxLength = 30): string {
    if (path.length <= maxLength) {
      return path;
    }
    return "..." + path.slice(-maxLength);
  }
</script>

<header
  class="h-12 border-b border-border-default flex items-center px-4 bg-bg-secondary gap-4"
>
  <h1 class="text-lg font-semibold">QraftBox</h1>

  <div class="flex items-center ml-4 h-full flex-1 min-w-0">
    <nav
      class="flex items-center gap-0 h-full overflow-x-auto project-tabs-nav flex-1 min-w-0"
    >
      <button
        type="button"
        class="px-3 py-1.5 text-sm transition-colors h-full border-b-2 shrink-0 touch-manipulation
               {currentScreen === 'project'
          ? 'text-text-primary font-semibold border-accent-emphasis'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
        onclick={() => onNavigateToScreen("project")}
      >
        Project
      </button>
      {#if workspaceTabs.length > 0}
        <span class="text-border-default mx-1 shrink-0">|</span>
        {#each workspaceTabs as tab (tab.id)}
          <div class="flex items-center h-full shrink-0 group">
            <button
              type="button"
              class="pl-3 pr-1 py-1.5 text-sm transition-colors h-full border-b-2 whitespace-nowrap touch-manipulation
                     {tab.id === contextId
                ? 'text-text-primary font-semibold border-accent-emphasis'
                : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
              onclick={() => void onSwitchProject(tab.id)}
              title={tab.path}
            >
              {tab.name}
            </button>
            <button
              type="button"
              class="project-tab-close w-4 h-4 flex items-center justify-center shrink-0 mr-1
                     rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary
                     {tab.id === contextId ? 'project-tab-close-active' : ''}"
              onclick={(e) => void onCloseProjectTab(tab.id, e)}
              title="Close {tab.name}"
            >
              <svg
                width="10"
                height="10"
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
      {/if}

      <button
        type="button"
        class="px-2 py-1 text-sm text-text-tertiary hover:text-text-primary transition-colors h-full shrink-0"
        bind:this={addProjectBtnEl}
        onclick={() => {
          addProjectMenuOpen = !addProjectMenuOpen;
          if (addProjectMenuOpen) {
            onNewProjectPathChange("");
            void onFetchRecentProjects();
          }
        }}
        title="Add project"
      >
        +
      </button>
    </nav>
  </div>

  <div class="ml-auto relative">
    <button
      type="button"
      class="p-2 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
      onclick={() => (headerMenuOpen = !headerMenuOpen)}
      aria-label="Open menu"
      title="Open menu"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z"
        ></path>
      </svg>
    </button>
    {#if headerMenuOpen}
      <div
        class="absolute right-0 top-full mt-1 w-40 bg-bg-secondary border border-border-default rounded-md shadow-lg z-50 py-1"
      >
        <button
          type="button"
          class="w-full text-left px-4 py-2 text-sm hover:bg-bg-tertiary transition-colors
                 {currentScreen === 'tools'
            ? 'text-text-primary font-semibold'
            : 'text-text-secondary'}"
          onclick={() => {
            onNavigateToScreen("tools");
            headerMenuOpen = false;
          }}
        >
          Tools
        </button>
        <button
          type="button"
          class="w-full text-left px-4 py-2 text-sm hover:bg-bg-tertiary transition-colors
                 {currentScreen === 'system-info'
            ? 'text-text-primary font-semibold'
            : 'text-text-secondary'}"
          onclick={() => {
            onNavigateToScreen("system-info");
            headerMenuOpen = false;
          }}
        >
          System Info
        </button>
        <button
          type="button"
          class="w-full text-left px-4 py-2 text-sm hover:bg-bg-tertiary transition-colors
                 {currentScreen === 'model-config'
            ? 'text-text-primary font-semibold'
            : 'text-text-secondary'}"
          onclick={() => {
            onNavigateToScreen("model-config");
            headerMenuOpen = false;
          }}
        >
          Model Config
        </button>
      </div>
    {/if}
  </div>
</header>

{#if headerMenuOpen || addProjectMenuOpen}
  <div
    class="fixed inset-0 z-40"
    onclick={() => {
      headerMenuOpen = false;
      addProjectMenuOpen = false;
    }}
    onkeydown={() => {}}
    role="presentation"
  ></div>
{/if}

{#if addProjectMenuOpen && addProjectBtnEl !== undefined}
  {@const rect = addProjectBtnEl.getBoundingClientRect()}
  <div
    class="fixed w-80 bg-bg-secondary border border-border-default rounded-md shadow-lg z-50 py-1"
    style="top: {rect.bottom + 4}px; left: {Math.min(
      rect.left,
      window.innerWidth - 336,
    )}px;"
  >
    <div class="px-3 py-2">
      <label
        for="open-directory-input"
        class="text-xs text-text-tertiary font-semibold uppercase tracking-wider mb-1.5 block"
      >
        Open Directory
      </label>
      <form
        class="flex items-center gap-1.5"
        onsubmit={(e) => {
          e.preventDefault();
          void onOpenProjectByPath(newProjectPath);
        }}
      >
        <input
          id="open-directory-input"
          type="text"
          value={newProjectPath}
          oninput={(e) =>
            onNewProjectPathChange((e.currentTarget as HTMLInputElement).value)}
          class="flex-1 px-2 py-1.5 text-sm rounded border border-border-default
                 bg-bg-primary text-text-primary font-mono
                 focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                 placeholder:text-text-tertiary"
          placeholder="/path/to/project"
          disabled={newProjectLoading || pickingDirectory}
        />
        <button
          type="button"
          disabled={pickingDirectory || newProjectLoading}
          onclick={() => void onPickDirectory()}
          class="p-1.5 rounded text-text-secondary hover:text-accent-fg hover:bg-bg-tertiary
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-colors shrink-0"
          title="Browse directories"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
            />
          </svg>
        </button>
        <button
          type="submit"
          disabled={newProjectPath.trim().length === 0 || newProjectLoading}
          class="px-2 py-1.5 rounded text-sm font-medium
                 bg-bg-tertiary text-text-primary hover:bg-border-default
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-colors shrink-0"
        >
          {newProjectLoading ? "..." : "Open"}
        </button>
      </form>
      {#if newProjectError !== null}
        <p class="mt-1.5 text-xs text-danger-fg">{newProjectError}</p>
      {/if}
    </div>

    {#if availableRecentProjects.length > 0}
      <div class="border-t border-border-default my-1"></div>
      <div
        class="px-4 py-1 text-xs text-text-tertiary font-semibold uppercase tracking-wider"
      >
        Previous Projects
      </div>
      <div class="max-h-60 overflow-y-auto">
        {#each availableRecentProjects as recent (recent.path)}
          <div class="flex items-center hover:bg-bg-tertiary transition-colors">
            <button
              type="button"
              class="flex-1 text-left px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2 min-w-0"
              onclick={() => void onOpenRecentProject(recent.path)}
              title={recent.path}
            >
              <svg
                width="12"
                height="12"
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
              <span class="truncate flex-1">{recent.name}</span>
              <span class="text-xs text-text-tertiary truncate max-w-[120px]"
                >{truncatePath(recent.path, 20)}</span
              >
            </button>
            <button
              type="button"
              class="shrink-0 p-1 mr-2 rounded text-text-tertiary hover:text-danger-fg hover:bg-danger-subtle transition-colors"
              title="Remove from history"
              onclick={(e) => {
                e.stopPropagation();
                void onRemoveRecentProject(recent.path);
              }}
            >
              <svg
                width="10"
                height="10"
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
    {/if}
  </div>
{/if}

<div
  class="flex items-center bg-bg-secondary border-b border-border-default px-2 overflow-x-auto"
>
  {#if projectPath}
    <div
      class="py-2 px-4 text-sm border-b-2 border-accent-emphasis text-text-primary flex items-center gap-1"
      title={projectPath}
    >
      <span
        class="overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]"
      >
        {truncatePath(projectPath)}
      </span>
      <button
        type="button"
        class="text-text-secondary hover:text-text-primary transition-colors"
        onclick={copyPath}
        title="Copy path to clipboard"
      >
        {#if pathCopied}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
              fill="currentColor"
            />
          </svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M5.75 1a.75.75 0 0 0-.75.75v.5h-.5A1.75 1.75 0 0 0 2.75 4v9.5c0 .966.784 1.75 1.75 1.75h7a1.75 1.75 0 0 0 1.75-1.75V4a1.75 1.75 0 0 0-1.75-1.75h-.5v-.5A.75.75 0 0 0 10.25 1h-4.5zM10 2.5v.5h-4v-.5h4zm-6.5 2a.25.25 0 0 1 .25-.25h7.5a.25.25 0 0 1 .25.25v9.5a.25.25 0 0 1-.25.25h-7.5a.25.25 0 0 1-.25-.25V4.5z"
              fill="currentColor"
            />
          </svg>
        {/if}
      </button>
    </div>
  {/if}

  {#if contextId !== null}
    <WorktreeButton
      {contextId}
      {projectPath}
      {onWorktreeSwitch}
      disabled={!activeTabIsGitRepo}
    />
  {/if}

  {#if contextId !== null && activeTabIsGitRepo}
    <HeaderStatusBadges {contextId} {projectPath} />
    <span class="text-border-default mx-1">|</span>
  {/if}

  <nav class="flex items-center gap-0 h-full">
    <button
      type="button"
      class="px-3 py-1.5 text-sm transition-colors h-full border-b-2
             {currentScreen === 'files'
        ? 'text-text-primary font-semibold border-accent-emphasis'
        : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
      onclick={() => onNavigateToScreen("files")}
    >
      Files
    </button>
    <button
      type="button"
      class="px-3 py-1.5 text-sm transition-colors h-full border-b-2
             {currentScreen === 'ai-session'
        ? 'text-text-primary font-semibold border-accent-emphasis'
        : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
      onclick={() => onNavigateToScreen("ai-session")}
    >
      AI Session
    </button>
    <button
      type="button"
      class="px-3 py-1.5 text-sm transition-colors h-full border-b-2
             {currentScreen === 'commits'
        ? 'text-text-primary font-semibold border-accent-emphasis'
        : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
      onclick={() => onNavigateToScreen("commits")}
    >
      Commits
    </button>
    <button
      type="button"
      class="px-3 py-1.5 text-sm transition-colors h-full border-b-2
             {currentScreen === 'terminal'
        ? 'text-text-primary font-semibold border-accent-emphasis'
        : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
      onclick={() => onNavigateToScreen("terminal")}
    >
      Terminal
    </button>
  </nav>

  <div class="ml-auto py-1 px-2">
    {#if contextId !== null}
      <GitPushButton
        {contextId}
        {projectPath}
        {hasChanges}
        onSuccess={onPushSuccess}
        isGitRepo={activeTabIsGitRepo}
      />
    {/if}
  </div>
</div>

<style>
  .project-tabs-nav {
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x;
  }
  .project-tabs-nav::-webkit-scrollbar {
    display: none;
  }

  .project-tabs-nav button {
    touch-action: manipulation;
  }

  .project-tab-close {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  .group:hover .project-tab-close,
  .group:focus-within .project-tab-close,
  .project-tab-close-active {
    opacity: 1;
    pointer-events: auto;
  }

  @media (hover: none) {
    .group .project-tab-close {
      opacity: 0;
      pointer-events: none;
    }

    .group .project-tab-close.project-tab-close-active {
      opacity: 1;
      pointer-events: auto;
    }
  }
</style>
