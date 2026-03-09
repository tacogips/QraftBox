import { describe, expect, test } from "bun:test";
import { createCommitApiClient } from "./commits";

describe("commit api client", () => {
  test("builds commit-log requests with encoded context ids and query params", async () => {
    const calls: string[] = [];
    const apiClient = createCommitApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation: async (input): Promise<Response> => {
        calls.push(String(input));
        return new Response(
          JSON.stringify({
            commits: [],
            pagination: {
              offset: 50,
              limit: 50,
              total: 70,
              hasMore: true,
            },
            branch: "main",
          }),
          { status: 200 },
        );
      },
    });

    await apiClient.fetchCommitLog("ctx/demo", {
      limit: 50,
      offset: 50,
      search: "fix race",
    });

    expect(calls).toEqual([
      "/custom-api/ctx/ctx%2Fdemo/commits?limit=50&offset=50&search=fix+race",
    ]);
  });

  test("fetches commit detail and diff through the shared api base", async () => {
    const calls: string[] = [];
    const apiClient = createCommitApiClient({
      fetchImplementation: async (input): Promise<Response> => {
        calls.push(String(input));
        if (calls.length === 1) {
          return new Response(
            JSON.stringify({
              hash: "abc1234",
              shortHash: "abc1234",
              message: "Fix stale refresh",
              body: "",
              author: { name: "Taco", email: "taco@example.com" },
              committer: { name: "Taco", email: "taco@example.com" },
              date: 1_741_478_400_000,
              parentHashes: [],
              stats: { filesChanged: 1, additions: 4, deletions: 1 },
              files: [],
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            files: [
              {
                path: "src/app.ts",
                status: "modified",
                additions: 4,
                deletions: 1,
                chunks: [],
                isBinary: false,
              },
            ],
          }),
          { status: 200 },
        );
      },
    });

    const detail = await apiClient.fetchCommitDetail("ctx-1", "abc1234");
    const diffFiles = await apiClient.fetchCommitDiff("ctx-1", "abc1234");

    expect(calls).toEqual([
      "/api/ctx/ctx-1/commits/abc1234",
      "/api/ctx/ctx-1/commits/abc1234/diff",
    ]);
    expect(detail.stats.filesChanged).toBe(1);
    expect(diffFiles[0]?.path).toBe("src/app.ts");
  });

  test("surfaces server json errors for failed commit requests", async () => {
    const apiClient = createCommitApiClient({
      fetchImplementation: async (): Promise<Response> =>
        new Response(JSON.stringify({ error: "Commit not found" }), {
          status: 404,
        }),
    });

    await expect(
      apiClient.fetchCommitDetail("ctx-1", "deadbeef"),
    ).rejects.toThrow("Commit not found");
  });
});
