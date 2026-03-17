import { Show, type JSX } from "solid-js";
import { ToolbarIconButton } from "../../components/ToolbarIconButton";
import {
  AiSessionChatPane,
  type AiSessionChatPaneImageAttachment,
} from "./AiSessionChatPane";
import type { AiSessionDefaultPromptAction } from "./state";
import type { AiSessionTranscriptLine } from "./presentation";

export interface AiSessionDetailPaneProps {
  readonly heading: string;
  readonly description: string;
  readonly purposeExpanded: boolean;
  readonly onTogglePurposeExpanded: () => void;
  readonly status: string | null;
  readonly modelLabel: string;
  readonly showSystemPrompts: boolean;
  readonly hiddenSystemPromptCount: number;
  readonly onToggleSystemPrompts: () => void;
  readonly transcriptSummary: string;
  readonly transcriptCollapsed: boolean;
  readonly onToggleTranscriptCollapsed: () => void;
  readonly transcriptContainerRef?:
    | ((element: HTMLDivElement) => void)
    | undefined;
  readonly onTranscriptScroll?: ((event: Event) => void) | undefined;
  readonly transcriptLoading: boolean;
  readonly transcriptLoadingMore: boolean;
  readonly transcriptError: string | null;
  readonly transcriptLines: readonly AiSessionTranscriptLine[];
  readonly copiedTranscriptLineId: string | null;
  readonly onCopyTranscriptLine: (
    transcriptLine: AiSessionTranscriptLine,
  ) => void | Promise<void>;
  readonly emptyTranscriptText: string;
  readonly composerCollapsed: boolean;
  readonly onToggleComposerCollapsed: () => void;
  readonly composerContext?: JSX.Element;
  readonly promptInput: string;
  readonly onPromptInput: (value: string) => void;
  readonly onPromptKeyDown: JSX.EventHandlerUnion<
    HTMLTextAreaElement,
    KeyboardEvent
  >;
  readonly attachmentTrigger?: JSX.Element;
  readonly attachmentHint?: string;
  readonly attachments?: readonly AiSessionChatPaneImageAttachment[];
  readonly onRemoveAttachment?: ((attachmentId: string) => void) | undefined;
  readonly attachmentError?: string | null;
  readonly composerActions: JSX.Element;
  readonly metadata?: JSX.Element;
  readonly canRunDraftSessionDefaultPrompt: boolean;
  readonly canRunSelectedSessionDefaultPrompts: boolean;
  readonly describeDefaultPromptActionLabel: (
    action: AiSessionDefaultPromptAction,
  ) => string;
  readonly composerBusy: boolean;
  readonly onRunDefaultPromptAction: (
    action: AiSessionDefaultPromptAction,
  ) => void | Promise<void>;
  readonly onReloadTranscript: () => void | Promise<void>;
  readonly reloadTranscriptDisabled: boolean;
  readonly onJumpToHead: () => void | Promise<void>;
  readonly jumpToHeadDisabled: boolean;
  readonly onJumpToLatest: () => void | Promise<void>;
  readonly jumpToLatestDisabled: boolean;
  readonly onClose?: (() => void) | undefined;
  readonly rightToolbarActions?: JSX.Element;
}

function renderRefreshIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="M15.5 9.5a5.5 5.5 0 1 1-1.2-3.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12.5 3.5h3v3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function renderCreatePurposeIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="M10 3.5 11.6 7l3.9.5-2.9 2.8.8 4-3.4-1.9-3.4 1.9.8-4-2.9-2.8 3.9-.5Z"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M14.5 4.5v3" stroke-linecap="round" />
      <path d="M13 6h3" stroke-linecap="round" />
    </svg>
  );
}

function renderRefreshPurposeIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="M14.8 10.2a4.8 4.8 0 1 1-1.1-3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12.4 4.1h2.8v2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M10 7.2v1.8" stroke-linecap="round" />
      <path d="M10 11.2V13" stroke-linecap="round" />
      <path d="M7.9 10.1h1.8" stroke-linecap="round" />
      <path d="M11.9 10.1h1.8" stroke-linecap="round" />
    </svg>
  );
}

function renderJumpToLatestIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="m6.5 6 3.5 3.5L13.5 6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="m6.5 10.5 3.5 3.5 3.5-3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function renderJumpToHeadIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="m6.5 14 3.5-3.5 3.5 3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="m6.5 9.5 3.5-3.5 3.5 3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function renderCloseIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path d="m5 5 10 10" stroke-linecap="round" />
      <path d="M15 5 5 15" stroke-linecap="round" />
    </svg>
  );
}

function renderSystemPromptVisibilityIcon(hiddenCount: number): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <rect x="3.5" y="4" width="13" height="10" rx="2" />
      <path d="M6.5 7.5h7" stroke-linecap="round" />
      <path d="M6.5 10.5h4" stroke-linecap="round" />
      <Show when={hiddenCount > 0}>
        <path d="M4 16 16 4" stroke-linecap="round" />
      </Show>
    </svg>
  );
}

function getSessionStatusBadgeClass(status: string): string {
  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus.includes("run")) {
    return "bg-accent-muted text-accent-fg";
  }
  if (normalizedStatus.includes("queue")) {
    return "bg-attention-emphasis/20 text-attention-fg";
  }
  if (
    normalizedStatus.includes("fail") ||
    normalizedStatus.includes("cancel") ||
    normalizedStatus.includes("error")
  ) {
    return "bg-danger-emphasis/20 text-danger-fg";
  }
  if (normalizedStatus.includes("await")) {
    return "bg-success-muted text-success-fg";
  }
  return "bg-bg-tertiary text-text-secondary";
}

