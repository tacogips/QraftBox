import {
  getAIPromptCompletionNotificationsEnabled,
  getNotificationPermissionLabel,
  readNotificationPermission,
  requestNotificationPermission,
  setAIPromptCompletionNotificationsEnabled,
  type BrowserNotificationPermission,
} from "../../../../client-shared/src/browser/notifications";

export interface NotificationSettingsState {
  readonly notificationsEnabled: boolean;
  readonly permission: BrowserNotificationPermission;
  readonly requestingPermission: boolean;
  readonly requestError: string | null;
}

export function createInitialNotificationSettingsState(): NotificationSettingsState {
  return {
    notificationsEnabled: getAIPromptCompletionNotificationsEnabled(),
    permission: readNotificationPermission(),
    requestingPermission: false,
    requestError: null,
  };
}

export function formatNotificationPermissionLabel(
  permission: BrowserNotificationPermission,
): string {
  return getNotificationPermissionLabel(permission);
}

export async function requestBrowserNotificationPermission(
  currentState: NotificationSettingsState,
): Promise<NotificationSettingsState> {
  if (
    currentState.permission === "unsupported" ||
    currentState.requestingPermission
  ) {
    return currentState;
  }

  try {
    const permission = await requestNotificationPermission();
    return {
      ...currentState,
      permission,
      requestingPermission: false,
      requestError: null,
    };
  } catch (error) {
    return {
      ...currentState,
      permission: readNotificationPermission(),
      requestingPermission: false,
      requestError:
        error instanceof Error
          ? error.message
          : "Failed to request notification permission",
    };
  }
}

export function toggleNotificationSettings(
  enabled: boolean,
  currentState: NotificationSettingsState,
): NotificationSettingsState {
  setAIPromptCompletionNotificationsEnabled(enabled);

  return {
    ...currentState,
    notificationsEnabled: enabled,
  };
}
