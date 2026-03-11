import {
  type AIPromptContext,
  generateQraftAiSessionId,
  type AISessionSubmitResult,
  type QraftAiSessionId,
} from "../../../src/types/ai";
import type {
  ExtendedSessionEntry,
  SessionFilters,
  SessionListResponse,
} from "../../../src/types/claude-session";
import { resolveFetchImplementation } from "./fetch";

export interface PromptQueueItem {
  readonly id: string;
  readonly message: string;
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
  readonly claude_session_id?: string | undefined;
  readonly current_activity?: string | undefined;
  readonly error?: string | undefined;
  readonly created_at: string;
  readonly project_path: string;
  readonly worktree_id: string;
  readonly qraft_ai_session_id?: QraftAiSessionId | undefined;
}

export interface AISessionInfo {
  readonly id: string;
  readonly state: string;
  readonly prompt: string;
  readonly projectPath: string;
  readonly createdAt: string;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly worktreeId?: string | undefined;
  readonly context: unknown;
  readonly lastAssistantMessage?: string | undefined;
  readonly currentActivity?: string | undefined;
  readonly error?: string | undefined;
  readonly clientSessionId?: QraftAiSessionId | undefined;
}

export interface AiSessionTranscriptEvent {
  readonly type: string;
  readonly uuid?: string | undefined;
  readonly timestamp?: string | undefined;
  readonly content?: unknown;
  readonly raw: Record<string, unknown>;
}

export interface AiSessionTranscriptResponse {
  readonly events: readonly AiSessionTranscriptEvent[];
  readonly qraftAiSessionId: QraftAiSessionId;
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
}

export interface AiSessionsApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface SubmitPromptInput {
  readonly runImmediately: boolean;
  readonly message: string;
  readonly projectPath: string;
  readonly qraftAiSessionId?: QraftAiSessionId | undefined;
  readonly forceNewSession?: boolean | undefined;
  readonly modelProfileId?: string | undefined;
  readonly context: AIPromptContext;
}

export interface AiSessionsApiClient {
  fetchPromptQueue(options?: {
    readonly projectPath?: string | undefined;
  }): Promise<readonly PromptQueueItem[]>;
  fetchActiveSessions(options?: {
    readonly projectPath?: string | undefined;
    readonly worktreeId?: string | undefined;
  }): Promise<readonly AISessionInfo[]>;
  fetchHiddenSessionIds(): Promise<readonly QraftAiSessionId[]>;
  setSessionHidden(sessionId: QraftAiSessionId, hidden: boolean): Promise<void>;
  cancelActiveSession(sessionId: string): Promise<void>;
  cancelQueuedPrompt(promptId: string): Promise<void>;
  submitPrompt(input: SubmitPromptInput): Promise<AISessionSubmitResult>;
  fetchClaudeSessions(
    contextId: string,
    filters?: SessionFilters | undefined,
    options?: {
      readonly offset?: number | undefined;
      readonly limit?: number | undefined;
    },
  ): Promise<SessionListResponse>;
  fetchClaudeSession(
    contextId: string,
    qraftAiSessionId: QraftAiSessionId,
  ): Promise<ExtendedSessionEntry>;
  fetchClaudeSessionTranscript(
    contextId: string,
    qraftAiSessionId: QraftAiSessionId,
    options?: {
      readonly offset?: number | undefined;
      readonly limit?: number | undefined;
    },
  ): Promise<AiSessionTranscriptResponse>;
}

interface AiSessionsApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createAiSessionsApiClientConfig(
  options: AiSessionsApiClientOptions = {},
): AiSessionsApiClientConfig {
  return {
    fetchImplementation: resolveFetchImplementation(
      options.fetchImplementation,
    ),
    apiBaseUrl: normalizeApiBaseUrl(options.apiBaseUrl ?? "/api"),
  };
}

async function ensureOk(
  response: Response,
  message: string,
): Promise<Response> {
  if (!response.ok) {
    let detail = `${message}: ${response.status}`;

    try {
      const errorPayload = (await response.json()) as ErrorResponse;
      if (
        typeof errorPayload.error === "string" &&
        errorPayload.error.length > 0
      ) {
        detail = errorPayload.error;
      }
    } catch {
      // Keep the status fallback when the payload is not valid JSON.
    }

    throw new Error(detail);
  }

  return response;
}

