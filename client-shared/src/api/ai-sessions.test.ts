import { describe, expect, test } from "bun:test";
import type { QraftAiSessionId } from "../../../src/types/ai";
import type {
  ExtendedSessionEntry,
  SessionListResponse,
} from "../../../src/types/claude-session";
import {
  createAiSessionsApiClient,
  type AISessionInfo,
  type AiSessionTranscriptResponse,
  type PromptQueueItem,
} from "./ai-sessions";

describe("ai sessions api client", () => {
  test("fetches active sessions and prompt queue through the configured api base", async () => {
    const requestedUrls: string[] = [];
    const fetchImplementation: typeof fetch = (async (
      input: string | URL | Request,
    ): Promise<Response> => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes("/ai/sessions?projectPath=%2Ftmp%2Frepo")) {
        const sessions: readonly AISessionInfo[] = [
          {
            id: "qs_1",
            state: "running",
            prompt: "Review the diff",
            projectPath: "/tmp/repo",
            createdAt: "2026-03-09T06:00:00.000Z",
            context: {},
          },
        ];
        return new Response(JSON.stringify({ sessions }), { status: 200 });
      }

      if (url.endsWith("/ai/sessions/hidden")) {
        return new Response(
          JSON.stringify({
            sessionIds: ["qs_hidden_1" as QraftAiSessionId],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/ai/prompt-queue?projectPath=%2Ftmp%2Frepo")) {
        const prompts: readonly PromptQueueItem[] = [
          {
            id: "prompt-1",
            message: "Queued prompt",
            status: "queued",
            created_at: "2026-03-09T06:00:00.000Z",
            project_path: "/tmp/repo",
            worktree_id: "wt-1",
          },
        ];
        return new Response(JSON.stringify({ prompts }), { status: 200 });
      }

      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const apiClient = createAiSessionsApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation,
    });

    const activeSessions = await apiClient.fetchActiveSessions({
      projectPath: "/tmp/repo",
    });
    const hiddenSessionIds = await apiClient.fetchHiddenSessionIds();
    const promptQueue = await apiClient.fetchPromptQueue({
      projectPath: "/tmp/repo",
    });

    expect(activeSessions).toHaveLength(1);
    expect(hiddenSessionIds).toEqual(["qs_hidden_1" as QraftAiSessionId]);
    expect(promptQueue).toHaveLength(1);
    expect(requestedUrls).toEqual([
      "/custom-api/ai/sessions?projectPath=%2Ftmp%2Frepo",
      "/custom-api/ai/sessions/hidden",
      "/custom-api/ai/prompt-queue?projectPath=%2Ftmp%2Frepo",
    ]);
  });

  test("submits prompts and fetches claude sessions with normalized query params", async () => {
    const requests: Array<{
      readonly url: string;
      readonly init?: RequestInit | undefined;
    }> = [];
    const fetchImplementation: typeof fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      requests.push({ url, init });

      if (url.includes("/claude-sessions/sessions")) {
        const payload: SessionListResponse = {
          sessions: [
            {
              sessionId: "claude-1",
              fullPath: "/tmp/claude-1.jsonl",
              fileMtime: 1,
              firstPrompt: "Fix the migration",
              summary: "Solid migration work",
              messageCount: 12,
              created: "2026-03-08T10:00:00.000Z",
              modified: "2026-03-09T05:00:00.000Z",
              gitBranch: "main",
              projectPath: "/tmp/repo",
              isSidechain: false,
              source: "qraftbox",
              projectEncoded: "tmp-repo",
              qraftAiSessionId: "qs_history_1" as QraftAiSessionId,
            },
          ],
          total: 1,
          offset: 0,
          limit: 50,
        };
        return new Response(JSON.stringify(payload), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          sessionId: "qs_generated",
          status: "queued",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const apiClient = createAiSessionsApiClient({
      apiBaseUrl: "/api",
      fetchImplementation,
    });

    await apiClient.submitPrompt({
      runImmediately: false,
      message: "Continue the session",
      projectPath: "/tmp/repo",
      qraftAiSessionId: "qs_resume_1" as QraftAiSessionId,
      context: {
        primaryFile: undefined,
        references: [],
        diffSummary: undefined,
      },
    });

    const response = await apiClient.fetchClaudeSessions("ctx-1", {
      workingDirectoryPrefix: "/tmp/repo",
      searchQuery: "migration",
      searchInTranscript: true,
      source: "qraftbox",
      branch: "main",
    });

    expect(response.sessions[0]?.qraftAiSessionId).toBe(
      "qs_history_1" as QraftAiSessionId,
    );
    expect(requests[0]?.url).toBe("/api/ai/submit");
    expect(requests[1]?.url).toContain(
      "/api/ctx/ctx-1/claude-sessions/sessions?",
    );
    expect(requests[1]?.url).toContain("workingDirectoryPrefix=%2Ftmp%2Frepo");
    expect(requests[1]?.url).toContain("search=migration");
    expect(requests[1]?.url).toContain("searchInTranscript=true");
    expect(requests[1]?.url).toContain("source=qraftbox");
    expect(requests[1]?.url).toContain("branch=main");
  });

  test("supports paginated claude-session history requests", async () => {
    const requests: string[] = [];
    const fetchImplementation: typeof fetch = (async (
      input: string | URL | Request,
    ): Promise<Response> => {
      const url = String(input);
      requests.push(url);

      return new Response(
        JSON.stringify({
          sessions: [],
          total: 125,
          offset: 50,
          limit: 25,
        } satisfies SessionListResponse),
        { status: 200 },
      );
    }) as typeof fetch;

    const apiClient = createAiSessionsApiClient({
      apiBaseUrl: "/api",
      fetchImplementation,
    });

    const response = await apiClient.fetchClaudeSessions(
      "ctx-1",
      {
        workingDirectoryPrefix: "/tmp/repo",
      },
      {
        offset: 50,
        limit: 25,
      },
    );

    expect(response.total).toBe(125);
    expect(requests).toEqual([
      "/api/ctx/ctx-1/claude-sessions/sessions?workingDirectoryPrefix=%2Ftmp%2Frepo&offset=50&limit=25&sortBy=modified&sortOrder=desc",
    ]);
  });

  test("loads selected session detail and transcript through shared claude-session routes", async () => {
    const requests: string[] = [];
    const fetchImplementation: typeof fetch = (async (
      input: string | URL | Request,
    ): Promise<Response> => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith("/claude-sessions/sessions/qs_history_1")) {
        return new Response(
          JSON.stringify({
            sessionId: "claude-1",
            fullPath: "/tmp/claude-1.jsonl",
            fileMtime: 1,
            firstPrompt: "Continue migration",
            summary: "Solid transcript slice",
            messageCount: 3,
            created: "2026-03-08T10:00:00.000Z",
            modified: "2026-03-09T05:00:00.000Z",
            gitBranch: "main",
            projectPath: "/tmp/repo",
            isSidechain: false,
            source: "qraftbox",
            projectEncoded: "tmp-repo",
            qraftAiSessionId: "qs_history_1" as QraftAiSessionId,
          } satisfies ExtendedSessionEntry),
          { status: 200 },
        );
      }

      if (
        url.endsWith(
          "/claude-sessions/sessions/qs_history_1/transcript?offset=0&limit=25",
        )
      ) {
        const payload: AiSessionTranscriptResponse = {
          events: [
            {
              type: "assistant",
              uuid: "evt-1",
              timestamp: "2026-03-09T05:00:00.000Z",
              raw: {
                message: {
                  content: [{ type: "text", text: "Transcript line" }],
                },
              },
            },
          ],
          qraftAiSessionId: "qs_history_1" as QraftAiSessionId,
          offset: 0,
          limit: 25,
          total: 1,
        };
        return new Response(JSON.stringify(payload), { status: 200 });
      }

      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const apiClient = createAiSessionsApiClient({
      apiBaseUrl: "/api",
      fetchImplementation,
    });

    const session = await apiClient.fetchClaudeSession(
      "ctx-1",
      "qs_history_1" as QraftAiSessionId,
    );
    const transcript = await apiClient.fetchClaudeSessionTranscript(
      "ctx-1",
      "qs_history_1" as QraftAiSessionId,
      { offset: 0, limit: 25 },
    );

    expect(session.summary).toBe("Solid transcript slice");
    expect(transcript.events[0]?.raw).toEqual({
      message: {
        content: [{ type: "text", text: "Transcript line" }],
      },
    });
    expect(requests).toEqual([
      "/api/ctx/ctx-1/claude-sessions/sessions/qs_history_1",
      "/api/ctx/ctx-1/claude-sessions/sessions/qs_history_1/transcript?offset=0&limit=25",
    ]);
  });

  test("submits force_new_session when restarting an existing qraft session from the beginning", async () => {
    let capturedRequestBody: string | undefined;
    const fetchImplementation: typeof fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedRequestBody =
        typeof init?.body === "string" ? init.body : undefined;

      return new Response(
        JSON.stringify({
          sessionId: "qs_existing",
          status: "running",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const apiClient = createAiSessionsApiClient({
      apiBaseUrl: "/api",
      fetchImplementation,
    });

    await apiClient.submitPrompt({
      runImmediately: true,
      message: "Restart this session from the beginning",
      projectPath: "/tmp/repo",
      qraftAiSessionId: "qs_existing" as QraftAiSessionId,
      forceNewSession: true,
      context: {
        primaryFile: undefined,
        references: [],
        diffSummary: undefined,
      },
    });

    expect(JSON.parse(capturedRequestBody ?? "{}")).toMatchObject({
      qraft_ai_session_id: "qs_existing",
      force_new_session: true,
      run_immediately: true,
    });
  });

  test("surfaces json api errors for failed ai-session requests", async () => {
    const apiClient = createAiSessionsApiClient({
      fetchImplementation: (async (): Promise<Response> =>
        new Response(JSON.stringify({ error: "Prompt queue unavailable" }), {
          status: 503,
        })) as typeof fetch,
    });

    await expect(apiClient.fetchPromptQueue()).rejects.toThrow(
      "Prompt queue unavailable",
    );
  });

  test("updates hidden-session state through the shared ai-session client", async () => {
    const requests: Array<{
      readonly url: string;
      readonly init?: RequestInit | undefined;
    }> = [];
    const fetchImplementation: typeof fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      requests.push({ url: String(input), init });
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const apiClient = createAiSessionsApiClient({
      fetchImplementation,
    });

    await apiClient.setSessionHidden("qs_hidden_1" as QraftAiSessionId, true);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("/api/ai/sessions/qs_hidden_1/hidden");
    expect(requests[0]?.init?.method).toBe("PUT");
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ hidden: true }));
  });
});
