<script lang="ts">
  /**
   * PushPanel Component
   *
   * Bottom sheet modal for configuring and executing git push with AI.
   *
   * Features:
   * - Bottom sheet modal (slides up from bottom)
   * - Shows unpushed commits list
   * - Remote selector dropdown
   * - Force push toggle with warning
   * - Set upstream toggle
   * - Push tags toggle
   * - Push/Cancel buttons
   * - Different states: idle, pushing, success, error
   * - Behind warning when applicable
   *
   * Props:
   * - isOpen: Whether the panel is open
   * - unpushedCommits: List of unpushed commits
   * - remotes: Available remotes
   * - selectedRemote: Currently selected remote
   * - behindCount: Number of commits behind remote
   * - aheadCount: Number of commits ahead of remote
   * - forcePush: Whether force push is enabled
   * - setUpstream: Whether to set upstream
   * - pushTags: Whether to push tags
   * - status: Current panel status
   * - error: Error message if any
   * - result: Push result if successful
   * - onClose: Callback when panel closes
   * - onPush: Callback when push button clicked
   * - onRemoteChange: Callback when remote selection changes
   * - onForcePushChange: Callback when force push toggle changes
   * - onSetUpstreamChange: Callback when set upstream toggle changes
   * - onPushTagsChange: Callback when push tags toggle changes
   */

  import type {
    UnpushedCommit,
    RemoteTracking,
    PushResult,
  } from "../../../../src/types/push-context";
  import UnpushedCommitsList from "./UnpushedCommitsList.svelte";
  import RemoteSelector from "./RemoteSelector.svelte";
  import PushBehindWarning from "./PushBehindWarning.svelte";
  import PushProgress from "./PushProgress.svelte";
  import PushSuccess from "./PushSuccess.svelte";

  type PushStatus = "idle" | "pushing" | "success" | "error";

  interface Props {
    isOpen: boolean;
    unpushedCommits: readonly UnpushedCommit[];
    remotes: readonly RemoteTracking[];
    selectedRemote: string;
    behindCount: number;
    aheadCount: number;
    forcePush: boolean;
    setUpstream: boolean;
    pushTags: boolean;
    status: PushStatus;
    error: string | null;
    result: PushResult | null;
    onClose: () => void;
    onPush: () => void;
    onRemoteChange: (remoteName: string) => void;
    onForcePushChange: (enabled: boolean) => void;
    onSetUpstreamChange: (enabled: boolean) => void;
    onPushTagsChange: (enabled: boolean) => void;
  }

  const {
    isOpen,
    unpushedCommits,
    remotes,
    selectedRemote,
    behindCount,
    aheadCount,
    forcePush,
    setUpstream,
    pushTags,
    status,
    error,
    result,
    onClose,
    onPush,
    onRemoteChange,
    onForcePushChange,
    onSetUpstreamChange,
    onPushTagsChange,
  }: Props = $props();

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
   * Handle push button click
   */
  function handlePush(): void {
    if (status === "idle" || status === "error") {
      onPush();
    }
  }

  /**
   * Handle success close
   */
  function handleSuccessClose(): void {
    onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="push-panel-backdrop fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
    onclick={handleBackdropClick}
    role="button"
    tabindex="-1"
    aria-label="Close push panel"
  ></div>

  <!-- Panel -->
  <div
    class="push-panel fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 max-h-[85vh] overflow-y-auto"
    onclick={handlePanelClick}
    role="dialog"
    aria-labelledby="push-panel-title"
    aria-modal="true"
  >
    <!-- Panel Header -->
    <div
      class="panel-header sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10"
    >
      <div class="flex items-center justify-between">
        <h2 id="push-panel-title" class="text-xl font-bold text-gray-900">
          Push Commits
        </h2>

        <button
          type="button"
          onclick={onClose}
          class="close-icon-button p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Close panel"
          disabled={status === "pushing"}
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
      {#if status === "pushing"}
        <!-- Pushing State -->
        <PushProgress message="Pushing commits to remote..." />
      {:else if status === "success" && result}
        <!-- Success State -->
        <PushSuccess
          remote={result.remote}
          branch={result.branch}
          pushedCommits={result.pushedCommits}
          sessionId={result.sessionId}
          onclose={handleSuccessClose}
        />
      {:else}
        <!-- Idle/Error State -->
        <div class="space-y-6">
          <!-- Behind Warning -->
          {#if behindCount > 0}
            <PushBehindWarning {behindCount} {aheadCount} />
          {/if}

          <!-- Error Message -->
          {#if status === "error" && error}
            <div
              class="error-message p-4 bg-red-50 border border-red-300 rounded-lg"
            >
              <div class="flex items-start gap-3">
                <svg
                  class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
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
                  <h3 class="text-sm font-medium text-red-800 mb-1">
                    Push Failed
                  </h3>
                  <p class="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          {/if}

          <!-- Unpushed Commits List -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">
              Unpushed Commits ({unpushedCommits.length})
            </h3>
            <UnpushedCommitsList commits={unpushedCommits} />
          </div>

          <!-- Remote Selector -->
          <RemoteSelector
            {remotes}
            {selectedRemote}
            onchange={onRemoteChange}
            disabled={status === "pushing"}
          />

          <!-- Options -->
          <div class="options-section space-y-3">
            <h3 class="text-sm font-medium text-gray-700">Options</h3>

            <!-- Force Push Toggle -->
            <label class="option-toggle flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={forcePush}
                onchange={(e) => onForcePushChange(e.currentTarget.checked)}
                disabled={status === "pushing"}
                class="toggle-checkbox w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
              />
              <div class="flex-1">
                <span class="text-sm font-medium text-gray-900">Force Push</span
                >
                <p class="text-xs text-gray-500">
                  Overwrite remote branch (use with caution)
                </p>
              </div>
            </label>

            <!-- Set Upstream Toggle -->
            <label class="option-toggle flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={setUpstream}
                onchange={(e) => onSetUpstreamChange(e.currentTarget.checked)}
                disabled={status === "pushing"}
                class="toggle-checkbox w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
              />
              <div class="flex-1">
                <span class="text-sm font-medium text-gray-900"
                  >Set Upstream</span
                >
                <p class="text-xs text-gray-500">
                  Set remote as upstream tracking branch
                </p>
              </div>
            </label>

            <!-- Push Tags Toggle -->
            <label class="option-toggle flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={pushTags}
                onchange={(e) => onPushTagsChange(e.currentTarget.checked)}
                disabled={status === "pushing"}
                class="toggle-checkbox w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
              />
              <div class="flex-1">
                <span class="text-sm font-medium text-gray-900">Push Tags</span>
                <p class="text-xs text-gray-500">Push all tags to remote</p>
              </div>
            </label>
          </div>
        </div>
      {/if}
    </div>

    <!-- Panel Footer (Action Buttons) -->
    {#if status !== "pushing" && status !== "success"}
      <div
        class="panel-footer sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4"
      >
        <div class="flex gap-3">
          <!-- Cancel Button -->
          <button
            type="button"
            onclick={onClose}
            class="cancel-button flex-1 min-h-[44px] px-6 py-2
                   text-gray-700 bg-gray-100
                   rounded-lg
                   hover:bg-gray-200
                   focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2
                   active:bg-gray-300
                   transition-colors
                   font-medium text-base"
          >
            Cancel
          </button>

          <!-- Push Button -->
          <button
            type="button"
            onclick={handlePush}
            disabled={unpushedCommits.length === 0}
            class="push-action-button flex-1 min-h-[44px] px-6 py-2
                   text-white bg-green-600
                   rounded-lg
                   hover:bg-green-700
                   focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
                   active:bg-green-800
                   disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed
                   transition-colors
                   font-medium text-base"
          >
            {forcePush ? "Force Push" : "Push"}
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /**
   * PushPanel Styling
   *
   * - Bottom sheet with slide-up animation
   * - Backdrop overlay
   * - Sticky header and footer
   * - Scrollable content area
   * - Touch-friendly buttons
   */
  .push-panel-backdrop {
    animation: fade-in 0.2s ease-out;
  }

  .push-panel {
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

  .push-panel {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
  }

  .push-panel::-webkit-scrollbar {
    width: 6px;
  }

  .push-panel::-webkit-scrollbar-track {
    background: transparent;
  }

  .push-panel::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
  }

  .push-panel::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.7);
  }

  .close-icon-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-button:active,
  .push-action-button:not(:disabled):active {
    transform: scale(0.98);
  }

  .option-toggle {
    padding: 0.75rem;
    border-radius: 0.5rem;
    transition: background-color 0.2s;
  }

  .option-toggle:hover {
    background-color: #f9fafb;
  }

  .toggle-checkbox {
    cursor: pointer;
  }

  .toggle-checkbox:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
