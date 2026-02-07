<script lang="ts">
  /**
   * PRCreatePanel Component
   *
   * Bottom sheet modal for creating GitHub Pull Requests with AI.
   *
   * Features:
   * - Bottom sheet modal (slides up from bottom)
   * - Form fields: title, description, base branch, labels, reviewers
   * - Integrates BaseBranchSelector, LabelSelector, ReviewerSelector
   * - Create/Cancel buttons
   * - Different states: idle, creating, success, error
   *
   * Props:
   * - isOpen: Whether the panel is open
   * - baseBranches: Available base branches
   * - selectedBaseBranch: Currently selected base branch
   * - availableLabels: Available labels
   * - selectedLabels: Selected labels
   * - availableReviewers: Available reviewers
   * - selectedReviewers: Selected reviewers
   * - title: PR title (optional)
   * - description: PR description (optional)
   * - status: Current panel status
   * - error: Error message if any
   * - onClose: Callback when panel closes
   * - onSubmit: Callback when create button clicked
   * - onCancel: Callback when cancel button clicked
   * - onBaseBranchChange: Callback when base branch changes
   * - onLabelChange: Callback when labels change
   * - onReviewerChange: Callback when reviewers change
   */

  import BaseBranchSelector from "./BaseBranchSelector.svelte";
  import LabelSelector from "./LabelSelector.svelte";
  import ReviewerSelector from "./ReviewerSelector.svelte";
  import PRProgress from "./PRProgress.svelte";

  type PRStatus = "idle" | "creating" | "success" | "error";

  interface Props {
    isOpen: boolean;
    baseBranches: readonly string[];
    selectedBaseBranch: string;
    availableLabels: readonly string[];
    selectedLabels: readonly string[];
    availableReviewers: readonly string[];
    selectedReviewers: readonly string[];
    title?: string | undefined;
    description?: string | undefined;
    status: PRStatus;
    error: string | null;
    onClose: () => void;
    onSubmit: (data: {
      title: string;
      description: string;
      baseBranch: string;
      labels: readonly string[];
      reviewers: readonly string[];
    }) => void;
    onCancel: () => void;
    onBaseBranchChange: (branch: string) => void;
    onLabelChange: (labels: readonly string[]) => void;
    onReviewerChange: (reviewers: readonly string[]) => void;
  }

  const {
    isOpen,
    baseBranches,
    selectedBaseBranch,
    availableLabels,
    selectedLabels,
    availableReviewers,
    selectedReviewers,
    title = "",
    description = "",
    status,
    error,
    onClose,
    onSubmit,
    onCancel,
    onBaseBranchChange,
    onLabelChange,
    onReviewerChange,
  }: Props = $props();

  let titleInput = $state(title);
  let descriptionInput = $state(description);

  /**
   * Handle backdrop click to close panel
   */
  function handleBackdropClick(): void {
    if (status === "idle" || status === "error") {
      onClose();
    }
  }

  /**
   * Handle panel content click to prevent backdrop close
   */
  function handlePanelClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  /**
   * Handle Escape key to close panel
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && (status === "idle" || status === "error")) {
      onClose();
    }
  }

  /**
   * Handle submit button click
   */
  function handleSubmit(): void {
    if (status === "idle" || status === "error") {
      onSubmit({
        title: titleInput,
        description: descriptionInput,
        baseBranch: selectedBaseBranch,
        labels: selectedLabels,
        reviewers: selectedReviewers,
      });
    }
  }

  /**
   * Handle cancel button click
   */
  function handleCancel(): void {
    onCancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="pr-panel-backdrop fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
    onclick={handleBackdropClick}
    role="button"
    tabindex="-1"
    aria-label="Close PR panel"
  ></div>

  <!-- Panel -->
  <div
    class="pr-panel fixed bottom-0 left-0 right-0 bg-bg-primary rounded-t-2xl shadow-2xl z-50 max-h-[85vh] overflow-y-auto"
    onclick={handlePanelClick}
    role="dialog"
    aria-labelledby="pr-panel-title"
    aria-modal="true"
  >
    <!-- Panel Header -->
    <div
      class="panel-header sticky top-0 bg-bg-primary border-b border-border-default px-6 py-4 z-10"
    >
      <div class="flex items-center justify-between">
        <h2 id="pr-panel-title" class="text-xl font-bold text-text-primary">
          Create Pull Request
        </h2>

        <button
          type="button"
          onclick={onClose}
          class="close-icon-button p-2 text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-bg-secondary transition-colors"
          aria-label="Close panel"
          disabled={status === "creating"}
        >
          <svg
            class="w-6 h-6"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Panel Content -->
    <div class="panel-content px-6 py-4">
      {#if status === "creating"}
        <!-- Creating State -->
        <PRProgress stage="creating" message="Creating pull request..." />
      {:else}
        <!-- Idle/Error State -->
        <div class="space-y-6">
          <!-- Error Message -->
          {#if status === "error" && error}
            <div
              class="error-message p-4 bg-danger-subtle border border-danger-emphasis rounded-lg"
            >
              <div class="flex items-start gap-3">
                <svg
                  class="w-5 h-5 text-danger-fg flex-shrink-0 mt-0.5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clip-rule="evenodd"
                  />
                </svg>
                <div class="flex-1">
                  <h3 class="text-sm font-medium text-danger-fg mb-1">
                    PR Creation Failed
                  </h3>
                  <p class="text-sm text-danger-fg">{error}</p>
                </div>
              </div>
            </div>
          {/if}

          <!-- Title Input -->
          <div>
            <label
              for="pr-title"
              class="block text-sm font-medium text-text-primary mb-2"
            >
              Title
            </label>
            <input
              id="pr-title"
              type="text"
              bind:value={titleInput}
              placeholder="Enter PR title (optional - AI will generate if empty)"
              disabled={status === "creating"}
              class="w-full px-4 py-2 min-h-[44px] border border-border-default rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                     disabled:bg-bg-secondary disabled:cursor-not-allowed
                     text-base"
            />
          </div>

          <!-- Description Input -->
          <div>
            <label
              for="pr-description"
              class="block text-sm font-medium text-text-primary mb-2"
            >
              Description
            </label>
            <textarea
              id="pr-description"
              bind:value={descriptionInput}
              placeholder="Enter PR description (optional - AI will generate if empty)"
              disabled={status === "creating"}
              rows="4"
              class="w-full px-4 py-2 border border-border-default rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                     disabled:bg-bg-secondary disabled:cursor-not-allowed
                     text-base resize-vertical"
            ></textarea>
          </div>

          <!-- Base Branch Selector -->
          <BaseBranchSelector
            branches={baseBranches}
            selected={selectedBaseBranch}
            onchange={onBaseBranchChange}
            disabled={status === "creating"}
          />

          <!-- Label Selector -->
          <LabelSelector
            {availableLabels}
            selected={selectedLabels}
            onchange={onLabelChange}
            disabled={status === "creating"}
          />

          <!-- Reviewer Selector -->
          <ReviewerSelector
            {availableReviewers}
            selected={selectedReviewers}
            onchange={onReviewerChange}
            disabled={status === "creating"}
          />
        </div>
      {/if}
    </div>

    <!-- Panel Footer (Action Buttons) -->
    {#if status !== "creating"}
      <div
        class="panel-footer sticky bottom-0 bg-bg-primary border-t border-border-default px-6 py-4"
      >
        <div class="flex gap-3">
          <!-- Cancel Button -->
          <button
            type="button"
            onclick={handleCancel}
            class="cancel-button flex-1 min-h-[44px] px-6 py-2
                   text-text-primary bg-bg-secondary
                   rounded-lg
                   hover:bg-bg-tertiary
                   focus:outline-none focus:ring-2 focus:ring-border-emphasis focus:ring-offset-2
                   active:bg-bg-tertiary
                   transition-colors
                   font-medium text-base"
          >
            Cancel
          </button>

          <!-- Create Button -->
          <button
            type="button"
            onclick={handleSubmit}
            class="create-action-button flex-1 min-h-[44px] px-6 py-2
                   text-white bg-purple-600
                   rounded-lg
                   hover:bg-purple-700
                   focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
                   active:bg-purple-800
                   disabled:bg-bg-tertiary disabled:text-text-secondary disabled:cursor-not-allowed
                   transition-colors
                   font-medium text-base"
          >
            Create PR
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /**
   * PRCreatePanel Styling
   *
   * - Bottom sheet with slide-up animation
   * - Backdrop overlay
   * - Sticky header and footer
   * - Scrollable content area
   * - Touch-friendly buttons
   */
  .pr-panel-backdrop {
    animation: fade-in 0.2s ease-out;
  }

  .pr-panel {
    animation: slide-up 0.3s ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slide-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .pr-panel {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
  }

  .pr-panel::-webkit-scrollbar {
    width: 6px;
  }

  .pr-panel::-webkit-scrollbar-track {
    background: transparent;
  }

  .pr-panel::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
  }

  .pr-panel::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.7);
  }

  .close-icon-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-button:active,
  .create-action-button:not(:disabled):active {
    transform: scale(0.98);
  }
</style>
