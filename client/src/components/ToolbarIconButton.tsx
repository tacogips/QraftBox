import type { JSX } from "solid-js";

export interface ToolbarIconButtonProps {
  readonly label: string;
  readonly disabled?: boolean | undefined;
  readonly onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  readonly type?: "button" | "submit" | "reset" | undefined;
  readonly children: JSX.Element;
}

export function ToolbarIconButton(props: ToolbarIconButtonProps): JSX.Element {
  return (
    <button
      type={props.type ?? "button"}
      class="rounded-md border border-border-default bg-bg-secondary p-2 text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span class="block h-5 w-5">{props.children}</span>
    </button>
  );
}
