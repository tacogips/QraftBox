import { describe, expect, test } from "bun:test";
import { buildAgentAuthEnv } from "./claude-env";

describe("buildAgentAuthEnv", () => {
  test("masks Claude API key env vars in cli_auth mode", () => {
    const env = buildAgentAuthEnv("anthropics", "cli_auth");
    expect(env["ANTHROPIC_API_KEY"]).toBe("");
    expect(env["CLAUDE_API_KEY"]).toBe("");
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe("");
  });

  test("masks Codex API key env vars in cli_auth mode", () => {
    const env = buildAgentAuthEnv("openai", "cli_auth");
    expect(env["OPENAI_API_KEY"]).toBe("");
    expect(env["CODEX_API_KEY"]).toBe("");
  });

  test("returns no overrides in api_key mode", () => {
    expect(buildAgentAuthEnv("anthropics", "api_key")).toEqual({});
    expect(buildAgentAuthEnv("openai", "api_key")).toEqual({});
  });
});
