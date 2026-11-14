import type { JSX } from "solid-js";

export interface SummaryCardProps {
  readonly title: JSX.Element;
  readonly titleLabel?: string | undefined;
  readonly body: JSX.Element;
  readonly bodyLabel?: string | undefined;
  readonly topSlot?: JSX.Element | undefined;
  readonly footerSlot?: JSX.Element | undefined;
  readonly selected?: boolean | undefined;
  readonly minHeightClass?: string | undefined;
  readonly ariaLabel?: string | undefined;
  readonly onActivate?: (() => void) | undefined;
}

export function SummaryCard(props: SummaryCardProps): JSX.Element {
  const minHeightClass = props.minHeightClass ?? "min-h-[164px]";
  const interactiveClass =
    props.onActivate === undefined
      ? ""
      : "cursor-pointer hover:border-accent-emphasis/60 hover:bg-bg-hover";
  const selectedClass = props.selected
    ? "border-accent-emphasis/70 bg-bg-hover shadow-lg shadow-black/10"
    : "border-border-default bg-bg-secondary";

  const handleKeyDown: JSX.EventHandlerUnion<HTMLDivElement, KeyboardEvent> = (
    event,
  ) => {
    if (props.onActivate === undefined) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onActivate();
    }
  };

  return (
    <div
      role={props.onActivate === undefined ? undefined : "button"}
      tabindex={props.onActivate === undefined ? undefined : 0}
      aria-label={props.ariaLabel}
      aria-pressed={props.onActivate === undefined ? undefined : props.selected}
      class={`flex ${minHeightClass} flex-col gap-3 rounded-xl border p-4 text-left transition ${selectedClass} ${interactiveClass}`}
      onClick={() => props.onActivate?.()}
      onKeyDown={handleKeyDown}
    >
      {props.topSlot}

      <div class="space-y-1">
        {props.titleLabel === undefined ? null : (
          <p class="text-[10px] uppercase tracking-wide text-text-tertiary">
            {props.titleLabel}
          </p>
        )}
        <div class="line-clamp-2 text-sm text-text-primary">{props.title}</div>
      </div>

      <div class="mt-auto space-y-1">
        {props.bodyLabel === undefined ? null : (
          <p class="text-[10px] uppercase tracking-wide text-text-tertiary">
            {props.bodyLabel}
          </p>
        )}
        <div class="line-clamp-3 text-xs leading-5 text-text-secondary">
          {props.body}
        </div>
      </div>

      {props.footerSlot === undefined ? null : (
        <div class="flex flex-wrap items-center gap-2 border-t border-border-default/60 pt-2 text-[11px] text-text-tertiary">
          {props.footerSlot}
        </div>
      )}
    </div>
  );
}
