import { describe, test, expect, beforeEach, vi, type Mock } from "vitest";
import { createAIRoutes } from "./ai";
import type { SessionManager } from "../ai/session-manager";
import type { PromptId, WorktreeId } from "../../types/ai";

describe("AI Routes", () => {
  let cancelMock: Mock<(sessionId: string) => Promise<void>>;
  let sessionManager: SessionManager;
  let app: ReturnType<typeof createAIRoutes>;

  beforeEach(() => {
    cancelMock = vi.fn(async () => {});
    sessionManager = {
      submit: vi.fn(),
      cancel: cancelMock,
      getQueueStatus: vi.fn(() => ({
        runningCount: 0,
        queuedCount: 0,
        runningSessionIds: [],
        totalCount: 0,
      })),
      getSession: vi.fn(() => null),
      listSessions: vi.fn(() => []),
      subscribe: vi.fn(() => () => {}),
      cleanup: vi.fn(),
      submitPrompt: vi.fn(() => ({
        promptId: "prompt-123" as PromptId,
        worktreeId: "test_abc123" as WorktreeId,
      })),
      getPromptQueue: vi.fn(() => []),
      cancelPrompt: vi.fn(),
      getMappingStore: vi.fn(() => undefined),
      listCompletedRows: vi.fn(() => []),
      getSessionPurpose: vi.fn(() => undefined),
    };

    app = createAIRoutes({
      projectPath: "/tmp/test-project",
      sessionManager,
    });
  });

  describe("POST /sessions/:id/cancel", () => {
    test("returns success when cancel succeeds", async () => {
      const res = await app.request("/sessions/session-123/cancel", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(cancelMock).toHaveBeenCalledWith("session-123");

      const body = (await res.json()) as {
        success: boolean;
        sessionId: string;
      };
      expect(body).toEqual({
        success: true,
        sessionId: "session-123",
      });
    });

    test("returns 404 when session is not found", async () => {
      cancelMock.mockRejectedValueOnce(
        new Error("Session not found: missing-session"),
      );

      const res = await app.request("/sessions/missing-session/cancel", {
        method: "POST",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string; code: number };
      expect(body.code).toBe(404);
      expect(body.error).toContain("Session not found: missing-session");
    });

    test("returns 500 for generic cancel errors", async () => {
      cancelMock.mockRejectedValueOnce(new Error("cancel failed"));

      const res = await app.request("/sessions/session-500/cancel", {
        method: "POST",
      });

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; code: number };
      expect(body.code).toBe(500);
      expect(body.error).toContain("cancel failed");
    });
  });

  describe("POST /submit", () => {
    test("returns 201 with promptId and worktreeId on valid submission", async () => {
      const res = await app.request("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Test prompt message",
          session_id: "session-123",
          run_immediately: true,
          project_path: "/test/project",
          worktree_id: "test_worktree",
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        promptId: string;
        worktreeId: string;
      };
      expect(body).toEqual({
        promptId: "prompt-123",
        worktreeId: "test_abc123",
      });
    });

    test("returns 400 when message is empty", async () => {
      const res = await app.request("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "",
          session_id: null,
          run_immediately: false,
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; code: number };
      expect(body.code).toBe(400);
      expect(body.error).toContain("message is required and must be non-empty");
    });

    test("returns 400 when message is missing", async () => {
      const res = await app.request("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: null,
          run_immediately: false,
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; code: number };
      expect(body.code).toBe(400);
      expect(body.error).toContain("message is required and must be non-empty");
    });

    test("passes worktree_id from request body to sessionManager.submitPrompt", async () => {
      const submitPromptMock = sessionManager.submitPrompt as Mock;

      await app.request("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Test message",
          session_id: "test-session",
          run_immediately: true,
          worktree_id: "custom_worktree_id",
        }),
      });

      expect(submitPromptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          worktree_id: "custom_worktree_id",
        }),
      );
    });

    test("passes project_path and run_immediately correctly", async () => {
      const submitPromptMock = sessionManager.submitPrompt as Mock;

      await app.request("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Test message",
          run_immediately: false,
          project_path: "/custom/path",
        }),
      });

      expect(submitPromptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          project_path: "/custom/path",
          message: "Test message",
          run_immediately: false,
        }),
      );
    });
  });

  describe("GET /prompt-queue", () => {
    test("returns empty prompts array by default", async () => {
      const res = await app.request("/prompt-queue", { method: "GET" });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { prompts: unknown[] };
      expect(body).toEqual({ prompts: [] });
    });

    test("passes worktree_id query parameter to getPromptQueue", async () => {
      const getPromptQueueMock = sessionManager.getPromptQueue as Mock;

      await app.request("/prompt-queue?worktree_id=test_worktree_xyz", {
        method: "GET",
      });

      expect(getPromptQueueMock).toHaveBeenCalledWith("test_worktree_xyz");
    });

    test("works without worktree_id query parameter (passes undefined)", async () => {
      const getPromptQueueMock = sessionManager.getPromptQueue as Mock;

      await app.request("/prompt-queue", { method: "GET" });

      expect(getPromptQueueMock).toHaveBeenCalledWith(undefined);
    });
  });

  describe("POST /prompt-queue/:id/cancel", () => {
    test("returns success when cancel succeeds", async () => {
      const res = await app.request("/prompt-queue/prompt-456/cancel", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        promptId: string;
      };
      expect(body).toEqual({
        success: true,
        promptId: "prompt-456",
      });
    });

    test("returns 404 when prompt not found", async () => {
      const cancelPromptMock = sessionManager.cancelPrompt as Mock;
      cancelPromptMock.mockImplementationOnce(() => {
        throw new Error("Prompt not found: missing-prompt");
      });

      const res = await app.request("/prompt-queue/missing-prompt/cancel", {
        method: "POST",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string; code: number };
      expect(body.code).toBe(404);
      expect(body.error).toContain("Prompt not found: missing-prompt");
    });
  });
});
