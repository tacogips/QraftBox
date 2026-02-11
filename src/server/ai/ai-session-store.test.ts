/**
 * AI Session Store Tests
 *
 * Tests for SQLite-backed session store covering insert, get, list, update, delete, and cleanup.
 */

import { describe, test, expect, beforeEach } from "vitest";
import {
  createInMemoryAiSessionStore,
  toSessionInfo,
  type AiSessionStore,
  type AiSessionRow,
} from "./ai-session-store.js";
import type {
  QraftAiSessionId,
  ClaudeSessionId,
  PromptId,
  WorktreeId,
} from "../../types/ai.js";

/**
 * Create a test AiSessionRow
 *
 * @param overrides - Partial overrides for the row
 * @returns Complete AiSessionRow with defaults
 */
function createTestRow(overrides?: Partial<AiSessionRow>): AiSessionRow {
  return {
    id: `qs_test_${Date.now()}` as QraftAiSessionId,
    state: "queued",
    projectPath: "/tmp/test",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("createInMemoryAiSessionStore()", () => {
  test("creates store without error", () => {
    const sessionStore = createInMemoryAiSessionStore();
    expect(sessionStore).toBeDefined();
  });
});

describe("AiSessionStore", () => {
  let sessionStore: AiSessionStore;

  beforeEach(() => {
    sessionStore = createInMemoryAiSessionStore();
  });

  describe("insert() + get()", () => {
    test("inserts a session and retrieves it by ID", () => {
      const testRow = createTestRow({
        id: "qs_test_insert_get" as QraftAiSessionId,
        state: "queued",
        projectPath: "/tmp/test-insert",
        createdAt: "2025-01-01T00:00:00.000Z",
      });

      sessionStore.insert(testRow);
      const retrievedRow = sessionStore.get(testRow.id);

      expect(retrievedRow).toBeDefined();
      expect(retrievedRow?.id).toBe(testRow.id);
      expect(retrievedRow?.state).toBe("queued");
      expect(retrievedRow?.projectPath).toBe("/tmp/test-insert");
      expect(retrievedRow?.createdAt).toBe("2025-01-01T00:00:00.000Z");
    });

    test("returns undefined for non-existent ID", () => {
      const retrievedRow = sessionStore.get(
        "qs_nonexistent" as QraftAiSessionId,
      );
      expect(retrievedRow).toBeUndefined();
    });

    test("correctly maps snake_case DB columns to camelCase AiSessionRow fields", () => {
      const testRow = createTestRow({
        id: "qs_test_camel_case" as QraftAiSessionId,
        state: "running",
        projectPath: "/tmp/test-camel-case",
        createdAt: "2025-01-01T00:00:00.000Z",
        startedAt: "2025-01-01T00:01:00.000Z",
        completedAt: "2025-01-01T00:02:00.000Z",
        currentActivity: "Processing...",
        currentClaudeSessionId: "claude_session_123" as ClaudeSessionId,
      });

      sessionStore.insert(testRow);
      const retrievedRow = sessionStore.get(testRow.id);

      expect(retrievedRow).toBeDefined();
      expect(retrievedRow?.projectPath).toBe("/tmp/test-camel-case");
      expect(retrievedRow?.startedAt).toBe("2025-01-01T00:01:00.000Z");
      expect(retrievedRow?.completedAt).toBe("2025-01-01T00:02:00.000Z");
      expect(retrievedRow?.currentActivity).toBe("Processing...");
      expect(retrievedRow?.currentClaudeSessionId).toBe("claude_session_123");
    });
  });

  describe("list()", () => {
    test("returns empty array when no sessions", () => {
      const allSessions = sessionStore.list();
      expect(allSessions).toEqual([]);
    });

    test("returns all sessions ordered by created_at DESC", () => {
      const session1 = createTestRow({
        id: "qs_test_list_1" as QraftAiSessionId,
        createdAt: "2025-01-01T00:00:00.000Z",
      });
      const session2 = createTestRow({
        id: "qs_test_list_2" as QraftAiSessionId,
        createdAt: "2025-01-01T00:01:00.000Z",
      });
      const session3 = createTestRow({
        id: "qs_test_list_3" as QraftAiSessionId,
        createdAt: "2025-01-01T00:02:00.000Z",
      });

      sessionStore.insert(session1);
      sessionStore.insert(session2);
      sessionStore.insert(session3);

      const allSessions = sessionStore.list();
      expect(allSessions).toHaveLength(3);
      // Should be DESC order: session3, session2, session1
      expect(allSessions[0]?.id).toBe("qs_test_list_3");
      expect(allSessions[1]?.id).toBe("qs_test_list_2");
      expect(allSessions[2]?.id).toBe("qs_test_list_1");
    });

    test("returns multiple sessions", () => {
      const session1 = createTestRow({
        id: "qs_test_multiple_1" as QraftAiSessionId,
      });
      const session2 = createTestRow({
        id: "qs_test_multiple_2" as QraftAiSessionId,
      });

      sessionStore.insert(session1);
      sessionStore.insert(session2);

      const allSessions = sessionStore.list();
      expect(allSessions).toHaveLength(2);
    });
  });

  describe("listByState()", () => {
    test("returns only sessions matching the state", () => {
      const queuedSession = createTestRow({
        id: "qs_test_state_queued" as QraftAiSessionId,
        state: "queued",
      });
      const runningSession = createTestRow({
        id: "qs_test_state_running" as QraftAiSessionId,
        state: "running",
      });
      const completedSession = createTestRow({
        id: "qs_test_state_completed" as QraftAiSessionId,
        state: "completed",
      });

      sessionStore.insert(queuedSession);
      sessionStore.insert(runningSession);
      sessionStore.insert(completedSession);

      const queuedSessions = sessionStore.listByState("queued");
      expect(queuedSessions).toHaveLength(1);
      expect(queuedSessions[0]?.id).toBe("qs_test_state_queued");

      const runningSessions = sessionStore.listByState("running");
      expect(runningSessions).toHaveLength(1);
      expect(runningSessions[0]?.id).toBe("qs_test_state_running");
    });

    test("returns empty array when no sessions match", () => {
      const queuedSession = createTestRow({
        id: "qs_test_no_match" as QraftAiSessionId,
        state: "queued",
      });

      sessionStore.insert(queuedSession);

      const completedSessions = sessionStore.listByState("completed");
      expect(completedSessions).toEqual([]);
    });
  });

  describe("updateState()", () => {
    test("updates state without timestamps", () => {
      const testRow = createTestRow({
        id: "qs_test_update_state" as QraftAiSessionId,
        state: "queued",
      });

      sessionStore.insert(testRow);
      sessionStore.updateState(testRow.id, "running");

      const updatedRow = sessionStore.get(testRow.id);
      expect(updatedRow?.state).toBe("running");
    });

    test("updates state with startedAt", () => {
      const testRow = createTestRow({
        id: "qs_test_update_started" as QraftAiSessionId,
        state: "queued",
      });

      sessionStore.insert(testRow);
      sessionStore.updateState(testRow.id, "running", {
        startedAt: "2025-01-01T00:05:00.000Z",
      });

      const updatedRow = sessionStore.get(testRow.id);
      expect(updatedRow?.state).toBe("running");
      expect(updatedRow?.startedAt).toBe("2025-01-01T00:05:00.000Z");
    });

    test("updates state with completedAt", () => {
      const testRow = createTestRow({
        id: "qs_test_update_completed" as QraftAiSessionId,
        state: "running",
        startedAt: "2025-01-01T00:05:00.000Z",
      });

      sessionStore.insert(testRow);
      sessionStore.updateState(testRow.id, "completed", {
        completedAt: "2025-01-01T00:10:00.000Z",
      });

      const updatedRow = sessionStore.get(testRow.id);
      expect(updatedRow?.state).toBe("completed");
      expect(updatedRow?.completedAt).toBe("2025-01-01T00:10:00.000Z");
    });

    test("updates state with both timestamps", () => {
      const testRow = createTestRow({
        id: "qs_test_update_both" as QraftAiSessionId,
        state: "queued",
      });

      sessionStore.insert(testRow);
      sessionStore.updateState(testRow.id, "completed", {
        startedAt: "2025-01-01T00:05:00.000Z",
        completedAt: "2025-01-01T00:10:00.000Z",
      });

      const updatedRow = sessionStore.get(testRow.id);
      expect(updatedRow?.state).toBe("completed");
      expect(updatedRow?.startedAt).toBe("2025-01-01T00:05:00.000Z");
      expect(updatedRow?.completedAt).toBe("2025-01-01T00:10:00.000Z");
    });
  });

  describe("updateClaudeSessionId()", () => {
    test("updates the Claude session ID", () => {
      const testRow = createTestRow({
        id: "qs_test_update_claude_id" as QraftAiSessionId,
        state: "running",
      });

      sessionStore.insert(testRow);
      sessionStore.updateClaudeSessionId(
        testRow.id,
        "claude_session_abc123" as ClaudeSessionId,
      );

      const updatedRow = sessionStore.get(testRow.id);
      expect(updatedRow?.currentClaudeSessionId).toBe("claude_session_abc123");
    });

    test("verify via get() that the ID persists", () => {
      const testRow = createTestRow({
        id: "qs_test_persist_claude_id" as QraftAiSessionId,
        state: "running",
      });

      sessionStore.insert(testRow);
      sessionStore.updateClaudeSessionId(
        testRow.id,
        "claude_session_persist" as ClaudeSessionId,
      );

      const retrievedRow = sessionStore.get(testRow.id);
      expect(retrievedRow?.currentClaudeSessionId).toBe(
        "claude_session_persist",
      );
    });
  });

  describe("updateActivity()", () => {
    test("updates activity string", () => {
      const testRow = createTestRow({
        id: "qs_test_update_activity" as QraftAiSessionId,
        state: "running",
      });

      sessionStore.insert(testRow);
      sessionStore.updateActivity(testRow.id, "Thinking...");

      const updatedRow = sessionStore.get(testRow.id);
      expect(updatedRow?.currentActivity).toBe("Thinking...");
    });

    test("clears activity with undefined", () => {
      const testRow = createTestRow({
        id: "qs_test_clear_activity" as QraftAiSessionId,
        state: "running",
        currentActivity: "Previous activity",
      });

      sessionStore.insert(testRow);
      sessionStore.updateActivity(testRow.id, undefined);

      const updatedRow = sessionStore.get(testRow.id);
      expect(updatedRow?.currentActivity).toBeUndefined();
    });
  });

  describe("delete()", () => {
    test("deletes a session by ID", () => {
      const testRow = createTestRow({
        id: "qs_test_delete" as QraftAiSessionId,
        state: "completed",
      });

      sessionStore.insert(testRow);
      expect(sessionStore.get(testRow.id)).toBeDefined();

      sessionStore.delete(testRow.id);
      expect(sessionStore.get(testRow.id)).toBeUndefined();
    });

    test("get() returns undefined after delete", () => {
      const testRow = createTestRow({
        id: "qs_test_delete_check" as QraftAiSessionId,
        state: "completed",
      });

      sessionStore.insert(testRow);
      sessionStore.delete(testRow.id);

      const retrievedRow = sessionStore.get(testRow.id);
      expect(retrievedRow).toBeUndefined();
    });
  });

  describe("cleanup()", () => {
    test("removes completed sessions older than maxAge", () => {
      const oldSession = createTestRow({
        id: "qs_test_cleanup_old" as QraftAiSessionId,
        state: "completed",
        createdAt: new Date(Date.now() - 10000).toISOString(), // 10 seconds ago
      });

      sessionStore.insert(oldSession);

      const deletedCount = sessionStore.cleanup(5000); // maxAge = 5 seconds

      expect(deletedCount).toBe(1);
      expect(sessionStore.get(oldSession.id)).toBeUndefined();
    });

    test("does not remove running or queued sessions", () => {
      const oldRunningSession = createTestRow({
        id: "qs_test_cleanup_running" as QraftAiSessionId,
        state: "running",
        createdAt: new Date(Date.now() - 10000).toISOString(),
      });
      const oldQueuedSession = createTestRow({
        id: "qs_test_cleanup_queued" as QraftAiSessionId,
        state: "queued",
        createdAt: new Date(Date.now() - 10000).toISOString(),
      });
      const oldCompletedSession = createTestRow({
        id: "qs_test_cleanup_completed" as QraftAiSessionId,
        state: "completed",
        createdAt: new Date(Date.now() - 10000).toISOString(),
      });

      sessionStore.insert(oldRunningSession);
      sessionStore.insert(oldQueuedSession);
      sessionStore.insert(oldCompletedSession);

      const deletedCount = sessionStore.cleanup(5000);

      // Only completed session should be deleted
      expect(deletedCount).toBe(1);
      expect(sessionStore.get(oldRunningSession.id)).toBeDefined();
      expect(sessionStore.get(oldQueuedSession.id)).toBeDefined();
      expect(sessionStore.get(oldCompletedSession.id)).toBeUndefined();
    });

    test("returns count of deleted sessions", () => {
      const oldCompleted1 = createTestRow({
        id: "qs_test_cleanup_count_1" as QraftAiSessionId,
        state: "completed",
        createdAt: new Date(Date.now() - 10000).toISOString(),
      });
      const oldCompleted2 = createTestRow({
        id: "qs_test_cleanup_count_2" as QraftAiSessionId,
        state: "failed",
        createdAt: new Date(Date.now() - 10000).toISOString(),
      });
      const oldCompleted3 = createTestRow({
        id: "qs_test_cleanup_count_3" as QraftAiSessionId,
        state: "cancelled",
        createdAt: new Date(Date.now() - 10000).toISOString(),
      });

      sessionStore.insert(oldCompleted1);
      sessionStore.insert(oldCompleted2);
      sessionStore.insert(oldCompleted3);

      const deletedCount = sessionStore.cleanup(5000);

      // All three terminal states should be deleted
      expect(deletedCount).toBe(3);
    });
  });

  describe("countByState()", () => {
    test("returns 0 when no sessions", () => {
      const count = sessionStore.countByState("queued");
      expect(count).toBe(0);
    });

    test("returns correct count for specific state", () => {
      const queued1 = createTestRow({
        id: "qs_test_count_queued_1" as QraftAiSessionId,
        state: "queued",
      });
      const queued2 = createTestRow({
        id: "qs_test_count_queued_2" as QraftAiSessionId,
        state: "queued",
      });
      const running1 = createTestRow({
        id: "qs_test_count_running_1" as QraftAiSessionId,
        state: "running",
      });

      sessionStore.insert(queued1);
      sessionStore.insert(queued2);
      sessionStore.insert(running1);

      const queuedCount = sessionStore.countByState("queued");
      const runningCount = sessionStore.countByState("running");
      const completedCount = sessionStore.countByState("completed");

      expect(queuedCount).toBe(2);
      expect(runningCount).toBe(1);
      expect(completedCount).toBe(0);
    });
  });

  describe("nextQueued()", () => {
    test("returns undefined when no queued sessions", () => {
      const nextId = sessionStore.nextQueued();
      expect(nextId).toBeUndefined();
    });

    test("returns oldest queued session ID (by created_at ASC)", () => {
      const oldest = createTestRow({
        id: "qs_test_next_oldest" as QraftAiSessionId,
        state: "queued",
        createdAt: "2025-01-01T00:00:00.000Z",
      });
      const middle = createTestRow({
        id: "qs_test_next_middle" as QraftAiSessionId,
        state: "queued",
        createdAt: "2025-01-01T00:01:00.000Z",
      });
      const newest = createTestRow({
        id: "qs_test_next_newest" as QraftAiSessionId,
        state: "queued",
        createdAt: "2025-01-01T00:02:00.000Z",
      });

      sessionStore.insert(middle);
      sessionStore.insert(newest);
      sessionStore.insert(oldest);

      const nextId = sessionStore.nextQueued();
      expect(nextId).toBe("qs_test_next_oldest");
    });

    test("ignores non-queued sessions", () => {
      const runningSession = createTestRow({
        id: "qs_test_next_running" as QraftAiSessionId,
        state: "running",
        createdAt: "2025-01-01T00:00:00.000Z",
      });
      const queuedSession = createTestRow({
        id: "qs_test_next_queued" as QraftAiSessionId,
        state: "queued",
        createdAt: "2025-01-01T00:01:00.000Z",
      });

      sessionStore.insert(runningSession);
      sessionStore.insert(queuedSession);

      const nextId = sessionStore.nextQueued();
      expect(nextId).toBe("qs_test_next_queued");
    });
  });

  describe("toSessionInfo()", () => {
    test("converts AiSessionRow to AISessionInfo with empty defaults for content fields", () => {
      const testRow: AiSessionRow = {
        id: "qs_test_to_info" as QraftAiSessionId,
        state: "running",
        projectPath: "/tmp/test",
        createdAt: "2025-01-01T00:00:00.000Z",
        startedAt: "2025-01-01T00:01:00.000Z",
        currentActivity: "Processing files...",
        currentClaudeSessionId: "claude_session_xyz" as ClaudeSessionId,
      };

      const sessionInfo = toSessionInfo(testRow);

      expect(sessionInfo.id).toBe("qs_test_to_info");
      expect(sessionInfo.state).toBe("running");
      expect(sessionInfo.prompt).toBe("");
      expect(sessionInfo.createdAt).toBe("2025-01-01T00:00:00.000Z");
      expect(sessionInfo.startedAt).toBe("2025-01-01T00:01:00.000Z");
      expect(sessionInfo.completedAt).toBeUndefined();
      expect(sessionInfo.context).toEqual({ references: [] });
      expect(sessionInfo.lastAssistantMessage).toBeUndefined();
      expect(sessionInfo.currentActivity).toBe("Processing files...");
      expect(sessionInfo.claudeSessionId).toBe("claude_session_xyz");
    });

    test("preserves operational fields (id, state, timestamps, activity, claudeSessionId)", () => {
      const testRow: AiSessionRow = {
        id: "qs_test_preserve_fields" as QraftAiSessionId,
        state: "completed",
        projectPath: "/tmp/preserve",
        createdAt: "2025-01-01T00:00:00.000Z",
        startedAt: "2025-01-01T00:01:00.000Z",
        completedAt: "2025-01-01T00:05:00.000Z",
        currentActivity: "Done",
        currentClaudeSessionId: "claude_session_final" as ClaudeSessionId,
      };

      const sessionInfo = toSessionInfo(testRow);

      // Verify all operational fields are preserved
      expect(sessionInfo.id).toBe(testRow.id);
      expect(sessionInfo.state).toBe(testRow.state);
      expect(sessionInfo.createdAt).toBe(testRow.createdAt);
      expect(sessionInfo.startedAt).toBe(testRow.startedAt);
      expect(sessionInfo.completedAt).toBe(testRow.completedAt);
      expect(sessionInfo.currentActivity).toBe(testRow.currentActivity);
      expect(sessionInfo.claudeSessionId).toBe(testRow.currentClaudeSessionId);
    });

    test("uses message field for prompt in AISessionInfo", () => {
      const testRow: AiSessionRow = {
        id: "qs_test_message_prompt" as QraftAiSessionId,
        state: "completed",
        projectPath: "/tmp/test",
        createdAt: "2025-01-01T00:00:00.000Z",
        message: "This was the user prompt",
      };

      const sessionInfo = toSessionInfo(testRow);
      expect(sessionInfo.prompt).toBe("This was the user prompt");
    });
  });

  describe("prompt queue fields", () => {
    test("inserts and retrieves session with prompt queue fields", () => {
      const testRow = createTestRow({
        id: "qs_test_prompt_fields" as QraftAiSessionId,
        state: "queued",
        projectPath: "/tmp/test-prompt",
        createdAt: "2025-01-01T00:00:00.000Z",
        promptId: "prompt_abc_123" as PromptId,
        worktreeId: "my_worktree_abc" as WorktreeId,
        message: "Test prompt message",
        clientSessionId: "qs_client_group_1" as QraftAiSessionId,
      });

      sessionStore.insert(testRow);
      const retrieved = sessionStore.get(testRow.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.promptId).toBe("prompt_abc_123");
      expect(retrieved?.worktreeId).toBe("my_worktree_abc");
      expect(retrieved?.message).toBe("Test prompt message");
      expect(retrieved?.clientSessionId).toBe("qs_client_group_1");
      expect(retrieved?.error).toBeUndefined();
    });

    test("handles session without prompt queue fields (direct submit)", () => {
      const testRow = createTestRow({
        id: "qs_test_no_prompt_fields" as QraftAiSessionId,
        state: "queued",
        projectPath: "/tmp/test-direct",
        createdAt: "2025-01-01T00:00:00.000Z",
      });

      sessionStore.insert(testRow);
      const retrieved = sessionStore.get(testRow.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.promptId).toBeUndefined();
      expect(retrieved?.worktreeId).toBeUndefined();
      expect(retrieved?.message).toBeUndefined();
      expect(retrieved?.clientSessionId).toBeUndefined();
      expect(retrieved?.error).toBeUndefined();
    });
  });

  describe("updateError()", () => {
    test("sets error message", () => {
      const testRow = createTestRow({
        id: "qs_test_set_error" as QraftAiSessionId,
        state: "failed",
      });

      sessionStore.insert(testRow);
      sessionStore.updateError(testRow.id, "Something went wrong");

      const retrieved = sessionStore.get(testRow.id);
      expect(retrieved?.error).toBe("Something went wrong");
    });

    test("clears error with undefined", () => {
      const testRow = createTestRow({
        id: "qs_test_clear_error" as QraftAiSessionId,
        state: "failed",
        error: "Previous error",
      });

      sessionStore.insert(testRow);
      sessionStore.updateError(testRow.id, undefined);

      const retrieved = sessionStore.get(testRow.id);
      expect(retrieved?.error).toBeUndefined();
    });
  });

  describe("findByPromptId()", () => {
    test("finds session by prompt ID", () => {
      const testRow = createTestRow({
        id: "qs_test_find_prompt" as QraftAiSessionId,
        state: "queued",
        promptId: "prompt_find_me" as PromptId,
        message: "Find me",
      });

      sessionStore.insert(testRow);
      const found = sessionStore.findByPromptId("prompt_find_me" as PromptId);

      expect(found).toBeDefined();
      expect(found?.id).toBe("qs_test_find_prompt");
      expect(found?.message).toBe("Find me");
    });

    test("returns undefined for non-existent prompt ID", () => {
      const found = sessionStore.findByPromptId(
        "prompt_nonexistent" as PromptId,
      );
      expect(found).toBeUndefined();
    });

    test("does not match sessions without promptId", () => {
      const testRow = createTestRow({
        id: "qs_test_no_prompt_id" as QraftAiSessionId,
        state: "queued",
      });

      sessionStore.insert(testRow);
      const found = sessionStore.findByPromptId("" as PromptId);
      // Empty string won't match null prompt_id
      expect(found).toBeUndefined();
    });
  });

  describe("listPromptQueue()", () => {
    test("returns only sessions with promptId", () => {
      // Session with promptId (prompt queue entry)
      sessionStore.insert(
        createTestRow({
          id: "qs_queue_1" as QraftAiSessionId,
          state: "queued",
          promptId: "prompt_1" as PromptId,
          worktreeId: "wt_a" as WorktreeId,
          message: "Prompt 1",
        }),
      );

      // Session without promptId (direct submit)
      sessionStore.insert(
        createTestRow({
          id: "qs_direct_1" as QraftAiSessionId,
          state: "queued",
        }),
      );

      // Another session with promptId
      sessionStore.insert(
        createTestRow({
          id: "qs_queue_2" as QraftAiSessionId,
          state: "running",
          promptId: "prompt_2" as PromptId,
          worktreeId: "wt_b" as WorktreeId,
          message: "Prompt 2",
        }),
      );

      const queue = sessionStore.listPromptQueue();
      expect(queue).toHaveLength(2);
      const ids = queue.map((row) => row.id);
      expect(ids).toContain("qs_queue_1");
      expect(ids).toContain("qs_queue_2");
      expect(ids).not.toContain("qs_direct_1");
    });

    test("filters by worktreeId", () => {
      sessionStore.insert(
        createTestRow({
          id: "qs_wt_a1" as QraftAiSessionId,
          state: "queued",
          promptId: "prompt_a1" as PromptId,
          worktreeId: "worktree_alpha" as WorktreeId,
        }),
      );

      sessionStore.insert(
        createTestRow({
          id: "qs_wt_b1" as QraftAiSessionId,
          state: "queued",
          promptId: "prompt_b1" as PromptId,
          worktreeId: "worktree_beta" as WorktreeId,
        }),
      );

      const alphaQueue = sessionStore.listPromptQueue(
        "worktree_alpha" as WorktreeId,
      );
      expect(alphaQueue).toHaveLength(1);
      expect(alphaQueue[0]?.id).toBe("qs_wt_a1");

      const betaQueue = sessionStore.listPromptQueue(
        "worktree_beta" as WorktreeId,
      );
      expect(betaQueue).toHaveLength(1);
      expect(betaQueue[0]?.id).toBe("qs_wt_b1");
    });

    test("returns empty array when no prompt queue entries exist", () => {
      sessionStore.insert(
        createTestRow({
          id: "qs_no_queue" as QraftAiSessionId,
          state: "queued",
        }),
      );

      const queue = sessionStore.listPromptQueue();
      expect(queue).toEqual([]);
    });
  });

  describe("findResumeByClientSessionId()", () => {
    test("finds most recent session with claude ID for client session group", () => {
      sessionStore.insert(
        createTestRow({
          id: "qs_resume_old" as QraftAiSessionId,
          state: "completed",
          createdAt: "2025-01-01T00:00:00.000Z",
          currentClaudeSessionId: "claude_old" as ClaudeSessionId,
          clientSessionId: "qs_group_1" as QraftAiSessionId,
        }),
      );

      sessionStore.insert(
        createTestRow({
          id: "qs_resume_new" as QraftAiSessionId,
          state: "completed",
          createdAt: "2025-01-01T01:00:00.000Z",
          currentClaudeSessionId: "claude_new" as ClaudeSessionId,
          clientSessionId: "qs_group_1" as QraftAiSessionId,
        }),
      );

      const resumeId = sessionStore.findResumeByClientSessionId(
        "qs_group_1" as QraftAiSessionId,
      );
      expect(resumeId).toBe("claude_new");
    });

    test("returns undefined when no matching sessions", () => {
      const resumeId = sessionStore.findResumeByClientSessionId(
        "qs_nonexistent" as QraftAiSessionId,
      );
      expect(resumeId).toBeUndefined();
    });

    test("skips sessions without claude session ID", () => {
      sessionStore.insert(
        createTestRow({
          id: "qs_no_claude_id" as QraftAiSessionId,
          state: "completed",
          clientSessionId: "qs_group_2" as QraftAiSessionId,
          // No currentClaudeSessionId
        }),
      );

      const resumeId = sessionStore.findResumeByClientSessionId(
        "qs_group_2" as QraftAiSessionId,
      );
      expect(resumeId).toBeUndefined();
    });
  });

  describe("findResumeByWorktreeId()", () => {
    test("finds most recent session with claude ID for worktree", () => {
      sessionStore.insert(
        createTestRow({
          id: "qs_wt_resume_old" as QraftAiSessionId,
          state: "completed",
          createdAt: "2025-01-01T00:00:00.000Z",
          currentClaudeSessionId: "claude_wt_old" as ClaudeSessionId,
          worktreeId: "wt_resume" as WorktreeId,
        }),
      );

      sessionStore.insert(
        createTestRow({
          id: "qs_wt_resume_new" as QraftAiSessionId,
          state: "completed",
          createdAt: "2025-01-01T01:00:00.000Z",
          currentClaudeSessionId: "claude_wt_new" as ClaudeSessionId,
          worktreeId: "wt_resume" as WorktreeId,
        }),
      );

      const resumeId = sessionStore.findResumeByWorktreeId(
        "wt_resume" as WorktreeId,
      );
      expect(resumeId).toBe("claude_wt_new");
    });

    test("returns undefined when no matching sessions", () => {
      const resumeId = sessionStore.findResumeByWorktreeId(
        "wt_nonexistent" as WorktreeId,
      );
      expect(resumeId).toBeUndefined();
    });

    test("skips sessions without claude session ID", () => {
      sessionStore.insert(
        createTestRow({
          id: "qs_wt_no_claude" as QraftAiSessionId,
          state: "completed",
          worktreeId: "wt_skip" as WorktreeId,
          // No currentClaudeSessionId
        }),
      );

      const resumeId = sessionStore.findResumeByWorktreeId(
        "wt_skip" as WorktreeId,
      );
      expect(resumeId).toBeUndefined();
    });
  });
});
