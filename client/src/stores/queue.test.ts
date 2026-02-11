import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { createQueueStore, type QueueStore } from "./queue";

describe("createQueueStore", () => {
  let store: QueueStore;
  let fetchMock: Mock<typeof global.fetch>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    store = createQueueStore();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    // Restore original fetch to avoid polluting other test files
    global.fetch = originalFetch;
  });

  async function loadWithSessions(
    sessions: {
      id: string;
      state: string;
      prompt: string;
      createdAt: string;
      context: { references: unknown[] };
    }[],
  ): Promise<void> {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions }),
    } as Response);
    await store.loadQueue();
  }

  it("cancels a running session and moves it to completed list as cancelled", async () => {
    await loadWithSessions([
      {
        id: "s1",
        state: "running",
        prompt: "test",
        createdAt: "2026-02-09T00:00:00.000Z",
        context: { references: [] },
      },
    ]);

    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    await store.cancelSession("s1");

    expect(fetchMock).toHaveBeenLastCalledWith("/api/ai/sessions/s1/cancel", {
      method: "POST",
    });
    expect(store.running).toHaveLength(0);
    expect(store.completed).toHaveLength(1);
    expect(store.completed[0]?.id).toBe("s1");
    expect(store.completed[0]?.state).toBe("cancelled");
  });

  it("cancels a queued session and removes it from queue", async () => {
    await loadWithSessions([
      {
        id: "s2",
        state: "queued",
        prompt: "test2",
        createdAt: "2026-02-09T00:00:00.000Z",
        context: { references: [] },
      },
    ]);

    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    await store.cancelSession("s2");

    expect(store.queued).toHaveLength(0);
    expect(store.completed[0]?.id).toBe("s2");
    expect(store.completed[0]?.state).toBe("cancelled");
  });

  it("sets error and throws when cancel request fails", async () => {
    await loadWithSessions([
      {
        id: "s3",
        state: "running",
        prompt: "test3",
        createdAt: "2026-02-09T00:00:00.000Z",
        context: { references: [] },
      },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      statusText: "Bad Request",
    } as Response);

    await expect(store.cancelSession("s3")).rejects.toThrow(
      "Failed to cancel session: Bad Request",
    );
    expect(store.error).toBe("Failed to cancel session: Bad Request");
    expect(store.running[0]?.id).toBe("s3");
  });
});
