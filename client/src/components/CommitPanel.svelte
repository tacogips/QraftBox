<script lang="ts">
  /**
   * CommitPanel Component
   *
   * Bottom sheet panel for commit configuration with AI-powered commit feature.
   *
   * Features:
   * - Bottom sheet modal with slide-up animation
   * - Staged files list with status badges
   * - Prompt template selector dropdown
   * - Commit and Cancel buttons
   * - Touch-friendly design (60px rows, 52px buttons)
   *
   * Props:
   * - isOpen: Whether the panel is visible
   * - stagedFiles: List of staged files to commit
   * - selectedPromptId: Currently selected prompt template ID
   * - onClose: Callback when panel is dismissed
   * - onCommit: Callback when commit button is clicked
   */

  import type { StagedFile } from "../../../src/types/commit-context";
  import type { PromptTemplate } from "../stores/commit";
  import StagedFilesList from "./StagedFilesList.svelte";
  import PromptSelector from "./PromptSelector.svelte";

  interface Props {
    isOpen: boolean;
    stagedFiles: readonly StagedFile[];
    selectedPromptId: string | null;
    onClose: () => void;
    onCommit: () => void;
  }

  const { isOpen, stagedFiles, selectedPromptId, onClose, onCommit }: Props =
    $props();

  /**
   * Available prompt templates (stubbed for now)
   * TODO: Load from API when prompt system is ready
   */
  const promptTemplates: readonly PromptTemplate[] = [
    {
      id: "commit-conventional",
      name: "Conventional Commit",
      description:
        "Generate commit message following Conventional Commits format",
      variables: [],
    },
    {
      id: "commit-detailed",
      name: "Detailed Commit",
      description: "Generate detailed commit message with full context",
      variables: [],
    },
    {
      id: "commit-simple",
      name: "Simple Commit",
      description: "Generate simple, concise commit message",
      variables: [],
    },
  ];

  /**
   * Currently selected prompt template (local state)
   */
  let currentPromptId = $state<string | null>(selectedPromptId);

  /**
   * Update local state when prop changes
   */
  $effect(() => {
    currentPromptId = selectedPromptId;
  });

  /**
   * Handle prompt template selection
   */
  function handlePromptSelect(promptId: string): void {
    currentPromptId = promptId;
  }

  /**
   * Handle commit button click
   */
  function handleCommit(): void {
    onCommit();
  }

  /**
   * Handle cancel button click
   */
  function handleCancel(): void {
    onClose();
  }

  /**
   * Handle keyboard events for panel
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
  }

  /**
   * Handle clicking backdrop to close
   */
  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  /**
   * Check if commit button should be disabled
   */
  function isCommitDisabled(): boolean {
    return stagedFiles.length === 0 || currentPromptId === null;
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="commit-panel-backdrop fixed inset-0 z-40 bg-black/30
           backdrop-blur-sm"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="presentation"
  ></div>

  <!-- Bottom Sheet Panel -->
  <div
    class="commit-panel fixed bottom-0 left-0 right-0 z-50
           bg-bg-primary rounded-t-2xl shadow-2xl
           border-t border-border-default
           max-h-[80vh] flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-labelledby="commit-panel-title"
  >
    <!-- Header -->
    <div
      class="panel-header px-6 py-4 border-b border-border-default
             bg-bg-secondary flex items-center justify-between"
    >
      <h2
        id="commit-panel-title"
        class="text-lg font-semibold text-text-primary"
      >
        Commit Changes
      </h2>

      <button
        type="button"
        onclick={handleCancel}
        class="p-2 min-w-[44px] min-h-[44px]
               text-text-secondary hover:text-text-primary
               hover:bg-bg-hover rounded-lg
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
        aria-label="Close commit panel"
        title="Close (Esc)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="panel-content flex-1 overflow-y-auto px-6 py-4">
      <!-- Staged Files Section -->
      <div class="mb-6">
        <h3 class="text-sm font-medium text-text-secondary mb-3">
          Staged Files ({stagedFiles.length})
        </h3>
        <StagedFilesList files={stagedFiles} />
      </div>

      <!-- Prompt Selector Section -->
      <div class="mb-4">
        <h3 class="text-sm font-medium text-text-secondary mb-3">
          Commit Template
        </h3>
        <PromptSelector
          templates={promptTemplates}
          selectedId={currentPromptId}
          onSelect={handlePromptSelect}
        />
      </div>
    </div>

    <!-- Footer Buttons -->
    <div
      class="panel-footer px-6 py-4 border-t border-border-default
             bg-bg-secondary flex items-center justify-end gap-3"
    >
      <button
        type="button"
        onclick={handleCancel}
        class="px-6 py-3 min-h-[52px] min-w-[100px]
               text-text-primary bg-bg-tertiary
               border border-border-default rounded-lg
               hover:bg-bg-hover
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis
               font-medium transition-colors"
      >
        Cancel
      </button>

      <button
        type="button"
        onclick={handleCommit}
        disabled={isCommitDisabled()}
        class="px-6 py-3 min-h-[52px] min-w-[120px]
               text-white bg-accent-emphasis
               rounded-lg
               hover:bg-accent-emphasis
               disabled:opacity-50 disabled:cursor-not-allowed
               focus:outline-none focus:ring-2 focus:ring-accent-emphasis
               font-medium transition-colors
               flex items-center justify-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Commit
      </button>
    </div>
  </div>
{/if}

<style>
  /**
 * CommitPanel Styling
 *
 * - Bottom sheet with slide-up animation
 * - Touch-friendly design
 * - Smooth transitions
 */
  .commit-panel-backdrop {
    animation: fade-in 0.15s ease-out;
  }

  .commit-panel {
    animation: slide-up 0.25s ease-out;
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
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .panel-content {
    -webkit-overflow-scrolling: touch;
  }
</style>
