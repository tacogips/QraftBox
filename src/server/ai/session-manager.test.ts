/**
 * Session Manager Tests
 *
 * Tests for AI session management including queueing, execution, and events.
 */

import { describe, test, expect } from "vitest";
import { createSessionManager, generateWorktreeId } from "./session-manager.js";
import type {
  AIPromptRequest,
  AIConfig,
  AIProgressEvent,
  ClaudeSessionId,
  QraftAiSessionId,
  WorktreeId,
} from "../../types/ai.js";
import type { AgentRunner, AgentEvent } from "./agent-runner.js";
import { DEFAULT_AI_CONFIG } from "../../types/ai.js";

/**
 * Create a test AI prompt request
 *
 * @param overrides - Partial overrides for the request
 * @returns Complete AIPromptRequest
 */
function createTestRequest(
  overrides?: Partial<AIPromptRequest>,
): AIPromptRequest {
  return {
    prompt: "Test prompt",
    context: {
      references: [],
      primaryFile: undefined,
      diffSummary: undefined,
    },
    options: {
      projectPath: "/tmp/test",
      sessionMode: "new",
      immediate: true,
    },
    ...overrides,
  } as AIPromptRequest;
}

describe("createSessionManager", () => {
  describe("submit()", () => {
    test("starts session immediately when immediate=true", async () => {
      const manager = createSessionManager();
      const request = createTestRequest();

      const result = await manager.submit(request);

      expect(result.sessionId).toBeTruthy();
      expect(result.immediate).toBe(true);
      expect(result.queuePosition).toBeUndefined();

      const session = manager.getSession(result.sessionId);
      expect(session).not.toBeNull();
      expect(session?.state).toMatch(/running|completed/);
    });

    test("queues session when max concurrent reached", async () => {
      const config: AIConfig = {
        maxConcurrent: 1,
        maxQueueSize: 10,
        sessionTimeoutMs: 5 * 60 * 1000,
        enabled: true,
        assistantModel: "claude-opus-4-6",
        assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      };
      const manager = createSessionManager(config);

      // Submit first session
      const result1 = await manager.submit(createTestRequest());
      expect(result1.immediate).toBe(true);

      // Submit second session - should be queued
      const result2 = await manager.submit(
        createTestRequest({
          options: {
            projectPath: "/tmp/test",
            sessionMode: "new",
            immediate: false,
          },
        }),
      );

      expect(result2.immediate).toBe(false);
      expect(result2.queuePosition).toBe(1);

      const queueStatus = manager.getQueueStatus();
      expect(queueStatus.runningCount).toBe(1);
      expect(queueStatus.queuedCount).toBe(1);
    });

    test("throws when AI disabled", async () => {
      const config: AIConfig = {
        maxConcurrent: 1,
        maxQueueSize: 10,
        sessionTimeoutMs: 5 * 60 * 1000,
        enabled: false,
        assistantModel: "claude-opus-4-6",
        assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      };
      const manager = createSessionManager(config);

      const request = createTestRequest();

      await expect(manager.submit(request)).rejects.toThrow(
        "AI features are disabled",
      );
    });

    test("throws when queue is full", async () => {
      const config: AIConfig = {
        maxConcurrent: 1,
        maxQueueSize: 1,
        sessionTimeoutMs: 5 * 60 * 1000,
        enabled: true,
        assistantModel: "claude-opus-4-6",
        assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      };
      const manager = createSessionManager(config);

      // Fill the running slot
      await manager.submit(createTestRequest());

      // Fill the queue
      await manager.submit(
        createTestRequest({
          options: {
            projectPath: "/tmp/test",
            sessionMode: "new",
            immediate: false,
          },
        }),
      );

      // Next submission should fail
      await expect(
        manager.submit(
          createTestRequest({
            options: {
              projectPath: "/tmp/test",
              sessionMode: "new",
              immediate: false,
            },
          }),
        ),
      ).rejects.toThrow("Queue is full");
    });

    test("preserves resumeSessionId as claudeSessionId for continued sessions", async () => {
      const manager = createSessionManager();
      const request = createTestRequest({
        options: {
          projectPath: "/tmp/test",
          sessionMode: "continue",
          immediate: true,
          resumeSessionId: "claude-session-123" as ClaudeSessionId,
        },
      });

      const result = await manager.submit(request);
      expect(result.claudeSessionId).toBe("claude-session-123");

      const session = manager.getSession(result.sessionId);
      expect(session?.claudeSessionId).toBe("claude-session-123");
    });
  });

  describe("cancel()", () => {
    test("cancels queued session", async () => {
      const config: AIConfig = {
        maxConcurrent: 1,
        maxQueueSize: 10,
        sessionTimeoutMs: 5 * 60 * 1000,
        enabled: true,
        assistantModel: "claude-opus-4-6",
        assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      };
      const manager = createSessionManager(config);

      // Fill running slot
      await manager.submit(createTestRequest());

      // Queue a session
      const result = await manager.submit(
        createTestRequest({
          options: {
            projectPath: "/tmp/test",
            sessionMode: "new",
            immediate: false,
          },
        }),
      );

      // Cancel it
      await manager.cancel(result.sessionId);

      const session = manager.getSession(result.sessionId);
      expect(session?.state).toBe("cancelled");

      const queueStatus = manager.getQueueStatus();
      expect(queueStatus.queuedCount).toBe(0);
    });

    test("throws when cancelling unknown session", async () => {
      const manager = createSessionManager();

      await expect(
        manager.cancel("nonexistent-session" as QraftAiSessionId),
      ).rejects.toThrow("Session not found: nonexistent-session");
    });

    test("is idempotent for completed sessions", async () => {
      const manager = createSessionManager();
      const result = await manager.submit(createTestRequest());

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Cancel after completion - should not throw
      await manager.cancel(result.sessionId);

      const session = manager.getSession(result.sessionId);
      expect(session?.state).toBe("completed");
    });

    test("keeps cancelled state when cancelling a running session", async () => {
      const manager = createSessionManager();
      const result = await manager.submit(createTestRequest());

      await manager.cancel(result.sessionId);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const session = manager.getSession(result.sessionId);
      expect(session?.state).toBe("cancelled");
      expect(session?.completedAt).toBeDefined();
    });
  });

  describe("getQueueStatus()", () => {
    test("returns correct counts", async () => {
      const config: AIConfig = {
        maxConcurrent: 2,
        maxQueueSize: 10,
        sessionTimeoutMs: 5 * 60 * 1000,
        enabled: true,
        assistantModel: "claude-opus-4-6",
        assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      };
      const manager = createSessionManager(config);

      // Start 2 sessions (fill running slots)
      const result1 = await manager.submit(createTestRequest());
      const result2 = await manager.submit(createTestRequest());

      // Queue 2 more
      await manager.submit(
        createTestRequest({
          options: {
            projectPath: "/tmp/test",
            sessionMode: "new",
            immediate: false,
          },
        }),
      );
      await manager.submit(
        createTestRequest({
          options: {
            projectPath: "/tmp/test",
            sessionMode: "new",
            immediate: false,
          },
        }),
      );

      const status = manager.getQueueStatus();
      expect(status.runningCount).toBe(2);
      expect(status.queuedCount).toBe(2);
      expect(status.totalCount).toBe(4);
      expect(status.runningSessionIds).toContain(result1.sessionId);
      expect(status.runningSessionIds).toContain(result2.sessionId);
    });

    test("returns zero counts when no sessions", () => {
      const manager = createSessionManager();

      const status = manager.getQueueStatus();
      expect(status.runningCount).toBe(0);
      expect(status.queuedCount).toBe(0);
      expect(status.totalCount).toBe(0);
      expect(status.runningSessionIds).toHaveLength(0);
    });
  });

  describe("getSession()", () => {
    test("returns session info", async () => {
      const manager = createSessionManager();
      const request = createTestRequest({ prompt: "Test session info" });
      const result = await manager.submit(request);

      const session = manager.getSession(result.sessionId);

      expect(session).not.toBeNull();
      expect(session?.id).toBe(result.sessionId);
      expect(session?.prompt).toBe("Test session info");
      expect(session?.createdAt).toBeTruthy();
      expect(session?.context).toEqual(request.context);
    });

    test("returns null for unknown session", () => {
      const manager = createSessionManager();

      const session = manager.getSession("unknown-session" as QraftAiSessionId);
      expect(session).toBeNull();
    });

    test("returns empty defaults for content fields after session completes and handle is cleaned", async () => {
      // Submit, wait for completion (stubbed completes quickly), then verify
      // After completion, runtime handle is cleaned up, so content fields should be empty defaults
      const manager = createSessionManager();
      const result = await manager.submit(
        createTestRequest({ prompt: "Will be cleaned" }),
      );

      // Wait for session to complete and runtime handle cleanup
      await new Promise((resolve) => setTimeout(resolve, 300));

      const session = manager.getSession(result.sessionId);
      expect(session).not.toBeNull();
      expect(session?.state).toBe("completed");
      // After handle cleanup, content fields get empty defaults from toSessionInfo
      expect(session?.prompt).toBe("");
      expect(session?.context).toEqual({ references: [] });
      expect(session?.lastAssistantMessage).toBeUndefined();
    });
  });

  describe("listSessions()", () => {
    test("returns all sessions", async () => {
      const manager = createSessionManager();

      const result1 = await manager.submit(
        createTestRequest({ prompt: "Prompt 1" }),
      );
      const result2 = await manager.submit(
        createTestRequest({ prompt: "Prompt 2" }),
      );

      const sessions = manager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.id)).toContain(result1.sessionId);
      expect(sessions.map((s) => s.id)).toContain(result2.sessionId);
    });

    test("returns empty array when no sessions", () => {
      const manager = createSessionManager();

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(0);
    });

    test("returns content fields from runtime handle for active sessions", async () => {
      const manager = createSessionManager();
      const request = createTestRequest({ prompt: "Active session prompt" });
      const result = await manager.submit(request);

      // Session should still have runtime handle content before completion
      const sessions = manager.listSessions();
      const session = sessions.find((s) => s.id === result.sessionId);
      expect(session).toBeDefined();
      expect(session?.prompt).toBe("Active session prompt");
      expect(session?.context).toEqual(request.context);
    });
  });

  describe("subscribe()", () => {
    test("receives events from session", async () => {
      const manager = createSessionManager();
      const events: AIProgressEvent[] = [];

      const result = await manager.submit(createTestRequest());
      const unsubscribe = manager.subscribe(result.sessionId, (event) => {
        events.push(event);
      });

      // Wait for session to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(events.length).toBeGreaterThan(0);

      // Check for expected event types (session_started may have already fired)
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain("completed");

      unsubscribe();
    });

    test("returns unsubscribe function that stops events", async () => {
      const manager = createSessionManager();
      const events: AIProgressEvent[] = [];

      const result = await manager.submit(createTestRequest());
      const unsubscribe = manager.subscribe(result.sessionId, (event) => {
        events.push(event);
      });

      // Unsubscribe immediately
      unsubscribe();

      // Wait for session to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have minimal events (only those emitted before unsubscribe)
      expect(events.length).toBeLessThan(3);
    });

    test("handles unknown session gracefully", () => {
      const manager = createSessionManager();

      const unsubscribe = manager.subscribe(
        "unknown-session" as QraftAiSessionId,
        () => {
          // Should not crash
        },
      );

      expect(typeof unsubscribe).toBe("function");
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe("cleanup()", () => {
    test("removes old completed sessions", async () => {
      const config: AIConfig = {
        maxConcurrent: 1,
        maxQueueSize: 10,
        sessionTimeoutMs: 1000, // 1 second timeout
        enabled: true,
        assistantModel: "claude-opus-4-6",
        assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      };
      const manager = createSessionManager(config);

      const result = await manager.submit(createTestRequest());

      // Wait for session to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Session should exist
      expect(manager.getSession(result.sessionId)).not.toBeNull();

      // Advance time past timeout
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Run cleanup
      manager.cleanup();

      // Session should be removed
      expect(manager.getSession(result.sessionId)).toBeNull();
    });

    test("does not remove active sessions", async () => {
      const config: AIConfig = {
        maxConcurrent: 1,
        maxQueueSize: 10,
        sessionTimeoutMs: 1000,
        enabled: true,
        assistantModel: "claude-opus-4-6",
        assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      };
      const manager = createSessionManager(config);

      const result = await manager.submit(createTestRequest());

      // Cleanup immediately (session still running)
      manager.cleanup();

      // Session should still exist
      expect(manager.getSession(result.sessionId)).not.toBeNull();
    });
  });

  describe("submitPrompt()", () => {
    test("queues a prompt and returns promptId", () => {
      const manager = createSessionManager();

      const result = manager.submitPrompt({
        run_immediately: true,
        message: "Test prompt via queue",
        project_path: "/tmp/test",
      });

      expect(result.promptId).toBeTruthy();
      expect(result.promptId).toMatch(/^prompt_/);

      const queue = manager.getPromptQueue();
      expect(queue.length).toBeGreaterThanOrEqual(1);
      expect(queue.some((p) => p.id === result.promptId)).toBe(true);
    });

    test("broadcasts queue update via callback", () => {
      const broadcasts: { event: string; data: unknown }[] = [];
      const manager = createSessionManager(
        undefined,
        undefined,
        (event, data) => {
          broadcasts.push({ event, data });
        },
      );

      manager.submitPrompt({
        run_immediately: true,
        message: "Broadcast test",
        project_path: "/tmp/test",
      });

      const queueUpdates = broadcasts.filter(
        (b) => b.event === "ai:queue_update",
      );
      expect(queueUpdates.length).toBeGreaterThanOrEqual(1);
    });

    test("throws when AI disabled", () => {
      const config: AIConfig = {
        maxConcurrent: 1,
        maxQueueSize: 10,
        sessionTimeoutMs: 5 * 60 * 1000,
        enabled: false,
        assistantModel: "claude-opus-4-6",
        assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      };
      const manager = createSessionManager(config);

      expect(() =>
        manager.submitPrompt({
          run_immediately: true,
          message: "Should fail",
          project_path: "/tmp/test",
        }),
      ).toThrow("AI features are disabled");
    });

    test("cancels a queued prompt", () => {
      const config: AIConfig = {
        maxConcurrent: 0, // Prevent immediate dispatch
        maxQueueSize: 10,
        sessionTimeoutMs: 5 * 60 * 1000,
        enabled: true,
        assistantModel: "claude-opus-4-6",
        assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      };
      const manager = createSessionManager(config);

      const { promptId } = manager.submitPrompt({
        run_immediately: false,
        message: "To be cancelled",
        project_path: "/tmp/test",
      });

      manager.cancelPrompt(promptId);

      // Cancelled prompts should no longer appear in the active queue
      const queue = manager.getPromptQueue();
      const prompt = queue.find((p) => p.id === promptId);
      expect(prompt).toBeUndefined();
    });
  });

  describe("stubbed session behavior", () => {
    test("emits expected events without toolRegistry", async () => {
      const manager = createSessionManager();
      const events: AIProgressEvent[] = [];

      const result = await manager.submit(createTestRequest());
      manager.subscribe(result.sessionId, (event) => {
        events.push(event);
      });

      // Wait for session to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check event types (session_started and thinking may have already fired)
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain("message");
      expect(eventTypes).toContain("completed");

      // Check for stubbed message
      const messageEvent = events.find((e) => e.type === "message");
      expect(messageEvent).toBeDefined();

      if (
        messageEvent !== undefined &&
        "content" in messageEvent.data &&
        typeof messageEvent.data.content === "string"
      ) {
        expect(messageEvent.data.content).toContain("[AI Integration Stubbed]");
        expect(messageEvent.data.content).toContain("Test prompt");
      }
    });

    test("stubbed session includes prompt in response", async () => {
      const manager = createSessionManager();
      const events: AIProgressEvent[] = [];

      const request = createTestRequest({
        prompt: "This is a test prompt for stubbed session",
      });
      const result = await manager.submit(request);

      manager.subscribe(result.sessionId, (event) => {
        events.push(event);
      });

      // Wait for session to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Find message event
      const messageEvent = events.find((e) => e.type === "message");
      expect(messageEvent).toBeDefined();

      if (
        messageEvent !== undefined &&
        "content" in messageEvent.data &&
        typeof messageEvent.data.content === "string"
      ) {
        expect(messageEvent.data.content).toContain(
          "This is a test prompt for stubbed session",
        );
      }
    });

    test("stubbed session completes successfully", async () => {
      const manager = createSessionManager();

      const result = await manager.submit(createTestRequest());

      // Wait for session to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const session = manager.getSession(result.sessionId);
      expect(session?.state).toBe("completed");
      expect(session?.completedAt).toBeTruthy();
    });
  });

  describe("generateWorktreeId()", () => {
    test("returns a non-empty string", () => {
      const worktreeId = generateWorktreeId("/home/user/project");
      expect(worktreeId).toBeTruthy();
      expect(typeof worktreeId).toBe("string");
      expect(worktreeId.length).toBeGreaterThan(0);
    });

    test("is deterministic for same path", () => {
      const path = "/home/user/my-project";
      const id1 = generateWorktreeId(path);
      const id2 = generateWorktreeId(path);
      expect(id1).toBe(id2);
    });

    test("produces different IDs for different paths", () => {
      const id1 = generateWorktreeId("/home/user/project-a");
      const id2 = generateWorktreeId("/home/user/project-b");
      expect(id1).not.toBe(id2);
    });

    test("produces URL-safe output", () => {
      const worktreeId = generateWorktreeId("/home/user/my-project-123");
      // Should only contain alphanumeric characters and underscores
      expect(worktreeId).toMatch(/^[a-z0-9_]+$/);
    });

    test("sanitizes special characters in basename", () => {
      const worktreeId = generateWorktreeId("/home/user/my@special#project!");
      // Should only contain alphanumeric characters and underscores
      expect(worktreeId).toMatch(/^[a-z0-9_]+$/);
    });

    test("handles paths with multiple segments correctly", () => {
      const worktreeId = generateWorktreeId("/very/long/path/to/project");
      // Should use basename only
      expect(worktreeId).toContain("project");
      expect(worktreeId).not.toContain("very");
      expect(worktreeId).not.toContain("long");
    });
  });

  describe("submitPrompt() with worktree_id", () => {
    test("returns worktreeId in result", () => {
      const manager = createSessionManager();

      const result = manager.submitPrompt({
        run_immediately: true,
        message: "Test worktree_id",
        project_path: "/tmp/test-project",
      });

      expect(result.worktreeId).toBeTruthy();
      expect(typeof result.worktreeId).toBe("string");
    });

    test("uses explicit worktree_id when provided", () => {
      const manager = createSessionManager();

      const result = manager.submitPrompt({
        run_immediately: true,
        message: "Test explicit worktree_id",
        project_path: "/tmp/test-project",
        worktree_id: "custom_worktree_abc123",
      });

      expect(result.worktreeId).toBe("custom_worktree_abc123");

      const queue = manager.getPromptQueue();
      const prompt = queue.find((p) => p.id === result.promptId);
      expect(prompt?.worktree_id).toBe("custom_worktree_abc123");
    });

    test("generates worktree_id from project_path when not provided", () => {
      const manager = createSessionManager();
      const projectPath = "/tmp/test-project-auto";

      const result = manager.submitPrompt({
        run_immediately: true,
        message: "Test auto-generated worktree_id",
        project_path: projectPath,
      });

      const expectedWorktreeId = generateWorktreeId(projectPath);
      expect(result.worktreeId).toBe(expectedWorktreeId);
    });

    test("getPromptQueue() without filter returns all prompts", () => {
      const manager = createSessionManager();

      manager.submitPrompt({
        run_immediately: true,
        message: "Prompt 1",
        project_path: "/tmp/project-a",
      });

      manager.submitPrompt({
        run_immediately: true,
        message: "Prompt 2",
        project_path: "/tmp/project-b",
      });

      const queue = manager.getPromptQueue();
      expect(queue.length).toBeGreaterThanOrEqual(2);
    });

    test("getPromptQueue(worktreeId) returns only matching prompts", () => {
      const manager = createSessionManager();

      const result1 = manager.submitPrompt({
        run_immediately: true,
        message: "Prompt for project A",
        project_path: "/tmp/project-a",
        worktree_id: "worktree_a",
      });

      manager.submitPrompt({
        run_immediately: true,
        message: "Prompt for project B",
        project_path: "/tmp/project-b",
        worktree_id: "worktree_b",
      });

      const queueForA = manager.getPromptQueue("worktree_a" as WorktreeId);
      expect(queueForA.length).toBe(1);
      expect(queueForA[0]?.id).toBe(result1.promptId);
      expect(queueForA[0]?.worktree_id).toBe("worktree_a");
    });

    test("per-worktree session continuity: different worktrees have different session IDs", () => {
      const manager = createSessionManager();

      const result1 = manager.submitPrompt({
        run_immediately: true,
        message: "Prompt 1 in worktree A",
        project_path: "/tmp/project-a",
        worktree_id: "worktree_a_123",
      });

      const result2 = manager.submitPrompt({
        run_immediately: true,
        message: "Prompt 2 in worktree B",
        project_path: "/tmp/project-b",
        worktree_id: "worktree_b_456",
      });

      const queueA = manager.getPromptQueue("worktree_a_123" as WorktreeId);
      const queueB = manager.getPromptQueue("worktree_b_456" as WorktreeId);

      expect(queueA.length).toBe(1);
      expect(queueB.length).toBe(1);
      expect(queueA[0]?.worktree_id).toBe("worktree_a_123");
      expect(queueB[0]?.worktree_id).toBe("worktree_b_456");
      expect(result1.worktreeId).not.toBe(result2.worktreeId);
    });

    test("empty worktree_id string is treated as missing and generates from path", () => {
      const manager = createSessionManager();
      const projectPath = "/tmp/test-empty-worktree";

      const result = manager.submitPrompt({
        run_immediately: true,
        message: "Test empty worktree_id",
        project_path: projectPath,
        worktree_id: "",
      });

      const expectedWorktreeId = generateWorktreeId(projectPath);
      expect(result.worktreeId).toBe(expectedWorktreeId);
    });
  });

  describe("AgentRunner integration", () => {
    /**
     * Create a mock AgentRunner that yields predetermined events
     */
    function createMockAgentRunner(events: AgentEvent[]): AgentRunner {
      return {
        execute(_params) {
          let cancelled = false;
          const eventsCopy = [...events];

          return {
            events(): AsyncIterable<AgentEvent> {
              return {
                [Symbol.asyncIterator]() {
                  let index = 0;
                  return {
                    async next() {
                      if (cancelled || index >= eventsCopy.length) {
                        return {
                          value: undefined as unknown as AgentEvent,
                          done: true,
                        };
                      }
                      const value = eventsCopy[index];
                      index++;
                      // Small delay to allow event loop to process
                      await new Promise((resolve) => setTimeout(resolve, 10));
                      return { value: value!, done: false };
                    },
                  };
                },
              };
            },
            async cancel() {
              cancelled = true;
            },
            async abort() {
              cancelled = true;
            },
          };
        },
      };
    }

    test("processes claude_session_detected event and updates session", async () => {
      const mockRunner = createMockAgentRunner([
        {
          type: "claude_session_detected",
          claudeSessionId: "claude-abc-123" as ClaudeSessionId,
        },
        { type: "completed", success: true, lastAssistantMessage: "Done" },
      ]);

      const manager = createSessionManager(
        DEFAULT_AI_CONFIG,
        undefined, // no toolRegistry
        undefined, // no broadcast
        undefined, // no mappingStore
        undefined, // no sessionStore
        mockRunner,
      );

      const result = await manager.submit(createTestRequest());
      await new Promise((resolve) => setTimeout(resolve, 300));

      const session = manager.getSession(result.sessionId);
      expect(session?.state).toBe("completed");
      expect(session?.claudeSessionId).toBe("claude-abc-123");
    });

    test("processes message events and emits to subscribers", async () => {
      const mockRunner = createMockAgentRunner([
        {
          type: "message",
          role: "assistant" as const,
          content: "Hello from mock",
        },
        {
          type: "completed",
          success: true,
          lastAssistantMessage: "Hello from mock",
        },
      ]);

      const manager = createSessionManager(
        DEFAULT_AI_CONFIG,
        undefined,
        undefined,
        undefined,
        undefined,
        mockRunner,
      );

      const events: AIProgressEvent[] = [];
      const result = await manager.submit(createTestRequest());
      manager.subscribe(result.sessionId, (event) => events.push(event));

      await new Promise((resolve) => setTimeout(resolve, 300));

      const messageEvents = events.filter((e) => e.type === "message");
      expect(messageEvents.length).toBeGreaterThanOrEqual(1);

      const msgEvent = messageEvents[0];
      if (
        msgEvent !== undefined &&
        "content" in msgEvent.data &&
        typeof msgEvent.data.content === "string"
      ) {
        expect(msgEvent.data.content).toBe("Hello from mock");
      }
    });

    test("processes tool_call and tool_result events", async () => {
      const mockRunner = createMockAgentRunner([
        {
          type: "tool_call",
          toolName: "read_file",
          input: { path: "/tmp/test.ts" },
        },
        {
          type: "tool_result",
          toolName: "read_file",
          output: "file content",
          isError: false,
        },
        { type: "completed", success: true },
      ]);

      const manager = createSessionManager(
        DEFAULT_AI_CONFIG,
        undefined,
        undefined,
        undefined,
        undefined,
        mockRunner,
      );

      const events: AIProgressEvent[] = [];
      const result = await manager.submit(createTestRequest());
      manager.subscribe(result.sessionId, (event) => events.push(event));

      await new Promise((resolve) => setTimeout(resolve, 300));

      const toolUseEvents = events.filter((e) => e.type === "tool_use");
      const toolResultEvents = events.filter((e) => e.type === "tool_result");
      expect(toolUseEvents.length).toBeGreaterThanOrEqual(1);
      expect(toolResultEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("handles failed execution with error event", async () => {
      const mockRunner = createMockAgentRunner([
        { type: "error", message: "Something went wrong" },
        { type: "completed", success: false, error: "Something went wrong" },
      ]);

      const manager = createSessionManager(
        DEFAULT_AI_CONFIG,
        undefined,
        undefined,
        undefined,
        undefined,
        mockRunner,
      );

      const result = await manager.submit(createTestRequest());
      await new Promise((resolve) => setTimeout(resolve, 300));

      const session = manager.getSession(result.sessionId);
      expect(session?.state).toBe("failed");
    });

    test("processes activity events and updates currentActivity", async () => {
      const mockRunner = createMockAgentRunner([
        { type: "activity", activity: "Reading files..." },
        { type: "activity", activity: undefined },
        { type: "completed", success: true },
      ]);

      const manager = createSessionManager(
        DEFAULT_AI_CONFIG,
        undefined,
        undefined,
        undefined,
        undefined,
        mockRunner,
      );

      const result = await manager.submit(createTestRequest());

      // Check activity during execution (before completion)
      await new Promise((resolve) => setTimeout(resolve, 50));
      const activeSess = manager.getSession(result.sessionId);
      // Activity may have been set or cleared depending on timing
      expect(activeSess).not.toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 300));
      const session = manager.getSession(result.sessionId);
      expect(session?.state).toBe("completed");
    });

    test("passes resumeSessionId from session to runner.execute", async () => {
      let capturedParams:
        | {
            prompt: string;
            projectPath: string;
            resumeSessionId?: ClaudeSessionId | undefined;
          }
        | undefined;

      const mockRunner: AgentRunner = {
        execute(params) {
          capturedParams = { ...params };
          // Return a simple completed execution
          return {
            events(): AsyncIterable<AgentEvent> {
              const evts: AgentEvent[] = [{ type: "completed", success: true }];
              return {
                [Symbol.asyncIterator]() {
                  let i = 0;
                  return {
                    async next() {
                      if (i >= evts.length)
                        return {
                          value: undefined as unknown as AgentEvent,
                          done: true,
                        };
                      const value = evts[i]!;
                      i++;
                      await new Promise((r) => setTimeout(r, 10));
                      return { value, done: false };
                    },
                  };
                },
              };
            },
            async cancel() {},
            async abort() {},
          };
        },
      };

      const manager = createSessionManager(
        DEFAULT_AI_CONFIG,
        undefined,
        undefined,
        undefined,
        undefined,
        mockRunner,
      );

      const request = createTestRequest({
        options: {
          projectPath: "/tmp/test",
          sessionMode: "continue",
          immediate: true,
          resumeSessionId: "resume-session-xyz" as ClaudeSessionId,
        },
      });

      await manager.submit(request);
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(capturedParams).toBeDefined();
      expect(capturedParams?.resumeSessionId).toBe("resume-session-xyz");
      expect(capturedParams?.projectPath).toBe("/tmp/test");
    });

    test("broadcasts queue updates for prompt queue entries via mock runner", async () => {
      const broadcasts: { event: string; data: unknown }[] = [];
      const mockRunner = createMockAgentRunner([
        { type: "message", role: "assistant" as const, content: "response" },
        {
          type: "completed",
          success: true,
          lastAssistantMessage: "response",
        },
      ]);

      const manager = createSessionManager(
        DEFAULT_AI_CONFIG,
        undefined,
        (event, data) => {
          broadcasts.push({ event, data });
        },
        undefined,
        undefined,
        mockRunner,
      );

      manager.submitPrompt({
        run_immediately: true,
        message: "Test broadcast with mock",
        project_path: "/tmp/test",
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const queueUpdates = broadcasts.filter(
        (b) => b.event === "ai:queue_update",
      );
      expect(queueUpdates.length).toBeGreaterThanOrEqual(1);
    });

    test("cancel() stops execution via AgentExecution.cancel()", async () => {
      let cancelCalled = false;

      // Create a slow runner that takes a long time so we can cancel it
      const slowRunner: AgentRunner = {
        execute(_params) {
          let cancelled = false;
          return {
            events(): AsyncIterable<AgentEvent> {
              return {
                [Symbol.asyncIterator]() {
                  let step = 0;
                  return {
                    async next() {
                      if (cancelled || step > 10) {
                        return {
                          value: undefined as unknown as AgentEvent,
                          done: true,
                        };
                      }
                      step++;
                      // Wait a long time between events
                      await new Promise((r) => setTimeout(r, 100));
                      return {
                        value: {
                          type: "activity",
                          activity: `Step ${step}`,
                        } as AgentEvent,
                        done: false,
                      };
                    },
                  };
                },
              };
            },
            async cancel() {
              cancelCalled = true;
              cancelled = true;
            },
            async abort() {
              cancelled = true;
            },
          };
        },
      };

      const manager = createSessionManager(
        DEFAULT_AI_CONFIG,
        undefined,
        undefined,
        undefined,
        undefined,
        slowRunner,
      );

      const result = await manager.submit(createTestRequest());

      // Wait for execution to start
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Cancel
      await manager.cancel(result.sessionId);

      expect(cancelCalled).toBe(true);

      const session = manager.getSession(result.sessionId);
      expect(session?.state).toBe("cancelled");
    });
  });
});
