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
  type ListSessionsOptions,
  type SessionSummary,
  type TranscriptEvent,
} from "../claude/session-reader";
import {
  stripSystemTags,
  wrapQraftboxInternalPrompt,
} from "../../utils/strip-system-tags";
import type { SessionMappingStore } from "../ai/session-mapping-store.js";
import type {
  ClaudeSessionId,
  QraftAiSessionId,
  WorktreeId,
} from "../../types/ai.js";
import { AIAgent } from "../../types/ai-agent.js";
import { SessionEnrichmentService } from "../claude/session-enrichment.js";
import {
  generateWorktreeId,
  type SessionManager,
} from "../ai/session-manager.js";
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
import type { ModelConfigStore } from "../model-config/store.js";
import type { AISessionInfo } from "../../types/ai.js";
import { buildAgentAuthEnv } from "../ai/claude-env.js";

interface ClaudeSessionReaderLike {
  listProjects(pathFilter?: string): Promise<ProjectInfo[]>;
  listSessions(options?: ListSessionsOptions): Promise<SessionListResponse>;
  getSession(sessionId: string): Promise<ExtendedSessionEntry | null>;
  readTranscript(
    sessionId: string,
    offset?: number,
    limit?: number,
  ): Promise<{ events: TranscriptEvent[]; total: number } | null>;
  getSessionSummary(sessionId: string): Promise<SessionSummary | null>;
}

interface ClaudeSessionsRouteDependencies {
  readonly sessionReader?: ClaudeSessionReaderLike;
}

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

