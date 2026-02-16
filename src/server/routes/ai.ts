/**
 * AI API Routes
 *
 * REST and SSE endpoints for AI agent integration.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type {
  AIProgressEvent,
  AIPromptMessage,
  QraftAiSessionId,
  PromptId,
  WorktreeId,
} from "../../types/ai";
import type { SessionManager } from "../ai/session-manager";
import { createLogger } from "../logger.js";
import type { ModelConfigStore } from "../model-config/store.js";

/**
 * Server context for AI routes
 */
export interface AIServerContext {
  readonly projectPath: string;
  readonly sessionManager: SessionManager;
  readonly modelConfigStore?: ModelConfigStore | undefined;
}

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Create AI routes
 *
 * Routes:
 * - POST /api/ai/submit - Submit a prompt
 * - GET /api/ai/prompt-queue - Get prompt queue state
 * - POST /api/ai/prompt-queue/:id/cancel - Cancel a queued prompt
 * - GET /api/ai/queue/status - Get queue status
 * - GET /api/ai/sessions - List all sessions
 * - GET /api/ai/sessions/:id - Get session details
 * - GET /api/ai/sessions/:id/stream - SSE stream for session events
 * - POST /api/ai/sessions/:id/cancel - Cancel a session
 *
 * @param context - Server context with session manager
 * @returns Hono app with AI routes
 */
