/**
 * Local Prompt API Routes
 *
 * REST endpoints for managing locally stored prompts.
 * Prompts are stored in ~/.local/QraftBox/prompts/ and dispatched
 * to Claude Code agent on demand.
 */

import { Hono } from "hono";
import type {
  PromptStore,
  CreateLocalPromptRequest,
  LocalPromptUpdate,
  DispatchPromptOptions,
  LocalPromptStatus,
} from "../../types/local-prompt";
import type { SessionManager } from "../ai/session-manager";

/**
 * Configuration for local prompt routes
 */
export interface LocalPromptRoutesConfig {
  readonly promptStore: PromptStore;
  readonly sessionManager: SessionManager;
}

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Create local prompt routes
 *
 * Routes:
 * - POST /          - Create a new local prompt
 * - GET /           - List prompts (query: status, limit, offset, search)
 * - GET /:id        - Get prompt by ID
 * - PATCH /:id      - Update prompt
 * - DELETE /:id     - Delete prompt
 * - POST /:id/dispatch  - Dispatch to Claude Code agent
 * - POST /:id/summarize - Generate AI description
 *
 * @param config - Routes configuration with promptStore and sessionManager
 * @returns Hono app with local prompt routes
 */
export function createLocalPromptRoutes(config: LocalPromptRoutesConfig): Hono {
  const app = new Hono();

  /**
   * POST / - Create a new local prompt
   */
  app.post("/", async (c) => {
    try {
      const body = await c.req.json<CreateLocalPromptRequest>();

      if (
        body.prompt === undefined ||
        body.prompt === null ||
        body.prompt.trim().length === 0
      ) {
        const errorResponse: ErrorResponse = {
          error: "Prompt text is required",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      const prompt = await config.promptStore.create({
        prompt: body.prompt,
        context: body.context !== undefined && body.context !== null
          ? { ...body.context, references: body.context.references ?? [] }
          : { references: [] },
        projectPath: body.projectPath ?? "",
      });

      return c.json({ prompt }, 201);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to create prompt";
      const errorResponse: ErrorResponse = { error: errorMessage, code: 500 };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET / - List prompts with optional filtering
   */
  app.get("/", async (c) => {
    try {
      const status = c.req.query("status") as LocalPromptStatus | undefined;
      const limitStr = c.req.query("limit");
      const offsetStr = c.req.query("offset");
      const search = c.req.query("search");

      const limit = limitStr !== undefined ? parseInt(limitStr, 10) : undefined;
      const offset =
        offsetStr !== undefined ? parseInt(offsetStr, 10) : undefined;

      const options: {
        status?: LocalPromptStatus;
        limit?: number;
        offset?: number;
        search?: string;
      } = {};
      if (status !== undefined) options.status = status;
      if (limit !== undefined && !isNaN(limit)) options.limit = limit;
      if (offset !== undefined && !isNaN(offset)) options.offset = offset;
      if (search !== undefined) options.search = search;

      const result = await config.promptStore.list(options);

      return c.json(result);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to list prompts";
      const errorResponse: ErrorResponse = { error: errorMessage, code: 500 };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /:id - Get prompt by ID
   */
  app.get("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const prompt = await config.promptStore.get(id);

      if (prompt === null) {
        const errorResponse: ErrorResponse = {
          error: `Prompt not found: ${id}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      return c.json({ prompt });
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get prompt";
      const errorResponse: ErrorResponse = { error: errorMessage, code: 500 };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * PATCH /:id - Update prompt
   */
  app.patch("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const updates = await c.req.json<LocalPromptUpdate>();

      const existing = await config.promptStore.get(id);
      if (existing === null) {
        const errorResponse: ErrorResponse = {
          error: `Prompt not found: ${id}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      const updated = await config.promptStore.update(id, updates);
      return c.json({ prompt: updated });
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to update prompt";
      const errorResponse: ErrorResponse = { error: errorMessage, code: 500 };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * DELETE /:id - Delete prompt
   */
  app.delete("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const deleted = await config.promptStore.delete(id);

      if (!deleted) {
        const errorResponse: ErrorResponse = {
          error: `Prompt not found: ${id}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      return c.json({ success: true });
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to delete prompt";
      const errorResponse: ErrorResponse = { error: errorMessage, code: 500 };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /:id/dispatch - Dispatch prompt to Claude Code agent
   *
   * Changes status to "dispatching", submits to session manager,
   * then updates with sessionId on success or error on failure.
   */
  app.post("/:id/dispatch", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req
        .json<DispatchPromptOptions>()
        .catch(() => ({}) as DispatchPromptOptions);

      const prompt = await config.promptStore.get(id);
      if (prompt === null) {
        const errorResponse: ErrorResponse = {
          error: `Prompt not found: ${id}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      if (prompt.status !== "pending" && prompt.status !== "failed") {
        const errorResponse: ErrorResponse = {
          error: `Prompt cannot be dispatched (status: ${prompt.status})`,
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Mark as dispatching
      await config.promptStore.update(id, {
        status: "dispatching",
        error: null,
      });

      try {
        // Submit to session manager
        const resumeId =
          typeof body.resumeSessionId === "string" && body.resumeSessionId.length > 0
            ? body.resumeSessionId
            : undefined;
        const result = await config.sessionManager.submit({
          prompt: prompt.prompt,
          context: prompt.context,
          options: {
            projectPath: prompt.projectPath,
            sessionMode: resumeId !== undefined ? "continue" : "new",
            immediate: body.immediate ?? false,
            resumeSessionId: resumeId,
          },
        });

        // Update with session ID
        const updated = await config.promptStore.update(id, {
          status: "dispatched",
          sessionId: result.sessionId,
        });

        return c.json({ prompt: updated, session: result });
      } catch (dispatchError) {
        // Mark as failed
        const errorMessage =
          dispatchError instanceof Error
            ? dispatchError.message
            : "Dispatch failed";
        await config.promptStore.update(id, {
          status: "failed",
          error: errorMessage,
        });
        const errorResponse: ErrorResponse = {
          error: errorMessage,
          code: 500,
        };
        return c.json(errorResponse, 500);
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to dispatch prompt";
      const errorResponse: ErrorResponse = { error: errorMessage, code: 500 };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /:id/summarize - Generate AI description for prompt
   *
   * Uses the session manager to send a lightweight summarization request
   * to Claude Code, then updates the prompt's description field.
   */
  app.post("/:id/summarize", async (c) => {
    try {
      const id = c.req.param("id");
      const prompt = await config.promptStore.get(id);

      if (prompt === null) {
        const errorResponse: ErrorResponse = {
          error: `Prompt not found: ${id}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      // Submit a summarization request to the session manager
      const summarizePrompt = [
        "Summarize the following user prompt in 1-2 short sentences (max 150 characters).",
        "Return ONLY the summary text, no explanation or formatting.",
        "",
        "User prompt:",
        prompt.prompt,
      ].join("\n");

      try {
        const result = await config.sessionManager.submit({
          prompt: summarizePrompt,
          context: { references: [] },
          options: {
            projectPath: prompt.projectPath,
            sessionMode: "new",
            immediate: true,
          },
        });

        // For now, we track the summarization session but don't wait for completion.
        // The description will be updated when the session completes.
        // A future enhancement could poll for results.
        return c.json({
          prompt,
          summarizeSessionId: result.sessionId,
          message: "Summarization session started",
        });
      } catch (summarizeError) {
        // Summarization is non-critical - return prompt as-is
        const errorMessage =
          summarizeError instanceof Error
            ? summarizeError.message
            : "Summarization failed";
        return c.json({
          prompt,
          message: `Summarization failed: ${errorMessage}`,
        });
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to summarize prompt";
      const errorResponse: ErrorResponse = { error: errorMessage, code: 500 };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