function createClaudeSessionsQuery(
  filters: SessionFilters = {},
  options?: {
    readonly offset?: number | undefined;
    readonly limit?: number | undefined;
  },
): string {
  const searchParams = new URLSearchParams();

  if (
    typeof filters.workingDirectoryPrefix === "string" &&
    filters.workingDirectoryPrefix.length > 0
  ) {
    searchParams.set("workingDirectoryPrefix", filters.workingDirectoryPrefix);
  }
  if (filters.source !== undefined) {
    searchParams.set("source", filters.source);
  }
  if (typeof filters.branch === "string" && filters.branch.length > 0) {
    searchParams.set("branch", filters.branch);
  }
  if (
    typeof filters.searchQuery === "string" &&
    filters.searchQuery.trim().length > 0
  ) {
    searchParams.set("search", filters.searchQuery.trim());
  }
  if (typeof filters.searchInTranscript === "boolean") {
    searchParams.set(
      "searchInTranscript",
      filters.searchInTranscript ? "true" : "false",
    );
  }
  if (typeof filters.dateRange?.from === "string") {
    searchParams.set("dateFrom", filters.dateRange.from);
  }
  if (typeof filters.dateRange?.to === "string") {
    searchParams.set("dateTo", filters.dateRange.to);
  }

  searchParams.set("offset", String(options?.offset ?? 0));
  searchParams.set("limit", String(options?.limit ?? 50));
  searchParams.set("sortBy", "modified");
  searchParams.set("sortOrder", "desc");

  return searchParams.toString();
}

function normalizePromptQueueItem(
  promptQueueItem: PromptQueueItem,
): PromptQueueItem {
  return {
    ...promptQueueItem,
    project_path: promptQueueItem.project_path,
    qraft_ai_session_id: promptQueueItem.qraft_ai_session_id,
  };
}

function normalizeActiveSession(activeSession: AISessionInfo): AISessionInfo {
  return {
    ...activeSession,
    projectPath: activeSession.projectPath,
    worktreeId: activeSession.worktreeId,
    clientSessionId: activeSession.clientSessionId,
  };
}

function createProjectScopedQuery(params: {
  readonly projectPath?: string | undefined;
  readonly worktreeId?: string | undefined;
}): string {
  const searchParams = new URLSearchParams();

  if (
    typeof params.projectPath === "string" &&
    params.projectPath.trim().length > 0
  ) {
    searchParams.set("projectPath", params.projectPath.trim());
  }

  if (
    typeof params.worktreeId === "string" &&
    params.worktreeId.trim().length > 0
  ) {
    searchParams.set("worktree_id", params.worktreeId.trim());
  }

  const query = searchParams.toString();
  return query.length > 0 ? `?${query}` : "";
}

function normalizeClaudeSession(
  claudeSession: ExtendedSessionEntry,
): ExtendedSessionEntry {
  return {
    ...claudeSession,
    aiAgent: claudeSession.aiAgent,
    modelProfileId: claudeSession.modelProfileId,
    modelVendor: claudeSession.modelVendor,
    modelName: claudeSession.modelName,
  };
}

function normalizeTranscriptEvent(
  transcriptEvent: AiSessionTranscriptEvent,
): AiSessionTranscriptEvent {
  return {
    ...transcriptEvent,
    raw:
      typeof transcriptEvent.raw === "object" && transcriptEvent.raw !== null
        ? transcriptEvent.raw
        : {},
  };
}

function createTranscriptQuery(options?: {
  readonly offset?: number | undefined;
  readonly limit?: number | undefined;
}): string {
  const searchParams = new URLSearchParams();

  if (typeof options?.offset === "number") {
    searchParams.set("offset", String(options.offset));
  }

  if (typeof options?.limit === "number") {
    searchParams.set("limit", String(options.limit));
  }

  const query = searchParams.toString();
  return query.length > 0 ? `?${query}` : "";
}