export function createAIRoutes(context: AIServerContext): Hono {
  const logger = createLogger("AIRoutes");
  const app = new Hono();

  /**
   * POST /api/ai/submit
   *
   * Simplified prompt submission endpoint.
   * Accepts { session_id, run_immediately, message, context?, project_path? }
   * Server manages queue, session continuity, and execution.
   * Queue status is broadcast via WebSocket.
   */
  app.post("/submit", async (c) => {
    try {
      const body = await c.req.json<AIPromptMessage>();

      if (
        typeof body.message !== "string" ||
        body.message.trim().length === 0
      ) {
        const errorResponse: ErrorResponse = {
          error: "message is required and must be non-empty",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      if (body.message.length > 100000) {
        const errorResponse: ErrorResponse = {
          error: "message exceeds maximum length of 100000 characters",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Ensure project_path defaults to server config
      const msg: AIPromptMessage = {
        ...(context.modelConfigStore !== undefined
          ? (() => {
              const selected = context.modelConfigStore.resolveForOperation(
                "ai_ask",
                typeof body.model_profile_id === "string" &&
                  body.model_profile_id.trim().length > 0
                  ? body.model_profile_id
                  : undefined,
              );
              return {
                model_profile_id: selected.profileId,
                model_vendor: selected.vendor,
                model_name: selected.model,
                model_arguments: selected.arguments,
              };
            })()
          : {}),
        run_immediately: body.run_immediately === true,
        message: body.message,
        context: body.context,
        project_path:
          typeof body.project_path === "string" && body.project_path.length > 0
            ? body.project_path
            : context.projectPath,
        worktree_id:
          typeof body.worktree_id === "string" && body.worktree_id.length > 0
            ? body.worktree_id
            : undefined,
        qraft_ai_session_id:
          typeof body.qraft_ai_session_id === "string" &&
          body.qraft_ai_session_id.length > 0
            ? body.qraft_ai_session_id
            : undefined,
      };

      const result = context.sessionManager.submitPrompt(msg);

      return c.json(result, 201);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to submit prompt";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/ai/prompt-queue
   *
   * Get current prompt queue state.
   * Supports optional ?worktree_id=xxx query parameter for filtering.
   */
  app.get("/prompt-queue", (c) => {
    const worktreeId = c.req.query("worktree_id");
    const prompts = context.sessionManager.getPromptQueue(
      typeof worktreeId === "string" && worktreeId.length > 0
        ? (worktreeId as WorktreeId)
        : undefined,
    );
    return c.json({ prompts });
  });

  /**
   * POST /api/ai/prompt-queue/:id/cancel
   *
   * Cancel a queued prompt.
   */
  app.post("/prompt-queue/:id/cancel", (c) => {
    const promptId = c.req.param("id") as PromptId;
    try {
      context.sessionManager.cancelPrompt(promptId);
      return c.json({ success: true, promptId });
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to cancel prompt";
      const isNotFound = e instanceof Error && e.message.includes("not found");
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: isNotFound ? 404 : 500,
      };
      return c.json(errorResponse, isNotFound ? 404 : 500);
    }
  });

  /**
   * GET /api/ai/queue/status
   *
   * Get minimal queue status for UI (session button).
   */
  app.get("/queue/status", (c) => {
    const status = context.sessionManager.getQueueStatus();
    return c.json(status);
  });

  /**
   * GET /api/ai/sessions
   *
   * List all sessions.
   */
  app.get("/sessions", (c) => {
    const sessions = context.sessionManager.listSessions();
    return c.json({ sessions });
  });

  /**
   * GET /api/ai/sessions/:id
   *
   * Get details for a specific session.
   */
  app.get("/sessions/:id", (c) => {
    const sessionId = c.req.param("id") as QraftAiSessionId;
    const session = context.sessionManager.getSession(sessionId);

    if (session === null) {
      const errorResponse: ErrorResponse = {
        error: `Session not found: ${sessionId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    return c.json(session);
  });

  /**
   * GET /api/ai/sessions/:id/stream
   *
   * SSE stream for session progress events.
   */
  app.get("/sessions/:id/stream", async (c) => {
    const sessionId = c.req.param("id") as QraftAiSessionId;
    const session = context.sessionManager.getSession(sessionId);

    if (session === null) {
      const errorResponse: ErrorResponse = {
        error: `Session not found: ${sessionId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Set SSE headers
    return streamSSE(c, async (stream) => {
      const streamOpenedAt = Date.now();
      let firstEventLogged = false;
      // Send initial connection event
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ sessionId }),
      });

      // If session is already completed, send final state
      if (
        session.state === "completed" ||
        session.state === "failed" ||
        session.state === "cancelled"
      ) {
        await stream.writeSSE({
          event: session.state,
          data: JSON.stringify({ sessionId }),
        });
        return;
      }

      // Subscribe to session events
      const eventQueue: AIProgressEvent[] = [];
      let resolveWait: (() => void) | null = null;

      const unsubscribe = context.sessionManager.subscribe(
        sessionId,
        (event) => {
          eventQueue.push(event);
          if (resolveWait !== null) {
            resolveWait();
            resolveWait = null;
          }
        },
      );

      try {
        // Stream events until session is done
        while (true) {
          let timedOutWaiting = false;
          // Wait for events if queue is empty
          if (eventQueue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveWait = resolve;
              // Timeout to check for client disconnect
              setTimeout(() => {
                timedOutWaiting = true;
                resolve();
              }, 5000);
            });
          }

          // Send heartbeat to keep long-lived SSE connections alive
          // when the agent is still thinking and no events are emitted.
          if (timedOutWaiting && eventQueue.length === 0) {
            await stream.writeSSE({
              event: "ping",
              data: JSON.stringify({
                sessionId,
                timestamp: new Date().toISOString(),
              }),
            });
          }

          // Process all queued events
          while (eventQueue.length > 0) {
            const event = eventQueue.shift();
            if (event !== undefined) {
              if (!firstEventLogged) {
                firstEventLogged = true;
                logger.info("first SSE event", {
                  sessionId,
                  type: event.type,
                  elapsedMs: Date.now() - streamOpenedAt,
                });
              }
              await stream.writeSSE({
                event: event.type,
                data: JSON.stringify(event),
              });

              // Check if session is done
              if (
                event.type === "completed" ||
                event.type === "error" ||
                event.type === "cancelled"
              ) {
                return;
              }
            }
          }

          // Check if session state changed externally
          const currentSession = context.sessionManager.getSession(sessionId);
          if (
            currentSession === null ||
            currentSession.state === "completed" ||
            currentSession.state === "failed" ||
            currentSession.state === "cancelled"
          ) {
            return;
          }
        }
      } finally {
        unsubscribe();
      }
    });
  });

  /**
   * POST /api/ai/sessions/:id/cancel
   *
   * Cancel a session.
   */
  app.post("/sessions/:id/cancel", async (c) => {
    const sessionId = c.req.param("id") as QraftAiSessionId;

    try {
      await context.sessionManager.cancel(sessionId);
      return c.json({ success: true, sessionId });
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to cancel session";
      const isNotFound = e instanceof Error && e.message.includes("not found");
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: isNotFound ? 404 : 500,
      };
      return c.json(errorResponse, isNotFound ? 404 : 500);
    }
  });

  return app;
}
