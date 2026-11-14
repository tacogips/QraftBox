import { describe, expect, it } from "vitest";
import {
  hasQraftboxInternalPrompt,
  isInjectedSessionSystemPrompt,
  stripSystemTags,
  wrapQraftboxInternalPrompt,
} from "./strip-system-tags";

describe("stripSystemTags", () => {
  it("removes command/system metadata tags with content", () => {
    const input = [
      "hello",
      "<command-message>internal</command-message>",
      "world",
    ].join("\n");

    expect(stripSystemTags(input)).toBe("hello\n\nworld");
  });

  it("unwraps qraftbox-system-prompt and keeps inner content", () => {
    const input = [
      "<qraftbox-system-prompt>",
      "Commit this change",
      "</qraftbox-system-prompt>",
    ].join("\n");

    expect(stripSystemTags(input)).toBe("Commit this change");
  });

  it("handles mixed qraftbox wrapper and command metadata tags", () => {
    const input = [
      "<qraftbox-system-prompt>",
      "Please fix tests",
      "<system-reminder>hidden</system-reminder>",
      "</qraftbox-system-prompt>",
    ].join("\n");

    expect(stripSystemTags(input)).toBe("Please fix tests");
  });

  it("removes qraftbox internal prompt blocks", () => {
    const input = [
      '<qraftbox-internal-prompt label="ai-session-purpose" anchor="session-purpose-v1">',
      "internal prompt payload",
      "</qraftbox-internal-prompt>",
      "Visible text",
    ].join("\n");

    expect(stripSystemTags(input)).toBe("Visible text");
    expect(hasQraftboxInternalPrompt(input)).toBe(true);
    expect(hasQraftboxInternalPrompt("Visible text")).toBe(false);
  });

  it("wraps qraftbox internal prompt blocks", () => {
    const wrapped = wrapQraftboxInternalPrompt(
      "ai-session-refresh-purpose",
      "Refresh this session purpose now",
      "session-action-v1",
    );

    expect(wrapped).toContain(
      '<qraftbox-internal-prompt label="ai-session-refresh-purpose"',
    );
    expect(wrapped).toContain('anchor="session-action-v1"');
    expect(wrapped).toContain("Refresh this session purpose now");
    expect(hasQraftboxInternalPrompt(wrapped)).toBe(true);
  });
});

describe("isInjectedSessionSystemPrompt", () => {
  it("detects AGENTS bootstrap wrapper", () => {
    expect(
      isInjectedSessionSystemPrompt(
        "# AGENTS.md instructions for /g/gits/tacogips/QraftBox",
      ),
    ).toBe(true);
  });

  it("detects environment context wrapper", () => {
    expect(
      isInjectedSessionSystemPrompt(
        "<environment_context>\n  <cwd>/repo</cwd>\n</environment_context>",
      ),
    ).toBe(true);
  });

  it("detects turn aborted wrapper", () => {
    expect(
      isInjectedSessionSystemPrompt(
        "<turn_aborted>\nThe user interrupted the previous turn.\n</turn_aborted>",
      ),
    ).toBe(true);
  });

  it("detects qraftbox system prompt wrapper", () => {
    expect(
      isInjectedSessionSystemPrompt(
        "<qraftbox-system-prompt>Refresh session purpose</qraftbox-system-prompt>",
      ),
    ).toBe(true);
  });

  it("returns false for regular user message", () => {
    expect(
      isInjectedSessionSystemPrompt("Please update the tests for this module."),
    ).toBe(false);
  });
});
