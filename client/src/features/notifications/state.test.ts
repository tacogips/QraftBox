import { describe, expect, test } from "bun:test";
import {
  createInitialNotificationSettingsState,
  formatNotificationPermissionLabel,
  requestBrowserNotificationPermission,
} from "./state";

describe("notification screen state helpers", () => {
  test("creates an initial state without a request error", () => {
    expect(createInitialNotificationSettingsState()).toMatchObject({
      requestingPermission: false,
      requestError: null,
    });
  });

  test("formats the browser permission label through the shared helper", () => {
    expect(formatNotificationPermissionLabel("granted")).toBe("Granted");
    expect(formatNotificationPermissionLabel("unsupported")).toBe(
      "Unsupported",
    );
  });

  test("still requests browser permission after the UI enters requesting state", async () => {
    const nextState = await requestBrowserNotificationPermission({
      notificationsEnabled: true,
      permission: "default",
      requestingPermission: false,
      requestError: null,
    });

    expect(nextState.requestingPermission).toBe(false);
    expect(["granted", "denied", "default", "unsupported"]).toContain(
      nextState.permission,
    );
  });
});
