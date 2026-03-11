import { describe, expect, test } from "bun:test";
import type {
  AIPromptContext,
  QraftAiSessionId,
} from "../../../../src/types/ai";
import type { ExtendedSessionEntry } from "../../../../src/types/claude-session";
import type {
  AISessionInfo,
  AiSessionTranscriptEvent,
  PromptQueueItem,
} from "../../../../client-shared/src/api/ai-sessions";
import {
  buildAiSessionListEntries,
  buildAiSessionTranscriptLines,
  describeAiSessionPromptContext,
  resolveAiSessionCancelAction,
  describeAiSessionEntryModel,
  describeAiSessionModelProfile,
  describeAiSessionTarget,
  extractAiSessionTranscriptText,
  formatAiSessionTimestamp,
  getQueuedPromptSummary,
} from "./presentation";
import { resolveAiSessionTargetSessionId } from "./state";

const TEST_AI_PROMPT_CONTEXT: AIPromptContext = {
  references: [],
  diffSummary: undefined,
};

function asQraftAiSessionId(value: string): QraftAiSessionId {
  return value as QraftAiSessionId;
}

function createAiSessionInfo(
  overrides: Omit<AISessionInfo, "projectPath" | "context"> &
    Partial<Pick<AISessionInfo, "projectPath" | "context">>,
): AISessionInfo {
  return {
    projectPath: "/tmp/repo",
    context: TEST_AI_PROMPT_CONTEXT,
    ...overrides,
  };
}

function createPromptQueueItem(
  overrides: Omit<PromptQueueItem, "project_path"> &
    Partial<Pick<PromptQueueItem, "project_path">>,
): PromptQueueItem {
  return {
    project_path: "/tmp/repo",
    ...overrides,
  };
}

