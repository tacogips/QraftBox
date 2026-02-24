<script lang="ts">
  import type { AIAgent } from "../../../src/types/ai-agent";
  import type { ModelProfile } from "../../../src/types/model-config";
  import {
    getSessionStatusMeta,
    type SessionStatus,
  } from "../../src/lib/session-status";
  import SessionTranscriptInline from "./SessionTranscriptInline.svelte";

  interface Props {
    open: boolean;
    contextId: string | null;
    sessionId: string | null;
    qraftSessionId: string | null;
    cliSessionId: string | null;
    title: string;
    status: SessionStatus;
    purpose: string;
    latestResponse: string;
    source: "qraftbox" | "claude-cli" | "codex-cli" | "unknown";
    aiAgent: AIAgent;
    queuedPromptCount: number;
    pendingPromptMessages: readonly {
      message: string;
      status: "queued" | "running";
    }[];
    optimisticAssistantMessage?: string | undefined;
    showModelProfileSelector?: boolean;
    modelProfiles?: readonly ModelProfile[];
    selectedModelProfileId?: string | undefined;
    onModelProfileChange?: (profileId: string | undefined) => void;
    canCancelPrompt: boolean;
    cancelPromptInProgress: boolean;
    cancelPromptError: string | null;
    canRunSessionDefaultPrompts: boolean;
    isHidden: boolean;
    onToggleHidden: () => Promise<void>;
    onCancelPrompt: () => Promise<void>;
    onRunRefreshPurposePrompt: () => Promise<void>;
    onRunResumeSessionPrompt: () => Promise<void>;
    onClose: () => void;
    onSubmitPrompt: (message: string, immediate: boolean) => Promise<void>;
  }

  const {
    open,
    contextId,
    sessionId,
    qraftSessionId,
    cliSessionId,
    title,
    status,
    purpose,
    latestResponse,
    source,
    aiAgent,
    queuedPromptCount,
    pendingPromptMessages,
    optimisticAssistantMessage = undefined,
    showModelProfileSelector = false,
    modelProfiles = [],
    selectedModelProfileId = undefined,
    onModelProfileChange,
    canCancelPrompt,
    cancelPromptInProgress,
    cancelPromptError,
    canRunSessionDefaultPrompts,
    isHidden,
    onToggleHidden,
    onCancelPrompt,
    onRunRefreshPurposePrompt,
    onRunResumeSessionPrompt,
    onClose,
    onSubmitPrompt,
  }: Props = $props();

  const normalizedSessionId = $derived.by(() => {
    if (typeof sessionId !== "string") {
      return null;
    }
    const trimmed = sessionId.trim();
    if (trimmed.length === 0 || trimmed === "undefined" || trimmed === "null") {
      return null;
    }
    return trimmed;
  });

  const normalizedQraftSessionId = $derived.by(() => {
    if (typeof qraftSessionId !== "string") {
      return null;
    }
    const trimmed = qraftSessionId.trim();
    if (trimmed.length === 0 || trimmed === "undefined" || trimmed === "null") {
      return null;
    }
    return trimmed;
  });

  const normalizedCliSessionId = $derived.by(() => {
    if (typeof cliSessionId !== "string") {
      return null;
    }
    const trimmed = cliSessionId.trim();
    if (trimmed.length === 0 || trimmed === "undefined" || trimmed === "null") {
      return null;
    }
    return trimmed;
  });

  const cliSessionLabel = $derived.by(() =>
    aiAgent === "codex" || source === "codex-cli"
      ? "Codex Session ID"
      : "Claude Session ID",
  );

  let copiedIdType = $state<"qraft" | "cli" | null>(null);
  let copiedFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  function resetCopyFeedbackTimer(): void {
    if (copiedFeedbackTimer !== null) {
      clearTimeout(copiedFeedbackTimer);
      copiedFeedbackTimer = null;
    }
  }

  function markIdCopied(idType: "qraft" | "cli"): void {
    copiedIdType = idType;
    resetCopyFeedbackTimer();
    copiedFeedbackTimer = setTimeout(() => {
      copiedIdType = null;
      copiedFeedbackTimer = null;
    }, 1200);
  }

  async function copySessionId(
    idType: "qraft" | "cli",
    value: string | null,
  ): Promise<void> {
    if (value === null || value.length === 0) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      markIdCopied(idType);
      return;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      markIdCopied(idType);
    }
  }

  let promptText = $state("");
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let optimisticUserMessage = $state<string | undefined>(undefined);
  let optimisticUserStatus = $state<"queued" | "running">("queued");
  let optimisticAssistantMessageSticky = $state<string | undefined>(undefined);
  let focusTailNonce = $state(0);
  let showSubmitOptions = $state(false);
  let runningRefreshPurpose = $state(false);
  let runningResumeSession = $state(false);

  function normalizePromptText(message: string): string {
    return message.replace(/\s+/g, " ").trim();
  }

  async function submitNextPrompt(immediate: boolean): Promise<void> {
    const trimmedPrompt = promptText.trim();
    if (trimmedPrompt.length === 0 || submitting) {
      return;
    }

    submitting = true;
    submitError = null;
    optimisticUserMessage = trimmedPrompt;
    optimisticUserStatus = immediate ? "running" : "queued";
    focusTailNonce += 1;
    try {
      await onSubmitPrompt(trimmedPrompt, immediate);
      promptText = "";
    } catch (error: unknown) {
      submitError =
        error instanceof Error ? error.message : "Failed to submit prompt";
      optimisticUserMessage = undefined;
      optimisticUserStatus = "queued";
    } finally {
      submitting = false;
    }
  }

  async function runDefaultPrompt(
    kind: "refresh-purpose" | "resume-session",
  ): Promise<void> {
    if (!canRunSessionDefaultPrompts || submitting) {
      return;
    }

    const assignRunningState = (value: boolean): void => {
      if (kind === "refresh-purpose") {
        runningRefreshPurpose = value;
      } else {
        runningResumeSession = value;
      }
    };

    assignRunningState(true);
    submitError = null;
    try {
      if (kind === "refresh-purpose") {
        await onRunRefreshPurposePrompt();
      } else {
        await onRunResumeSessionPrompt();
      }
      focusTailNonce += 1;
    } catch (error: unknown) {
      submitError =
        error instanceof Error ? error.message : "Failed to run default prompt";
    } finally {
      assignRunningState(false);
    }
  }

  function handlePromptComposerKeydown(event: KeyboardEvent): void {
    if (submitting || promptText.trim().length === 0) {
      return;
    }
    if (event.key !== "Enter") {
      return;
    }
    if (event.shiftKey) {
      return;
    }
    event.preventDefault();
    // Cmd/Ctrl+Enter submits with immediate priority.
    if (event.ctrlKey || event.metaKey) {
      void submitNextPrompt(true);
      return;
    }
    // Enter submits queued by default for faster keyboard flow.
    if (!event.altKey) {
      void submitNextPrompt(false);
    }
  }

  function promptShortcutLabel(): string {
    if (typeof navigator === "undefined") {
      return "Enter submits queued. Shift+Enter adds a newline. Ctrl/Cmd+Enter runs immediately.";
    }
    const isMacPlatform =
      navigator.platform.toLowerCase().includes("mac") ||
      navigator.userAgent.toLowerCase().includes("macintosh");
    return isMacPlatform
      ? "Enter submits queued. Shift+Enter adds a newline. Cmd+Enter runs immediately."
      : "Enter submits queued. Shift+Enter adds a newline. Ctrl+Enter runs immediately.";
  }

  const promptShortcutHint = $derived(promptShortcutLabel());
  const shouldLiveRefreshTranscript = $derived(
    status === "running" || source === "codex-cli",
  );
  const hasRunningPendingPrompt = $derived(
    optimisticUserStatus === "running" ||
      pendingPromptMessages.some((pending) => pending.status === "running"),
  );
  const shouldShowAssistantThinking = $derived(
    status === "running" || submitting || hasRunningPendingPrompt,
  );

  $effect(() => {
    const optimisticMessage = optimisticUserMessage;
    if (optimisticMessage === undefined) {
      return;
    }
    const normalizedOptimistic = normalizePromptText(optimisticMessage);
    const pendingMatch = pendingPromptMessages.find(
      (item) => normalizePromptText(item.message) === normalizedOptimistic,
    );
    if (pendingMatch !== undefined) {
      optimisticUserStatus = pendingMatch.status;
      return;
    }
    // Clear stale optimistic message when no matching pending prompt exists
    // and the session is no longer actively processing (e.g. after cancel).
    if (status === "awaiting_input") {
      optimisticUserMessage = undefined;
      optimisticUserStatus = "queued";
    }
  });

  $effect(() => {
    const assistantMessage = optimisticAssistantMessage;
    if (
      typeof assistantMessage === "string" &&
      assistantMessage.trim().length > 0
    ) {
      optimisticAssistantMessageSticky = assistantMessage;
      return;
    }
    if (!open) {
      optimisticAssistantMessageSticky = undefined;
    }
  });

  $effect(() => {
    if (!open) {
      optimisticUserMessage = undefined;
      optimisticUserStatus = "queued";
      optimisticAssistantMessageSticky = undefined;
      showSubmitOptions = false;
      return;
    }
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
    };
  });

  $effect(() => {
    return () => {
      resetCopyFeedbackTimer();
    };
  });