interface SessionListCacheEntry {
  readonly cachedAtMs: number;
  readonly payload: SessionListResponse;
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
  modelConfigStore?: ModelConfigStore | undefined,
  dependencies?: ClaudeSessionsRouteDependencies,
): Hono {
  const app = new Hono();
  const sessionReader: ClaudeSessionReaderLike =
    dependencies?.sessionReader ??
    new ClaudeSessionReader(undefined, mappingStore);
  const enrichmentService =
    mappingStore !== undefined
      ? new SessionEnrichmentService(mappingStore)
      : undefined;
  const purposeCache = new Map<string, PurposeCacheEntry>();
  const inFlightPurpose = new Map<string, Promise<SessionPurposeResponse>>();
  const sessionListCache = new Map<string, SessionListCacheEntry>();
  const SESSION_LIST_CACHE_TTL_MS = 5000;

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
    outputLanguage: string,
  ): Promise<string> {
    const runner = new SessionRunner({
      cwd: projectPath,
      allowedTools: [],
      mcpServers: {},
      env: buildAgentAuthEnv("anthropics", "cli_auth"),
    });

    let assistantText = "";
    try {
      const prompt = wrapQraftboxInternalPrompt(
        "ai-session-purpose",
        await buildPurposePrompt(intents, outputLanguage),
        "session-purpose-v1",
      );
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
    if (mappingStore !== undefined) {
      const mappedClaudeSessionId = mappingStore.findClaudeSessionIdSqlOnly(
        qraftAiSessionId as QraftAiSessionId,
      );
      if (mappedClaudeSessionId !== undefined) {
        return mappedClaudeSessionId;
      }
    }

    if (sessionManager === undefined) {
      return undefined;
    }

    // Direct lookup (when qraftAiSessionId matches a concrete session row id)
    const direct = sessionManager.getSession(
      qraftAiSessionId as QraftAiSessionId,
    );
    if (direct?.claudeSessionId !== undefined) {
      return direct.claudeSessionId;
    }

    // Fallback: qraftAiSessionId is typically the client session group ID,
    // while actual session rows have distinct generated ids.
    let bestMatch: AISessionInfo | undefined;
    let bestTime = Number.NEGATIVE_INFINITY;
    for (const session of sessionManager.listSessions()) {
      if (
        session.claudeSessionId === undefined ||
        (session.clientSessionId !== qraftAiSessionId &&
          session.id !== qraftAiSessionId)
      ) {
        continue;
      }
      const sessionTime = Date.parse(
        session.completedAt ?? session.startedAt ?? session.createdAt,
      );
      if (sessionTime > bestTime) {
        bestTime = sessionTime;
        bestMatch = session;
      }
    }
    return bestMatch?.claudeSessionId;
  }

  function resolveBestQraftSessionInfo(
    qraftAiSessionId: string,
  ): AISessionInfo | undefined {
    if (sessionManager === undefined) {
      return undefined;
    }

    const direct = sessionManager.getSession(
      qraftAiSessionId as QraftAiSessionId,
    );
    if (direct !== null) {
      return direct;
    }

    let bestMatch: AISessionInfo | undefined;
    let bestTime = Number.NEGATIVE_INFINITY;
    for (const session of sessionManager.listSessions()) {
      if (
        session.clientSessionId !== qraftAiSessionId &&
        session.id !== qraftAiSessionId
      ) {
        continue;
      }
      const sessionTime = Date.parse(
        session.completedAt ?? session.startedAt ?? session.createdAt,
      );
      if (sessionTime > bestTime) {
        bestTime = sessionTime;
        bestMatch = session;
      }
    }
    return bestMatch;
  }

  function buildFallbackTranscriptPayload(qraftAiSessionId: string):
    | {
        events: readonly {
          type: "user" | "assistant";
          timestamp: string;
          content: string;
          raw: Record<string, unknown>;
        }[];
        qraftAiSessionId: string;
        offset: number;
        limit: number;
        total: number;
      }
    | undefined {
    const session = resolveBestQraftSessionInfo(qraftAiSessionId);
    if (session === undefined) {
      return undefined;
    }

    const events: {
      type: "user" | "assistant";
      timestamp: string;
      content: string;
      raw: Record<string, unknown>;
    }[] = [];

    const userContent = stripSystemTags(session.prompt).trim();
    if (userContent.length > 0) {
      events.push({
        type: "user",
        timestamp: session.createdAt,
        content: userContent,
        raw: {
          type: "user",
          message: { role: "user", content: userContent },
          source: "qraftbox-fallback",
        },
      });
    }

    const assistantContent = stripSystemTags(
      session.lastAssistantMessage ?? "",
    ).trim();
    if (assistantContent.length > 0) {
      events.push({
        type: "assistant",
        timestamp:
          session.completedAt ?? session.startedAt ?? session.createdAt,
        content: assistantContent,
        raw: {
          type: "assistant",
          message: { role: "assistant", content: assistantContent },
          source: "qraftbox-fallback",
        },
      });
    }

    if (events.length === 0) {
      return undefined;
    }

    return {
      events,
      qraftAiSessionId,
      offset: 0,
      limit: 200,
      total: events.length,
    };
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
   * - searchInTranscript: Search query against full transcript content
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
      const searchInTranscriptParam = c.req.query("searchInTranscript");
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
            error: `Invalid source value: ${sourceParam}. Must be one of: qraftbox, claude-cli, codex-cli, unknown`,
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

      let searchInTranscript: boolean | undefined;
      if (searchInTranscriptParam !== undefined) {
        if (
          searchInTranscriptParam !== "true" &&
          searchInTranscriptParam !== "false"
        ) {
          const errorResponse: ErrorResponse = {
            error: "searchInTranscript must be 'true' or 'false' when provided",
            code: 400,
          };
          return c.json(errorResponse, 400);
        }
        searchInTranscript = searchInTranscriptParam === "true";
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
      const options: ListSessionsOptions = {};

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
      if (searchInTranscript !== undefined) {
        options.searchInTranscript = searchInTranscript;
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
      // Keep list endpoint responsive: avoid per-session JSONL scans when
      // recovering firstPrompt from system-only index content.
      options.recoverFirstPromptFromJsonl = false;
      // Favor low-latency overview list rendering when index files are absent.
      options.fastListMode = true;

      const cacheKey = JSON.stringify({
        workingDirectoryPrefix: options.workingDirectoryPrefix ?? null,
        source: options.source ?? null,
        branch: options.branch ?? null,
        search: options.search ?? null,
        searchInTranscript: options.searchInTranscript ?? null,
        dateRange: options.dateRange ?? null,
        offset: options.offset ?? 0,
        limit: options.limit ?? 50,
        sortBy: options.sortBy ?? "modified",
        sortOrder: options.sortOrder ?? "desc",
        recoverFirstPromptFromJsonl: options.recoverFirstPromptFromJsonl,
        fastListMode: options.fastListMode,
      });
      const nowMs = Date.now();
      const cached = sessionListCache.get(cacheKey);
      if (cached !== undefined) {
        const cacheAgeMs = nowMs - cached.cachedAtMs;
        if (cacheAgeMs < SESSION_LIST_CACHE_TTL_MS) {
          return c.json(cached.payload);
        }
      }

      // List sessions with filters
      const response: SessionListResponse =
        await sessionReader.listSessions(options);
      const allRuntimeSessions =
        sessionManager !== undefined ? sessionManager.listSessions() : [];
      const completedRuntimeRows =
        sessionManager !== undefined ? sessionManager.listCompletedRows() : [];

      // Strip system tags from firstPrompt/summary before returning
      for (const session of response.sessions) {
        session.firstPrompt = stripSystemTags(session.firstPrompt);
        session.summary = stripSystemTags(session.summary);
      }

      // Normalize mappings so CLI/codex sessions created from QraftBox share
      // the same qraftAiSessionId (client session group ID).
      if (mappingStore !== undefined && sessionManager !== undefined) {
        for (const row of completedRuntimeRows) {
          const clientSessionId = row.clientSessionId;
          const concreteSessionId = row.currentClaudeSessionId;
          if (
            clientSessionId === undefined ||
            concreteSessionId === undefined ||
            concreteSessionId.length === 0 ||
            concreteSessionId.startsWith("pending-")
          ) {
            continue;
          }
          try {
            mappingStore.upsert(
              concreteSessionId,
              row.projectPath,
              (row.worktreeId ?? "unknown") as WorktreeId,
              "qraftbox",
              clientSessionId,
            );
          } catch {
            // Best-effort normalization; keep list endpoint resilient.
          }
        }
      }

      // Enrich sessions with qraftAiSessionId via batch SQLite lookup.
      // Auto-register missing mappings so the client always receives a qraft ID.
      if (enrichmentService !== undefined && response.sessions.length > 0) {
        enrichmentService.enrichSessionsWithQraftIds(response.sessions);
      }

      if (mappingStore !== undefined) {
        const normalizeSessionId = (value: string): string =>
          value.startsWith("codex-session-")
            ? value.slice("codex-session-".length)
            : value;
        for (const session of response.sessions) {
          try {
            const isQraftSource =
              mappingStore.isQraftBoxSession(
                session.sessionId as ClaudeSessionId,
              ) ||
              mappingStore.isQraftBoxSession(
                normalizeSessionId(session.sessionId) as ClaudeSessionId,
              );
            if (isQraftSource) {
              session.source = "qraftbox";
            }
          } catch {
            // Best-effort source normalization.
          }
        }
      }

      // Reconcile Codex sessions created via QraftBox when runtime row still has
      // only pending-* claudeSessionId. In that case, bind the concrete listed
      // codex session back to the clientSessionId by prompt/time proximity.
      if (sessionManager !== undefined) {
        const normalizeText = (value: string): string =>
          stripSystemTags(value).replace(/\s+/g, " ").trim().toLowerCase();

        const codexListedSessions = response.sessions.filter(
          (session) => session.aiAgent === AIAgent.CODEX,
        );

        for (const row of completedRuntimeRows) {
          if (
            row.aiAgent !== AIAgent.CODEX ||
            row.clientSessionId === undefined ||
            row.currentClaudeSessionId === undefined ||
            !row.currentClaudeSessionId.startsWith("pending-")
          ) {
            continue;
          }

          const normalizedPrompt = normalizeText(row.message ?? "");
          if (normalizedPrompt.length === 0) {
            continue;
          }

          const rowTime = new Date(
            row.completedAt ?? row.startedAt ?? row.createdAt,
          ).getTime();

          let bestMatch: ExtendedSessionEntry | undefined;
          let bestDelta = Number.POSITIVE_INFINITY;
          for (const session of codexListedSessions) {
            const sessionPrompt = normalizeText(session.firstPrompt);
            if (sessionPrompt !== normalizedPrompt) {
              continue;
            }
            const sessionTime = new Date(session.modified).getTime();
            const delta = Math.abs(sessionTime - rowTime);
            if (delta < bestDelta) {
              bestDelta = delta;
              bestMatch = session;
            }
          }

          if (bestMatch === undefined || bestDelta > 2 * 60 * 1000) {
            continue;
          }

          bestMatch.qraftAiSessionId = row.clientSessionId;
          bestMatch.source = "qraftbox";
          if (mappingStore !== undefined) {
            try {
              mappingStore.upsert(
                bestMatch.sessionId as ClaudeSessionId,
                row.projectPath,
                (row.worktreeId ?? "unknown") as WorktreeId,
                "qraftbox",
                row.clientSessionId,
              );
            } catch {
              // Best-effort mapping reconciliation.
            }
          }
        }
      }

      // Reconcile active (including running) QraftBox sessions by concrete
      // claudeSessionId so list rows keep Qraft identity in real time.
      if (sessionManager !== undefined) {
        const normalizeSessionId = (value: string): string =>
          value.startsWith("codex-session-")
            ? value.slice("codex-session-".length)
            : value;

        const activeByConcreteClaudeId = new Map<string, AISessionInfo>();
        for (const session of allRuntimeSessions) {
          if (
            session.clientSessionId === undefined ||
            session.claudeSessionId === undefined ||
            session.claudeSessionId.length === 0 ||
            session.claudeSessionId.startsWith("pending-")
          ) {
            continue;
          }
          activeByConcreteClaudeId.set(
            normalizeSessionId(session.claudeSessionId),
            session,
          );
        }

        for (const listed of response.sessions) {
          const concreteId = normalizeSessionId(listed.sessionId);
          const active = activeByConcreteClaudeId.get(concreteId);
          if (active === undefined || active.clientSessionId === undefined) {
            continue;
          }
          listed.qraftAiSessionId = active.clientSessionId;
          listed.source = "qraftbox";
          if (mappingStore !== undefined) {
            try {
              mappingStore.upsert(
                listed.sessionId as ClaudeSessionId,
                listed.projectPath,
                generateWorktreeId(listed.projectPath),
                "qraftbox",
                active.clientSessionId,
              );
            } catch {
              // Best-effort reconciliation.
            }
          }
        }
      }

      const effectiveOffset = options.offset ?? 0;
      const effectiveLimit = options.limit ?? 50;

      // Merge QraftBox-only sessions (completed sessions without CLI counterpart).
      // For paginated follow-up pages (offset > 0), keep reader pagination intact.
      if (sessionManager !== undefined && effectiveOffset === 0) {
        const cliQraftIds = new Set(
          response.sessions.map((session) => session.qraftAiSessionId),
        );
        const normalizeSessionId = (value: string): string => {
          if (value.startsWith("codex-session-")) {
            return value.slice("codex-session-".length);
          }
          return value;
        };
        const normalizeText = (value: string): string =>
          stripSystemTags(value).replace(/\s+/g, " ").trim().toLowerCase();
        const cliSessionIds = new Set(
          response.sessions
            .map((session) => session.sessionId)
            .filter((sessionId) => sessionId.length > 0)
            .map((sessionId) => normalizeSessionId(sessionId)),
        );
        const cliSessionIdsByPromptMinute = new Map<string, string[]>();
        const cliPromptTimeKeys = new Set(
          response.sessions
            .filter((session) => session.source !== "qraftbox")
            .map((session) => {
              const normalizedPrompt = normalizeText(session.firstPrompt);
              const bucketMinute = Math.floor(
                new Date(session.modified).getTime() / 60000,
              );
              const key = `${normalizedPrompt}::${bucketMinute}`;
              const existing = cliSessionIdsByPromptMinute.get(key) ?? [];
              existing.push(session.sessionId);
              cliSessionIdsByPromptMinute.set(key, existing);
              return key;
            }),
        );
        const cliSessionIdsToDrop = new Set<string>();

        let addedQraftOnlyCount = 0;

        // Group by clientSessionId, keeping newest per group
        const latestByGroup = new Map<string, AiSessionRow>();
        for (const row of completedRuntimeRows) {
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
          if (
            row.currentClaudeSessionId !== undefined &&
            row.currentClaudeSessionId.length > 0 &&
            cliSessionIds.has(normalizeSessionId(row.currentClaudeSessionId))
          ) {
            continue;
          }
          if (
            row.aiAgent === AIAgent.CODEX &&
            row.currentClaudeSessionId !== undefined &&
            row.currentClaudeSessionId.startsWith("pending-")
          ) {
            const normalizedPrompt = normalizeText(row.message ?? "");
            const rowBucketMinute = Math.floor(
              new Date(
                row.completedAt ?? row.startedAt ?? row.createdAt,
              ).getTime() / 60000,
            );
            const matchKey = `${normalizedPrompt}::${rowBucketMinute}`;
            if (cliPromptTimeKeys.has(matchKey)) {
              const matchedCliSessionIds =
                cliSessionIdsByPromptMinute.get(matchKey) ?? [];
              if (matchedCliSessionIds.length > 0) {
                const matchedSessionId = matchedCliSessionIds[0];
                if (matchedSessionId !== undefined) {
                  cliSessionIdsToDrop.add(matchedSessionId);
                }
              }
            }
          }

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
            aiAgent: row.aiAgent ?? AIAgent.CLAUDE,
            hasUserPrompt: true,
          };

          response.sessions.push(extended);
          addedQraftOnlyCount += 1;
        }

        if (cliSessionIdsToDrop.size > 0) {
          response.sessions = response.sessions.filter(
            (session) => !cliSessionIdsToDrop.has(session.sessionId),
          );
        }

        // Re-sort the combined list
        response.sessions.sort((sessionA, sessionB) => {
          return (
            new Date(sessionB.modified).getTime() -
            new Date(sessionA.modified).getTime()
          );
        });

        // Respect requested page size after merge.
        response.sessions = response.sessions.slice(0, effectiveLimit);
        response.total += addedQraftOnlyCount;
        response.offset = 0;
        response.limit = effectiveLimit;
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

      // Enrich list rows with model/profile metadata from runtime session store.
      // This allows UI to display which profile/model was used per session.
      if (sessionManager !== undefined) {
        const latestRuntimeByGroupId = new Map<string, AISessionInfo>();
        const runtimeTimestampMs = (session: AISessionInfo): number =>
          new Date(
            session.completedAt ?? session.startedAt ?? session.createdAt,
          ).getTime();

        for (const runtimeSession of allRuntimeSessions) {
          const groupId = runtimeSession.clientSessionId ?? runtimeSession.id;
          const existing = latestRuntimeByGroupId.get(groupId);
          if (
            existing === undefined ||
            runtimeTimestampMs(runtimeSession) > runtimeTimestampMs(existing)
          ) {
            latestRuntimeByGroupId.set(groupId, runtimeSession);
          }
        }

        for (const listedSession of response.sessions) {
          const runtime = latestRuntimeByGroupId.get(
            listedSession.qraftAiSessionId,
          );
          if (runtime === undefined) {
            continue;
          }
          listedSession.modelProfileId = runtime.modelProfileId;
          listedSession.modelVendor = runtime.modelVendor;
          listedSession.modelName = runtime.modelName;
        }
      }

      sessionListCache.set(cacheKey, {
        cachedAtMs: nowMs,
        payload: response,
      });

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
      const fallback = buildFallbackTranscriptPayload(qraftId);
      if (fallback !== undefined) {
        return c.json(fallback);
      }
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
        const fallback = buildFallbackTranscriptPayload(qraftId);
        if (fallback !== undefined) {
          return c.json(fallback);
        }
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
          const purposeOutputLanguage =
            modelConfigStore?.resolveLanguageForOperation(
              "ai_session_purpose",
            ) ?? "English";
          const purpose = await summarizePurposeWithLlm(
            session.projectPath,
            intents,
            purposeOutputLanguage,
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
