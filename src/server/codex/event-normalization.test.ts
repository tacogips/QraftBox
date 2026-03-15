import { describe, expect, test } from "vitest";
import {
  isCodexType,
  normalizeCodexType,
  readFirstCodexStringField,
} from "./event-normalization.js";

describe("normalizeCodexType()", () => {
  test("normalizes PascalCase and snake_case to a shared canonical value", () => {
    expect(normalizeCodexType("AgentMessage")).toBe("agent_message");
    expect(normalizeCodexType("agent_message")).toBe("agent_message");
    expect(normalizeCodexType("ExecCommandBegin")).toBe("exec_command_begin");
    expect(normalizeCodexType("exec_command_begin")).toBe("exec_command_begin");
  });

  test("returns undefined for non-string and blank values", () => {
    expect(normalizeCodexType(undefined)).toBeUndefined();
    expect(normalizeCodexType("   ")).toBeUndefined();
    expect(normalizeCodexType(123)).toBeUndefined();
  });
});

describe("isCodexType()", () => {
  test("matches equivalent external spellings", () => {
    expect(isCodexType("AgentMessage", "agent_message")).toBe(true);
    expect(isCodexType("agent_message", "agent_message")).toBe(true);
    expect(isCodexType("ExecCommandEnd", "exec_command_end")).toBe(true);
  });
});

describe("readFirstCodexStringField()", () => {
  test("reads aliased external keys through a single helper", () => {
    expect(
      readFirstCodexStringField({ threadId: "camel", thread_id: "snake" }, [
        "thread_id",
        "threadId",
      ]),
    ).toBe("snake");
    expect(
      readFirstCodexStringField({ threadId: "camel" }, [
        "thread_id",
        "threadId",
      ]),
    ).toBe("camel");
  });
});
