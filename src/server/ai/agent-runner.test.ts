/**
 * AgentRunner Tests
 *
 * Tests for agent execution covering factory function, StubbedAgentRunner behavior,
 * event stream, and AgentEvent type discrimination.
 */

import { describe, test, expect } from "vitest";
import {
  buildCodexMessageSnapshots,
  buildCodexExecCommand,
  createAgentRunner,
  extractClaudeSessionIdFromMessage,
  parseCodexJsonLine,
  shouldEmitCodexSessionDetected,
  type AgentEvent,
  type AgentRunParams,
} from "./agent-runner.js";
import type { ClaudeSessionId } from "../../types/ai.js";
import { DEFAULT_AI_CONFIG } from "../../types/ai.js";
import { AIAgent } from "../../types/ai-agent.js";

/**
 * Create test agent run parameters
 *
 * @param overrides - Partial overrides for the parameters
 * @returns Complete AgentRunParams
 */
function createTestRunParams(
  overrides?: Partial<AgentRunParams>,
): AgentRunParams {
  return {
    prompt: "Test prompt",
    projectPath: "/tmp/test",
    ...overrides,
  };
}

describe("createAgentRunner()", () => {
  test("returns StubbedAgentRunner when toolRegistry is undefined", () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    expect(runner).toBeDefined();
    expect(typeof runner.execute).toBe("function");
  });

  test("returns ClaudeAgentRunner when toolRegistry is provided", () => {
    // Create a minimal mock of QraftBoxToolRegistry
    const mockToolRegistry = {
      getAllowedToolNames: () => new Set<string>(),
      toMcpServerConfig: () => ({
        command: "node",
        args: ["index.js"],
      }),
    };

    const runner = createAgentRunner(
      DEFAULT_AI_CONFIG,
      mockToolRegistry as any,
    );
    expect(runner).toBeDefined();
    expect(typeof runner.execute).toBe("function");
  });
});

describe("extractClaudeSessionIdFromMessage()", () => {
  const sessionId = "0dc4ee1f-2e78-462f-a400-16d14ab6a418" as ClaudeSessionId;

  test("extracts from top-level camelCase sessionId", () => {
    const result = extractClaudeSessionIdFromMessage({ sessionId });
    expect(result).toBe(sessionId);
  });

  test("extracts from top-level snake_case session_id", () => {
    const result = extractClaudeSessionIdFromMessage({ session_id: sessionId });
    expect(result).toBe(sessionId);
  });

  test("extracts from nested message.session_id", () => {
    const result = extractClaudeSessionIdFromMessage({
      type: "assistant",
      message: { role: "assistant", session_id: sessionId },
    });
    expect(result).toBe(sessionId);
  });

  test("extracts from nested result.sessionId", () => {
    const result = extractClaudeSessionIdFromMessage({
      type: "result",
      result: { sessionId },
    });
    expect(result).toBe(sessionId);
  });

  test("returns undefined for non-UUID values", () => {
    const result = extractClaudeSessionIdFromMessage({
      sessionId: "sdk-session-1",
    });
    expect(result).toBeUndefined();
  });
});

describe("buildCodexExecCommand()", () => {
  test("builds codex exec --json command for new sessions", () => {
    const command = buildCodexExecCommand(
      createTestRunParams({
        prompt: "Investigate latency",
        aiAgent: AIAgent.CODEX,
        model: "gpt-5.3-codex",
        additionalArgs: ["--dangerously-bypass-approvals-and-sandbox"],
      }),
    );

    expect(command.slice(0, 3)).toEqual(["codex", "exec", "--json"]);
    expect(command).toContain("--model");
    expect(command).toContain("gpt-5.3-codex");
    expect(command).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(command).not.toContain("--print");
    expect(command).not.toContain("--output-format");
    expect(command[command.length - 1]).toBe("Investigate latency");
  });

  test("builds codex exec resume --json command for resumed sessions", () => {
    const resumeId = "0dc4ee1f-2e78-462f-a400-16d14ab6a418" as ClaudeSessionId;
    const command = buildCodexExecCommand(
      createTestRunParams({
        prompt: "Continue from previous task",
        aiAgent: AIAgent.CODEX,
        resumeSessionId: resumeId,
        model: "gpt-5.3-codex",
      }),
    );

    expect(command.slice(0, 4)).toEqual(["codex", "exec", "resume", "--json"]);
    expect(command).toContain(resumeId);
    expect(command[command.length - 1]).toBe("Continue from previous task");
  });
});

