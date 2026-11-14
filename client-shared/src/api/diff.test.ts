import { describe, expect, test } from "bun:test";
import { createDiffApiClient } from "./diff";

describe("shared diff api", () => {
  test("fetches context diff data and preserves server-provided stats", async () => {
    const fetchCalls: string[] = [];
    const diffApiClient = createDiffApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation: async (input: Parameters<typeof fetch>[0]) => {
        fetchCalls.push(String(input));
        return new Response(
          JSON.stringify({
            files: [
              {
                path: "src/server.ts",
                status: "modified",
                additions: 5,
                deletions: 1,
                chunks: [],
                isBinary: false,
              },
            ],
            stats: {
              totalFiles: 10,
              additions: 20,
              deletions: 3,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    });

    const diffResponse = await diffApiClient.fetchContextDiff("ctx/alpha");

    expect(fetchCalls).toEqual(["/custom-api/ctx/ctx%2Falpha/diff"]);
    expect(diffResponse.stats.totalFiles).toBe(10);
    expect(diffResponse.files[0]?.path).toBe("src/server.ts");
  });

  test("uses server error payloads when the diff request fails", async () => {
    const diffApiClient = createDiffApiClient({
      fetchImplementation: async () =>
        new Response(JSON.stringify({ error: "Diff target not available" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
    });

    await expect(diffApiClient.fetchContextDiff("ctx-beta")).rejects.toThrow(
      "Diff target not available",
    );
  });
});
