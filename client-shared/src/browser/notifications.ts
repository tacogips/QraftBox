export type NotificationPermissionValue = "default" | "denied" | "granted";

export type BrowserNotificationPermission =
  | NotificationPermissionValue
  | "unsupported";

export interface NotificationApiLike {
  readonly permission: NotificationPermissionValue;
  requestPermission():
    | Promise<NotificationPermissionValue>
    | NotificationPermissionValue;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const AI_COMPLETION_NOTIFICATIONS_ENABLED_KEY =
  "qraftbox-ai-completion-notifications-enabled";

export function getAIPromptCompletionNotificationsEnabled(
  storage: StorageLike | null | undefined = resolveLocalStorage(),
): boolean {
  if (storage === null || storage === undefined) {
    return true;
  }

  try {
    const storedValue = storage.getItem(
      AI_COMPLETION_NOTIFICATIONS_ENABLED_KEY,
    );
    if (storedValue === null) {
      return true;
    }

    return storedValue !== "false";
  } catch {
    return true;
  }
}

export function setAIPromptCompletionNotificationsEnabled(
  enabled: boolean,
  storage: StorageLike | null | undefined = resolveLocalStorage(),
): void {
  if (storage === null || storage === undefined) {
    return;
  }

  try {
    storage.setItem(AI_COMPLETION_NOTIFICATIONS_ENABLED_KEY, String(enabled));
  } catch {
    // Ignore storage errors and keep the in-memory UI state.
  }
}

export function readNotificationPermission(
  notificationApi:
    | NotificationApiLike
    | null
    | undefined = resolveNotificationApi(),
): BrowserNotificationPermission {
  if (notificationApi === null || notificationApi === undefined) {
    return "unsupported";
  }

  return notificationApi.permission;
}

export async function requestNotificationPermission(
  notificationApi:
    | NotificationApiLike
    | null
    | undefined = resolveNotificationApi(),
): Promise<BrowserNotificationPermission> {
  if (notificationApi === null || notificationApi === undefined) {
    return "unsupported";
  }

  return await notificationApi.requestPermission();
}

export function getNotificationPermissionLabel(
  permission: BrowserNotificationPermission,
): string {
  if (permission === "granted") {
    return "Granted";
  }

  if (permission === "denied") {
    return "Denied";
  }

  if (permission === "default") {
    return "Not requested";
  }

  return "Unsupported";
}

function resolveLocalStorage(): StorageLike | null {
  const browserWindow = getBrowserWindow();
  if (browserWindow === null) {
    return null;
  }

  return browserWindow.localStorage;
}

function resolveNotificationApi(): NotificationApiLike | null {
  const browserWindow = getBrowserWindow();
  if (browserWindow === null || !("Notification" in browserWindow)) {
    return null;
  }

  return browserWindow.Notification as NotificationApiLike;
}

function getBrowserWindow(): {
  readonly localStorage: StorageLike;
  readonly Notification?: unknown;
} | null {
  if (
    typeof globalThis !== "object" ||
    globalThis === null ||
    !("window" in globalThis)
  ) {
    return null;
  }

  const browserWindow = (
    globalThis as {
      readonly window?: {
        readonly localStorage: StorageLike;
        readonly Notification?: unknown;
      };
    }
  ).window;

  return browserWindow ?? null;
}
