import { describe, expect, test, vi } from "vitest";
import { createWorktreeApiClient } from "./worktree";

describe("shared worktree api", () => {
  test("lists worktrees for a context", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          worktrees: [
            {
              path: "/repos/alpha",
              head: "abc123",
              branch: "main",
              isMain: true,
              locked: false,
              prunable: false,
              mainRepositoryPath: "/repos/alpha",
            },
          ],
          mainRepository: "/repos/alpha",
        }),
      ),
    );
    const worktreeApiClient = createWorktreeApiClient({ fetchImplementation });

    await expect(worktreeApiClient.listWorktrees("ctx-1")).resolves.toEqual({
      worktrees: [
        {
          path: "/repos/alpha",
          head: "abc123",
          branch: "main",
          isMain: true,
          locked: false,
          prunable: false,
          mainRepositoryPath: "/repos/alpha",
        },
      ],
      mainRepository: "/repos/alpha",
    });
    expect(fetchImplementation).toHaveBeenCalledWith("/api/ctx/ctx-1/worktree");
  });

  test("posts create-worktree requests and surfaces server errors", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            path: "/repos/worktrees/wt-2",
            branch: "wt-2",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Branch already exists" }), {
          status: 409,
        }),
      );
    const worktreeApiClient = createWorktreeApiClient({ fetchImplementation });

    await expect(
      worktreeApiClient.createWorktree("ctx-2", {
        branch: "wt-2",
        worktreeName: "wt-2",
        createBranch: true,
        baseBranch: "main",
      }),
    ).resolves.toEqual({
      success: true,
      path: "/repos/worktrees/wt-2",
      branch: "wt-2",
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "/api/ctx/ctx-2/worktree",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: "wt-2",
          worktreeName: "wt-2",
          createBranch: true,
          baseBranch: "main",
        }),
      },
    );

    await expect(
      worktreeApiClient.createWorktree("ctx-2", {
        branch: "wt-3",
        worktreeName: "wt-3",
        createBranch: true,
        baseBranch: "main",
      }),
    ).rejects.toThrow("Branch already exists");
  });
});
