import { createSignal, type JSX, Show } from "solid-js";
import { readNotificationPermission } from "../../../../client-shared/src/browser/notifications";
import {
  createInitialNotificationSettingsState,
  formatNotificationPermissionLabel,
  requestBrowserNotificationPermission,
  toggleNotificationSettings,
  type NotificationSettingsState,
} from "./state";

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
    <section>
      <h2>Notifications</h2>
      <p>Configure browser notifications for AI prompt completion.</p>
      <section>
        <h3>AI completion notifications</h3>
        <label>
          <input
            type="checkbox"
            checked={state().notificationsEnabled}
            onInput={(event) =>
              setState(
                toggleNotificationSettings(
                  event.currentTarget.checked,
                  state(),
                ),
              )
            }
          />{" "}
          {state().notificationsEnabled ? "On" : "Off"}
        </label>
        <p>
          Permission status:{" "}
          <strong>
            {formatNotificationPermissionLabel(state().permission)}
          </strong>
        </p>
        <Show when={state().permission === "default"}>
          <button
            type="button"
            disabled={
              state().requestingPermission || !state().notificationsEnabled
            }
            onClick={() => void requestPermission()}
          >
            {state().requestingPermission
              ? "Requesting permission..."
              : "Request permission"}
          </button>
        </Show>
        <Show when={state().permission === "denied"}>
          <p>
            Browser notifications are blocked. Update your browser site settings
            to allow notifications for this app.
          </p>
        </Show>
        <Show when={state().permission === "unsupported"}>
          <p>This browser environment does not support notifications.</p>
        </Show>
        <Show when={state().requestError !== null}>
          <p role="alert">{state().requestError}</p>
        </Show>
      </section>
    </section>
  );
}
