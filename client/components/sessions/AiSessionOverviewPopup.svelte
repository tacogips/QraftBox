<script lang="ts">
  import type { AIAgent } from "../../../src/types/ai-agent";
  import SessionTranscriptInline from "./SessionTranscriptInline.svelte";

  interface Props {
    open: boolean;
    contextId: string | null;
    sessionId: string;
    title: string;
    status: "running" | "queued" | "idle";
    purpose: string;
    latestResponse: string;
    source: "qraftbox" | "claude-cli" | "unknown";
    aiAgent: AIAgent;
    queuedPromptCount: number;
    pendingPromptMessages: readonly {
      message: string;
      status: "queued" | "running";
    }[];
    onClose: () => void;
    onResumeSession: (sessionId: string) => void;
    onSubmitPrompt: (message: string, immediate: boolean) => Promise<void>;
  }

  const {
    open,
    contextId,
    sessionId,
    title,
    status,
    purpose,
    latestResponse,
    source,
    aiAgent,
    queuedPromptCount,
    pendingPromptMessages,
    onClose,
    onResumeSession,
    onSubmitPrompt,
  }: Props = $props();

  let promptText = $state("");
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let optimisticUserMessage = $state<string | undefined>(undefined);
  let optimisticUserStatus = $state<"queued" | "running">("queued");
  let focusTailNonce = $state(0);

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
    } finally {
      submitting = false;
    }
  }

  function handlePromptComposerKeydown(event: KeyboardEvent): void {
    if (submitting || promptText.trim().length === 0) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void submitNextPrompt(event.shiftKey);
    }
  }

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
    if (!submitting) {
      optimisticUserMessage = undefined;
      optimisticUserStatus = "queued";
    }
  });

  $effect(() => {
    if (!open) {
      optimisticUserMessage = undefined;
      optimisticUserStatus = "queued";
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
              class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide {status ===
              'running'
                ? 'bg-accent-muted text-accent-fg'
                : status === 'queued'
                  ? 'bg-attention-muted text-attention-fg'
                  : 'bg-bg-tertiary text-text-secondary'}"
            >
              {status}
            </span>
            <span
              class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide {source ===
              'qraftbox'
                ? 'bg-success-muted text-success-fg'
                : source === 'claude-cli'
                  ? 'bg-accent-muted text-accent-fg'
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
            Latest: {latestResponse}
          </p>
        </div>

        <div class="shrink-0 flex items-center gap-2">
          <button
            type="button"
            class="px-2.5 py-1 text-xs rounded border border-border-default
                   text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            onclick={() => onResumeSession(sessionId)}
          >
            Set Active
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
          {#if contextId !== null}
            <SessionTranscriptInline
              {sessionId}
              {contextId}
              autoRefreshMs={status === "running" || submitting ? 1500 : 0}
              followLatest={status === "running"}
              {focusTailNonce}
              {optimisticUserMessage}
              {optimisticUserStatus}
              pendingUserMessages={pendingPromptMessages}
            />
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

          <div class="mt-3 flex items-center gap-2">
            <button
              type="button"
              class="px-3 py-1.5 text-xs rounded bg-accent-muted text-accent-fg
                     border border-accent-emphasis/40 hover:bg-accent-muted/80 disabled:opacity-60 font-medium"
              disabled={submitting || promptText.trim().length === 0}
              onclick={() => void submitNextPrompt(false)}
            >
              {submitting ? "Submitting..." : "Queue"}
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-xs rounded bg-danger-muted text-danger-fg
                     border border-danger-fg/30 hover:bg-danger-muted/80 disabled:opacity-60"
              disabled={submitting || promptText.trim().length === 0}
              onclick={() => void submitNextPrompt(true)}
              title="Priority: run immediately and bypass normal queue order"
            >
              {submitting ? "Submitting..." : "Run Now (Priority)"}
            </button>
          </div>
          <p class="mt-2 text-[11px] text-text-tertiary">
            Default is <span class="font-medium text-text-secondary">Queue</span
            >. Shortcut: Ctrl/Cmd+Enter queues, Ctrl/Cmd+Shift+Enter runs
            immediately as priority.
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}