</script>

{#if open}
  <div
    class="fixed inset-0 z-[130] bg-black/45 backdrop-blur-[1px]"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}
  >
    <div
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
             w-[min(1200px,94vw)] h-[min(92vh,860px)]
             border border-border-default bg-bg-primary rounded-xl shadow-2xl
             overflow-hidden flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Session progress"
    >
      <div
        class="shrink-0 px-4 py-3 border-b border-border-default bg-bg-secondary
               flex items-start justify-between gap-4"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span
              class={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${getSessionStatusMeta(status).badgeClass}`}
            >
              {getSessionStatusMeta(status).label}
            </span>
            <span
              class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide {source ===
              'qraftbox'
                ? 'bg-success-muted text-success-fg'
                : source === 'claude-cli'
                  ? 'bg-accent-muted text-accent-fg'
                  : source === 'codex-cli'
                    ? 'bg-attention-emphasis/20 text-attention-fg'
                    : 'bg-bg-tertiary text-text-secondary'}"
            >
              {source}
            </span>
            <span
              class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-bg-tertiary text-text-secondary"
            >
              {aiAgent}
            </span>
            {#if queuedPromptCount > 0}
              <span class="text-xs text-text-tertiary"
                >{queuedPromptCount} queued</span
              >
            {/if}
          </div>
          <h2 class="text-sm font-semibold text-text-primary truncate">
            {title}
          </h2>
          <p class="text-xs text-text-secondary mt-1 truncate">
            Purpose: {purpose}
          </p>
          <p class="text-xs text-text-tertiary mt-0.5 truncate">
            Latest activity: {latestResponse}
          </p>
          <div class="mt-1 flex flex-wrap items-start gap-x-4 gap-y-1">
            <div class="flex min-w-[320px] flex-1 items-center gap-1.5">
              <span
                class="shrink-0 text-[10px] uppercase tracking-wide text-text-tertiary"
              >
                Qraft Session ID
              </span>
              <span
                class="min-w-0 truncate text-[11px] text-text-secondary font-mono"
              >
                {normalizedQraftSessionId ?? "-"}
              </span>
              <button
                type="button"
                class="shrink-0 p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover
                       focus:outline-none focus:ring-1 focus:ring-accent-emphasis
                       disabled:opacity-60 disabled:cursor-not-allowed"
                onclick={() => copySessionId("qraft", normalizedQraftSessionId)}
                disabled={normalizedQraftSessionId === null}
                aria-label="Copy Qraft session ID"
                title="Copy Qraft session ID"
              >
                {#if copiedIdType === "qraft"}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="text-success-fg"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path
                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                    />
                  </svg>
                {/if}
              </button>
            </div>
            <div class="flex min-w-[320px] flex-1 items-center gap-1.5">
              <span
                class="shrink-0 text-[10px] uppercase tracking-wide text-text-tertiary"
              >
                {cliSessionLabel}
              </span>
              <span
                class="min-w-0 truncate text-[11px] text-text-secondary font-mono"
              >
                {normalizedCliSessionId ?? "-"}
              </span>
              <button
                type="button"
                class="shrink-0 p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover
                       focus:outline-none focus:ring-1 focus:ring-accent-emphasis
                       disabled:opacity-60 disabled:cursor-not-allowed"
                onclick={() => copySessionId("cli", normalizedCliSessionId)}
                disabled={normalizedCliSessionId === null}
                aria-label={`Copy ${cliSessionLabel}`}
                title={`Copy ${cliSessionLabel}`}
              >
                {#if copiedIdType === "cli"}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="text-success-fg"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path
                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                    />
                  </svg>
                {/if}
              </button>
            </div>
          </div>
        </div>

        <div class="shrink-0 flex items-center gap-2">
          {#if canRunSessionDefaultPrompts}
            <button
              type="button"
              class="px-2 py-1 rounded border border-border-default text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-60 disabled:cursor-not-allowed"
              onclick={() => {
                void runDefaultPrompt("refresh-purpose");
              }}
              disabled={submitting ||
                runningRefreshPurpose ||
                runningResumeSession}
              aria-label="Refresh purpose"
              title="Run default refresh-purpose prompt"
            >
              {runningRefreshPurpose ? "Refreshing..." : "Refresh Purpose"}
            </button>
            <button
              type="button"
              class="px-2 py-1 rounded border border-border-default text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-60 disabled:cursor-not-allowed"
              onclick={() => {
                void runDefaultPrompt("resume-session");
              }}
              disabled={submitting ||
                runningResumeSession ||
                runningRefreshPurpose}
              aria-label="Resume session"
              title="Run default resume-session prompt"
            >
              {runningResumeSession ? "Resuming..." : "Resume Session"}
            </button>
          {/if}
          {#if canCancelPrompt}
            <button
              type="button"
              class="px-2 py-1 rounded border border-danger-emphasis/40 text-xs text-danger-fg hover:bg-danger-emphasis/10 disabled:opacity-60 disabled:cursor-not-allowed"
              onclick={() => {
                void onCancelPrompt();
              }}
              disabled={cancelPromptInProgress}
              aria-label="Cancel current prompt"
              title="Cancel prompt execution"
            >
              {cancelPromptInProgress ? "Cancelling..." : "Cancel Prompt"}
            </button>
          {/if}
          <button
            type="button"
            class="px-2 py-1 rounded border border-border-default text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            onclick={() => {
              void onToggleHidden();
            }}
            aria-label={isHidden ? "Show session in grid" : "Hide session"}
            title={isHidden ? "Show session" : "Hide session"}
          >
            {isHidden ? "Show" : "Hide"}
          </button>
          <button
            type="button"
            class="w-7 h-7 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary"
            onclick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 grid grid-cols-1 lg:grid-cols-[1fr_340px]">
        <div class="min-h-0 overflow-hidden border-r border-border-default/70">
          {#if contextId !== null && normalizedSessionId !== null}
            <SessionTranscriptInline
              sessionId={normalizedSessionId}
              {contextId}
              autoRefreshMs={shouldLiveRefreshTranscript || submitting
                ? 1500
                : 0}
              followLatest={shouldLiveRefreshTranscript}
              {focusTailNonce}
              showAssistantThinking={shouldShowAssistantThinking}
              {optimisticUserMessage}
              {optimisticUserStatus}
              optimisticAssistantMessage={optimisticAssistantMessageSticky}
              pendingUserMessages={pendingPromptMessages}
            />
          {:else if normalizedSessionId === null}
            <div
              class="h-full flex items-center justify-center text-sm text-text-tertiary"
            >
              New session ready. Submit the first prompt to start.
            </div>
          {:else}
            <div
              class="h-full flex items-center justify-center text-sm text-text-tertiary"
            >
              Context is unavailable.
            </div>
          {/if}
        </div>

        <div class="min-h-0 overflow-y-auto p-4 bg-bg-secondary/40">
          <h3
            class="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2"
          >
            Next Prompt
          </h3>
          {#if showModelProfileSelector}
            <div class="mb-3 space-y-1">
              <label
                for="new-session-profile-select"
                class="block text-[11px] font-semibold uppercase tracking-wide text-text-secondary"
              >
                Profile (new session)
              </label>
              <select
                id="new-session-profile-select"
                class="w-full rounded border border-border-default bg-bg-primary px-2 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
                value={selectedModelProfileId}
                disabled={modelProfiles.length === 0 || submitting}
                onchange={(event) => {
                  const nextValue = (event.currentTarget as HTMLSelectElement)
                    .value;
                  onModelProfileChange?.(
                    nextValue.length > 0 ? nextValue : undefined,
                  );
                }}
              >
                {#if modelProfiles.length === 0}
                  <option value="">No profile available</option>
                {:else}
                  {#each modelProfiles as profile (profile.id)}
                    <option value={profile.id}>
                      {profile.name} ({profile.vendor} / {profile.model})
                    </option>
                  {/each}
                {/if}
              </select>
            </div>
          {/if}
          <textarea
            class="w-full h-40 resize-y min-h-28 rounded border border-border-default bg-bg-primary
                   px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-emphasis"
            placeholder="Add the next instruction for this session"
            bind:value={promptText}
            onkeydown={handlePromptComposerKeydown}
          ></textarea>

          {#if submitError !== null}
            <p class="mt-2 text-xs text-danger-fg">{submitError}</p>
          {/if}
          {#if cancelPromptError !== null}
            <p class="mt-2 text-xs text-danger-fg">{cancelPromptError}</p>
          {/if}

          <div class="mt-3">
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="px-3 py-1.5 text-xs rounded bg-accent-muted text-accent-fg
                       border border-accent-emphasis/40 hover:bg-accent-muted/80 disabled:opacity-60 font-medium"
                disabled={submitting || promptText.trim().length === 0}
                onclick={() => void submitNextPrompt(false)}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
              <button
                type="button"
                class="px-2 py-1.5 text-xs rounded border border-border-default bg-bg-primary
                       text-text-secondary hover:bg-bg-hover disabled:opacity-60"
                disabled={submitting || promptText.trim().length === 0}
                aria-expanded={showSubmitOptions}
                aria-label="Toggle submit options"
                onclick={() => {
                  showSubmitOptions = !showSubmitOptions;
                }}
              >
                {showSubmitOptions ? "▲" : "▼"}
              </button>
            </div>

            {#if showSubmitOptions}
              <div
                class="mt-2 rounded border border-border-default bg-bg-primary p-2"
              >
                <button
                  type="button"
                  class="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-hover
                         text-text-secondary disabled:opacity-60"
                  disabled={submitting || promptText.trim().length === 0}
                  onclick={() => void submitNextPrompt(true)}
                  title="Priority: run immediately and bypass normal queue order"
                >
                  {submitting ? "Submitting..." : "Run immediately"}
                </button>
              </div>
            {/if}
          </div>
          <p class="mt-2 text-[11px] text-text-tertiary">
            Default is <span class="font-medium text-text-secondary"
              >Submit (queued)</span
            >. {promptShortcutHint}
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}
