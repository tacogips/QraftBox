import { createEffect, For, Show, type JSX } from "solid-js";
import { ToolbarIconButton } from "../../components/ToolbarIconButton";
import {
  enhanceMarkdownElements,
  renderMarkdownHtml,
} from "../../lib/markdown";
import type { AiSessionTranscriptLine } from "./presentation";

export interface AiSessionChatPaneImageAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeLabel: string;
  readonly previewUrl: string;
}

export interface AiSessionChatPaneProps {
  readonly heading: string;
  readonly description: string;
  readonly purposeExpanded: boolean;
  readonly onTogglePurposeExpanded: () => void;
  readonly headerBadges?: JSX.Element;
  readonly toolbarActions?: JSX.Element;
  readonly transcriptSummary: string;
  readonly transcriptCollapsed: boolean;
  readonly onToggleTranscriptCollapsed: () => void;
  readonly metadata?: JSX.Element;
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
  readonly composerLabel?: string;
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
}

function renderCopyIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <rect x="7" y="5" width="9" height="11" rx="2" />
      <path d="M4.5 12.5V6.5A2.5 2.5 0 0 1 7 4h5.5" />
    </svg>
  );
}

function renderCopiedIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path
        d="m4.5 10.5 3.2 3.2L15.5 6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function renderChevronIcon(collapsed: boolean): JSX.Element {
  return collapsed ? (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path d="m6 12 4-4 4 4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function getTranscriptLineCardClass(
  transcriptLine: AiSessionTranscriptLine,
): string {
  if (transcriptLine.role === "assistant" && transcriptLine.isLive) {
    return "rounded-xl border border-success-emphasis/40 bg-success-muted/10 p-4";
  }
  if (transcriptLine.role === "assistant" && transcriptLine.isThinking) {
    return "rounded-xl border border-success-emphasis/30 bg-success-muted/10 p-4";
  }
  if (transcriptLine.role === "system") {
    return "rounded-xl border border-attention-emphasis/25 bg-attention-muted/10 p-4";
  }
  return "rounded-xl border border-border-default bg-bg-primary p-4";
}

function getTranscriptLineRoleBadgeClass(
  transcriptLine: AiSessionTranscriptLine,
): string {
  if (transcriptLine.role === "assistant") {
    return "bg-success-muted text-success-fg";
  }
  if (transcriptLine.role === "system") {
    return "bg-attention-emphasis/20 text-attention-fg";
  }
  return "bg-accent-muted text-accent-fg";
}

