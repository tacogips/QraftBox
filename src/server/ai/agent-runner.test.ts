/**
 * AgentRunner Tests
 *
 * Tests for agent execution covering factory function, StubbedAgentRunner behavior,
 * event stream, and AgentEvent type discrimination.
 */

import { describe, test, expect } from "vitest";
import {
  createAgentRunner,
  type AgentEvent,
  type AgentRunParams,
} from "./agent-runner.js";
import type { ClaudeSessionId } from "../../types/ai.js";
import { DEFAULT_AI_CONFIG } from "../../types/ai.js";

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
