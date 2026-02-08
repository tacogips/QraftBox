<script lang="ts">
  /**
   * GitPushButton Component
   *
   * Displays a "Git Push" button and a 3-dot menu in the project root panel.
   * - "Git Push" button: runs AI commit prompt then push prompt sequentially.
   * - 3-dot menu: Commit with custom prompt, Push with custom prompt,
   *   Fetch, Merge, Create PR, Open current PR in Browser, Merge PR.
   *
   * The dropdown uses position:fixed and is rendered via <svelte:body>
   * to escape any overflow clipping from parent containers.
   */

  interface Props {
    contextId: string;
    projectPath: string;
  }

  const { contextId, projectPath }: Props = $props();

  // Menu state
  let menuOpen = $state(false);
  let customPromptAction = $state<
    "commit" | "push" | "fetch" | "merge" | null
  >(null);
  let customPromptText = $state("");

  // Dropdown position (fixed, viewport-relative)
  let menuTop = $state(0);
  let menuRight = $state(0);

  // Button ref for position calculation
  let menuButtonEl = $state<HTMLButtonElement | null>(null);

  // Operation state
  let operating = $state(false);
  let operationMessage = $state<{ success: boolean; text: string } | null>(
    null,
  );

  // PR info for "Open PR in Browser"
  let currentPRUrl = $state<string | null>(null);
  let prNumber = $state<number | null>(null);
  let prLoading = $state(false);
  let prCanCreate = $state(false);
  let prBaseBranch = $state("");
  let prAvailableBranches = $state<string[]>([]);
  let showCreatePR = $state(false);
  let selectedCreateBaseBranch = $state("");
  let creatingPR = $state(false);

  /**
   * Calculate dropdown position from the 3-dot button
   */
  function updateMenuPosition(): void {
    if (menuButtonEl === null) return;
    const rect = menuButtonEl.getBoundingClientRect();
    menuTop = rect.bottom + 4;
    menuRight = window.innerWidth - rect.right;
  }

  /**
   * Toggle menu open/close
   */
  function toggleMenu(e: MouseEvent): void {
    e.stopPropagation();
    if (menuOpen) {
      menuOpen = false;
      customPromptAction = null;
      customPromptText = "";
    } else {
      updateMenuPosition();
      menuOpen = true;
    }
  }

  /**
   * Fetch current PR status to get URL and PR number
   */
  async function fetchPRStatus(): Promise<void> {
    prLoading = true;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/pr/${contextId}/status`);
      if (resp.ok) {
        const data = (await resp.json()) as {
          status: {
            hasPR: boolean;
            pr: { url: string; number: number; state: string } | null;
            canCreatePR: boolean;
            baseBranch: string;
            availableBaseBranches: string[];
            reason?: string;
          };
        };
        if (data.status.hasPR && data.status.pr !== null) {
          currentPRUrl = data.status.pr.url;
          prNumber = data.status.pr.number;
        } else {
          currentPRUrl = null;
          prNumber = null;
        }
        prCanCreate = data.status.canCreatePR;
        prBaseBranch = data.status.baseBranch;
        prAvailableBranches = data.status.availableBaseBranches;
        selectedCreateBaseBranch = data.status.baseBranch;
      }
    } catch {
      // Silently ignore - PR status is non-critical
    } finally {
      prLoading = false;
    }
  }

  /**
   * Execute AI commit prompt then push prompt sequentially
   */
  async function handleGitPush(): Promise<void> {
    operating = true;
    operationMessage = null;
    try {
      // Step 1: Commit via AI prompt
      const commitResp = await fetch("/api/ai/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:
            "Please commit all staged changes with an appropriate commit message. If there are no staged changes, stage all modified and untracked files first, then commit.",
          context: {
            references: [],
          },
          options: {
            projectPath,
            sessionMode: "new",
            immediate: true,
          },
        }),
      });
      if (!commitResp.ok) {
        throw new Error(`Commit prompt failed: ${commitResp.status}`);
      }
      const commitData = (await commitResp.json()) as {
        sessionId: string;
      };

      // Wait for commit session to complete
      await waitForSession(commitData.sessionId);

      // Step 2: Push via AI prompt
      const pushResp = await fetch("/api/ai/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Please push the current branch to the remote repository.",
          context: {
            references: [],
          },
          options: {
            projectPath,
            sessionMode: "new",
            immediate: true,
          },
        }),
      });
      if (!pushResp.ok) {
        throw new Error(`Push prompt failed: ${pushResp.status}`);
      }

      operationMessage = {
        success: true,
        text: "Commit and push completed",
      };
    } catch (e) {
      operationMessage = {
        success: false,
        text: e instanceof Error ? e.message : "Operation failed",
      };
    } finally {
      operating = false;
    }
  }

  /**
   * Wait for an AI session to complete (polling)
   */
  async function waitForSession(sessionId: string): Promise<void> {
    const maxAttempts = 120; // 2 minutes max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const resp = await fetch(`/api/ai/sessions/${sessionId}`);
        if (resp.ok) {
          const data = (await resp.json()) as {
            session: { status: string };
          };
          if (
            data.session.status === "completed" ||
            data.session.status === "failed"
          ) {
            if (data.session.status === "failed") {
              throw new Error("AI session failed");
            }
            return;
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message === "AI session failed") {
          throw e;
        }
        // Retry on network errors
      }
    }
    throw new Error("Session timed out");
  }

  /**
   * Execute commit or push with custom prompt
   */
  async function handleCustomPromptSubmit(): Promise<void> {
    if (customPromptAction === null) return;

    operating = true;
    operationMessage = null;
    const action = customPromptAction;
    const prompt = customPromptText.trim();

    try {
      let actionPrompt: string;
      if (action === "commit") {
        actionPrompt =
          prompt.length > 0
            ? `Please commit the changes with the following instructions: ${prompt}`
            : "Please commit all staged changes with an appropriate commit message. If there are no staged changes, stage all modified and untracked files first, then commit.";
      } else if (action === "push") {
        actionPrompt =
          prompt.length > 0
            ? `Please push the current branch with the following instructions: ${prompt}`
            : "Please push the current branch to the remote repository.";
      } else if (action === "fetch") {
        actionPrompt =
          prompt.length > 0
            ? `Please run git fetch with the following instructions: ${prompt}`
            : "Please run git fetch to update all remote tracking branches.";
      } else {
        // merge
        actionPrompt =
          prompt.length > 0
            ? `Please run git merge with the following instructions: ${prompt}`
            : "Please merge the upstream tracking branch into the current branch.";
      }

      const resp = await fetch("/api/ai/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: actionPrompt,
          context: {
            references: [],
          },
          options: {
            projectPath,
            sessionMode: "new",
            immediate: true,
          },
        }),
      });
      if (!resp.ok) {
        throw new Error(`${action} prompt failed: ${resp.status}`);
      }

      const actionLabel =
        action === "commit"
          ? "Commit"
          : action === "push"
            ? "Push"
            : action === "fetch"
              ? "Fetch"
              : "Merge";
      operationMessage = {
        success: true,
        text: `${actionLabel} prompt submitted`,
      };
      customPromptAction = null;
      customPromptText = "";
      menuOpen = false;
    } catch (e) {
      operationMessage = {
        success: false,
        text: e instanceof Error ? e.message : "Operation failed",
      };
    } finally {
      operating = false;
    }
  }

  /**
   * Open the current PR in the browser
   */
  function handleOpenPR(): void {
    if (currentPRUrl !== null) {
      window.open(currentPRUrl, "_blank");
    }
    menuOpen = false;
  }

  /**
   * Create a new PR
   */
  async function handleCreatePR(): Promise<void> {
    if (selectedCreateBaseBranch === "") return;
    creatingPR = true;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/pr/${contextId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptTemplateId: "default",
          baseBranch: selectedCreateBaseBranch,
        }),
      });
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData !== null && errData.error !== undefined
            ? errData.error
            : `Create PR failed: ${resp.status}`,
        );
      }
      operationMessage = {
        success: true,
        text: "PR creation initiated via AI",
      };
      showCreatePR = false;
      menuOpen = false;
      await fetchPRStatus();
    } catch (e) {
      operationMessage = {
        success: false,
        text: e instanceof Error ? e.message : "Create PR failed",
      };
    } finally {
      creatingPR = false;
    }
  }

  /**
   * Merge the current PR
   */
  async function handleMergePR(): Promise<void> {
    if (prNumber === null) return;

    operating = true;
    operationMessage = null;
    menuOpen = false;

    try {
      const resp = await fetch(
        `/api/ctx/${contextId}/pr/${contextId}/${prNumber}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mergeMethod: "merge" }),
        },
      );
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData !== null && errData.error !== undefined
            ? errData.error
            : `Merge failed: ${resp.status}`,
        );
      }
      operationMessage = { success: true, text: `PR #${prNumber} merged` };
      prNumber = null;
      currentPRUrl = null;
    } catch (e) {
      operationMessage = {
        success: false,
        text: e instanceof Error ? e.message : "Merge failed",
      };
    } finally {
      operating = false;
    }
  }

  /**
   * Close menu when clicking outside
   */
  function handleWindowClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (
      !target.closest(".git-actions-menu-container") &&
      !target.closest(".git-actions-dropdown")
    ) {
      menuOpen = false;
      if (customPromptAction !== null) {
        customPromptAction = null;
        customPromptText = "";
      }
    }
  }

  // Fetch PR status on mount
  $effect(() => {
    void fetchPRStatus();
  });
