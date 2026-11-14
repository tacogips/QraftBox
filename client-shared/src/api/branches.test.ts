import { describe, expect, test, vi } from "vitest";
import { createBranchesApiClient } from "./branches";

describe("shared branches api", () => {
  test("lists branches with query parameters", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          branches: [
            {
              name: "main",
              isCurrent: false,
              isDefault: true,
              isRemote: false,
              lastCommit: {
                hash: "abc123",
                message: "latest commit",
                author: "octocat",
                date: 1234567890,
              },
            },
            {
              name: "feature/solid",
              isCurrent: true,
              isDefault: false,
              isRemote: false,
              lastCommit: {
                hash: "def456",
                message: "work in progress",
                author: "octocat",
                date: 1234567899,
              },
            },
          ],
          current: "feature/solid",
          defaultBranch: "main",
          total: 2,
          offset: 10,
          limit: 25,
        }),
      ),
    );
    const branchesApiClient = createBranchesApiClient({ fetchImplementation });

    await expect(
      branchesApiClient.listBranches("ctx-1", {
        offset: 10,
        limit: 25,
      }),
    ).resolves.toEqual({
      branches: [
        {
          name: "main",
          isCurrent: false,
          isDefault: true,
          isRemote: false,
          lastCommit: {
            hash: "abc123",
            message: "latest commit",
            author: "octocat",
            date: 1234567890,
          },
        },
        {
          name: "feature/solid",
          isCurrent: true,
          isDefault: false,
          isRemote: false,
          lastCommit: {
            hash: "def456",
            message: "work in progress",
            author: "octocat",
            date: 1234567899,
          },
        },
      ],
      current: "feature/solid",
      defaultBranch: "main",
      total: 2,
      offset: 10,
      limit: 25,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/ctx/ctx-1/branches?offset=10&limit=25",
    );
  });

  test("posts checkout requests and surfaces server errors", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            previousBranch: "main",
            currentBranch: "feature/solid",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Cannot switch branches" }), {
          status: 409,
        }),
      );
    const branchesApiClient = createBranchesApiClient({ fetchImplementation });

    await expect(
      branchesApiClient.checkoutBranch("ctx-2", {
        branch: "feature/solid",
      }),
    ).resolves.toEqual({
      success: true,
      previousBranch: "main",
      currentBranch: "feature/solid",
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "/api/ctx/ctx-2/branches/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: "feature/solid" }),
      },
    );

    await expect(
      branchesApiClient.checkoutBranch("ctx-2", {
        branch: "feature/conflict",
      }),
    ).rejects.toThrow("Cannot switch branches");
  });
});
