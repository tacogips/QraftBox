import type { JSX } from "solid-js";

export interface ScreenHeaderProps {
  readonly title: string;
  readonly subtitle?: string | undefined;
}

export function ScreenHeader(props: ScreenHeaderProps): JSX.Element {
  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-2xl font-semibold text-text-primary">{props.title}</h2>
      {props.subtitle !== undefined ? (
        <p class="max-w-3xl text-sm leading-6 text-text-secondary">
          {props.subtitle}
        </p>
      ) : null}
    </div>
  );
}
