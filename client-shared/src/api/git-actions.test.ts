import { describe, expect, test, vi } from "vitest";
import { createGitActionsApiClient } from "./git-actions";

describe("shared git actions api", () => {
  test("encodes pull request status queries against the configured api base", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: {
            hasPR: false,
            pr: null,
            canCreatePR: true,
            baseBranch: "main",
            availableBaseBranches: ["main", "develop"],
          },
        }),
      ),
    );
    const apiClient = createGitActionsApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation,
    });

    await expect(
      apiClient.fetchPullRequestStatus("/tmp/demo repo"),
    ).resolves.toMatchObject({
      canCreatePR: true,
      baseBranch: "main",
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/custom-api/git-actions/pr-status?projectPath=%2Ftmp%2Fdemo+repo",
    );
  });

  test("posts commit and cancel requests with json bodies", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            output: "commit complete",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            actionId: "action-1",
            cancelled: true,
          }),
        ),
      );
    const apiClient = createGitActionsApiClient({ fetchImplementation });

    await expect(
      apiClient.commit({
        projectPath: "/repo",
        actionId: "action-1",
        customCtx: "focus on changed files",
      }),
    ).resolves.toEqual({
      success: true,
      output: "commit complete",
    });
    await expect(apiClient.cancel("action-1")).resolves.toEqual({
      success: true,
      actionId: "action-1",
      cancelled: true,
    });

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "/api/git-actions/commit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: "/repo",
          actionId: "action-1",
          customCtx: "focus on changed files",
        }),
      },
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      "/api/git-actions/cancel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: "action-1",
        }),
      },
    );
  });

  test("surfaces server json errors for failed git action requests", async () => {
    const apiClient = createGitActionsApiClient({
      fetchImplementation: async (): Promise<Response> =>
        new Response(JSON.stringify({ error: "Pull rejected" }), {
          status: 409,
        }),
    });

    await expect(apiClient.pull("/repo", "action-2")).rejects.toThrow(
      "Pull rejected",
    );
  });
});
