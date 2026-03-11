import { describe, expect, test, vi } from "vitest";
import { createAiCommentsApiClient } from "./ai-comments";

describe("shared ai comments api", () => {
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
});
