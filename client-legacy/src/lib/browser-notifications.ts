import type { AISession } from "../../../src/types/ai";

const AI_COMPLETION_NOTIFICATIONS_ENABLED_KEY =
  "qraftbox-ai-completion-notifications-enabled";

function supportsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getAIPromptCompletionNotificationsEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const storedValue = localStorage.getItem(
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
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(
      AI_COMPLETION_NOTIFICATIONS_ENABLED_KEY,
      String(enabled),
    );
  } catch {
    // Ignore localStorage errors and keep in-memory UI state.
  }
}

function formatPromptPreview(prompt: string): string {
  const normalizedPrompt = prompt.trim().replace(/\s+/g, " ");
  if (normalizedPrompt.length <= 80) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt.slice(0, 77)}...`;
}

export async function requestAIPromptNotificationPermission(): Promise<void> {
  if (!getAIPromptCompletionNotificationsEnabled()) {
    return;
  }
  if (!supportsNotifications()) {
    return;
  }
  if (Notification.permission !== "default") {
    return;
  }
  try {
    await Notification.requestPermission();
  } catch {
    // Ignore permission API errors and continue prompt execution.
  }
}

export function notifyAIPromptCompleted(session: AISession): void {
  if (!getAIPromptCompletionNotificationsEnabled()) {
    return;
  }
  if (!supportsNotifications()) {
    return;
  }
  if (Notification.permission !== "granted") {
    return;
  }

  const promptPreview = formatPromptPreview(session.prompt);
  const notificationBody =
    promptPreview.length > 0
      ? promptPreview
      : "Your AI prompt execution has completed.";

  try {
    new Notification("QraftBox AI prompt completed", {
      body: notificationBody,
      tag: `qraftbox-ai-session-${session.id}`,
    });
  } catch {
    // Ignore notification delivery errors.
  }
}
