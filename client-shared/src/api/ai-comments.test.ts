import { describe, expect, test, vi } from "vitest";
import { createAiCommentsApiClient } from "./ai-comments";

describe("shared ai comments api", () => {
  test("lists queued comments for a project", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          comments: [
            {
              id: "comment-1",
              projectPath: "/tmp/repo",
              filePath: "src/main.ts",
              startLine: 2,
              endLine: 4,
              side: "new",
              source: "full-file",
              prompt: "Review this range.",
              createdAt: 1_762_345_678_000,
            },
          ],
        }),
      ),
    );
    const apiClient = createAiCommentsApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation,
    });

    await expect(apiClient.listComments("/tmp/repo")).resolves.toEqual([
      {
        id: "comment-1",
        projectPath: "/tmp/repo",
        filePath: "src/main.ts",
        startLine: 2,
        endLine: 4,
        side: "new",
        source: "full-file",
        prompt: "Review this range.",
        createdAt: 1_762_345_678_000,
      },
    ]);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/custom-api/ai-comments?projectPath=%2Ftmp%2Frepo",
    );
  });

  test("queues a full-file comment through the configured api base", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          comment: {
            id: "1",
            projectPath: "/tmp/repo",
            filePath: "src/main.ts",
            startLine: 4,
            endLine: 6,
            side: "new",
            source: "full-file",
            prompt: "Please adjust this block.",
            createdAt: 1_762_345_678_000,
          },
        }),
      ),
    );
    const apiClient = createAiCommentsApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation,
    });

    await expect(
      apiClient.addComment({
        projectPath: "/tmp/repo",
        filePath: "src/main.ts",
        startLine: 4,
        endLine: 6,
        side: "new",
        source: "full-file",
        prompt: "Please adjust this block.",
      }),
    ).resolves.toEqual({
      id: "1",
      projectPath: "/tmp/repo",
      filePath: "src/main.ts",
      startLine: 4,
      endLine: 6,
      side: "new",
      source: "full-file",
      prompt: "Please adjust this block.",
      createdAt: 1_762_345_678_000,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/custom-api/ai-comments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: "/tmp/repo",
          filePath: "src/main.ts",
          startLine: 4,
          endLine: 6,
          side: "new",
          source: "full-file",
          prompt: "Please adjust this block.",
        }),
      },
    );
  });

  test("updates an existing queued comment", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          comment: {
            id: "comment-1",
            projectPath: "/tmp/repo",
            filePath: "src/main.ts",
            startLine: 4,
            endLine: 6,
            side: "new",
            source: "full-file",
            prompt: "Updated prompt.",
            createdAt: 1_762_345_678_000,
          },
        }),
      ),
    );
    const apiClient = createAiCommentsApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation,
    });

    await expect(
      apiClient.updateComment("/tmp/repo", "comment-1", "Updated prompt."),
    ).resolves.toEqual({
      id: "comment-1",
      projectPath: "/tmp/repo",
      filePath: "src/main.ts",
      startLine: 4,
      endLine: 6,
      side: "new",
      source: "full-file",
      prompt: "Updated prompt.",
      createdAt: 1_762_345_678_000,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/custom-api/ai-comments/comment-1?projectPath=%2Ftmp%2Frepo",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Updated prompt." }),
      },
    );
  });

  test("removes a queued comment", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true })),
    );
    const apiClient = createAiCommentsApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation,
    });

    await expect(
      apiClient.removeComment("/tmp/repo", "comment-1"),
    ).resolves.toBe(true);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/custom-api/ai-comments/comment-1?projectPath=%2Ftmp%2Frepo",
      {
        method: "DELETE",
      },
    );
  });

  test("clears all queued comments for a project", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, deletedCount: 3 })),
    );
    const apiClient = createAiCommentsApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation,
    });

    await expect(apiClient.clearComments("/tmp/repo")).resolves.toBe(3);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/custom-api/ai-comments?projectPath=%2Ftmp%2Frepo",
      {
        method: "DELETE",
      },
    );
  });
});
