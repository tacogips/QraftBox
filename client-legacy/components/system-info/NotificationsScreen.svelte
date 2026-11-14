<script lang="ts">
  import {
    getAIPromptCompletionNotificationsEnabled,
    setAIPromptCompletionNotificationsEnabled,
  } from "../../src/lib/browser-notifications";

  type BrowserNotificationPermission = NotificationPermission | "unsupported";

  let notificationsEnabled = $state(
    getAIPromptCompletionNotificationsEnabled(),
  );
  let permission = $state<BrowserNotificationPermission>("default");
  let requestingPermission = $state(false);
  let requestError = $state<string | null>(null);

  function readPermission(): BrowserNotificationPermission {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission;
  }

  function refreshPermission(): void {
    permission = readPermission();
  }

  async function requestPermission(): Promise<void> {
    if (permission === "unsupported" || requestingPermission) {
      return;
    }

    try {
      requestingPermission = true;
      requestError = null;
      await Notification.requestPermission();
    } catch (error) {
      requestError =
        error instanceof Error
          ? error.message
          : "Failed to request notification permission";
    } finally {
      refreshPermission();
      requestingPermission = false;
    }
  }

  function onToggleEnabled(nextEnabled: boolean): void {
    notificationsEnabled = nextEnabled;
    setAIPromptCompletionNotificationsEnabled(nextEnabled);
  }

  function permissionLabel(value: BrowserNotificationPermission): string {
    if (value === "granted") return "Granted";
    if (value === "denied") return "Denied";
    if (value === "default") return "Not requested";
    return "Unsupported";
  }

  $effect(() => {
    refreshPermission();
  });
</script>

<div
  class="h-full flex flex-col bg-bg-primary"
  role="main"
  aria-label="Notification settings"
>
  <div class="px-4 py-3 border-b border-border-default bg-bg-secondary">
    <h2 class="text-lg font-semibold text-text-primary">Notifications</h2>
    <p class="mt-1 text-sm text-text-secondary">
      Configure browser notifications for AI prompt completion.
    </p>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-4">
    <section
      class="max-w-2xl rounded-lg border border-border-default bg-bg-secondary p-4 space-y-4"
      aria-label="Browser notification settings"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">
            AI completion notifications
          </h3>
          <p class="mt-1 text-sm text-text-secondary">
            Show a browser notification when an AI session completes.
          </p>
        </div>
        <label class="inline-flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onchange={(event) =>
              onToggleEnabled(
                (event.currentTarget as HTMLInputElement).checked,
              )}
            class="h-4 w-4 rounded border-border-default text-accent-fg focus:ring-2 focus:ring-accent-emphasis"
          />
          <span>{notificationsEnabled ? "On" : "Off"}</span>
        </label>
      </div>

      <div class="text-sm text-text-secondary">
        Permission status:
        <span class="font-medium text-text-primary">
          {permissionLabel(permission)}
        </span>
      </div>

      {#if permission === "default"}
        <button
          type="button"
          class="px-3 py-1.5 rounded border border-border-default text-sm text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          onclick={() => void requestPermission()}
          disabled={requestingPermission || !notificationsEnabled}
        >
          {requestingPermission
            ? "Requesting permission..."
            : "Request permission"}
        </button>
      {:else if permission === "denied"}
        <p class="text-sm text-warning-fg">
          Browser notifications are blocked. Update your browser site settings
          to allow notifications for this app.
        </p>
      {:else if permission === "unsupported"}
        <p class="text-sm text-warning-fg">
          This browser environment does not support notifications.
        </p>
      {/if}

      {#if requestError !== null}
        <p class="text-sm text-danger-fg">{requestError}</p>
      {/if}
    </section>
  </div>
</div>