export function createAiSessionsApiClient(
  options: AiSessionsApiClientOptions = {},
): AiSessionsApiClient {
  const config = createAiSessionsApiClientConfig(options);

  return {
    async fetchPromptQueue(options = {}): Promise<readonly PromptQueueItem[]> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ai/prompt-queue${createProjectScopedQuery({
          projectPath: options.projectPath,
        })}`,
      );
      await ensureOk(response, "Prompt queue error");
      const payload = (await response.json()) as {
        readonly prompts?: readonly PromptQueueItem[] | undefined;
      };
      return (payload.prompts ?? []).map(normalizePromptQueueItem);
    },
    async fetchActiveSessions(options = {}): Promise<readonly AISessionInfo[]> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ai/sessions${createProjectScopedQuery({
          projectPath: options.projectPath,
          worktreeId: options.worktreeId,
        })}`,
      );
      await ensureOk(response, "AI sessions error");
      const payload = (await response.json()) as {
        readonly sessions?: readonly AISessionInfo[] | undefined;
      };
      return (payload.sessions ?? []).map(normalizeActiveSession);
    },
    async fetchHiddenSessionIds(): Promise<readonly QraftAiSessionId[]> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ai/sessions/hidden`,
      );
      await ensureOk(response, "Hidden AI sessions error");
      const payload = (await response.json()) as {
        readonly sessionIds?: readonly QraftAiSessionId[] | undefined;
      };
      return payload.sessionIds ?? [];
    },
    async setSessionHidden(
      sessionId: QraftAiSessionId,
      hidden: boolean,
    ): Promise<void> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ai/sessions/${encodeURIComponent(
          sessionId,
        )}/hidden`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hidden }),
        },
      );
      await ensureOk(response, "Failed to update hidden session state");
    },
    async cancelActiveSession(sessionId: string): Promise<void> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ai/sessions/${encodeURIComponent(
          sessionId,
        )}/cancel`,
        {
          method: "POST",
        },
      );
      await ensureOk(response, "Failed to cancel session");
    },
    async cancelQueuedPrompt(promptId: string): Promise<void> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ai/prompt-queue/${encodeURIComponent(
          promptId,
        )}/cancel`,
        {
          method: "POST",
        },
      );
      await ensureOk(response, "Failed to cancel queued prompt");
    },
    async submitPrompt(
      input: SubmitPromptInput,
    ): Promise<AISessionSubmitResult> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ai/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            run_immediately: input.runImmediately,
            message: input.message,
            context: input.context,
            project_path: input.projectPath,
            qraft_ai_session_id:
              input.qraftAiSessionId ?? generateQraftAiSessionId(),
            force_new_session: input.forceNewSession === true,
            ai_agent: undefined,
            model_profile_id: input.modelProfileId,
          }),
        },
      );
      await ensureOk(response, "AI submit error");
      return (await response.json()) as AISessionSubmitResult;
    },
    async fetchClaudeSessions(
      contextId: string,
      filters: SessionFilters = {},
      options = {},
    ): Promise<SessionListResponse> {
      const query = createClaudeSessionsQuery(filters, options);
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(
          contextId,
        )}/claude-sessions/sessions${query.length > 0 ? `?${query}` : ""}`,
      );
      await ensureOk(response, "Failed to load sessions");
      const payload = (await response.json()) as SessionListResponse;
      return {
        ...payload,
        sessions: payload.sessions.map(normalizeClaudeSession),
      };
    },
    async fetchClaudeSession(
      contextId: string,
      qraftAiSessionId: QraftAiSessionId,
    ): Promise<ExtendedSessionEntry> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(
          contextId,
        )}/claude-sessions/sessions/${encodeURIComponent(qraftAiSessionId)}`,
      );
      await ensureOk(response, "Failed to load session");
      return normalizeClaudeSession(
        (await response.json()) as ExtendedSessionEntry,
      );
    },
    async fetchClaudeSessionTranscript(
      contextId: string,
      qraftAiSessionId: QraftAiSessionId,
      options = {},
    ): Promise<AiSessionTranscriptResponse> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(
          contextId,
        )}/claude-sessions/sessions/${encodeURIComponent(
          qraftAiSessionId,
        )}/transcript${createTranscriptQuery(options)}`,
      );
      await ensureOk(response, "Failed to load transcript");
      const payload = (await response.json()) as AiSessionTranscriptResponse;
      return {
        ...payload,
        events: payload.events.map(normalizeTranscriptEvent),
      };
    },
  };
}
