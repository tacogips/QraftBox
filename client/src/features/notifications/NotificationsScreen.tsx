import { createSignal, type JSX, Show } from "solid-js";
import { readNotificationPermission } from "../../../../client-shared/src/browser/notifications";
import { CheckboxField } from "../../components/CheckboxField";
import { ScreenHeader } from "../../components/ScreenHeader";
import {
  createInitialNotificationSettingsState,
  formatNotificationPermissionLabel,
  requestBrowserNotificationPermission,
  toggleNotificationSettings,
  type NotificationSettingsState,
} from "./state";

const SCREEN_SHELL_CLASS =
  "mx-auto flex h-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6";
const PANEL_CLASS =
  "rounded-2xl border border-border-default bg-bg-secondary p-5";

function getPermissionBadgeClass(
  permission: NotificationSettingsState["permission"],
): string {
  if (permission === "granted") {
    return "border-success-emphasis/30 bg-success-muted/15 text-success-fg";
  }

  if (permission === "denied") {
    return "border-danger-emphasis/30 bg-danger-muted/15 text-danger-fg";
  }

  if (permission === "unsupported") {
    return "border-attention-emphasis/30 bg-attention-muted/15 text-attention-fg";
  }

  return "border-border-default bg-bg-primary text-text-secondary";
}

export function NotificationsScreen(): JSX.Element {
  const [state, setState] = createSignal<NotificationSettingsState>({
    ...createInitialNotificationSettingsState(),
    permission: readNotificationPermission(),
  });

  async function requestPermission(): Promise<void> {
    const requestState = {
      ...state(),
      requestingPermission: false,
      requestError: null,
    };

    setState((currentState) => ({
      ...currentState,
      requestingPermission: true,
      requestError: null,
    }));
    setState(await requestBrowserNotificationPermission(requestState));
  }

  return (
    <section class={SCREEN_SHELL_CLASS}>
      <ScreenHeader
        title="Notifications"
        subtitle="Control browser notification behavior for long-running AI work so session completion is visible even when QraftBox is in the background."
      />

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <section class={`${PANEL_CLASS} space-y-5`}>
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                Browser delivery
              </p>
              <h3 class="mt-1 text-lg font-semibold text-text-primary">
                AI completion notifications
              </h3>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                Show a browser notification when an AI session finishes so you
                can move away from the tab without losing the completion signal.
              </p>
            </div>

            <CheckboxField
              checked={state().notificationsEnabled}
              class="rounded-full border border-border-default bg-bg-primary px-4 py-2"
              label={
                <span>
                  {state().notificationsEnabled ? "Enabled" : "Disabled"}
                </span>
              }
              onInput={(event) =>
                setState(
                  toggleNotificationSettings(
                    event.currentTarget.checked,
                    state(),
                  ),
                )
              }
            />
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div class="rounded-2xl border border-border-default bg-bg-primary/70 p-4">
              <p class="text-[11px] uppercase tracking-wide text-text-tertiary">
                Delivery
              </p>
              <p class="mt-2 text-xl font-semibold text-text-primary">
                {state().notificationsEnabled ? "On" : "Off"}
              </p>
            </div>
            <div class="rounded-2xl border border-border-default bg-bg-primary/70 p-4">
              <p class="text-[11px] uppercase tracking-wide text-text-tertiary">
                Permission
              </p>
              <span
                class={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-medium ${getPermissionBadgeClass(
                  state().permission,
                )}`}
              >
                {formatNotificationPermissionLabel(state().permission)}
              </span>
            </div>
            <div class="rounded-2xl border border-border-default bg-bg-primary/70 p-4">
              <p class="text-[11px] uppercase tracking-wide text-text-tertiary">
                Request state
              </p>
              <p class="mt-2 text-sm font-medium text-text-primary">
                {state().requestingPermission
                  ? "Awaiting browser response"
                  : "Idle"}
              </p>
            </div>
          </div>

          <div class="rounded-2xl border border-border-default bg-bg-primary/60 p-4">
            <p class="text-sm leading-6 text-text-secondary">
              Permission status is controlled by the browser, while the toggle
              above controls whether QraftBox should try to deliver completion
              notifications at all.
            </p>

            <Show when={state().permission === "default"}>
              <div class="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={
                    state().requestingPermission ||
                    !state().notificationsEnabled
                  }
                  class="rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void requestPermission()}
                >
                  {state().requestingPermission
                    ? "Requesting permission..."
                    : "Request permission"}
                </button>
                <p class="text-xs text-text-secondary">
                  The browser prompt is only available while notifications are
                  enabled.
                </p>
              </div>
            </Show>

            <Show when={state().permission === "denied"}>
              <p class="mt-4 rounded-xl border border-danger-emphasis/30 bg-danger-muted/10 px-4 py-3 text-sm text-danger-fg">
                Browser notifications are currently blocked. Update the site
                permission in your browser settings, then refresh this screen.
              </p>
            </Show>

            <Show when={state().permission === "unsupported"}>
              <p class="mt-4 rounded-xl border border-attention-emphasis/30 bg-attention-muted/10 px-4 py-3 text-sm text-attention-fg">
                This browser environment does not expose the Notification API,
                so completion popups are unavailable here.
              </p>
            </Show>

            <Show when={state().requestError !== null}>
              <p class="mt-4 rounded-xl border border-danger-emphasis/30 bg-danger-muted/10 px-4 py-3 text-sm text-danger-fg">
                {state().requestError}
              </p>
            </Show>
          </div>
        </section>

        <aside class={`${PANEL_CLASS} space-y-4`}>
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
              Guidance
            </p>
            <h3 class="mt-1 text-lg font-semibold text-text-primary">
              Recommended setup
            </h3>
          </div>

          <div class="space-y-3 text-sm leading-6 text-text-secondary">
            <div class="rounded-xl border border-border-default bg-bg-primary/70 px-4 py-3">
              Enable notifications here before requesting permission, otherwise
              QraftBox will not attempt to send completion alerts.
            </div>
            <div class="rounded-xl border border-border-default bg-bg-primary/70 px-4 py-3">
              If permission is denied, fix it from the browser's site settings.
              The page cannot silently override that choice.
            </div>
            <div class="rounded-xl border border-border-default bg-bg-primary/70 px-4 py-3">
              Unsupported environments usually mean embedded browsers, older
              runtime shells, or remote rendering environments without desktop
              notification plumbing.
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
