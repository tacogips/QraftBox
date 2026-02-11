<script lang="ts">
  /**
   * GitPushButton Component
   *
   * Displays "Commit" and "Push" buttons and a 3-dot menu for git operations.
   * - "Commit" button: runs commit via Claude CLI
   * - "Push" button: runs git push directly (no AI)
   * - 3-dot menu: Commit with custom ctx,
   *   Create PR, Open current PR in Browser.
   *
   * Commit and Create PR use Claude Code agent (claude CLI).
   * Push uses direct git commands.
   * Success/error notifications shown as toast from top.
   */

  interface Props {
    contextId: string;
    projectPath: string;
    hasChanges?: boolean;
    onSuccess?: (() => void) | undefined;
    isGitRepo?: boolean;
  }

  const {
    contextId,
    projectPath,
    hasChanges = true,
    onSuccess,
    isGitRepo = true,
  }: Props = $props();

  // Menu state
  let menuOpen = $state(false);
  let customCtxAction = $state<"commit" | null>(null);
  let customCtxText = $state("");

  // Dropdown position (fixed, viewport-relative)
  let menuTop = $state(0);
  let menuRight = $state(0);

  // Button ref for position calculation
  let menuButtonEl = $state<HTMLButtonElement | null>(null);

  // Operation state
  let operating = $state(false);
  let operationPhase = $state<
    "idle" | "committing" | "pushing" | "creating-pr"
  >("idle");
  let activeActionId = $state<string | null>(null);
  let cancellingOperation = $state(false);

  // Toast state for notifications
  let toastMessage = $state<string | null>(null);
  let toastType = $state<"success" | "error">("success");
  let toastVisible = $state(false);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Show a toast notification from the top
   */
  function showToast(message: string, type: "success" | "error"): void {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
    }
    toastMessage = message;
    toastType = type;
    toastVisible = true;
    const duration = type === "error" ? 5000 : 3000;
    toastTimer = setTimeout(() => {
      toastVisible = false;
      setTimeout(() => {
        toastMessage = null;
      }, 300);
    }, duration);
  }

  function dismissToast(): void {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toastVisible = false;
    setTimeout(() => {
      toastMessage = null;
    }, 300);
  }

  function createActionId(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return `action_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // PR info for "Open PR in Browser"
  let currentPRUrl = $state<string | null>(null);
  let prNumber = $state<number | null>(null);
  let prLoading = $state(false);
  let prCanCreate = $state(false);
  let prBaseBranch = $state("");
  let prAvailableBranches = $state<string[]>([]);
  let showCreatePR = $state(false);
  let selectedCreateBaseBranch = $state("");

  const hasExistingPR = $derived(prNumber !== null);
  const prPrimaryActionLabel = $derived(
    hasExistingPR ? "Update PR" : "Create PR",
  );
  const canRunPRAction = $derived(
    !operating && !prLoading && (prCanCreate || hasExistingPR),
  );
  const canCancelOperation = $derived(
    operating &&
      (operationPhase === "committing" || operationPhase === "creating-pr") &&
      activeActionId !== null &&
      !cancellingOperation,
  );

  /** Server response type from git-actions endpoints */
  interface GitActionResult {
    success: boolean;
    output: string;
    error?: string;
  }

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
      customCtxAction = null;
      customCtxText = "";
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
      const resp = await fetch(
        `/api/git-actions/pr-status?projectPath=${encodeURIComponent(projectPath)}`,
      );
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
   * Execute commit via Claude CLI
   */
  async function handleCommit(): Promise<void> {
    const actionId = createActionId();
    operating = true;
    operationPhase = "committing";
    activeActionId = actionId;
    cancellingOperation = false;
    try {
      const commitResp = await fetch("/api/git-actions/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath, actionId }),
      });
      if (!commitResp.ok) {
        const errData = (await commitResp.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errData.error ?? `Commit failed: ${commitResp.status}`);
      }
      const commitResult = (await commitResp.json()) as GitActionResult;
      if (!commitResult.success) {
        throw new Error(commitResult.error ?? "Commit failed");
      }

      showToast("Commit completed", "success");
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Commit failed";
      showToast(msg, "error");
    } finally {
      operating = false;
      operationPhase = "idle";
      activeActionId = null;
      cancellingOperation = false;
    }
  }

  /**
   * Execute push via git
   */
  async function handlePush(): Promise<void> {
    operating = true;
    operationPhase = "pushing";
    try {
      const pushResp = await fetch("/api/git-actions/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath }),
      });
      if (!pushResp.ok) {
        const errData = (await pushResp.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errData.error ?? `Push failed: ${pushResp.status}`);
      }
      const pushResult = (await pushResp.json()) as GitActionResult;
      if (!pushResult.success) {
        throw new Error(pushResult.error ?? "Push failed");
      }

      showToast("Push completed", "success");
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Push failed";
      showToast(msg, "error");
    } finally {
      operating = false;
      operationPhase = "idle";
    }
  }

  /**
   * Execute action with optional custom ctx
   */
  async function handleCustomCtxSubmit(): Promise<void> {
    if (customCtxAction === null) return;

    const customCtx = customCtxText.trim();
    const actionId = createActionId();

    operating = true;
    operationPhase = "committing";
    activeActionId = actionId;
    cancellingOperation = false;

    try {
      const resp = await fetch("/api/git-actions/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          actionId,
          ...(customCtx.length > 0 ? { customCtx } : {}),
        }),
      });
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errData.error ?? `Commit failed: ${resp.status}`);
      }
      const result = (await resp.json()) as GitActionResult;

      if (!result.success) {
        throw new Error(result.error ?? "Commit failed");
      }

      showToast("Commit completed", "success");
      onSuccess?.();
      customCtxAction = null;
      customCtxText = "";
      menuOpen = false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Operation failed";
      showToast(msg, "error");
    } finally {
      operating = false;
      operationPhase = "idle";
      activeActionId = null;
      cancellingOperation = false;
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
   * Extract a GitHub PR URL from CLI output text
   */
  function extractPRUrl(output: string): string | null {
    const match = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/.exec(output);
    return match !== null ? match[0] : null;
  }

  /**
   * Create or update PR via Claude CLI (button action)
   */
  async function handlePRPrimaryActionButton(): Promise<void> {
    const isUpdate = prNumber !== null;
    const baseBranch =
      selectedCreateBaseBranch.length > 0
        ? selectedCreateBaseBranch
        : prBaseBranch.length > 0
          ? prBaseBranch
          : "main";
    const actionId = createActionId();
    operating = true;
    operationPhase = "creating-pr";
    activeActionId = actionId;
    cancellingOperation = false;
    try {
      const endpoint = isUpdate
        ? "/api/git-actions/update-pr"
        : "/api/git-actions/create-pr";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          baseBranch,
          actionId,
        }),
      });
      if (!resp.ok) {
        const rawErrorText = await resp.text().catch(() => "");
        let parsedError: { error?: string } | null = null;
        try {
          parsedError = JSON.parse(rawErrorText) as { error?: string };
        } catch {
          parsedError = null;
        }
        throw new Error(
          (parsedError !== null && typeof parsedError.error === "string"
            ? parsedError.error
            : rawErrorText.trim().length > 0
              ? rawErrorText
              : undefined) ??
            `${isUpdate ? "Update PR" : "Create PR"} failed: ${resp.status}`,
        );
      }
      const result = (await resp.json()) as GitActionResult;
      if (!result.success) {
        throw new Error(
          result.error ?? `${isUpdate ? "Update PR" : "Create PR"} failed`,
        );
      }

      // Try to extract PR URL from output, fallback to fetching status
      let prUrl = extractPRUrl(result.output);
      if (prUrl === null) {
        await fetchPRStatus();
        prUrl = currentPRUrl;
      } else {
        await fetchPRStatus();
      }

      const toastMsg =
        prUrl !== null
          ? `PR ${isUpdate ? "updated" : "created"}: ${prUrl}`
          : `PR ${isUpdate ? "updated" : "created"}`;
      showToast(toastMsg, "success");
      onSuccess?.();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : `${isUpdate ? "Update PR" : "Create PR"} failed`;
      showToast(msg, "error");
    } finally {
      operating = false;
      operationPhase = "idle";
      activeActionId = null;
      cancellingOperation = false;
    }
  }

  /**
   * Create or update PR via Claude CLI (dropdown action)
   */
  async function handlePRDropdownAction(): Promise<void> {
    if (selectedCreateBaseBranch === "" && prNumber === null) return;
    await handlePRPrimaryActionButton();
    showCreatePR = false;
    menuOpen = false;
  }

  async function handleCancelCurrentOperation(): Promise<void> {
    if (!canCancelOperation || activeActionId === null) return;

    cancellingOperation = true;
    try {
      const resp = await fetch("/api/git-actions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: activeActionId }),
      });
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errData.error ?? `Cancel failed: ${resp.status}`);
      }
      showToast("Cancellation requested", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to cancel operation";
      showToast(msg, "error");
      cancellingOperation = false;
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
      if (customCtxAction !== null) {
        customCtxAction = null;
        customCtxText = "";
      }
    }
  }

  // Fetch PR status on mount (only for git repos)
  $effect(() => {
    if (isGitRepo) {
      void fetchPRStatus();
    }
  });
</script>

<svelte:window onclick={handleWindowClick} />

<div class="flex items-center gap-1 git-actions-menu-container">
  <!-- Commit button -->
  <button
    type="button"
    class="px-3 py-1 text-xs font-medium border border-border-default rounded
           bg-success-emphasis text-white hover:opacity-90
           transition-colors disabled:opacity-50 disabled:cursor-not-allowed
           flex items-center gap-1.5"
    onclick={() => void handleCommit()}
    disabled={!isGitRepo || operating || !hasChanges}
    title={!isGitRepo ? "Not a git repository" : ""}
  >
    {#if operating && operationPhase === "committing"}
      <svg
        class="animate-spin"
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M8 1.5a6.5 6.5 0 1 1-4.6 1.9" stroke-linecap="round" />
      </svg>
      AI generating...
    {:else}
      Commit
    {/if}
  </button>

  <!-- Push button -->
  <button
    type="button"
    class="px-3 py-1 text-xs font-medium border border-border-default rounded
           bg-accent-emphasis text-white hover:opacity-90
           transition-colors disabled:opacity-50 disabled:cursor-not-allowed
           flex items-center gap-1.5"
    onclick={() => void handlePush()}
    disabled={!isGitRepo || operating}
    title={!isGitRepo ? "Not a git repository" : ""}
  >
    {#if operating && operationPhase === "pushing"}
      <svg
        class="animate-spin"
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M8 1.5a6.5 6.5 0 1 1-4.6 1.9" stroke-linecap="round" />
      </svg>
      Pushing...
    {:else}
      Push
    {/if}
  </button>

  <!-- Create PR button -->
  <button
    type="button"
    class="px-3 py-1 text-xs font-medium border border-border-default rounded
           bg-done-emphasis text-white hover:opacity-90
           transition-colors disabled:opacity-50 disabled:cursor-not-allowed
           flex items-center gap-1.5"
    onclick={() => void handlePRPrimaryActionButton()}
    disabled={!isGitRepo || !canRunPRAction}
    title={!isGitRepo ? "Not a git repository" : ""}
  >
    {#if operating && operationPhase === "creating-pr"}
      <svg
        class="animate-spin"
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M8 1.5a6.5 6.5 0 1 1-4.6 1.9" stroke-linecap="round" />
      </svg>
      AI generating...
    {:else}
      {prPrimaryActionLabel}
    {/if}
  </button>

  {#if operating && (operationPhase === "committing" || operationPhase === "creating-pr")}
    <button
      type="button"
      class="px-3 py-1 text-xs font-medium border border-border-default rounded
             bg-danger-emphasis text-white hover:opacity-90
             transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={() => void handleCancelCurrentOperation()}
      disabled={!canCancelOperation}
    >
      {cancellingOperation ? "Cancelling..." : "Cancel"}
    </button>
  {/if}

  <!-- 3-dot menu button -->
  <button
    type="button"
    bind:this={menuButtonEl}
    class="px-1.5 py-1 text-sm border border-border-default rounded
           hover:bg-bg-tertiary transition-colors text-text-secondary
           disabled:opacity-50 disabled:cursor-not-allowed"
    onclick={toggleMenu}
    aria-label="More git actions"
    disabled={!isGitRepo}
    title={!isGitRepo ? "Not a git repository" : ""}
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
    <!-- Commit with custom ctx -->
    <button
      type="button"
      role="menuitem"
      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors
             text-text-primary {customCtxAction === 'commit'
        ? 'bg-bg-tertiary'
        : ''}"
      onclick={(e) => {
        e.stopPropagation();
        customCtxAction = customCtxAction === "commit" ? null : "commit";
        customCtxText = "";
      }}
      disabled={operating}
    >
      Commit with custom ctx
    </button>

    {#if customCtxAction === "commit"}
      <div
        class="px-3 py-2 border-t border-border-default bg-bg-primary"
        role="presentation"
      >
        <textarea
          class="w-full h-20 px-2 py-1.5 text-xs bg-bg-secondary border border-border-default
                 rounded text-text-primary font-mono resize-y
                 focus:outline-none focus:border-accent-emphasis"
          placeholder="Enter additional context for commit..."
          bind:value={customCtxText}
          disabled={operating}
        ></textarea>
        <button
          type="button"
          class="mt-1 px-3 py-1 text-xs bg-success-emphasis text-white rounded
                 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => void handleCustomCtxSubmit()}
          disabled={operating}
        >
          {operating ? "Running..." : "Commit"}
        </button>
      </div>
    {/if}

    <!-- Separator -->
    <div class="border-t border-border-default"></div>

    <!-- Create/Update PR -->
    <button
      type="button"
      role="menuitem"
      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors
             {prCanCreate || prNumber !== null
        ? 'text-text-primary'
        : 'text-text-tertiary cursor-not-allowed'}
             {showCreatePR ? 'bg-bg-tertiary' : ''}"
      onclick={(e) => {
        e.stopPropagation();
        showCreatePR = !showCreatePR;
      }}
      disabled={(!prCanCreate && prNumber === null) || prLoading}
    >
      {prPrimaryActionLabel}
      {#if prNumber !== null}
        <span class="text-xs text-text-tertiary ml-1">(#{prNumber})</span>
      {:else if !prCanCreate && !prLoading}
        <span class="text-xs text-text-tertiary ml-1">(unavailable)</span>
      {/if}
    </button>

    {#if showCreatePR && (prCanCreate || prNumber !== null)}
      <div
        class="px-3 py-2 border-t border-border-default bg-bg-primary"
        role="presentation"
      >
        {#if prNumber === null}
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
        {/if}
        <button
          type="button"
          class="px-3 py-1 text-xs bg-success-emphasis text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => void handlePRDropdownAction()}
          disabled={operating ||
            (prNumber === null && selectedCreateBaseBranch === "")}
        >
          {operating && operationPhase === "creating-pr"
            ? "AI generating..."
            : prPrimaryActionLabel}
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
  </div>
{/if}

<!-- Toast notification (fixed at top of viewport) -->
{#if toastMessage !== null}
  <div
    class="toast-overlay"
    class:toast-visible={toastVisible}
    class:toast-hidden={!toastVisible}
  >
    <div
      class="toast-content"
      class:toast-success={toastType === "success"}
      class:toast-error={toastType === "error"}
    >
      {#if toastType === "error"}
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="shrink-0 mt-0.5"
        >
          <path
            d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          />
        </svg>
      {:else}
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="shrink-0 mt-0.5"
        >
          <path
            d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-1.06-1.06L7 8.94 5.28 7.22a.751.751 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0Z"
          />
        </svg>
      {/if}
      <span class="toast-text">{toastMessage}</span>
      <button type="button" class="toast-dismiss" onclick={dismissToast}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
          />
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .toast-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    z-index: 10000;
    pointer-events: none;
    padding: 12px 16px;
  }

  .toast-content {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    max-width: 480px;
    width: 100%;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.4;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    pointer-events: auto;
    transition:
      transform 0.3s ease,
      opacity 0.3s ease;
  }

  .toast-error {
    background: var(--color-danger-muted, #3d0c11);
    border: 1px solid var(--color-danger-emphasis, #da3633);
    color: var(--color-danger-fg, #f85149);
  }

  .toast-success {
    background: var(--color-success-muted, #0d1b0e);
    border: 1px solid var(--color-success-emphasis, #238636);
    color: var(--color-success-fg, #3fb950);
  }

  .toast-visible .toast-content {
    transform: translateY(0);
    opacity: 1;
  }

  .toast-hidden .toast-content {
    transform: translateY(-100%);
    opacity: 0;
  }

  .toast-text {
    flex: 1;
    word-break: break-word;
  }

  .toast-dismiss {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px;
    opacity: 0.7;
    transition: opacity 0.15s;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .toast-dismiss:hover {
    opacity: 1;
  }
</style>
