import { describe, test, expect, beforeEach, vi, type Mock } from "vitest";
import { createAIRoutes } from "./ai";
import type { SessionManager } from "../ai/session-manager";

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
});
