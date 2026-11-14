import { describe, expect, test } from "bun:test";
import { createSystemInfoApiClient } from "./system-info";

describe("system info api client", () => {
  test("fetches system info from the configured api base url", async () => {
    const calls: string[] = [];
    const apiClient = createSystemInfoApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation: async (input): Promise<Response> => {
        calls.push(String(input));
        return new Response(
          JSON.stringify({
            git: { version: "2.48.1", error: null },
            claudeCode: { version: "1.2.3", error: null },
            codexCode: { version: "0.9.0", error: null },
            models: {
              promptModel: "claude-opus-4-6",
              assistantModel: "gpt-5.3-codex",
            },
            claudeCodeUsage: null,
            codexCodeUsage: null,
          }),
          { status: 200 },
        );
      },
    });

    const result = await apiClient.fetchSystemInfo();

    expect(calls).toEqual(["/custom-api/system-info"]);
    expect(result.models.assistantModel).toBe("gpt-5.3-codex");
  });

  test("surfaces json api errors when the request fails", async () => {
    const apiClient = createSystemInfoApiClient({
      fetchImplementation: async (): Promise<Response> =>
        new Response(JSON.stringify({ error: "system info unavailable" }), {
          status: 503,
        }),
    });

    await expect(apiClient.fetchSystemInfo()).rejects.toThrow(
      "system info unavailable",
    );
  });
});
