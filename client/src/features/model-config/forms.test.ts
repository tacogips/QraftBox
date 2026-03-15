import { describe, expect, test } from "bun:test";
import { parseArgumentLines, profileSummary, suggestModelId } from "./forms";

describe("model-config helpers", () => {
  test("parses newline-separated command arguments", () => {
    expect(parseArgumentLines("--one\n \n--two")).toEqual(["--one", "--two"]);
  });

  test("suggests a default model id for each vendor", () => {
    expect(suggestModelId("anthropics")).toBe("claude-opus-4-6");
    expect(suggestModelId("openai")).toBe("gpt-5.3-codex");
  });

  test("summarizes the currently selected profile", () => {
    expect(
      profileSummary("profile-1", [
        {
          id: "profile-1",
          name: "Fast",
          vendor: "openai",
          authMode: "cli_auth",
          model: "gpt-5.3-codex",
          arguments: [],
          createdAt: "2026-03-09T00:00:00Z",
          updatedAt: "2026-03-09T00:00:00Z",
        },
      ]),
    ).toBe("openai / gpt-5.3-codex");
  });
});
