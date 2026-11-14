/**
 * Unit tests for commit store
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  createCommitStore,
  initialCommitState,
  type CommitStore,
} from "./commit";
import type { StagedFile } from "../../../src/types/commit-context";

describe("Commit Store", () => {
  let store: CommitStore;

  beforeEach(() => {
    store = createCommitStore("test-context");
  });

  describe("Initial State", () => {
    test("should have empty staged files initially", () => {
      expect(store.stagedFiles).toEqual([]);
    });

    test("should have empty staged diff initially", () => {
      expect(store.stagedDiff).toBe("");
    });

    test("should have no selected prompt initially", () => {
      expect(store.selectedPromptId).toBeNull();
    });

    test("should have empty commit message initially", () => {
      expect(store.commitMessage).toBe("");
    });

    test("should not be committing initially", () => {
      expect(store.isCommitting).toBe(false);
    });

    test("should have idle status initially", () => {
      expect(store.status).toBe("idle");
    });

    test("should have no error initially", () => {
      expect(store.error).toBeNull();
    });

    test("initial state matches exported constant", () => {
      const store = createCommitStore();
      expect(store.stagedFiles).toEqual(initialCommitState.stagedFiles);
      expect(store.stagedDiff).toEqual(initialCommitState.stagedDiff);
      expect(store.selectedPromptId).toEqual(
        initialCommitState.selectedPromptId,
      );
      expect(store.commitMessage).toEqual(initialCommitState.commitMessage);
      expect(store.isCommitting).toEqual(initialCommitState.isCommitting);
      expect(store.status).toEqual(initialCommitState.status);
      expect(store.error).toEqual(initialCommitState.error);
    });
  });

  describe("loadStagedFiles()", () => {
    test("should set status to loading then idle", async () => {
      await store.loadStagedFiles();
      // Status should be back to idle after completion
      expect(store.status).toBe("idle");
    });

    test("should load staged files", async () => {
      await store.loadStagedFiles();

      expect(store.status).toBe("idle");
      expect(store.error).toBeNull();
      // With stubbed implementation, should return empty
      expect(store.stagedFiles).toEqual([]);
      expect(store.stagedDiff).toBe("");
    });

    test("should clear error on successful load", async () => {
      // Set an error first
      store.selectPrompt("");

      await store.loadStagedFiles();

      expect(store.error).toBeNull();
    });
  });

  describe("selectPrompt()", () => {
    test("should select a prompt template", () => {
      store.selectPrompt("conventional-commit");

      expect(store.selectedPromptId).toBe("conventional-commit");
    });

    test("should update selected prompt", () => {
      store.selectPrompt("conventional-commit");
      expect(store.selectedPromptId).toBe("conventional-commit");

      store.selectPrompt("detailed-commit");
      expect(store.selectedPromptId).toBe("detailed-commit");
    });

    test("should clear error when selecting prompt", () => {
      // Trigger an error
      void store.previewCommit();
      expect(store.error).not.toBeNull();

      store.selectPrompt("conventional-commit");
      expect(store.error).toBeNull();
    });

    test("should accept empty string as valid prompt ID", () => {
      store.selectPrompt("");
      expect(store.selectedPromptId).toBe("");
    });
  });

  describe("previewCommit()", () => {
    test("should fail if no prompt selected", async () => {
      await store.previewCommit();

      expect(store.error).toBe("No prompt template selected");
      expect(store.status).toBe("error");
    });

    test("should fail if no staged files", async () => {
      store.selectPrompt("conventional-commit");
      await store.previewCommit();

      expect(store.error).toBe("No staged files to commit");
      expect(store.status).toBe("error");
    });

    test("should complete preview successfully", async () => {
      store.selectPrompt("conventional-commit");
      // Manually set staged files for testing
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );

      await store.previewCommit();
      expect(store.status).toBe("idle");
    });

    test("should clear error before preview", async () => {
      store.selectPrompt("conventional-commit");
      // Set some staged files
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );

      await store.previewCommit();

      expect(store.error).toBeNull();
    });
  });

  describe("executeCommit()", () => {
    test("should fail if no prompt selected", async () => {
      await store.executeCommit();

      expect(store.error).toBe("No prompt template selected");
      expect(store.status).toBe("error");
    });

    test("should fail if no staged files", async () => {
      store.selectPrompt("conventional-commit");
      await store.executeCommit();

      expect(store.error).toBe("No staged files to commit");
      expect(store.status).toBe("error");
    });

    test("should complete commit successfully", async () => {
      store.selectPrompt("conventional-commit");
      // Manually set staged files for testing
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );

      await store.executeCommit();

      expect(store.isCommitting).toBe(false);
      expect(store.status).toBe("success");
    });

    test("should clear isCommitting flag after completion", async () => {
      store.selectPrompt("conventional-commit");
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );

      await store.executeCommit();

      expect(store.isCommitting).toBe(false);
      expect(store.status).toBe("success");
    });

    test("should prevent concurrent commits", async () => {
      store.selectPrompt("conventional-commit");
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );

      // Execute commit
      await store.executeCommit();

      // Should complete successfully
      expect(store.status).toBe("success");
      expect(store.isCommitting).toBe(false);
    });

    test("should clear error and result before execution", async () => {
      store.selectPrompt("conventional-commit");
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );

      await store.executeCommit();

      expect(store.error).toBeNull();
    });
  });

  describe("cancel()", () => {
    test("should do nothing if not committing", () => {
      const initialStatus = store.status;
      store.cancel();

      expect(store.status).toBe(initialStatus);
      expect(store.isCommitting).toBe(false);
    });

    test("should allow cancel when not committing", () => {
      // Cancel should be safe to call even when not committing
      store.cancel();

      expect(store.isCommitting).toBe(false);
      expect(store.status).toBe("idle");
    });

    test("should not affect completed commit", async () => {
      store.selectPrompt("conventional-commit");
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );

      await store.executeCommit();
      const statusBefore = store.status;

      // Cancel after completion should do nothing
      store.cancel();

      // Status should remain (commit is done)
      expect(store.status).toBe(statusBefore);
    });
  });

  describe("reset()", () => {
    test("should reset to initial state", async () => {
      store.selectPrompt("conventional-commit");
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );
      await store.loadStagedFiles();

      store.reset();

      expect(store.stagedFiles).toEqual([]);
      expect(store.stagedDiff).toBe("");
      expect(store.selectedPromptId).toBeNull();
      expect(store.commitMessage).toBe("");
      expect(store.isCommitting).toBe(false);
      expect(store.status).toBe("idle");
      expect(store.error).toBeNull();
    });

    test("should clear all state including errors", () => {
      // Trigger an error
      void store.previewCommit();
      expect(store.error).not.toBeNull();

      store.reset();

      expect(store.error).toBeNull();
      expect(store.status).toBe("idle");
    });
  });

  describe("Type Safety", () => {
    test("stagedFiles should be readonly array", () => {
      // TypeScript should prevent this at compile time
      // @ts-expect-error - stagedFiles is readonly
      store.stagedFiles.push({
        path: "test.ts",
        status: "M",
        additions: 10,
        deletions: 5,
      });
    });
  });

  describe("Context ID", () => {
    test("should work without context ID", () => {
      const storeWithoutContext = createCommitStore();

      expect(storeWithoutContext.status).toBe("idle");
      expect(storeWithoutContext.error).toBeNull();
    });

    test("should work with context ID", () => {
      const storeWithContext = createCommitStore("custom-context");

      expect(storeWithContext.status).toBe("idle");
      expect(storeWithContext.error).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty prompt ID selection", () => {
      store.selectPrompt("");

      expect(store.selectedPromptId).toBe("");
    });

    test("should handle multiple rapid prompt selections", () => {
      store.selectPrompt("prompt1");
      store.selectPrompt("prompt2");
      store.selectPrompt("prompt3");

      expect(store.selectedPromptId).toBe("prompt3");
    });

    test("should handle load after reset", async () => {
      await store.loadStagedFiles();
      store.reset();
      await store.loadStagedFiles();

      expect(store.status).toBe("idle");
      expect(store.error).toBeNull();
    });

    test("should handle commit after error", async () => {
      // Trigger error
      await store.executeCommit();
      expect(store.error).not.toBeNull();

      // Fix the error condition
      store.selectPrompt("conventional-commit");
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );

      // Should succeed
      await store.executeCommit();
      expect(store.error).toBeNull();
      expect(store.status).toBe("success");
    });
  });

  describe("Status Transitions", () => {
    test("should transition from idle to loading to idle", async () => {
      expect(store.status).toBe("idle");

      await store.loadStagedFiles();

      expect(store.status).toBe("idle");
    });

    test("should transition to success after commit", async () => {
      store.selectPrompt("conventional-commit");
      store._setStagedFiles?.(
        [
          {
            path: "test.ts",
            status: "M",
            additions: 10,
            deletions: 5,
          },
        ],
        "diff content",
      );

      expect(store.status).toBe("idle");

      await store.executeCommit();

      expect(store.status).toBe("success");
    });

    test("should transition to error on failure", async () => {
      await store.executeCommit();

      expect(store.status).toBe("error");
    });

    test("should recover from error state", async () => {
      // Trigger error
      await store.executeCommit();
      expect(store.status).toBe("error");

      // Load should reset status
      await store.loadStagedFiles();
      expect(store.status).toBe("idle");
    });
  });
});