describe("ai-session presentation helpers", () => {
  test("merges active, queued, and historical sessions without duplicating the same qraft session", () => {
    const activeSessions: readonly AISessionInfo[] = [
      createAiSessionInfo({
        id: "qs-active",
        state: "running",
        prompt: "Continue migration",
        createdAt: "2026-03-09T06:00:00.000Z",
        currentActivity: "Applying patch",
      }),
    ];
    const promptQueue: readonly PromptQueueItem[] = [
      createPromptQueueItem({
        id: "prompt-1",
        message: "Follow up on files parity",
        status: "queued",
        created_at: "2026-03-09T06:30:00.000Z",
        worktree_id: "wt-1",
        qraft_ai_session_id: asQraftAiSessionId("qs-history"),
      }),
      createPromptQueueItem({
        id: "prompt-2",
        message: "Queued only session",
        status: "queued",
        created_at: "2026-03-09T07:00:00.000Z",
        worktree_id: "wt-1",
        qraft_ai_session_id: asQraftAiSessionId("qs-queued-only"),
      }),
    ];
    const historicalSessions: readonly ExtendedSessionEntry[] = [
      {
        sessionId: "claude-1",
        fullPath: "/tmp/claude-1.jsonl",
        fileMtime: 1,
        firstPrompt: "Continue migration",
        summary: "Active session duplicate",
        messageCount: 1,
        created: "2026-03-08T10:00:00.000Z",
        modified: "2026-03-09T06:00:00.000Z",
        gitBranch: "main",
        projectPath: "/tmp/repo",
        isSidechain: false,
        source: "qraftbox",
        projectEncoded: "tmp-repo",
        qraftAiSessionId: asQraftAiSessionId("qs-active"),
      },
      {
        sessionId: "claude-2",
        fullPath: "/tmp/claude-2.jsonl",
        fileMtime: 2,
        firstPrompt: "Review terminal parity",
        summary: "Terminal parity work",
        messageCount: 2,
        created: "2026-03-07T10:00:00.000Z",
        modified: "2026-03-08T06:00:00.000Z",
        gitBranch: "feature/solid",
        projectPath: "/tmp/repo",
        isSidechain: false,
        source: "claude-cli",
        projectEncoded: "tmp-repo",
        qraftAiSessionId: asQraftAiSessionId("qs-history"),
        modelProfileId: "profile-history",
        modelVendor: "anthropics",
        modelName: "claude-sonnet",
      },
    ];

    expect(
      buildAiSessionListEntries(
        activeSessions,
        promptQueue,
        historicalSessions,
      ),
    ).toEqual([
      {
        id: "queued:prompt-2",
        title: "Queued only session",
        detail: "Queued prompt for qs-queued-only",
        status: "queued",
        qraftAiSessionId: asQraftAiSessionId("qs-queued-only"),
        source: "queued",
        updatedAt: "2026-03-09T07:00:00.000Z",
        queuedPromptCount: 1,
        queuedPromptId: "prompt-2",
        activeSessionId: null,
        historySessionId: null,
        latestPrompt: "Queued only session",
        modelProfileId: undefined,
        modelVendor: undefined,
        modelName: undefined,
        canCancel: true,
      },
      {
        id: "history:claude-2",
        title: "Terminal parity work",
        detail: "Follow up on files parity",
        status: "queued",
        qraftAiSessionId: asQraftAiSessionId("qs-history"),
        source: "queued",
        updatedAt: "2026-03-09T06:30:00.000Z",
        queuedPromptCount: 1,
        queuedPromptId: "prompt-1",
        activeSessionId: null,
        historySessionId: "claude-2",
        latestPrompt: "Follow up on files parity",
        modelProfileId: "profile-history",
        modelVendor: "anthropics",
        modelName: "claude-sonnet",
        canCancel: true,
      },
      {
        id: "active:qs-active",
        title: "Continue migration",
        detail: "Applying patch",
        status: "running",
        qraftAiSessionId: asQraftAiSessionId("qs-active"),
        source: "active",
        updatedAt: "2026-03-09T06:00:00.000Z",
        queuedPromptCount: 0,
        queuedPromptId: null,
        activeSessionId: "qs-active",
        historySessionId: "claude-1",
        latestPrompt: "Continue migration",
        modelProfileId: undefined,
        modelVendor: undefined,
        modelName: undefined,
        canCancel: true,
      },
    ]);
  });

  test("prefers the newest queued prompt when summarizing active and historical sessions", () => {
    const activeSessions: readonly AISessionInfo[] = [
      createAiSessionInfo({
        id: "qs-active",
        state: "running",
        prompt: "Continue migration",
        createdAt: "2026-03-09T06:00:00.000Z",
      }),
    ];
    const promptQueue: readonly PromptQueueItem[] = [
      createPromptQueueItem({
        id: "prompt-old",
        message: "Older queued follow-up",
        status: "queued",
        created_at: "2026-03-09T06:30:00.000Z",
        worktree_id: "wt-1",
        qraft_ai_session_id: asQraftAiSessionId("qs-active"),
      }),
      createPromptQueueItem({
        id: "prompt-new",
        message: "Newest queued follow-up",
        status: "running",
        created_at: "2026-03-09T06:45:00.000Z",
        worktree_id: "wt-1",
        qraft_ai_session_id: asQraftAiSessionId("qs-history"),
      }),
      createPromptQueueItem({
        id: "prompt-history-old",
        message: "History older follow-up",
        status: "queued",
        created_at: "2026-03-09T06:15:00.000Z",
        worktree_id: "wt-1",
        qraft_ai_session_id: asQraftAiSessionId("qs-history"),
      }),
    ];
    const historicalSessions: readonly ExtendedSessionEntry[] = [
      {
        sessionId: "claude-1",
        fullPath: "/tmp/claude-1.jsonl",
        fileMtime: 1,
        firstPrompt: "Continue migration",
        summary: "Active session duplicate",
        messageCount: 1,
        created: "2026-03-08T10:00:00.000Z",
        modified: "2026-03-09T06:00:00.000Z",
        gitBranch: "main",
        projectPath: "/tmp/repo",
        isSidechain: false,
        source: "qraftbox",
        projectEncoded: "tmp-repo",
        qraftAiSessionId: asQraftAiSessionId("qs-active"),
      },
      {
        sessionId: "claude-2",
        fullPath: "/tmp/claude-2.jsonl",
        fileMtime: 2,
        firstPrompt: "Review terminal parity",
        summary: "Terminal parity work",
        messageCount: 2,
        created: "2026-03-07T10:00:00.000Z",
        modified: "2026-03-08T06:00:00.000Z",
        gitBranch: "feature/solid",
        projectPath: "/tmp/repo",
        isSidechain: false,
        source: "claude-cli",
        projectEncoded: "tmp-repo",
        qraftAiSessionId: asQraftAiSessionId("qs-history"),
      },
    ];

    expect(
      buildAiSessionListEntries(
        activeSessions,
        promptQueue,
        historicalSessions,
      ),
    ).toEqual([
      {
        id: "history:claude-2",
        title: "Terminal parity work",
        detail: "Newest queued follow-up",
        status: "running",
        qraftAiSessionId: asQraftAiSessionId("qs-history"),
        source: "queued",
        updatedAt: "2026-03-09T06:45:00.000Z",
        queuedPromptCount: 2,
        queuedPromptId: "prompt-new",
        activeSessionId: null,
        historySessionId: "claude-2",
        latestPrompt: "Newest queued follow-up",
        modelProfileId: undefined,
        modelVendor: undefined,
        modelName: undefined,
        canCancel: true,
      },
      {
        id: "active:qs-active",
        title: "Continue migration",
        detail: "Active session duplicate",
        status: "running",
        qraftAiSessionId: asQraftAiSessionId("qs-active"),
        source: "active",
        updatedAt: "2026-03-09T06:00:00.000Z",
        queuedPromptCount: 1,
        queuedPromptId: "prompt-old",
        activeSessionId: "qs-active",
        historySessionId: "claude-1",
        latestPrompt: "Continue migration",
        modelProfileId: undefined,
        modelVendor: undefined,
        modelName: undefined,
        canCancel: true,
      },
    ]);
  });

  test("resolves the correct cancellation action for active and queued entries", () => {
    expect(
      resolveAiSessionCancelAction({
        activeSessionId: "active-1",
        queuedPromptId: null,
        canCancel: true,
      }),
    ).toEqual({
      kind: "active-session",
      targetId: "active-1",
      label: "Cancel selected session",
    });

    expect(
      resolveAiSessionCancelAction({
        activeSessionId: null,
        queuedPromptId: "prompt-1",
        canCancel: true,
      }),
    ).toEqual({
      kind: "queued-prompt",
      targetId: "prompt-1",
      label: "Cancel selected queued prompt",
    });

    expect(
      resolveAiSessionCancelAction({
        activeSessionId: null,
        queuedPromptId: "prompt-1",
        canCancel: false,
      }),
    ).toBeNull();
  });

  test("summarizes running and queued prompts", () => {
    const promptQueue: readonly PromptQueueItem[] = [
      createPromptQueueItem({
        id: "prompt-1",
        message: "Queued",
        status: "queued",
        created_at: "2026-03-09T06:00:00.000Z",
        worktree_id: "wt-1",
      }),
      createPromptQueueItem({
        id: "prompt-2",
        message: "Running",
        status: "running",
        created_at: "2026-03-09T06:01:00.000Z",
        worktree_id: "wt-1",
      }),
    ];

    expect(getQueuedPromptSummary(promptQueue)).toBe("1 running, 1 queued");
  });

  test("formats valid and invalid timestamps", () => {
    expect(formatAiSessionTimestamp("invalid")).toBe("Unknown time");
    expect(formatAiSessionTimestamp("2026-03-09T06:00:00.000Z")).toContain(
      "Mar",
    );
  });

  test("describes the current session target", () => {
    expect(
      describeAiSessionTarget({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-existing"),
        draftSessionId: asQraftAiSessionId("qs-draft"),
      }),
    ).toBe("Continuing session qs-existing");
    expect(
      describeAiSessionTarget({
        selectedQraftAiSessionId: null,
        draftSessionId: asQraftAiSessionId("qs-draft"),
      }),
    ).toBe("New session draft qs-draft");
    expect(
      resolveAiSessionTargetSessionId({
        selectedQraftAiSessionId: asQraftAiSessionId("qs-existing"),
        draftSessionId: asQraftAiSessionId("qs-draft"),
      }),
    ).toBe(asQraftAiSessionId("qs-existing"));
  });

  test("describes the selected model profile", () => {
    expect(describeAiSessionModelProfile(null, [])).toBe(
      "Using the server default AI profile.",
    );
    expect(
      describeAiSessionModelProfile("profile-1", [
        {
          id: "profile-1",
          name: "Claude Default",
          vendor: "anthropics",
          authMode: "cli_auth",
          model: "claude-sonnet",
          arguments: [],
          createdAt: "2026-03-09T00:00:00.000Z",
          updatedAt: "2026-03-09T00:00:00.000Z",
        },
      ]),
    ).toBe("Using profile Claude Default (anthropics/claude-sonnet).");
  });

  test("describes the model shown on a session entry", () => {
    expect(
      describeAiSessionEntryModel(
        {
          modelProfileId: "profile-1",
          modelVendor: undefined,
          modelName: undefined,
        },
        [
          {
            id: "profile-1",
            name: "Claude Default",
            vendor: "anthropics",
            authMode: "cli_auth",
            model: "claude-sonnet",
            arguments: [],
            createdAt: "2026-03-09T00:00:00.000Z",
            updatedAt: "2026-03-09T00:00:00.000Z",
          },
        ],
      ),
    ).toBe("Claude Default (anthropics/claude-sonnet)");
    expect(
      describeAiSessionEntryModel(
        {
          modelProfileId: undefined,
          modelVendor: "openai",
          modelName: "gpt-5",
        },
        [],
      ),
    ).toBe("openai/gpt-5");
  });

  test("describes the current prompt context from the files screen", () => {
    expect(
      describeAiSessionPromptContext({
        references: [],
        selectedReferencePath: null,
        changedFileCount: 3,
      }),
    ).toBe(
      "No file is selected. Prompts will use workspace-level context only while 3 changed files remain available in the current diff.",
    );

    expect(
      describeAiSessionPromptContext({
        references: [
          {
            path: "src/app.ts",
          },
        ],
        selectedReferencePath: "src/app.ts",
        changedFileCount: 3,
      }),
    ).toBe(
      "Prompts will include src/app.ts and stay aligned with the current diff (3 changed files).",
    );
  });

  test("extracts transcript text from message and tool events", () => {
    const userEvent: AiSessionTranscriptEvent = {
      type: "user",
      uuid: "evt-user",
      raw: {
        message: {
          content: [
            { type: "text", text: "Continue migration" },
            { type: "tool_use", name: "grep_repository" },
          ],
        },
      },
    };
    const toolResultEvent: AiSessionTranscriptEvent = {
      type: "tool_result",
      uuid: "evt-tool",
      raw: {
        content: {
          status: "ok",
        },
      },
    };

    expect(extractAiSessionTranscriptText(userEvent)).toBe(
      "Continue migration\n\n[Tool: grep_repository]",
    );
    expect(extractAiSessionTranscriptText(toolResultEvent)).toBe(
      JSON.stringify({ status: "ok" }, null, 2),
    );
  });

  test("builds visible transcript lines from transcript events", () => {
    const transcriptEvents: readonly AiSessionTranscriptEvent[] = [
      {
        type: "assistant",
        uuid: "evt-1",
        timestamp: "2026-03-09T06:00:00.000Z",
        raw: {
          message: {
            content: [{ type: "text", text: "Transcript line one" }],
          },
        },
      },
      {
        type: "tool_use",
        uuid: "evt-2",
        timestamp: "2026-03-09T06:01:00.000Z",
        raw: {
          name: "exec_command",
        },
      },
      {
        type: "assistant",
        uuid: "evt-empty",
        raw: {
          message: {
            content: [],
          },
        },
      },
    ];

    expect(buildAiSessionTranscriptLines(transcriptEvents)).toEqual([
      {
        id: "evt-1",
        role: "assistant",
        text: "Transcript line one",
        timestamp: "2026-03-09T06:00:00.000Z",
      },
      {
        id: "evt-2",
        role: "system",
        text: "[Tool: exec_command]",
        timestamp: "2026-03-09T06:01:00.000Z",
      },
    ]);
  });

  test("uses the transcript response offset when fallback ids are needed", () => {
    const transcriptEvents: readonly AiSessionTranscriptEvent[] = [
      {
        type: "assistant",
        timestamp: "2026-03-09T06:10:00.000Z",
        raw: {
          message: {
            content: [{ type: "text", text: "Page two assistant line" }],
          },
        },
      },
      {
        type: "tool_use",
        timestamp: "2026-03-09T06:11:00.000Z",
        raw: {
          name: "write_stdin",
        },
      },
    ];

    expect(
      buildAiSessionTranscriptLines(transcriptEvents, {
        offset: 200,
      }),
    ).toEqual([
      {
        id: "assistant:200",
        role: "assistant",
        text: "Page two assistant line",
        timestamp: "2026-03-09T06:10:00.000Z",
      },
      {
        id: "tool_use:201",
        role: "system",
        text: "[Tool: write_stdin]",
        timestamp: "2026-03-09T06:11:00.000Z",
      },
    ]);
  });
});
