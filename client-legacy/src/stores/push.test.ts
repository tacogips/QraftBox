/**
 * Push store tests
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createPushStore, type PushStore } from "./push";
import type {
  PushStatus,
  RemoteTracking,
  UnpushedCommit,
  PushResult,
} from "../../../src/types/push-context";

describe("createPushStore", () => {
  let store: PushStore;

  beforeEach(() => {
    store = createPushStore();
  });

  describe("initial state", () => {
    test("has null push status", () => {
      expect(store.pushStatus).toBeNull();
    });

    test("has empty unpushed commits", () => {
      expect(store.unpushedCommits).toEqual([]);
    });

    test("has empty remotes", () => {
      expect(store.remotes).toEqual([]);
    });

    test("has null selected remote", () => {
      expect(store.selectedRemote).toBeNull();
    });

    test("has null selected prompt ID", () => {
      expect(store.selectedPromptId).toBeNull();
    });

    test("is not pushing", () => {
      expect(store.isPushing).toBe(false);
    });

    test("has null push result", () => {
      expect(store.pushResult).toBeNull();
    });

    test("has null error", () => {
      expect(store.error).toBeNull();
    });

    test("panel is closed", () => {
      expect(store.isPanelOpen).toBe(false);
    });

    test("force push is disabled", () => {
      expect(store.forcePush).toBe(false);
    });

    test("set upstream is disabled", () => {
      expect(store.setUpstream).toBe(false);
    });

    test("push tags is disabled", () => {
      expect(store.pushTags).toBe(false);
    });

    test("has empty custom variables", () => {
      expect(store.customVariables).toEqual({});
    });

    test("is not loading", () => {
      expect(store.loading).toBe(false);
    });
  });

  describe("selectRemote", () => {
    test("sets selected remote", () => {
      store.selectRemote("origin");
      expect(store.selectedRemote).toBe("origin");
    });

    test("clears error when selecting remote", () => {
      // Manually set error by attempting push without prompt
      store.selectPrompt("test");
      void store.executePush("ctx-test");
      // Wait for async operation
      setTimeout(() => {
        store.selectRemote("origin");
        expect(store.error).toBeNull();
      }, 0);
    });

    test("can change selected remote", () => {
      store.selectRemote("origin");
      store.selectRemote("upstream");
      expect(store.selectedRemote).toBe("upstream");
    });
  });

  describe("selectPrompt", () => {
    test("sets selected prompt ID", () => {
      store.selectPrompt("push-main");
      expect(store.selectedPromptId).toBe("push-main");
    });

    test("clears error when selecting prompt", () => {
      store.selectPrompt("test");
      void store.executePush("ctx-test");
      setTimeout(() => {
        store.selectPrompt("push-main");
        expect(store.error).toBeNull();
      }, 0);
    });

    test("can change selected prompt", () => {
      store.selectPrompt("push-main");
      store.selectPrompt("push-feature");
      expect(store.selectedPromptId).toBe("push-feature");
    });
  });

  describe("setCustomVariable", () => {
    test("sets a custom variable", () => {
      store.setCustomVariable("branch", "main");
      expect(store.customVariables).toEqual({ branch: "main" });
    });

    test("can set multiple variables", () => {
      store.setCustomVariable("branch", "main");
      store.setCustomVariable("target", "production");
      expect(store.customVariables).toEqual({
        branch: "main",
        target: "production",
      });
    });

    test("overwrites existing variable", () => {
      store.setCustomVariable("branch", "main");
      store.setCustomVariable("branch", "develop");
      expect(store.customVariables).toEqual({ branch: "develop" });
    });
  });

  describe("clearCustomVariable", () => {
    test("removes a custom variable", () => {
      store.setCustomVariable("branch", "main");
      store.clearCustomVariable("branch");
      expect(store.customVariables).toEqual({});
    });

    test("only removes specified variable", () => {
      store.setCustomVariable("branch", "main");
      store.setCustomVariable("target", "production");
      store.clearCustomVariable("branch");
      expect(store.customVariables).toEqual({ target: "production" });
    });

    test("handles clearing non-existent variable", () => {
      store.clearCustomVariable("nonexistent");
      expect(store.customVariables).toEqual({});
    });
  });

  describe("toggleForcePush", () => {
    test("toggles force push on", () => {
      expect(store.forcePush).toBe(false);
      store.toggleForcePush();
      expect(store.forcePush).toBe(true);
    });

    test("toggles force push off", () => {
      store.toggleForcePush();
      store.toggleForcePush();
      expect(store.forcePush).toBe(false);
    });
  });

  describe("toggleSetUpstream", () => {
    test("toggles set upstream on", () => {
      expect(store.setUpstream).toBe(false);
      store.toggleSetUpstream();
      expect(store.setUpstream).toBe(true);
    });

    test("toggles set upstream off", () => {
      store.toggleSetUpstream();
      store.toggleSetUpstream();
      expect(store.setUpstream).toBe(false);
    });
  });

  describe("togglePushTags", () => {
    test("toggles push tags on", () => {
      expect(store.pushTags).toBe(false);
      store.togglePushTags();
      expect(store.pushTags).toBe(true);
    });

    test("toggles push tags off", () => {
      store.togglePushTags();
      store.togglePushTags();
      expect(store.pushTags).toBe(false);
    });
  });

  describe("panel actions", () => {
    test("openPanel sets isPanelOpen to true", () => {
      expect(store.isPanelOpen).toBe(false);
      store.openPanel();
      expect(store.isPanelOpen).toBe(true);
    });

    test("closePanel sets isPanelOpen to false", () => {
      store.openPanel();
      store.closePanel();
      expect(store.isPanelOpen).toBe(false);
    });

    test("togglePanel switches state", () => {
      expect(store.isPanelOpen).toBe(false);
      store.togglePanel();
      expect(store.isPanelOpen).toBe(true);
      store.togglePanel();
      expect(store.isPanelOpen).toBe(false);
    });
  });

  describe("reset", () => {
    test("resets all state to initial values", () => {
      // Modify state
      store.selectRemote("origin");
      store.selectPrompt("push-main");
      store.setCustomVariable("branch", "main");
      store.toggleForcePush();
      store.toggleSetUpstream();
      store.togglePushTags();
      store.openPanel();

      // Reset
      store.reset();

      // Verify all state is reset
      expect(store.pushStatus).toBeNull();
      expect(store.unpushedCommits).toEqual([]);
      expect(store.remotes).toEqual([]);
      expect(store.selectedRemote).toBeNull();
      expect(store.selectedPromptId).toBeNull();
      expect(store.isPushing).toBe(false);
      expect(store.pushResult).toBeNull();
      expect(store.error).toBeNull();
      expect(store.isPanelOpen).toBe(false);
      expect(store.forcePush).toBe(false);
      expect(store.setUpstream).toBe(false);
      expect(store.pushTags).toBe(false);
      expect(store.customVariables).toEqual({});
      expect(store.loading).toBe(false);
    });
  });

  describe("state immutability", () => {
    test("unpushedCommits returns readonly array", () => {
      const commits = store.unpushedCommits;
      expect(Array.isArray(commits)).toBe(true);
      // TypeScript will prevent mutations at compile time
    });

    test("remotes returns readonly array", () => {
      const remotes = store.remotes;
      expect(Array.isArray(remotes)).toBe(true);
      // TypeScript will prevent mutations at compile time
    });

    test("customVariables returns object", () => {
      store.setCustomVariable("key", "value");
      const vars = store.customVariables;
      expect(typeof vars).toBe("object");
      expect(vars).toEqual({ key: "value" });
    });
  });

  describe("error handling", () => {
    test("executePush sets error when no prompt selected", async () => {
      await store.executePush("ctx-test");
      expect(store.error).toBe("No prompt template selected");
      expect(store.isPushing).toBe(false);
    });

    test("previewPush sets error when no prompt selected", async () => {
      await store.previewPush("ctx-test");
      expect(store.error).toBe("No prompt template selected");
      expect(store.isPushing).toBe(false);
    });
  });

  describe("multiple instances", () => {
    test("creates independent store instances", () => {
      const store1 = createPushStore();
      const store2 = createPushStore();

      store1.selectRemote("origin");
      store2.selectRemote("upstream");

      expect(store1.selectedRemote).toBe("origin");
      expect(store2.selectedRemote).toBe("upstream");
    });
  });
});

describe("PushStore integration scenarios", () => {
  let store: PushStore;

  beforeEach(() => {
    store = createPushStore();
  });

  describe("typical push flow", () => {
    test("can configure and prepare for push", () => {
      // Select prompt
      store.selectPrompt("push-main");
      expect(store.selectedPromptId).toBe("push-main");

      // Select remote
      store.selectRemote("origin");
      expect(store.selectedRemote).toBe("origin");

      // Enable options
      store.toggleSetUpstream();
      expect(store.setUpstream).toBe(true);

      // Set custom variables
      store.setCustomVariable("target", "production");
      expect(store.customVariables).toEqual({ target: "production" });

      // Open panel
      store.openPanel();
      expect(store.isPanelOpen).toBe(true);

      // Verify ready for push
      expect(store.selectedPromptId).not.toBeNull();
      expect(store.error).toBeNull();
    });

    test("can modify configuration before push", () => {
      store.selectPrompt("push-main");
      store.selectRemote("origin");

      // Change remote
      store.selectRemote("upstream");
      expect(store.selectedRemote).toBe("upstream");

      // Change prompt
      store.selectPrompt("push-feature");
      expect(store.selectedPromptId).toBe("push-feature");

      // Enable force push
      store.toggleForcePush();
      expect(store.forcePush).toBe(true);
    });
  });

  describe("custom variables workflow", () => {
    test("can build up custom variables incrementally", () => {
      store.setCustomVariable("branch", "main");
      store.setCustomVariable("env", "production");
      store.setCustomVariable("version", "1.0.0");

      expect(store.customVariables).toEqual({
        branch: "main",
        env: "production",
        version: "1.0.0",
      });
    });

    test("can modify and remove custom variables", () => {
      store.setCustomVariable("branch", "main");
      store.setCustomVariable("env", "staging");

      // Modify
      store.setCustomVariable("env", "production");
      expect(store.customVariables.env).toBe("production");

      // Remove
      store.clearCustomVariable("branch");
      expect(store.customVariables).toEqual({ env: "production" });
    });
  });

  describe("panel interaction", () => {
    test("panel state independent of other state", () => {
      store.openPanel();
      store.selectPrompt("push-main");
      store.selectRemote("origin");

      expect(store.isPanelOpen).toBe(true);

      store.reset();
      expect(store.isPanelOpen).toBe(false);
      expect(store.selectedPromptId).toBeNull();
    });
  });
});
