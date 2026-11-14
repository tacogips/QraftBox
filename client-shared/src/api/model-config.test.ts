import { describe, expect, test } from "bun:test";
import { createModelConfigApiClient } from "./model-config";

describe("model config api client", () => {
  test("builds prompt-template urls with an optional category filter", async () => {
    const calls: string[] = [];
    const apiClient = createModelConfigApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation: async (input): Promise<Response> => {
        calls.push(String(input));
        return new Response(JSON.stringify({ prompts: [] }), { status: 200 });
      },
    });

    await apiClient.fetchPromptTemplates("ctx-1", "commit");
    await apiClient.fetchPromptTemplates("ctx-2");

    expect(calls).toEqual([
      "/custom-api/ctx/ctx-1/prompts?category=commit",
      "/custom-api/ctx/ctx-2/prompts",
    ]);
  });

  test("surfaces model-config api errors from json responses", async () => {
    const apiClient = createModelConfigApiClient({
      fetchImplementation: async (): Promise<Response> =>
        new Response(JSON.stringify({ error: "profile already exists" }), {
          status: 409,
        }),
    });

    await expect(
      apiClient.createModelProfile({
        name: "Fast",
        vendor: "openai",
        model: "gpt-5.3-codex",
        arguments: [],
      }),
    ).rejects.toThrow("profile already exists");
  });
});
