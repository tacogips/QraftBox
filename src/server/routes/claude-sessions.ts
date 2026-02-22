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
import type { SessionMappingStore } from "../ai/session-mapping-store.js";
import type { QraftAiSessionId } from "../../types/ai.js";
import { SessionEnrichmentService } from "../claude/session-enrichment.js";
import type { SessionManager } from "../ai/session-manager.js";
import type { AiSessionRow } from "../ai/ai-session-store.js";
import {
  buildPurposePrompt,
  compactIntentInputs,
  createIntentSignature,
  extractUserIntents,
  normalizePurposeText,
  shouldRefreshPurpose,
} from "../claude/session-purpose.js";
import { SessionRunner } from "claude-code-agent/src/sdk/index.js";

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

interface SessionPurposeResponse {
  readonly purpose: string;
  readonly updatedAt: string;
  readonly source: "llm" | "fallback";
}

interface PurposeCacheEntry {
  readonly signature: string;
  readonly intentCount: number;
  readonly purpose: string;
  readonly updatedAt: string;
  readonly source: "llm" | "fallback";
}

function wrapInternalPurposePrompt(content: string): string {
  return `<qraftbox-internal-prompt label="ai-session-purpose" anchor="session-purpose-v1">
${content}
</qraftbox-internal-prompt>`;
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
 * @param mappingStore - Optional session mapping store for enriching sessions with qraftAiSessionId
 * @param sessionManager - Optional session manager for merging QraftBox-only sessions
 * @returns Hono app with Claude sessions routes mounted
 */
export function createClaudeSessionsRoutes(
  mappingStore?: SessionMappingStore | undefined,
  sessionManager?: SessionManager | undefined,
): Hono {
  const app = new Hono();
  const sessionReader = new ClaudeSessionReader(undefined, mappingStore);
  const enrichmentService =
    mappingStore !== undefined
      ? new SessionEnrichmentService(mappingStore)
      : undefined;
  const purposeCache = new Map<string, PurposeCacheEntry>();
  const inFlightPurpose = new Map<string, Promise<SessionPurposeResponse>>();

  function extractAssistantTextFromMessage(msg: unknown): string | undefined {
    if (typeof msg !== "object" || msg === null || !("type" in msg)) {
      return undefined;
    }
    const rawMsg = msg as {
      type?: string;
      message?: { role?: string; content?: unknown };
      content?: unknown;
    };
    if (rawMsg.type !== "assistant") {
      return undefined;
    }

    const nestedContent = rawMsg.message?.content;
    if (typeof nestedContent === "string" && nestedContent.trim().length > 0) {
      return nestedContent.trim();
    }
    if (Array.isArray(nestedContent)) {
      const textParts: string[] = [];
      for (const block of nestedContent) {
        if (
          typeof block === "object" &&
          block !== null &&
          "text" in block &&
          typeof (block as { text: unknown }).text === "string"
        ) {
          textParts.push((block as { text: string }).text);
        }
      }
      const joined = textParts.join(" ").trim();
      return joined.length > 0 ? joined : undefined;
    }
    if (
      typeof rawMsg.content === "string" &&
      rawMsg.content.trim().length > 0
    ) {
      return rawMsg.content.trim();
    }
    return undefined;
  }

  async function summarizePurposeWithLlm(
    projectPath: string,
    intents: readonly string[],
  ): Promise<string> {
    const runner = new SessionRunner({
      cwd: projectPath,
      allowedTools: [],
      mcpServers: {},
    });

    let assistantText = "";
    try {
      const prompt = wrapInternalPurposePrompt(buildPurposePrompt(intents));
      const session = await runner.startSession({ prompt });
      session.on("message", (msg: unknown) => {
        const extracted = extractAssistantTextFromMessage(msg);
        if (extracted !== undefined && extracted.length > 0) {
          assistantText = extracted;
        }
      });

      for await (const _msg of session.messages()) {
      }
      const result = await session.waitForCompletion();
      if (!result.success) {
        const errorMessage =
          result.error?.message ?? "Purpose summarization failed";
        throw new Error(errorMessage);
      }
    } finally {
      await runner.close();
    }

    const normalized = normalizePurposeText(assistantText);
    if (normalized.length === 0) {
      throw new Error("Purpose summarization returned empty text");
    }
    return normalized;
  }

  /**
   * Resolve a qraftAiSessionId to a Claude session UUID via the mapping store.
   * Returns undefined if no mapping exists.
   */
  function resolveClaudeSessionId(
    qraftAiSessionId: string,
  ): string | undefined {
    if (mappingStore === undefined) {
      return undefined;
    }
    return mappingStore.findClaudeSessionId(
      qraftAiSessionId as QraftAiSessionId,
    );
  }

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

      // Enrich sessions with qraftAiSessionId via batch SQLite lookup.
      // Auto-register missing mappings so the client always receives a qraft ID.
      if (enrichmentService !== undefined && response.sessions.length > 0) {
        enrichmentService.enrichSessionsWithQraftIds(response.sessions);
      }

      // Merge QraftBox-only sessions (completed sessions without CLI counterpart)
      if (sessionManager !== undefined) {
        const cliQraftIds = new Set(
          response.sessions.map((session) => session.qraftAiSessionId),
        );

        const completedRows = sessionManager.listCompletedRows();

        // Group by clientSessionId, keeping newest per group
        const latestByGroup = new Map<string, AiSessionRow>();
        for (const row of completedRows) {
          const groupKey = row.clientSessionId ?? row.id;
          const existing = latestByGroup.get(groupKey);
          if (existing === undefined) {
            latestByGroup.set(groupKey, row);
            continue;
          }
          const existingTime = new Date(
            existing.completedAt ?? existing.createdAt,
          ).getTime();
          const candidateTime = new Date(
            row.completedAt ?? row.createdAt,
          ).getTime();
          if (candidateTime > existingTime) {
            latestByGroup.set(groupKey, row);
          }
        }

        for (const row of latestByGroup.values()) {
          // Skip if CLI already has this session
          const qraftId = row.clientSessionId ?? row.id;
          if (cliQraftIds.has(qraftId as QraftAiSessionId)) continue;

          // Apply workingDirectoryPrefix filter
          if (
            options.workingDirectoryPrefix !== undefined &&
            row.projectPath.length > 0
          ) {
            if (!row.projectPath.startsWith(options.workingDirectoryPrefix))
              continue;
          }

          // Apply search filter
          if (options.search !== undefined) {
            const searchLower = options.search.toLowerCase();
            const promptLower = stripSystemTags(
              row.message ?? "",
            ).toLowerCase();
            const assistantLower = stripSystemTags(
              row.lastAssistantMessage ?? "",
            ).toLowerCase();
            if (
              !promptLower.includes(searchLower) &&
              !assistantLower.includes(searchLower)
            )
              continue;
          }

          // Convert to ExtendedSessionEntry
          const extended: ExtendedSessionEntry = {
            sessionId: row.id,
            fullPath: "",
            fileMtime: new Date(
              row.completedAt ?? row.startedAt ?? row.createdAt,
            ).getTime(),
            firstPrompt: stripSystemTags(row.message ?? ""),
            summary: row.lastAssistantMessage
              ? stripSystemTags(row.lastAssistantMessage).slice(0, 200)
              : "",
            messageCount: 0,
            created: row.createdAt,
            modified: row.completedAt ?? row.startedAt ?? row.createdAt,
            gitBranch: "",
            projectPath: row.projectPath,
            isSidechain: false,
            source: "qraftbox",
            projectEncoded: "",
            qraftAiSessionId: (row.clientSessionId ??
              row.id) as QraftAiSessionId,
            hasUserPrompt: true,
          };

          response.sessions.push(extended);
        }

        // Re-sort the combined list
        response.sessions.sort((sessionA, sessionB) => {
          return (
            new Date(sessionB.modified).getTime() -
            new Date(sessionA.modified).getTime()
          );
        });

        // Update total
        response.total = response.sessions.length;
      }

      // Apply purpose override only for QraftBox-originated sessions.
      // Claude CLI-originated sessions keep their first user prompt as purpose.
      if (sessionManager !== undefined) {
        for (const session of response.sessions) {
          if (session.source !== "qraftbox") {
            continue;
          }
          const computedPurpose = sessionManager.getSessionPurpose(
            session.qraftAiSessionId,
          );
          if (computedPurpose === undefined || computedPurpose.length === 0) {
            continue;
          }
          session.firstPrompt = computedPurpose;
        }
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
   * Get a specific session by qraftAiSessionId.
   * Resolves qraftAiSessionId to Claude UUID internally.
   */
  app.get("/sessions/:id", async (c) => {
    const qraftId = c.req.param("id");

    if (!qraftId || qraftId.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Session ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Resolve qraftAiSessionId to Claude UUID
      const claudeSessionId = resolveClaudeSessionId(qraftId);
      if (claudeSessionId === undefined) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${qraftId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      const session: ExtendedSessionEntry | null =
        await sessionReader.getSession(claudeSessionId);

      if (session === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${qraftId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      session.firstPrompt = stripSystemTags(session.firstPrompt);
      session.summary = stripSystemTags(session.summary);

      // Overwrite with authoritative mapping store value
      session.qraftAiSessionId = qraftId as QraftAiSessionId;

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
   * Get transcript events for a specific session by qraftAiSessionId.
   *
   * Query parameters:
   * - offset: Skip first N events (default: 0)
   * - limit: Return at most N events (default: 200, max: 1000)
   */
  app.get("/sessions/:id/transcript", async (c) => {
    const qraftId = c.req.param("id");

    if (!qraftId || qraftId.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Session ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Resolve qraftAiSessionId to Claude UUID
    const claudeSessionId = resolveClaudeSessionId(qraftId);
    if (claudeSessionId === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Session not found: ${qraftId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
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
        claudeSessionId,
        offset,
        limit,
      );

      if (result === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${qraftId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      return c.json({
        events: result.events,
        qraftAiSessionId: qraftId,
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
   * GET /api/claude/sessions/:id/purpose
   *
   * Generate a concise session purpose from user intent messages.
   * Accepts qraftAiSessionId as :id param.
   */
  app.get("/sessions/:id/purpose", async (c) => {
    const qraftId = c.req.param("id");

    if (!qraftId || qraftId.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Session ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const claudeSessionId = resolveClaudeSessionId(qraftId);
    if (claudeSessionId === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Session not found: ${qraftId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    try {
      const session = await sessionReader.getSession(claudeSessionId);
      if (session === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${qraftId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      const transcript = await sessionReader.readTranscript(
        claudeSessionId,
        0,
        1200,
      );
      if (transcript === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${qraftId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      const intents = compactIntentInputs(
        extractUserIntents(transcript.events),
      );
      const signature = createIntentSignature(intents);

      const cached = purposeCache.get(qraftId);
      if (
        cached !== undefined &&
        !shouldRefreshPurpose(cached.intentCount, intents.length)
      ) {
        return c.json({
          purpose: cached.purpose,
          updatedAt: cached.updatedAt,
          source: cached.source,
        } satisfies SessionPurposeResponse);
      }

      const fallbackPurpose = normalizePurposeText(
        session.firstPrompt || session.summary || "No purpose available",
      );

      const existingInFlight = inFlightPurpose.get(qraftId);
      if (existingInFlight !== undefined) {
        const inFlightResult = await existingInFlight;
        return c.json(inFlightResult);
      }

      if (intents.length === 0) {
        const fallbackResponse: SessionPurposeResponse = {
          purpose:
            fallbackPurpose.length > 0
              ? fallbackPurpose
              : "No purpose available",
          updatedAt: new Date().toISOString(),
          source: "fallback",
        };
        purposeCache.set(qraftId, {
          ...fallbackResponse,
          signature,
          intentCount: intents.length,
        });
        return c.json(fallbackResponse);
      }

      const summarizePromise = (async (): Promise<SessionPurposeResponse> => {
        try {
          const purpose = await summarizePurposeWithLlm(
            session.projectPath,
            intents,
          );
          const response: SessionPurposeResponse = {
            purpose,
            updatedAt: new Date().toISOString(),
            source: "llm",
          };
          purposeCache.set(qraftId, {
            ...response,
            signature,
            intentCount: intents.length,
          });
          return response;
        } catch {
          const response: SessionPurposeResponse = {
            purpose:
              fallbackPurpose.length > 0
                ? fallbackPurpose
                : "No purpose available",
            updatedAt: new Date().toISOString(),
            source: "fallback",
          };
          purposeCache.set(qraftId, {
            ...response,
            signature,
            intentCount: intents.length,
          });
          return response;
        } finally {
          inFlightPurpose.delete(qraftId);
        }
      })();

      inFlightPurpose.set(qraftId, summarizePromise);
      const purposeResponse = await summarizePromise;
      return c.json(purposeResponse);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to generate session purpose";
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
   * Accepts qraftAiSessionId as :id param.
   */
  app.get("/sessions/:id/summary", async (c) => {
    const qraftId = c.req.param("id");

    if (!qraftId || qraftId.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Session ID is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Resolve qraftAiSessionId to Claude UUID
    const claudeSessionId = resolveClaudeSessionId(qraftId);
    if (claudeSessionId === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Session not found: ${qraftId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    try {
      const summary: SessionSummary | null =
        await sessionReader.getSessionSummary(claudeSessionId);

      if (summary === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${qraftId}`,
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
   * Resume a session with an optional prompt.
   * Accepts qraftAiSessionId as :id param.
   * Currently returns instructions - actual session spawning to be implemented later.
   *
   * Request body:
   * - prompt (optional): Additional prompt to send when resuming
   */
  app.post("/sessions/:id/resume", async (c) => {
    const qraftId = c.req.param("id");

    if (!qraftId || qraftId.length === 0) {
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
      // Resolve qraftAiSessionId to Claude UUID
      const claudeSessionId = resolveClaudeSessionId(qraftId);
      if (claudeSessionId === undefined) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${qraftId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      // Verify session exists
      const session: ExtendedSessionEntry | null =
        await sessionReader.getSession(claudeSessionId);

      if (session === null) {
        const errorResponse: ErrorResponse = {
          error: `Session not found: ${qraftId}`,
          code: 404,
        };
        return c.json(errorResponse, 404);
      }

      // Return instructions for resuming the session
      const instructions = [
        `To resume session ${qraftId}:`,
        `1. Navigate to: ${session.projectPath}`,
        `2. Run: claude-code resume ${claudeSessionId}`,
      ];

      if (prompt) {
        instructions.push(`3. With prompt: ${prompt}`);
      }

      const response: ResumeSessionResponse = {
        sessionId: qraftId,
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