describe("parseCodexJsonLine()", () => {
  test("parses session from thread.started", () => {
    const line =
      '{"type":"thread.started","thread_id":"019c8ded-ecd4-7db2-a89e-450cb3445c6e"}';
    const parsed = parseCodexJsonLine(line);
    expect(parsed).toEqual({
      type: "session_detected",
      sessionId: "019c8ded-ecd4-7db2-a89e-450cb3445c6e",
    });
  });

  test("parses assistant text from item.completed agent_message", () => {
    const line =
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"hello from codex"}}';
    const parsed = parseCodexJsonLine(line);
    expect(parsed).toEqual({
      type: "message",
      content: "hello from codex",
    });
  });

  test("parses delta assistant text from item.delta", () => {
    const line =
      '{"type":"item.delta","item":{"id":"item_1","type":"agent_message"},"delta":{"text":"partial"}}';
    const parsed = parseCodexJsonLine(line);
    expect(parsed).toEqual({
      type: "message",
      content: "partial",
      isDelta: true,
    });
  });
});

describe("shouldEmitCodexSessionDetected()", () => {
  test("emits when no session was previously detected", () => {
    const nextSessionId = "codex-session-1" as ClaudeSessionId;
    expect(shouldEmitCodexSessionDetected(undefined, nextSessionId)).toBe(true);
  });

  test("does not emit duplicate detection for same session ID", () => {
    const sessionId = "codex-session-1" as ClaudeSessionId;
    expect(shouldEmitCodexSessionDetected(sessionId, sessionId)).toBe(false);
  });

  test("emits when resumed session resolves to a different session ID", () => {
    const resumeSessionId = "codex-session-old" as ClaudeSessionId;
    const detectedSessionId = "codex-session-new" as ClaudeSessionId;
    expect(
      shouldEmitCodexSessionDetected(resumeSessionId, detectedSessionId),
    ).toBe(true);
  });
});

describe("buildCodexMessageSnapshots()", () => {
  test("builds character-by-character snapshots for an initial full message", () => {
    const snapshots = buildCodexMessageSnapshots("", "hi", false);
    expect(snapshots).toEqual(["h", "hi"]);
  });

  test("builds character-by-character snapshots for delta content", () => {
    const snapshots = buildCodexMessageSnapshots("hel", "lo", true);
    expect(snapshots).toEqual(["hell", "hello"]);
  });

  test("builds character-by-character suffix snapshots for full content updates", () => {
    const snapshots = buildCodexMessageSnapshots("hello", "hello world", false);
    expect(snapshots).toEqual([
      "hello ",
      "hello w",
      "hello wo",
      "hello wor",
      "hello worl",
      "hello world",
    ]);
  });

  test("falls back to a single snapshot when content is not a monotonic extension", () => {
    const snapshots = buildCodexMessageSnapshots("hello world", "hi", false);
    expect(snapshots).toEqual(["hi"]);
  });
});

describe("StubbedAgentRunner", () => {
  test("yields activity, message, and completed events in order", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }

    // Should have: activity("Thinking..."), activity(undefined), message, completed
    expect(events.length).toBe(4);
    expect(events[0]?.type).toBe("activity");
    expect(events[1]?.type).toBe("activity");
    expect(events[2]?.type).toBe("message");
    expect(events[3]?.type).toBe("completed");

    // Verify activity sequence
    const firstActivity = events[0];
    if (firstActivity !== undefined && firstActivity.type === "activity") {
      expect(firstActivity.activity).toBe("Thinking...");
    }

    const secondActivity = events[1];
    if (secondActivity !== undefined && secondActivity.type === "activity") {
      expect(secondActivity.activity).toBeUndefined();
    }
  });

  test("completed event has success=true", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }

    const completedEvent = events[events.length - 1];
    expect(completedEvent).toBeDefined();
    if (completedEvent !== undefined && completedEvent.type === "completed") {
      expect(completedEvent.success).toBe(true);
      expect(completedEvent.error).toBeUndefined();
    }
  });

  test("message content includes prompt text", async () => {
    const testPrompt = "This is a test prompt for stubbed runner";
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(
      createTestRunParams({ prompt: testPrompt }),
    );

    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }

    const messageEvent = events.find((event) => event.type === "message");
    expect(messageEvent).toBeDefined();

    if (messageEvent !== undefined && messageEvent.type === "message") {
      expect(messageEvent.content).toContain("[AI Integration Stubbed]");
      expect(messageEvent.content).toContain(testPrompt);
      expect(messageEvent.role).toBe("assistant");
    }
  });

  test("message content is truncated for long prompts (>500 chars)", async () => {
    const longPrompt = "a".repeat(600);
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(
      createTestRunParams({ prompt: longPrompt }),
    );

    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }

    const messageEvent = events.find((event) => event.type === "message");
    expect(messageEvent).toBeDefined();

    if (messageEvent !== undefined && messageEvent.type === "message") {
      expect(messageEvent.content).toContain("...");
      // Should contain first 500 characters of prompt
      expect(messageEvent.content).toContain(longPrompt.slice(0, 500));
      // The full 500-char slice is included, followed by "..."
      // The message format is: "[AI Integration Stubbed] ... {first 500 chars}..."
      expect(messageEvent.content.length).toBeLessThan(longPrompt.length + 100);
    }
  });

  test("cancel() is a no-op (does not throw)", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    // Cancel should not throw
    await expect(execution.cancel()).resolves.toBeUndefined();

    // Events should still be consumable
    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThan(0);
  });

  test("abort() is a no-op (does not throw)", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    // Abort should not throw
    await expect(execution.abort()).resolves.toBeUndefined();

    // Events should still be consumable
    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThan(0);
  });

  test("lastAssistantMessage is set in completed event", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams({ prompt: "Test" }));

    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }

    const completedEvent = events.find((event) => event.type === "completed");
    expect(completedEvent).toBeDefined();

    if (completedEvent !== undefined && completedEvent.type === "completed") {
      expect(completedEvent.lastAssistantMessage).toBeDefined();
      expect(completedEvent.lastAssistantMessage).toContain(
        "[AI Integration Stubbed]",
      );
    }
  });

  test("works with resumeSessionId (ignored by stub)", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(
      createTestRunParams({
        prompt: "Resume test",
        resumeSessionId: "claude-session-123" as ClaudeSessionId,
      }),
    );

    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }

    // Should complete successfully despite resume session ID
    const completedEvent = events.find((event) => event.type === "completed");
    expect(completedEvent).toBeDefined();
    if (completedEvent !== undefined && completedEvent.type === "completed") {
      expect(completedEvent.success).toBe(true);
    }
  });
});

