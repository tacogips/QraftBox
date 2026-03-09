import { describe, expect, test } from "bun:test";
import { createGitStateRefreshController } from "./git-state-refresh";

type ListenerMap = Map<string, () => void>;

function createEventTargetHarness(): {
  readonly listeners: ListenerMap;
  dispatch(eventName: string): void;
  addEventListener(eventName: string, listener: () => void): void;
  removeEventListener(eventName: string, listener: () => void): void;
} {
  const listeners: ListenerMap = new Map();

  return {
    listeners,
    dispatch(eventName: string): void {
      listeners.get(eventName)?.();
    },
    addEventListener(eventName: string, listener: () => void): void {
      listeners.set(eventName, listener);
    },
    removeEventListener(eventName: string, listener: () => void): void {
      if (listeners.get(eventName) === listener) {
        listeners.delete(eventName);
      }
    },
  };
}

describe("createGitStateRefreshController", () => {
  test("refreshes the active git context on focus when the files screen is visible", () => {
    const windowHarness = createEventTargetHarness();
    const documentHarness = {
      ...createEventTargetHarness(),
      visibilityState: "visible" as const,
    };
    const refreshedContextIds: string[] = [];
    const gitStateRefreshController = createGitStateRefreshController({
      windowSource: windowHarness,
      documentSource: documentHarness,
      getContextId: () => "ctx-1",
      getActiveScreen: () => "files",
      isGitRepo: () => true,
      refreshContext(contextId) {
        refreshedContextIds.push(contextId);
      },
    });

    gitStateRefreshController.connect();
    windowHarness.dispatch("focus");

    expect(refreshedContextIds).toEqual(["ctx-1"]);
  });

  test("refreshes the active git context on focus when the ai-session screen is visible", () => {
    const windowHarness = createEventTargetHarness();
    const documentHarness = {
      ...createEventTargetHarness(),
      visibilityState: "visible" as const,
    };
    const refreshedContextIds: string[] = [];
    const gitStateRefreshController = createGitStateRefreshController({
      windowSource: windowHarness,
      documentSource: documentHarness,
      getContextId: () => "ctx-ai",
      getActiveScreen: () => "ai-session",
      isGitRepo: () => true,
      refreshContext(contextId) {
        refreshedContextIds.push(contextId);
      },
    });

    gitStateRefreshController.connect();
    windowHarness.dispatch("focus");

    expect(refreshedContextIds).toEqual(["ctx-ai"]);
  });

  test("skips refresh when the screen is outside the allowed refresh set", () => {
    const windowHarness = createEventTargetHarness();
    const documentHarness = {
      ...createEventTargetHarness(),
      visibilityState: "visible" as const,
    };
    let refreshCount = 0;
    const gitStateRefreshController = createGitStateRefreshController({
      windowSource: windowHarness,
      documentSource: documentHarness,
      getContextId: () => "ctx-2",
      getActiveScreen: () => "project",
      isGitRepo: () => true,
      refreshContext() {
        refreshCount += 1;
      },
    });

    gitStateRefreshController.connect();
    windowHarness.dispatch("focus");
    documentHarness.dispatch("visibilitychange");

    expect(refreshCount).toBe(0);
  });

  test("refreshes when visibility returns to visible", () => {
    const documentHarness = {
      ...createEventTargetHarness(),
      visibilityState: "hidden" as "hidden" | "visible",
    };
    let refreshCount = 0;
    const gitStateRefreshController = createGitStateRefreshController({
      windowSource: createEventTargetHarness(),
      documentSource: documentHarness,
      getContextId: () => "ctx-3",
      getActiveScreen: () => "files",
      isGitRepo: () => true,
      refreshContext() {
        refreshCount += 1;
      },
    });

    gitStateRefreshController.connect();
    documentHarness.visibilityState = "visible";
    documentHarness.dispatch("visibilitychange");

    expect(refreshCount).toBe(1);
  });

  test("polls while connected and stops after disconnect", () => {
    let pollCallback: (() => void) | null = null;
    let clearedTimerId: number | null = null;
    let refreshCount = 0;
    const gitStateRefreshController = createGitStateRefreshController({
      windowSource: createEventTargetHarness(),
      documentSource: {
        ...createEventTargetHarness(),
        visibilityState: "visible",
      },
      setIntervalFn(callback) {
        pollCallback = callback;
        return 7 as ReturnType<typeof setInterval>;
      },
      clearIntervalFn(timerId) {
        clearedTimerId = timerId as number;
      },
      getContextId: () => "ctx-4",
      getActiveScreen: () => "files",
      isGitRepo: () => true,
      refreshContext() {
        refreshCount += 1;
      },
    });

    gitStateRefreshController.connect();
    pollCallback?.();
    gitStateRefreshController.disconnect();
    pollCallback?.();

    expect(refreshCount).toBe(2);
    expect(clearedTimerId).toBe(7);
  });

  test("does not refresh hidden or non-git contexts", () => {
    const documentHarness = {
      ...createEventTargetHarness(),
      visibilityState: "hidden" as "hidden" | "visible",
    };
    let refreshCount = 0;
    const gitStateRefreshController = createGitStateRefreshController({
      windowSource: createEventTargetHarness(),
      documentSource: documentHarness,
      getContextId: () => "ctx-5",
      getActiveScreen: () => "files",
      isGitRepo: () => false,
      refreshContext() {
        refreshCount += 1;
      },
    });

    gitStateRefreshController.connect();
    documentHarness.dispatch("visibilitychange");
    documentHarness.visibilityState = "visible";
    documentHarness.dispatch("visibilitychange");

    expect(refreshCount).toBe(0);
  });
});