export function AiSessionChatPane(props: AiSessionChatPaneProps): JSX.Element {
  let transcriptMarkdownContainerElement: HTMLDivElement | undefined;

  createEffect(() => {
    props.transcriptLines;
    if (transcriptMarkdownContainerElement !== undefined) {
      enhanceMarkdownElements(transcriptMarkdownContainerElement);
    }
  });

  return (
    <div class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-border-default bg-bg-secondary">
      <div class="flex items-start justify-between gap-3 border-b border-border-default px-4 py-3">
        <div class="min-w-0 flex-1">
          <Show when={props.headerBadges !== undefined}>
            <div class="flex flex-wrap items-center gap-2">
              {props.headerBadges}
            </div>
          </Show>
          <div class="mt-2 flex items-start gap-2">
            <h3
              class={`min-w-0 flex-1 break-words text-lg font-semibold leading-7 text-text-primary ${
                props.purposeExpanded
                  ? "whitespace-normal"
                  : "overflow-hidden text-ellipsis whitespace-nowrap"
              }`}
              title={!props.purposeExpanded ? props.heading : undefined}
            >
              {props.heading}
            </h3>
            <ToolbarIconButton
              label={
                props.purposeExpanded ? "Collapse purpose" : "Expand purpose"
              }
              onClick={props.onTogglePurposeExpanded}
            >
              {renderChevronIcon(props.purposeExpanded)}
            </ToolbarIconButton>
          </div>
          <p
            class={`mt-1 text-xs text-text-secondary ${
              props.purposeExpanded
                ? "whitespace-normal"
                : "overflow-hidden text-ellipsis whitespace-nowrap"
            }`}
            title={!props.purposeExpanded ? props.description : undefined}
          >
            {props.description}
          </p>
        </div>
        <Show when={props.toolbarActions !== undefined}>
          <div class="mt-2 flex shrink-0 flex-wrap items-center gap-2 self-start">
            {props.toolbarActions}
          </div>
        </Show>
      </div>

      <div class="border-t border-border-default px-3 py-3 sm:px-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
              Chat history
            </p>
            <p class="mt-1 text-sm text-text-secondary">
              {props.transcriptSummary}
            </p>
          </div>
          <ToolbarIconButton
            label={
              props.transcriptCollapsed
                ? "Expand chat history"
                : "Collapse chat history"
            }
            onClick={props.onToggleTranscriptCollapsed}
          >
            {renderChevronIcon(props.transcriptCollapsed)}
          </ToolbarIconButton>
        </div>
      </div>

      <Show
        when={!props.transcriptCollapsed}
        fallback={
          <div class="px-3 pb-3 text-sm text-text-secondary sm:px-4">
            Chat history is collapsed.
          </div>
        }
      >
        <div
          ref={props.transcriptContainerRef}
          onScroll={props.onTranscriptScroll}
          class="min-h-0 flex-1 overflow-auto px-3 py-4 sm:px-4"
        >
          <Show when={props.metadata !== undefined}>
            <div class="mb-4">{props.metadata}</div>
          </Show>
          <Show when={props.transcriptLoading}>
            <p class="text-sm text-text-secondary">
              Loading selected session transcript...
            </p>
          </Show>
          <Show when={props.transcriptLoadingMore}>
            <p class="pb-3 text-xs text-text-secondary">
              Loading older transcript...
            </p>
          </Show>
          <Show when={props.transcriptError !== null}>
            <p
              role="alert"
              class="rounded-md border border-danger-emphasis/40 bg-danger-subtle px-3 py-2 text-sm text-danger-fg"
            >
              {props.transcriptError}
            </p>
          </Show>
          <div ref={transcriptMarkdownContainerElement} class="space-y-3">
            <For each={props.transcriptLines}>
              {(transcriptLine) => (
                <article class={getTranscriptLineCardClass(transcriptLine)}>
                  <div class="mb-2 flex items-center justify-between gap-3">
                    <span
                      class={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getTranscriptLineRoleBadgeClass(
                        transcriptLine,
                      )}`}
                    >
                      {transcriptLine.role}
                    </span>
                    <div class="flex items-center gap-2">
                      <span class="text-[11px] text-text-tertiary">
                        {transcriptLine.timestamp ?? ""}
                      </span>
                      <button
                        type="button"
                        class="rounded p-1 text-text-tertiary transition hover:bg-bg-hover hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-emphasis"
                        aria-label="Copy message to clipboard"
                        title="Copy to clipboard"
                        onClick={() =>
                          void props.onCopyTranscriptLine(transcriptLine)
                        }
                      >
                        <span class="block h-4 w-4">
                          {props.copiedTranscriptLineId === transcriptLine.id
                            ? renderCopiedIcon()
                            : renderCopyIcon()}
                        </span>
                      </button>
                    </div>
                  </div>
                  <div
                    class={`qraftbox-markdown break-words text-sm leading-6 text-text-primary ${
                      transcriptLine.isThinking ? "animate-thinking-blink" : ""
                    }`}
                    innerHTML={renderMarkdownHtml(transcriptLine.text)}
                  />
                </article>
              )}
            </For>
          </div>
          <Show
            when={
              !props.transcriptLoading &&
              props.transcriptError === null &&
              props.transcriptLines.length === 0
            }
          >
            <p class="text-sm text-text-secondary">
              {props.emptyTranscriptText}
            </p>
          </Show>
        </div>
      </Show>

      <div class="max-h-[45vh] shrink-0 overflow-y-auto border-t border-border-default bg-bg-primary px-3 py-3 sm:px-4">
        <div class="flex items-center gap-2">
          <ToolbarIconButton
            label={
              props.composerCollapsed
                ? "Expand session composer"
                : "Collapse session composer"
            }
            onClick={props.onToggleComposerCollapsed}
          >
            {renderChevronIcon(props.composerCollapsed)}
          </ToolbarIconButton>
          <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
            {props.composerLabel ?? "Session"}
          </span>
        </div>
        <Show when={!props.composerCollapsed}>
          <div class="mt-3 grid gap-2">
            <Show when={props.composerContext !== undefined}>
              <div>{props.composerContext}</div>
            </Show>
            <div class="pt-1">
              <div class="mb-1 flex items-center justify-between gap-3">
                <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                  Prompt
                </span>
              </div>
              <textarea
                class="min-h-[96px] w-full rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm leading-6 text-text-primary outline-none transition focus:border-accent-emphasis"
                rows={3}
                value={props.promptInput}
                onInput={(event) =>
                  props.onPromptInput(event.currentTarget.value)
                }
                onKeyDown={props.onPromptKeyDown}
              />
              <Show
                when={
                  props.attachmentTrigger !== undefined ||
                  (props.attachments?.length ?? 0) > 0 ||
                  props.attachmentError !== null ||
                  props.attachmentHint !== undefined
                }
              >
                <div class="mt-3 grid gap-2">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <Show when={props.attachmentTrigger !== undefined}>
                      <div>{props.attachmentTrigger}</div>
                    </Show>
                    <Show when={props.attachmentHint !== undefined}>
                      <p class="text-[11px] text-text-tertiary">
                        {props.attachmentHint}
                      </p>
                    </Show>
                  </div>
                  <Show when={(props.attachments?.length ?? 0) > 0}>
                    <div class="grid gap-2">
                      <For each={props.attachments ?? []}>
                        {(attachment) => (
                          <div class="flex items-center gap-3 rounded-md border border-border-default bg-bg-primary p-2">
                            <img
                              src={attachment.previewUrl}
                              alt={attachment.fileName}
                              class="h-14 w-14 shrink-0 rounded-md border border-border-default object-cover"
                            />
                            <div class="min-w-0 flex-1">
                              <p class="truncate text-sm text-text-primary">
                                {attachment.fileName}
                              </p>
                              <p class="text-[11px] text-text-tertiary">
                                {attachment.mimeType} · {attachment.sizeLabel}
                              </p>
                            </div>
                            <Show when={props.onRemoveAttachment !== undefined}>
                              <button
                                type="button"
                                class="rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-xs font-medium text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
                                onClick={() =>
                                  props.onRemoveAttachment?.(attachment.id)
                                }
                              >
                                Remove
                              </button>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                  <Show when={props.attachmentError !== null}>
                    <p class="text-xs text-danger-fg">
                      {props.attachmentError}
                    </p>
                  </Show>
                </div>
              </Show>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                {props.composerActions}
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
