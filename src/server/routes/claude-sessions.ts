/**
 * Claude Sessions API Routes
 *
 * Provides REST API endpoints for browsing and managing Claude Code sessions.
 */

import { Hono } from "hono";
import type {
  ProjectInfo,
  SessionListResponse,
  ExtendedSessionEntry,
  SessionSource,
} from "../../types/claude-session";
import { isSessionSource } from "../../types/claude-session";
import {
  ClaudeSessionReader,
  type SessionSummary,
} from "../claude/session-reader";
import { stripSystemTags } from "../../utils/strip-system-tags";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Resume session response
 */
interface ResumeSessionResponse {
  readonly sessionId: string;
  readonly instructions: string;
  readonly prompt?: string | undefined;
}

/**
 * Create Claude sessions routes
 *
 * Routes:
 * - GET /api/claude/projects - List all Claude projects
 * - GET /api/claude/sessions - List sessions with filtering
 * - GET /api/claude/sessions/:id - Get specific session
 * - GET /api/claude/sessions/:id/transcript - Get session transcript events
 * - GET /api/claude/sessions/:id/summary - Get session summary with tool usage and tasks
 * - POST /api/claude/sessions/:id/resume - Resume a session
 *
 * @returns Hono app with Claude sessions routes mounted
 */
export function createClaudeSessionsRoutes(): Hono {
  const app = new Hono();
  const sessionReader = new ClaudeSessionReader();

  /**
   * GET /api/claude/projects
   *
   * List all Claude projects with session counts and last modified timestamps.
   */
  app.get("/projects", async (c) => {
    try {
      const projects: ProjectInfo[] = await sessionReader.listProjects();
      return c.json(projects);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to list projects";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/claude/sessions
   *
   * List sessions with optional filtering and pagination.
   *
   * Query parameters:
   * - workingDirectoryPrefix: Filter by working directory prefix
   * - source: Filter by session source (qraftbox, claude-cli, unknown)
   * - branch: Filter by git branch
   * - search: Search in firstPrompt and summary
   * - dateFrom: Start date (ISO 8601)
   * - dateTo: End date (ISO 8601)
   * - offset: Pagination offset (default: 0)
   * - limit: Pagination limit (default: 50)
   * - sortBy: Sort field (modified, created)
   * - sortOrder: Sort order (asc, desc)
   */
  app.get("/sessions", async (c) => {
    try {
      // Parse query parameters
      const workingDirectoryPrefix = c.req.query("workingDirectoryPrefix");
      const sourceParam = c.req.query("source");
      const branch = c.req.query("branch");
      const search = c.req.query("search");
      const dateFrom = c.req.query("dateFrom");
      const dateTo = c.req.query("dateTo");
      const offsetParam = c.req.query("offset");
      const limitParam = c.req.query("limit");
      const sortByParam = c.req.query("sortBy");
      const sortOrderParam = c.req.query("sortOrder");

      // Validate source parameter
      let source: SessionSource | undefined;
      if (sourceParam !== undefined) {
        if (!isSessionSource(sourceParam)) {
          const errorResponse: ErrorResponse = {
            error: `Invalid source value: ${sourceParam}. Must be one of: qraftbox, claude-cli, unknown`,
            code: 400,
          };
          return c.json(errorResponse, 400);
        }
        source = sourceParam;
      }

      // Parse numeric parameters
      let offset: number | undefined;
      if (offsetParam !== undefined) {
        const parsed = parseInt(offsetParam, 10);
        if (isNaN(parsed) || parsed < 0) {
          const errorResponse: ErrorResponse = {
            error: "offset must be a non-negative integer",
            code: 400,
          };
          return c.json(errorResponse, 400);
        }
        offset = parsed;
      }

      let limit: number | undefined;
      if (limitParam !== undefined) {
        const parsed = parseInt(limitParam, 10);
        if (isNaN(parsed) || parsed <= 0) {
          const errorResponse: ErrorResponse = {
            error: "limit must be a positive integer",
            code: 400,
          };
          return c.json(errorResponse, 400);
        }
        limit = parsed;
      }

      // Validate sortBy parameter
      let sortBy: "modified" | "created" | undefined;
      if (sortByParam !== undefined) {
        if (sortByParam !== "modified" && sortByParam !== "created") {
          const errorResponse: ErrorResponse = {
            error: `Invalid sortBy value: ${sortByParam}. Must be one of: modified, created`,
            code: 400,
          };
          return c.json(errorResponse, 400);
        }
        sortBy = sortByParam;
      }

      // Validate sortOrder parameter
      let sortOrder: "asc" | "desc" | undefined;
      if (sortOrderParam !== undefined) {
        if (sortOrderParam !== "asc" && sortOrderParam !== "desc") {
          const errorResponse: ErrorResponse = {
            error: `Invalid sortOrder value: ${sortOrderParam}. Must be one of: asc, desc`,
            code: 400,
          };
          return c.json(errorResponse, 400);
        }
        sortOrder = sortOrderParam;
      }

      // Build date range filter - only include if at least one value is defined
      let dateRange: { from?: string; to?: string } | undefined;
      if (dateFrom !== undefined && dateTo !== undefined) {
        dateRange = { from: dateFrom, to: dateTo };
      } else if (dateFrom !== undefined) {
        dateRange = { from: dateFrom };
      } else if (dateTo !== undefined) {
        dateRange = { to: dateTo };
      }

      // Build options object with only defined values
      const options: {
        workingDirectoryPrefix?: string;
        source?: SessionSource;
        branch?: string;
        search?: string;
        dateRange?: { from?: string; to?: string };
        offset?: number;
        limit?: number;
        sortBy?: "modified" | "created";
        sortOrder?: "asc" | "desc";
      } = {};

      if (workingDirectoryPrefix !== undefined) {
        options.workingDirectoryPrefix = workingDirectoryPrefix;
      }
      if (source !== undefined) {
        options.source = source;
      }
      if (branch !== undefined) {
        options.branch = branch;
      }
      if (search !== undefined) {
        options.search = search;
      }
      if (dateRange !== undefined) {
        options.dateRange = dateRange;
      }
      if (offset !== undefined) {
        options.offset = offset;
      }
      if (limit !== undefined) {
        options.limit = limit;
      }
      if (sortBy !== undefined) {
        options.sortBy = sortBy;
      }
      if (sortOrder !== undefined) {
        options.sortOrder = sortOrder;
      }

      // List sessions with filters
      const response: SessionListResponse =
        await sessionReader.listSessions(options);

      // Strip system tags from firstPrompt/summary before returning
      for (const session of response.sessions) {
        session.firstPrompt = stripSystemTags(session.firstPrompt);
        session.summary = stripSystemTags(session.summary);
      }

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to list sessions";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/claude/sessions/:id
   *
   * Get a specific session by ID.
   */
  app.get("/sessions/:id", async (c) => {
    const sessionId = c.req.param("id");

    if (!sessionId || sessionId.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Session ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      const session: ExtendedSessionEntry | null =
        await sessionReader.getSession(sessionId);

      if (session === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${sessionId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      session.firstPrompt = stripSystemTags(session.firstPrompt);
      session.summary = stripSystemTags(session.summary);
      return c.json(session);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get session";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/claude/sessions/:id/transcript
   *
   * Get transcript events for a specific session.
   *
   * Query parameters:
   * - offset: Skip first N events (default: 0)
   * - limit: Return at most N events (default: 200, max: 1000)
   */
  app.get("/sessions/:id/transcript", async (c) => {
    const sessionId = c.req.param("id");

    if (!sessionId || sessionId.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Session ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Parse query parameters
    const offsetParam = c.req.query("offset");
    const limitParam = c.req.query("limit");

    let offset = 0;
    if (offsetParam !== undefined) {
      const parsed = parseInt(offsetParam, 10);
      if (isNaN(parsed) || parsed < 0) {
        const errorResponse: ErrorResponse = {
          error: "offset must be a non-negative integer",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }
      offset = parsed;
    }

    let limit = 200;
    if (limitParam !== undefined) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        const errorResponse: ErrorResponse = {
          error: "limit must be a positive integer",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }
      if (parsed > 1000) {
        const errorResponse: ErrorResponse = {
          error: "limit must not exceed 1000",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }
      limit = parsed;
    }

    try {
      const result = await sessionReader.readTranscript(
        sessionId,
        offset,
        limit,
      );

      if (result === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${sessionId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      return c.json({
        events: result.events,
        sessionId,
        offset,
        limit,
        total: result.total,
      });
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to read transcript";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/claude/sessions/:id/summary
   *
   * Get session summary with tool usage, tasks, and file modifications.
   */
  app.get("/sessions/:id/summary", async (c) => {
    const sessionId = c.req.param("id");

    if (!sessionId || sessionId.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Session ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      const summary: SessionSummary | null =
        await sessionReader.getSessionSummary(sessionId);

      if (summary === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${sessionId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      return c.json(summary);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get session summary";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /api/claude/sessions/:id/resume
   *
   * Resume a Claude session with an optional prompt.
   * Currently returns instructions - actual session spawning to be implemented later.
   *
   * Request body:
   * - prompt (optional): Additional prompt to send when resuming
   */
  app.post("/sessions/:id/resume", async (c) => {
    const sessionId = c.req.param("id");

    if (!sessionId || sessionId.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Session ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Parse request body
    let requestBody: unknown;
    try {
      requestBody = await c.req.json();
    } catch {
      // Allow empty body
      requestBody = {};
    }

    // Validate request body structure
    if (typeof requestBody !== "object" || requestBody === null) {
      const errorResponse: ErrorResponse = {
        error: "Request body must be a JSON object",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Extract optional prompt
    const body = requestBody as Record<string, unknown>;
    let prompt: string | undefined;

    if ("prompt" in body) {
      if (typeof body["prompt"] !== "string") {
        const errorResponse: ErrorResponse = {
          error: "prompt must be a string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }
      prompt = body["prompt"];
    }

    try {
      // Verify session exists
      const session: ExtendedSessionEntry | null =
        await sessionReader.getSession(sessionId);

      if (session === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${sessionId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      // Return instructions for resuming the session
      // Actual session spawning will be implemented in a future task
      const instructions = [
        `To resume session ${sessionId}:`,
        `1. Navigate to: ${session.projectPath}`,
        `2. Run: claude-code resume ${sessionId}`,
      ];

      if (prompt) {
        instructions.push(`3. With prompt: ${prompt}`);
      }

      const response: ResumeSessionResponse = {
        sessionId,
        instructions: instructions.join("\n"),
        prompt,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to resume session";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
