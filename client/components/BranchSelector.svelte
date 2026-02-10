<script lang="ts">
  /**
   * BranchSelector Component
   *
   * Clickable branch name that expands into a filterable branch list dropdown.
   * Uses fixed positioning so the dropdown escapes overflow-hidden/auto ancestors.
   * Delegates branch list rendering to BranchListPanel.
   */

  import BranchListPanel from "./BranchListPanel.svelte";

  interface Props {
    contextId: string;
    currentBranch: string;
  }

  const { contextId, currentBranch }: Props = $props();

  interface CheckoutResponse {
    readonly success: boolean;
    readonly previousBranch: string;
    readonly currentBranch: string;
    readonly stashCreated?: string | undefined;
    readonly error?: string | undefined;
  }

  interface CreateResponse {
    readonly success: boolean;
    readonly branch: string;
    readonly error?: string | undefined;
  }

  /** Whether dropdown is open */
  let isOpen = $state(false);

  /** Checkout in progress */
  let checkingOut = $state(false);

  /** Error message */
  let errorMessage = $state<string | null>(null);

  /** Success message */
  let successMessage = $state<string | null>(null);

  /** Whether a git operation (commit/push/PR) is in progress */
  let gitOperationRunning = $state(false);
  let gitOperationPhase = $state("");

  /** Reference to trigger button for position calculation */
  let triggerRef: HTMLButtonElement | undefined = $state(undefined);

  /** Reference to the BranchListPanel */
  let branchListPanel: ReturnType<typeof BranchListPanel> | undefined =
    $state(undefined);

  /** Dropdown fixed position */
  let dropdownTop = $state(0);
  let dropdownLeft = $state(0);

  /**
   * Toggle dropdown open/close
   */
  function toggle(): void {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  /**
   * Check if a git operation is currently running on the server
   */
  async function checkGitOperationStatus(): Promise<void> {
    try {
      const resp = await fetch("/api/git-actions/operating");
      if (resp.ok) {
        const data = (await resp.json()) as {
          operating: boolean;
          phase: string;
        };
        gitOperationRunning = data.operating;
        gitOperationPhase = data.phase;
      }
    } catch {
      // Non-critical - allow branch switching if check fails
      gitOperationRunning = false;
      gitOperationPhase = "";
    }
  }

  /**
   * Open the dropdown and initialize the branch list
   */
  function open(): void {
    if (triggerRef !== undefined) {
      const rect = triggerRef.getBoundingClientRect();
      dropdownTop = rect.bottom + 4;
      dropdownLeft = rect.left;
    }
    isOpen = true;
    errorMessage = null;
    successMessage = null;
    void checkGitOperationStatus();
    requestAnimationFrame(() => {
      branchListPanel?.initialize();
    });
  }

  /**
   * Close the dropdown
   */
  function close(): void {
    isOpen = false;
    errorMessage = null;
  }

  /**
   * Checkout a branch (called when a branch is selected in the panel)
   */
  async function checkout(branch: { name: string }): Promise<void> {
    if (branch.name === currentBranch) {
      return;
    }

    // Re-check git operation status before checkout
    await checkGitOperationStatus();
    if (gitOperationRunning) {
      errorMessage = `Cannot switch branches while ${gitOperationPhase} is in progress`;
      return;
    }

    checkingOut = true;
    errorMessage = null;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/branches/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: branch.name }),
      });
      const data = (await resp.json()) as CheckoutResponse;
      if (data.success) {
        successMessage = `Switched to ${data.currentBranch}`;
        setTimeout(() => {
          close();
          successMessage = null;
          window.location.reload();
        }, 800);
      } else {
        errorMessage = data.error ?? "Checkout failed";
      }
    } catch {
      errorMessage = "Checkout failed";
    } finally {
      checkingOut = false;
    }
  }

  /**
   * Create a new branch via API
   */
  async function createNewBranch(branchName: string): Promise<void> {
    // Re-check git operation status before creating branch
    await checkGitOperationStatus();
    if (gitOperationRunning) {
      errorMessage = `Cannot create branches while ${gitOperationPhase} is in progress`;
      return;
    }

    errorMessage = null;
    try {
      const resp = await fetch(`/api/ctx/${contextId}/branches/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: branchName }),
      });
      const data = (await resp.json()) as CreateResponse;
      if (data.success) {
        successMessage = `Created branch '${data.branch}'`;
        setTimeout(() => {
          close();
          successMessage = null;
          window.location.reload();
        }, 800);
      } else {
        errorMessage = data.error ?? "Branch creation failed";
      }
    } catch {
      errorMessage = "Branch creation failed";
    }
  }

  /**
   * Handle keydown in the dropdown (Escape to close)
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      close();
    }
  }

  /**
   * Periodic polling for git operation status while dropdown is open
   */
  $effect(() => {
    if (!isOpen) return;
    const intervalId = setInterval(() => {
      void checkGitOperationStatus();
    }, 2000);
    return () => {
      clearInterval(intervalId);
    };
  });
</script>

<!-- Trigger button -->
<button
  bind:this={triggerRef}
  type="button"
  class="font-mono text-accent-fg hover:text-accent-emphasis hover:underline cursor-pointer text-sm flex items-center gap-1 transition-colors"
  onclick={toggle}
  title="Click to switch branches"
>
  <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
    <path
      fill-rule="evenodd"
      d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"
    />
  </svg>
  <span>{currentBranch}</span>
  <svg
    class="w-3 h-3 shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}"
    viewBox="0 0 16 16"
    fill="currentColor"
  >
    <path
      fill-rule="evenodd"
      d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"
    />
  </svg>
</button>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40"
    onclick={() => close()}
    onkeydown={() => {}}
    role="presentation"
  ></div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed w-80 max-h-96 bg-bg-primary border border-border-default rounded-md shadow-lg z-50 flex flex-col"
    style="top: {dropdownTop}px; left: {dropdownLeft}px;"
    onkeydown={handleKeydown}
  >
    <!-- Error message -->
    {#if errorMessage !== null}
      <div
        class="px-3 py-1.5 text-xs bg-danger-subtle text-danger-fg border-b border-border-default"
      >
        {errorMessage}
      </div>
    {/if}

    <!-- Success message -->
    {#if successMessage !== null}
      <div
        class="px-3 py-1.5 text-xs bg-success-subtle text-success-fg border-b border-border-default"
      >
        {successMessage}
      </div>
    {/if}

    <!-- Reusable branch list panel -->
    <BranchListPanel
      bind:this={branchListPanel}
      {contextId}
      {currentBranch}
      headerText="Switch branches"
      warningMessage={gitOperationRunning
        ? `Branch switching disabled while ${gitOperationPhase} is in progress`
        : undefined}
      disabled={gitOperationRunning}
      onSelect={(branch) => void checkout(branch)}
      disableCurrentBranch={false}
      selectedBranch={currentBranch}
      onCreateBranch={(name) => void createNewBranch(name)}
    />
  </div>
{/if}
