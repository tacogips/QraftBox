import { describe, expect, it } from "vitest";
import {
  hasQraftboxInternalPrompt,
  stripSystemTags,
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
});