</script>

<svelte:window onclick={handleWindowClick} />

<div class="flex items-center gap-1 git-actions-menu-container">
  <!-- Operation result message -->
  {#if operationMessage !== null}
    <span
      class="text-xs px-2 py-1 rounded {operationMessage.success
        ? 'text-success-fg'
        : 'text-danger-fg'}"
    >
      {operationMessage.text}
    </span>
  {/if}

  <!-- Git Push button -->
  <button
    type="button"
    class="px-3 py-1 text-xs font-medium border border-border-default rounded
           bg-success-emphasis text-white hover:opacity-90
           transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    onclick={() => void handleGitPush()}
    disabled={operating}
  >
    {operating ? "Running..." : "Git Push"}
  </button>

  <!-- 3-dot menu button -->
  <button
    type="button"
    bind:this={menuButtonEl}
    class="px-1.5 py-1 text-sm border border-border-default rounded
           hover:bg-bg-tertiary transition-colors text-text-secondary"
    onclick={toggleMenu}
    aria-label="More git actions"
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  </button>
</div>

<!-- Dropdown menu: rendered at body level with position:fixed to escape overflow clipping -->
{#if menuOpen}
  <div
    class="git-actions-dropdown fixed w-64 bg-bg-secondary border border-border-default
           rounded-lg shadow-lg overflow-hidden"
    style="top: {menuTop}px; right: {menuRight}px; z-index: 9999;"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="menu"
  >
    <!-- Commit with custom prompt -->
    <button
      type="button"
      role="menuitem"
      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors
             text-text-primary {customPromptAction === 'commit'
        ? 'bg-bg-tertiary'
        : ''}"
      onclick={(e) => {
        e.stopPropagation();
        customPromptAction = customPromptAction === "commit" ? null : "commit";
        customPromptText = "";
      }}
      disabled={operating}
    >
      Commit with custom prompt
    </button>

    {#if customPromptAction === "commit"}
      <div
        class="px-3 py-2 border-t border-border-default bg-bg-primary"
        role="presentation"
      >
        <textarea
          class="w-full h-20 px-2 py-1.5 text-xs bg-bg-secondary border border-border-default
                 rounded text-text-primary font-mono resize-y
                 focus:outline-none focus:border-accent-emphasis"
          placeholder="Enter commit instructions..."
          bind:value={customPromptText}
          disabled={operating}
        ></textarea>
        <button
          type="button"
          class="mt-1 px-3 py-1 text-xs bg-success-emphasis text-white rounded
                 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => void handleCustomPromptSubmit()}
          disabled={operating}
        >
          {operating ? "Running..." : "Commit"}
        </button>
      </div>
    {/if}

    <!-- Push with custom prompt -->
    <button
      type="button"
      role="menuitem"
      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors
             text-text-primary border-t border-border-default
             {customPromptAction === 'push' ? 'bg-bg-tertiary' : ''}"
      onclick={(e) => {
        e.stopPropagation();
        customPromptAction = customPromptAction === "push" ? null : "push";
        customPromptText = "";
      }}
      disabled={operating}
    >
      Push with custom prompt
    </button>

    {#if customPromptAction === "push"}
      <div
        class="px-3 py-2 border-t border-border-default bg-bg-primary"
        role="presentation"
      >
        <textarea
          class="w-full h-20 px-2 py-1.5 text-xs bg-bg-secondary border border-border-default
                 rounded text-text-primary font-mono resize-y
                 focus:outline-none focus:border-accent-emphasis"
          placeholder="Enter push instructions..."
          bind:value={customPromptText}
          disabled={operating}
        ></textarea>
        <button
          type="button"
          class="mt-1 px-3 py-1 text-xs bg-success-emphasis text-white rounded
                 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => void handleCustomPromptSubmit()}
          disabled={operating}
        >
          {operating ? "Running..." : "Push"}
        </button>
      </div>
    {/if}

    <!-- Fetch with custom prompt -->
    <button
      type="button"
      role="menuitem"
      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors
             text-text-primary border-t border-border-default
             {customPromptAction === 'fetch' ? 'bg-bg-tertiary' : ''}"
      onclick={(e) => {
        e.stopPropagation();
        customPromptAction = customPromptAction === "fetch" ? null : "fetch";
        customPromptText = "";
      }}
      disabled={operating}
    >
      Fetch
    </button>

    {#if customPromptAction === "fetch"}
      <div
        class="px-3 py-2 border-t border-border-default bg-bg-primary"
        role="presentation"
      >
        <textarea
          class="w-full h-20 px-2 py-1.5 text-xs bg-bg-secondary border border-border-default
                 rounded text-text-primary font-mono resize-y
                 focus:outline-none focus:border-accent-emphasis"
          placeholder="Enter fetch instructions (e.g. specific remote)..."
          bind:value={customPromptText}
          disabled={operating}
        ></textarea>
        <button
          type="button"
          class="mt-1 px-3 py-1 text-xs bg-success-emphasis text-white rounded
                 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => void handleCustomPromptSubmit()}
          disabled={operating}
        >
          {operating ? "Running..." : "Fetch"}
        </button>
      </div>
    {/if}

    <!-- Merge with custom prompt -->
    <button
      type="button"
      role="menuitem"
      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors
             text-text-primary border-t border-border-default
             {customPromptAction === 'merge' ? 'bg-bg-tertiary' : ''}"
      onclick={(e) => {
        e.stopPropagation();
        customPromptAction = customPromptAction === "merge" ? null : "merge";
        customPromptText = "";
      }}
      disabled={operating}
    >
      Merge
    </button>

    {#if customPromptAction === "merge"}
      <div
        class="px-3 py-2 border-t border-border-default bg-bg-primary"
        role="presentation"
      >
        <textarea
          class="w-full h-20 px-2 py-1.5 text-xs bg-bg-secondary border border-border-default
                 rounded text-text-primary font-mono resize-y
                 focus:outline-none focus:border-accent-emphasis"
          placeholder="Enter merge instructions (e.g. branch name, --no-ff)..."
          bind:value={customPromptText}
          disabled={operating}
        ></textarea>
        <button
          type="button"
          class="mt-1 px-3 py-1 text-xs bg-success-emphasis text-white rounded
                 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => void handleCustomPromptSubmit()}
          disabled={operating}
        >
          {operating ? "Running..." : "Merge"}
        </button>
      </div>
    {/if}

    <!-- Separator -->
    <div class="border-t border-border-default"></div>

    <!-- Create PR -->
    <button
      type="button"
      role="menuitem"
      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors
             {prCanCreate && prNumber === null
        ? 'text-text-primary'
        : 'text-text-tertiary cursor-not-allowed'}
             {showCreatePR ? 'bg-bg-tertiary' : ''}"
      onclick={(e) => {
        e.stopPropagation();
        showCreatePR = !showCreatePR;
      }}
      disabled={!prCanCreate || prNumber !== null || prLoading}
    >
      Create PR
      {#if prNumber !== null}
        <span class="text-xs text-text-tertiary ml-1">(PR exists)</span>
      {:else if !prCanCreate && !prLoading}
        <span class="text-xs text-text-tertiary ml-1">(unavailable)</span>
      {/if}
    </button>

    {#if showCreatePR && prCanCreate}
      <div
        class="px-3 py-2 border-t border-border-default bg-bg-primary"
        role="presentation"
      >
        <div class="flex items-center gap-2 mb-2">
          <label for="create-pr-base" class="text-xs text-text-secondary"
            >Base:</label
          >
          <select
            id="create-pr-base"
            class="flex-1 px-2 py-1 text-xs bg-bg-secondary border border-border-default rounded text-text-primary focus:outline-none focus:border-accent-emphasis"
            bind:value={selectedCreateBaseBranch}
          >
            {#each prAvailableBranches as branch}
              <option value={branch}>{branch}</option>
            {/each}
          </select>
        </div>
        <button
          type="button"
          class="px-3 py-1 text-xs bg-success-emphasis text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => void handleCreatePR()}
          disabled={creatingPR || selectedCreateBaseBranch === ""}
        >
          {creatingPR ? "Creating..." : "Create PR"}
        </button>
      </div>
    {/if}

    <!-- Separator -->
    <div class="border-t border-border-default"></div>

    <!-- Open current PR in Browser -->
    <button
      type="button"
      role="menuitem"
      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors
             {currentPRUrl !== null
        ? 'text-text-primary'
        : 'text-text-tertiary cursor-not-allowed'}"
      onclick={handleOpenPR}
      disabled={currentPRUrl === null || prLoading}
    >
      Open current PR in Browser
      {#if currentPRUrl === null && !prLoading}
        <span class="text-xs text-text-tertiary ml-1">(no PR)</span>
      {/if}
    </button>

    <!-- Merge PR -->
    <button
      type="button"
      role="menuitem"
      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors
             border-t border-border-default
             {prNumber !== null
        ? 'text-text-primary'
        : 'text-text-tertiary cursor-not-allowed'}"
      onclick={() => void handleMergePR()}
      disabled={prNumber === null || operating || prLoading}
    >
      Merge PR
      {#if prNumber !== null}
        <span class="text-xs text-text-secondary ml-1">(#{prNumber})</span>
      {/if}
    </button>
  </div>
{/if}
