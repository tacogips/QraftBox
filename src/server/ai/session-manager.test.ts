/**
 * Session Manager Tests
 *
 * Tests for AI session management including queueing, execution, and events.
 */

import { describe, test, expect } from "vitest";
import { createSessionManager } from "./session-manager.js";
import type {
  AIPromptRequest,
  AIConfig,
  AIProgressEvent,
} from "../../types/ai.js";

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
  });

  describe("cancel()", () => {
    test("cancels queued session", async () => {
      const config: AIConfig = {
        maxConcurrent: 1,
        maxQueueSize: 10,
        sessionTimeoutMs: 5 * 60 * 1000,
        enabled: true,
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

      await expect(manager.cancel("nonexistent-session")).rejects.toThrow(
        "Session not found: nonexistent-session",
      );
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

      const session = manager.getSession("unknown-session");
      expect(session).toBeNull();
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

      const unsubscribe = manager.subscribe("unknown-session", () => {
        // Should not crash
      });

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
      };
      const manager = createSessionManager(config);

      const result = await manager.submit(createTestRequest());

      // Cleanup immediately (session still running)
      manager.cleanup();

      // Session should still exist
      expect(manager.getSession(result.sessionId)).not.toBeNull();
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
});