export function AiSessionDetailPane(
  props: AiSessionDetailPaneProps,
): JSX.Element {
  return (
    <AiSessionChatPane
      heading={props.heading}
      description={props.description}
      purposeExpanded={props.purposeExpanded}
      onTogglePurposeExpanded={props.onTogglePurposeExpanded}
      headerBadges={
        <>
          <Show when={props.status !== null}>
            <span
              class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getSessionStatusBadgeClass(
                props.status ?? "",
              )}`}
            >
              {props.status}
            </span>
          </Show>
          <span class="rounded bg-bg-tertiary px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            {props.modelLabel}
          </span>
        </>
      }
      toolbarActions={
        <>
          <button
            type="button"
            class={`rounded-md border p-2 transition ${
              props.showSystemPrompts
                ? "border-accent-emphasis/50 bg-accent-muted text-accent-fg"
                : "border-border-default bg-bg-primary text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
            aria-pressed={props.showSystemPrompts}
            aria-label={
              props.showSystemPrompts
                ? "Hide system prompts"
                : props.hiddenSystemPromptCount > 0
                  ? `Show system prompts (${props.hiddenSystemPromptCount} hidden)`
                  : "Show system prompts"
            }
            title={
              props.showSystemPrompts
                ? "Hide system prompts"
                : props.hiddenSystemPromptCount > 0
                  ? `Show system prompts (${props.hiddenSystemPromptCount} hidden)`
                  : "Show system prompts"
            }
            onClick={props.onToggleSystemPrompts}
          >
            <span class="block h-5 w-5">
              {renderSystemPromptVisibilityIcon(
                props.showSystemPrompts ? 0 : props.hiddenSystemPromptCount,
              )}
            </span>
          </button>
          <Show when={props.canRunDraftSessionDefaultPrompt}>
            <ToolbarIconButton
              label={props.describeDefaultPromptActionLabel(
                "ai-session-purpose",
              )}
              disabled={props.composerBusy}
              onClick={() =>
                void props.onRunDefaultPromptAction("ai-session-purpose")
              }
            >
              {renderCreatePurposeIcon()}
            </ToolbarIconButton>
          </Show>
          <Show when={props.canRunSelectedSessionDefaultPrompts}>
            <ToolbarIconButton
              label={props.describeDefaultPromptActionLabel(
                "ai-session-refresh-purpose",
              )}
              disabled={props.composerBusy}
              onClick={() =>
                void props.onRunDefaultPromptAction(
                  "ai-session-refresh-purpose",
                )
              }
            >
              {renderRefreshPurposeIcon()}
            </ToolbarIconButton>
          </Show>
          <ToolbarIconButton
            label="Reload transcript"
            disabled={props.reloadTranscriptDisabled}
            onClick={() => void props.onReloadTranscript()}
          >
            {renderRefreshIcon()}
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Jump to head"
            disabled={props.jumpToHeadDisabled}
            onClick={() => void props.onJumpToHead()}
          >
            {renderJumpToHeadIcon()}
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Jump to latest"
            disabled={props.jumpToLatestDisabled}
            onClick={() => void props.onJumpToLatest()}
          >
            {renderJumpToLatestIcon()}
          </ToolbarIconButton>
          {props.rightToolbarActions}
          <Show when={props.onClose !== undefined}>
            <button
              type="button"
              class="rounded-md border border-danger-emphasis bg-danger-emphasis p-2 text-danger-fg shadow-sm shadow-danger-emphasis/20 transition hover:border-danger-fg hover:bg-danger-fg hover:text-text-on-emphasis"
              aria-label="Close"
              title="Close"
              onClick={props.onClose}
            >
              <span class="block h-5 w-5">{renderCloseIcon()}</span>
            </button>
          </Show>
        </>
      }
      transcriptSummary={props.transcriptSummary}
      transcriptCollapsed={props.transcriptCollapsed}
      onToggleTranscriptCollapsed={props.onToggleTranscriptCollapsed}
      metadata={props.metadata}
      transcriptContainerRef={props.transcriptContainerRef}
      onTranscriptScroll={props.onTranscriptScroll}
      transcriptLoading={props.transcriptLoading}
      transcriptLoadingMore={props.transcriptLoadingMore}
      transcriptError={props.transcriptError}
      transcriptLines={props.transcriptLines}
      copiedTranscriptLineId={props.copiedTranscriptLineId}
      onCopyTranscriptLine={props.onCopyTranscriptLine}
      emptyTranscriptText={props.emptyTranscriptText}
      composerCollapsed={props.composerCollapsed}
      onToggleComposerCollapsed={props.onToggleComposerCollapsed}
      composerContext={props.composerContext}
      promptInput={props.promptInput}
      onPromptInput={props.onPromptInput}
      onPromptKeyDown={props.onPromptKeyDown}
      attachmentTrigger={props.attachmentTrigger}
      attachmentHint={props.attachmentHint}
      attachments={props.attachments}
      onRemoveAttachment={props.onRemoveAttachment}
      attachmentError={props.attachmentError}
      composerActions={props.composerActions}
    />
  );
}
