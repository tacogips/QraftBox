import { describe, expect, test, vi } from "vitest";
import { createWorkersApiClient } from "./workers";

describe("workers api client", () => {
  test("lists workers with an encoded project path filter", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workers: [
            {
              id: "worker-1",
              title: "git push",
              projectPath: "/tmp/demo repo",
              phase: "pushing",
              source: "git",
              status: "running",
              createdAt: "2026-03-15T00:00:00.000Z",
              updatedAt: "2026-03-15T00:00:01.000Z",
              commandSummary: "git push",
              outputPreview: "Counting objects...",
              canCancel: true,
            },
          ],
        }),
      ),
    );
    const apiClient = createWorkersApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation,
    });

    await expect(apiClient.listWorkers("/tmp/demo repo")).resolves.toEqual([
      expect.objectContaining({
        id: "worker-1",
        phase: "pushing",
      }),
    ]);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/custom-api/workers?projectPath=%2Ftmp%2Fdemo+repo",
    );
  });

  test("fetches worker details and posts cancellation requests", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            worker: {
              id: "worker-2",
              title: "AI git commit",
              projectPath: "/repo",
              phase: "committing",
              source: "claude-code-agent",
              status: "running",
              createdAt: "2026-03-15T00:00:00.000Z",
              updatedAt: "2026-03-15T00:00:01.000Z",
              commandSummary: "claude -p ...",
              outputPreview: "Analyzing changes...",
              canCancel: true,
              commands: [],
              logs: [],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            workerId: "worker-2",
            cancelled: true,
          }),
        ),
      );
    const apiClient = createWorkersApiClient({ fetchImplementation });

    await expect(apiClient.fetchWorker("worker-2")).resolves.toMatchObject({
      id: "worker-2",
      source: "claude-code-agent",
    });
    await expect(apiClient.cancelWorker("worker-2")).resolves.toEqual({
      success: true,
      workerId: "worker-2",
      cancelled: true,
    });

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "/api/workers/worker-2",
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      "/api/workers/worker-2/cancel",
      {
        method: "POST",
      },
    );
  });

  test("surfaces json api errors for failed worker requests", async () => {
    const apiClient = createWorkersApiClient({
      fetchImplementation: async (): Promise<Response> =>
        new Response(JSON.stringify({ error: "worker not found" }), {
          status: 404,
        }),
    });

    await expect(apiClient.fetchWorker("missing")).rejects.toThrow(
      "worker not found",
    );
  });
});
