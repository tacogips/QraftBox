import { describe, expect, test } from "bun:test";
import {
  getAIPromptCompletionNotificationsEnabled,
  getNotificationPermissionLabel,
  readNotificationPermission,
  requestNotificationPermission,
  setAIPromptCompletionNotificationsEnabled,
  type NotificationPermissionValue,
  type StorageLike,
} from "./notifications";

function createStorageHarness(
  initialValue: string | null = null,
): StorageLike & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initialValue !== null) {
    values.set("qraftbox-ai-completion-notifications-enabled", initialValue);
  }

  return {
    values,
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
  };
}

describe("browser notifications helpers", () => {
  test("defaults ai prompt completion notifications to enabled", () => {
    expect(getAIPromptCompletionNotificationsEnabled(null)).toBe(true);
    expect(
      getAIPromptCompletionNotificationsEnabled(createStorageHarness()),
    ).toBe(true);
    expect(
      getAIPromptCompletionNotificationsEnabled(createStorageHarness("false")),
    ).toBe(false);
  });

  test("persists the enabled flag to storage when available", () => {
    const storage = createStorageHarness();

    setAIPromptCompletionNotificationsEnabled(false, storage);

    expect(
      storage.values.get("qraftbox-ai-completion-notifications-enabled"),
    ).toBe("false");
  });

  test("reads and requests browser permission through the provided api", async () => {
    const notificationApi = {
      permission: "default" as const,
      requestPermission: (): Promise<NotificationPermissionValue> =>
        Promise.resolve("granted"),
    };

    expect(readNotificationPermission(notificationApi)).toBe("default");
    await expect(requestNotificationPermission(notificationApi)).resolves.toBe(
      "granted",
    );
  });

  test("formats user-facing permission labels", () => {
    expect(getNotificationPermissionLabel("default")).toBe("Not requested");
    expect(getNotificationPermissionLabel("unsupported")).toBe("Unsupported");
  });
});
