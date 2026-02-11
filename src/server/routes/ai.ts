/**
 * AI API Routes
 *
 * REST and SSE endpoints for AI agent integration.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type {
  AIPromptRequest,
  AIProgressEvent,
  AIPromptMessage,
} from "../../types/ai";
import { validateAIPromptRequest } from "../../types/ai";
import type { SessionManager } from "../ai/session-manager";
import type { PromptStore } from "../../types/local-prompt";
import { createLogger } from "../logger.js";

/**
 * Server context for AI routes
 */
export interface AIServerContext {
  readonly projectPath: string;
  readonly sessionManager: SessionManager;
  readonly promptStore?: PromptStore | undefined;
}

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Subscribe to session events and sync prompt status on terminal events.
 * Fire-and-forget - errors are silently ignored.
 */
function syncPromptWithSession(
  sessionManager: SessionManager,
  promptStore: PromptStore,
  sessionId: string,
  promptId: string,
): void {
  const unsubscribe = sessionManager.subscribe(sessionId, (event) => {
    if (event.type === "completed") {
      void promptStore
        .update(promptId, { status: "completed" })
        .catch(() => {});
      unsubscribe();
    } else if (event.type === "error") {
      const errorData = event.data as { message?: string };
      void promptStore
        .update(promptId, {
          status: "failed",
          error:
            typeof errorData.message === "string"
              ? errorData.message
              : "Session failed",
        })
        .catch(() => {});
      unsubscribe();
    } else if (event.type === "cancelled") {
      void promptStore
        .update(promptId, { status: "cancelled" })
        .catch(() => {});
      unsubscribe();
    }
  });
}

/**
 * Create AI routes
 *
 * Routes:
 * - POST /api/ai/prompt - Submit a prompt
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
   * POST /api/ai/prompt
   *
   * Submit a prompt for execution.
   */
  app.post("/prompt", async (c) => {
    try {
      const body = await c.req.json<AIPromptRequest>();

      // Ensure projectPath is set
      const request: AIPromptRequest = {
        ...body,
        options: {
          ...body.options,
          projectPath: body.options.projectPath || context.projectPath,
        },
      };

      // Validate request
      const validation = validateAIPromptRequest(request);
      if (!validation.valid) {
        const errorResponse: ErrorResponse = {
          error: validation.error ?? "Invalid request",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Auto-persist prompt to local store for crash recovery
      let localPromptId: string | undefined;
      if (context.promptStore !== undefined) {
        try {
          const localPrompt = await context.promptStore.create({
            prompt: request.prompt,
            context: request.context,
            projectPath: request.options.projectPath,
          });
          localPromptId = localPrompt.id;
          await context.promptStore.update(localPromptId, {
            status: "dispatching",
          });
        } catch {
          // Non-critical: prompt persistence failure should not block execution
        }
      }

      try {
        // Submit to session manager
        const result = await context.sessionManager.submit(request);

        // Update prompt with dispatch session ID and subscribe for completion sync
        if (context.promptStore !== undefined && localPromptId !== undefined) {
          try {
            await context.promptStore.update(localPromptId, {
              status: "dispatched",
              dispatchSessionId: result.sessionId,
            });
          } catch {
            // Non-critical
          }

          // Subscribe to session events for prompt status sync
          syncPromptWithSession(
            context.sessionManager,
            context.promptStore,
            result.sessionId,
            localPromptId,
          );
        }

        return c.json(result);
      } catch (submitError) {
        // Mark prompt as failed if dispatch failed
        if (context.promptStore !== undefined && localPromptId !== undefined) {
          const errorMessage =
            submitError instanceof Error
              ? submitError.message
              : "Failed to submit prompt";
          void context.promptStore
            .update(localPromptId, {
              status: "failed",
              error: errorMessage,
            })
            .catch(() => {});
        }
        throw submitError;
      }
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
        session_id:
          typeof body.session_id === "string" && body.session_id.length > 0
            ? body.session_id
            : null,
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
        ? worktreeId
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
    const promptId = c.req.param("id");
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
    const sessionId = c.req.param("id");
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
    const sessionId = c.req.param("id");
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
    const sessionId = c.req.param("id");

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
