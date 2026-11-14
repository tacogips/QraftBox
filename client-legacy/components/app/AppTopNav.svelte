<script lang="ts">
  import type { ScreenType } from "../../src/lib/app-routing";
  import type { ServerTab, RecentProject } from "../../src/lib/app-api";
  import HeaderStatusBadges from "../HeaderStatusBadges.svelte";
  import WorktreeButton from "../worktree/WorktreeButton.svelte";

  let {
    currentScreen,
    workspaceTabs,
    contextId,
    projectPath,
    activeTabIsGitRepo,
    availableRecentProjects,
    newProjectPath,
    newProjectError,
    newProjectLoading,
    pickingDirectory,
    canManageProjects,
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
    availableRecentProjects: RecentProject[];
    newProjectPath: string;
    newProjectError: string | null;
    newProjectLoading: boolean;
    pickingDirectory: boolean;
    canManageProjects: boolean;
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
    onPushSuccess: (
      action: "commit" | "push" | "pull" | "pr" | "init",
    ) => Promise<void>;
  } = $props();

  let headerMenuOpen = $state(false);
  let addProjectMenuOpen = $state(false);
  let projectPanelOpen = $state(false);
  let projectTreeExpanded = $state(true);
  let initializingRepo = $state(false);
  let initRepoError = $state<string | null>(null);

  const activeProjectTab = $derived(
    workspaceTabs.find((tab) => tab.id === contextId) ?? null,
  );

  const activeProjectLabel = $derived(activeProjectTab?.name ?? "No Project");

  function truncatePath(path: string, maxLength = 30): string {
    if (path.length <= maxLength) {
      return path;
    }
    return "..." + path.slice(-maxLength);
  }

  async function handleInitRepositoryFromMenu(): Promise<void> {
    if (contextId === null || activeTabIsGitRepo || initializingRepo) {
      return;
    }

    initializingRepo = true;
    initRepoError = null;
    try {
      const resp = await fetch("/api/git-actions/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath }),
      });

      if (!resp.ok) {
        const errData = (await resp.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          errData.error ?? `Git init failed with status ${resp.status}`,
        );
      }

      await onPushSuccess("init");
      headerMenuOpen = false;
    } catch (e) {
      initRepoError = e instanceof Error ? e.message : "Git init failed";
    } finally {
      initializingRepo = false;
    }
  }
</script>

<header
  class="h-12 border-b border-border-default flex items-center px-4 bg-bg-secondary gap-4"