describe("event stream behavior", () => {
  test("events are delivered in push order", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }

    // Verify expected order
    expect(events[0]?.type).toBe("activity");
    expect(events[1]?.type).toBe("activity");
    expect(events[2]?.type).toBe("message");
    expect(events[3]?.type).toBe("completed");
  });

  test("stream completes after all events yielded", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
    }

    // Last event should be completed
    const lastEvent = events[events.length - 1];
    expect(lastEvent?.type).toBe("completed");
  });

  test("multiple calls to events() on same execution return same iterable", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    const iterable1 = execution.events();
    const iterable2 = execution.events();

    // Both should be the same underlying channel
    expect(iterable1).toBe(iterable2);
  });
});

describe("AgentEvent type discrimination", () => {
  test("completed event with success=true has no error", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    let completedEvent: AgentEvent | undefined;
    for await (const event of execution.events()) {
      if (event.type === "completed") {
        completedEvent = event;
      }
    }

    expect(completedEvent).toBeDefined();
    if (completedEvent !== undefined && completedEvent.type === "completed") {
      expect(completedEvent.success).toBe(true);
      expect(completedEvent.error).toBeUndefined();
      expect(completedEvent.lastAssistantMessage).toBeDefined();
    }
  });

  test("message event has role and content", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    let messageEvent: AgentEvent | undefined;
    for await (const event of execution.events()) {
      if (event.type === "message") {
        messageEvent = event;
      }
    }

    expect(messageEvent).toBeDefined();
    if (messageEvent !== undefined && messageEvent.type === "message") {
      expect(messageEvent.role).toBe("assistant");
      expect(typeof messageEvent.content).toBe("string");
      expect(messageEvent.content.length).toBeGreaterThan(0);
    }
  });

  test("activity event has activity string or undefined", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    const activityEvents: AgentEvent[] = [];
    for await (const event of execution.events()) {
      if (event.type === "activity") {
        activityEvents.push(event);
      }
    }

    expect(activityEvents.length).toBeGreaterThan(0);

    // First activity should be "Thinking..."
    const firstActivity = activityEvents[0];
    if (firstActivity !== undefined && firstActivity.type === "activity") {
      expect(firstActivity.activity).toBe("Thinking...");
    }

    // Second activity should be undefined
    const secondActivity = activityEvents[1];
    if (secondActivity !== undefined && secondActivity.type === "activity") {
      expect(secondActivity.activity).toBeUndefined();
    }
  });
});

describe("integration-style test: consuming events in a loop", () => {
  test("events can be consumed in a for-await loop with early break", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    const events: AgentEvent[] = [];
    for await (const event of execution.events()) {
      events.push(event);
      if (event.type === "message") {
        break; // Early break
      }
    }

    // Should have events up to and including the first message
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1]?.type).toBe("message");
  });

  test("consuming all events completes normally", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    let eventCount = 0;
    for await (const _event of execution.events()) {
      eventCount++;
    }

    expect(eventCount).toBe(4); // activity, activity, message, completed
  });

  test("events can be filtered and collected", async () => {
    const runner = createAgentRunner(DEFAULT_AI_CONFIG);
    const execution = runner.execute(createTestRunParams());

    const activityEvents: AgentEvent[] = [];
    const messageEvents: AgentEvent[] = [];

    for await (const event of execution.events()) {
      if (event.type === "activity") {
        activityEvents.push(event);
      } else if (event.type === "message") {
        messageEvents.push(event);
      }
    }

    expect(activityEvents.length).toBe(2);
    expect(messageEvents.length).toBe(1);
  });
});
