import type { JSX } from "solid-js";

export interface CheckboxFieldProps {
  readonly label: JSX.Element;
  readonly checked: boolean;
  readonly disabled?: boolean | undefined;
  readonly onInput: JSX.EventHandlerUnion<HTMLInputElement, InputEvent>;
  readonly class?: string | undefined;
  readonly labelClass?: string | undefined;
}

function renderCheckIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function CheckboxField(props: CheckboxFieldProps): JSX.Element {
  const labelClass =
    props.labelClass ?? "text-sm font-medium text-text-primary";

  return (
    <label
      class={`inline-flex items-center gap-2.5 ${props.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${props.class ?? ""}`}
    >
      <input
        type="checkbox"
        class="peer sr-only"
        checked={props.checked}
        disabled={props.disabled}
        onInput={props.onInput}
      />
      <span
        class={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${props.checked ? "border-accent-emphasis bg-accent-emphasis text-text-on-emphasis" : "border-border-default bg-bg-secondary text-transparent"} peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-emphasis`}
      >
        <span class="h-3.5 w-3.5">{renderCheckIcon()}</span>
      </span>
      <span class={labelClass}>{props.label}</span>
    </label>
  );
}