>
  <div class="flex items-center gap-2 shrink-0">
    <h1 class="text-lg font-semibold">QraftBox</h1>
    <button
      type="button"
      class="h-9 max-w-[240px] px-3 rounded border border-border-default bg-bg-primary text-sm
             text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors
             flex items-center gap-2"
      onclick={() => {
        projectPanelOpen = !projectPanelOpen;
        if (projectPanelOpen) {
          headerMenuOpen = false;
        }
      }}
      title={projectPath}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="currentColor"
        class="transition-transform {projectPanelOpen ? 'rotate-90' : ''}"
      >
        <path
          d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
        />
      </svg>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
        />
      </svg>
      <span class="truncate">{activeProjectLabel}</span>
      <span class="text-xs text-text-tertiary">({workspaceTabs.length})</span>
    </button>
  </div>
  <div class="flex items-center min-w-0 flex-1 gap-2 overflow-hidden">
    <nav class="flex items-center gap-0 h-full overflow-x-auto">
      <button
        type="button"
        class="px-3 py-1.5 text-sm transition-colors h-full border-b-2 whitespace-nowrap
               {currentScreen === 'files'
          ? 'text-text-primary font-semibold border-accent-emphasis'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
        onclick={() => onNavigateToScreen("files")}
      >
        Files
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm transition-colors h-full border-b-2 whitespace-nowrap
               {currentScreen === 'ai-session'
          ? 'text-text-primary font-semibold border-accent-emphasis'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
        onclick={() => onNavigateToScreen("ai-session")}
      >
        Sessions
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm transition-colors h-full border-b-2 whitespace-nowrap
               {currentScreen === 'commits'
          ? 'text-text-primary font-semibold border-accent-emphasis'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
        onclick={() => onNavigateToScreen("commits")}
      >
        Commits
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm transition-colors h-full border-b-2 whitespace-nowrap
               {currentScreen === 'terminal'
          ? 'text-text-primary font-semibold border-accent-emphasis'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-emphasis'}"
        onclick={() => onNavigateToScreen("terminal")}
      >
        Terminal
      </button>
    </nav>
  </div>

  <div class="ml-auto flex items-center gap-2">
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
      <span class="text-border-default mx-1 shrink-0">|</span>
    {/if}

    <div class="relative">
      <button
        type="button"
        class="p-2 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        onclick={() => {
          headerMenuOpen = !headerMenuOpen;
          if (headerMenuOpen) {
            projectPanelOpen = false;
            addProjectMenuOpen = false;
          }
        }}
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
          class="absolute right-0 top-full mt-1 w-48 bg-bg-secondary border border-border-default rounded-md shadow-lg z-50 py-1"
        >
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
                 {currentScreen === 'model-profiles'
              ? 'text-text-primary font-semibold'
              : 'text-text-secondary'}"
            onclick={() => {
              onNavigateToScreen("model-profiles");
              headerMenuOpen = false;
            }}
          >
            Model Profiles
          </button>
          <button
            type="button"
            class="w-full text-left px-4 py-2 text-sm hover:bg-bg-tertiary transition-colors
                 {currentScreen === 'notifications'
              ? 'text-text-primary font-semibold'
              : 'text-text-secondary'}"
            onclick={() => {
              onNavigateToScreen("notifications");
              headerMenuOpen = false;
            }}
          >
            Notifications
          </button>
          <button
            type="button"
            class="w-full text-left px-4 py-2 text-sm hover:bg-bg-tertiary transition-colors
                 {currentScreen === 'action-defaults'
              ? 'text-text-primary font-semibold'
              : 'text-text-secondary'}"
            onclick={() => {
              onNavigateToScreen("action-defaults");
              headerMenuOpen = false;
            }}
          >
            Action Defaults
          </button>
          {#if contextId !== null && !activeTabIsGitRepo}
            <div class="border-t border-border-default my-1"></div>
            <button
              type="button"
              class="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-bg-tertiary
                     hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onclick={() => void handleInitRepositoryFromMenu()}
              disabled={initializingRepo}
            >
              {initializingRepo
                ? "Initializing Git Repository..."
                : "Initialize Git Repository"}
            </button>
            {#if initRepoError !== null}
              <p class="px-4 py-2 text-xs text-danger-fg">{initRepoError}</p>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </div>
</header>

{#if headerMenuOpen || projectPanelOpen}
  <div
    class="fixed inset-0 z-40"
    onclick={() => {
      headerMenuOpen = false;
      projectPanelOpen = false;
    }}
    onkeydown={() => {}}
    role="presentation"
  ></div>
{/if}

{#if projectPanelOpen}
  <aside
    class="fixed top-12 left-0 bottom-0 z-50 w-[22rem] max-w-[92vw] border-r border-border-default bg-bg-secondary shadow-xl flex flex-col"
  >
    <div
      class="h-10 px-3 border-b border-border-default flex items-center justify-between"
    >
      <span
        class="text-xs font-semibold uppercase tracking-wider text-text-tertiary"
        >Workspace</span
      >
      <span class="text-xs text-text-tertiary"
        >{workspaceTabs.length} projects</span
      >
    </div>

    <div class="overflow-y-auto flex-1 p-2">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex-1 h-8 px-2 rounded text-sm text-left text-text-secondary hover:text-text-primary hover:bg-bg-tertiary flex items-center gap-2"
          onclick={() => {
            projectTreeExpanded = !projectTreeExpanded;
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="transition-transform {projectTreeExpanded
              ? 'rotate-90'
              : ''}"
          >
            <path
              d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
            />
          </svg>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"
            />
          </svg>
          <span>Projects</span>
        </button>
        <button
          type="button"
          class="h-8 w-8 rounded border border-border-default text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canManageProjects}
          onclick={() => {
            if (!canManageProjects) return;
            addProjectMenuOpen = true;
            onNewProjectPathChange("");
            void onFetchRecentProjects();
          }}
          title="New project"
          aria-label="New project"
        >
          +
        </button>
      </div>

      {#if projectTreeExpanded}
        <div class="pl-4 pr-1 py-1 space-y-0.5">
          {#if workspaceTabs.length === 0}
            <div class="px-2 py-1.5 text-xs text-text-tertiary">
              No open projects
            </div>
          {:else}
            {#each workspaceTabs as tab (tab.id)}
              <div
                class="group flex items-center rounded"
                onclick={() => {
                  if (!canManageProjects) return;
                  projectPanelOpen = false;
                  void onSwitchProject(tab.id);
                }}
              >
                <button
                  type="button"
                  class="flex-1 min-w-0 px-2 py-1.5 text-sm rounded text-left flex items-center gap-2 transition-colors
                         {tab.id === contextId
                    ? 'bg-bg-tertiary text-text-primary font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'}"
                  onclick={(e) => {
                    e.stopPropagation();
                    if (!canManageProjects) return;
                    projectPanelOpen = false;
                    void onSwitchProject(tab.id);
                  }}
                  title={tab.path}
                >
                  <span class="truncate flex-1">{tab.name}</span>
                </button>
                <button
                  type="button"
                  class="project-tab-close w-5 h-5 flex items-center justify-center shrink-0 mr-1
                         rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary
                         {tab.id === contextId
                    ? 'project-tab-close-active'
                    : ''}"
                  onclick={(e) => {
                    if (!canManageProjects) return;
                    void onCloseProjectTab(tab.id, e);
                  }}
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
        </div>
      {/if}
    </div>
  </aside>
{/if}

{#if addProjectMenuOpen}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Project selector"
    onkeydown={(e) => {
      if (e.key === "Escape") {
        addProjectMenuOpen = false;
      }
    }}
  >
    <button
      type="button"
      class="absolute inset-0 bg-black/40"
      aria-label="Close project selector"
      onclick={() => {
        addProjectMenuOpen = false;
      }}
    ></button>
    <div
      class="relative z-10 w-full max-w-xl bg-bg-secondary border border-border-default rounded-md shadow-xl"
    >
      <div
        class="px-4 py-3 border-b border-border-default flex items-center justify-between gap-2"
      >
        <h2 class="text-sm font-semibold text-text-primary">Select Project</h2>
        <button
          type="button"
          class="h-7 w-7 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          onclick={() => {
            addProjectMenuOpen = false;
          }}
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
            />
          </svg>
        </button>
      </div>

      <div class="p-3">
        {#if !canManageProjects}
          <p class="mb-2 text-xs text-text-tertiary">
            Temporary project mode is active. Project add/change is disabled.
          </p>
        {/if}
        <label
          for="project-popup-open-directory-input"
          class="text-xs text-text-tertiary font-semibold uppercase tracking-wider mb-1.5 block"
        >
          Open Directory
        </label>
        <form
          class="flex items-center gap-1.5"
          onsubmit={async (e) => {
            e.preventDefault();
            await onOpenProjectByPath(newProjectPath);
            addProjectMenuOpen = false;
            projectPanelOpen = false;
          }}
        >
          <input
            id="project-popup-open-directory-input"
            type="text"
            value={newProjectPath}
            oninput={(e) =>
              onNewProjectPathChange(
                (e.currentTarget as HTMLInputElement).value,
              )}
            class="flex-1 px-2 py-1.5 text-sm rounded border border-border-default
                   bg-bg-primary text-text-primary font-mono
                   focus:outline-none focus:ring-2 focus:ring-accent-emphasis
                   placeholder:text-text-tertiary"
            placeholder="/path/to/project"
            disabled={!canManageProjects ||
              newProjectLoading ||
              pickingDirectory}
          />
          <button
            type="button"
            disabled={!canManageProjects ||
              pickingDirectory ||
              newProjectLoading}
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
            disabled={!canManageProjects ||
              newProjectPath.trim().length === 0 ||
              newProjectLoading}
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
        <div class="border-t border-border-default py-2">
          <div
            class="px-4 pb-1 text-xs text-text-tertiary font-semibold uppercase tracking-wider"
          >
            Previous Projects
          </div>
          <div class="max-h-60 overflow-y-auto">
            {#each availableRecentProjects as recent (recent.path)}
              <div
                class="flex items-center hover:bg-bg-tertiary transition-colors"
              >
                <button
                  type="button"
                  disabled={!canManageProjects}
                  class="flex-1 text-left px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2 min-w-0"
                  onclick={async () => {
                    if (!canManageProjects) return;
                    await onOpenRecentProject(recent.path);
                    addProjectMenuOpen = false;
                    projectPanelOpen = false;
                  }}
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
                  <span
                    class="text-xs text-text-tertiary truncate max-w-[120px]"
                    >{truncatePath(recent.path, 20)}</span
                  >
                </button>
                <button
                  type="button"
                  disabled={!canManageProjects}
                  class="shrink-0 p-1 mr-2 rounded text-text-tertiary hover:text-danger-fg hover:bg-danger-subtle transition-colors"
                  title="Remove from history"
                  onclick={(e) => {
                    e.stopPropagation();
                    if (!canManageProjects) return;
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
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
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
