import { describe, expect, test } from "vitest";
import { createInMemoryAiCommentQueueStore } from "./comment-queue-store";

describe("AiCommentQueueStore", () => {
  test("adds and lists comments in creation order", async () => {
    const store = createInMemoryAiCommentQueueStore();

    const c1 = await store.add({
      projectPath: "/repo/a",
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 10,
      side: "new",
      source: "diff",
      prompt: "first",
    });
    const c2 = await store.add({
      projectPath: "/repo/a",
      filePath: "src/b.ts",
      startLine: 20,
      endLine: 22,
      side: "new",
      source: "current-state",
      prompt: "second",
    });

    const listed = await store.list("/repo/a");
    expect(listed).toHaveLength(2);
    expect(listed[0]?.id).toBe(c1.id);
    expect(listed[1]?.id).toBe(c2.id);
  });

  test("scopes comments by projectPath", async () => {
    const store = createInMemoryAiCommentQueueStore();

    await store.add({
      projectPath: "/repo/a",
      filePath: "src/a.ts",
      startLine: 1,
      endLine: 1,
      side: "new",
      source: "diff",
      prompt: "a",
    });
    await store.add({
      projectPath: "/repo/b",
      filePath: "src/b.ts",
      startLine: 2,
      endLine: 2,
      side: "new",
      source: "diff",
      prompt: "b",
    });

    const a = await store.list("/repo/a");
    const b = await store.list("/repo/b");
    expect(a).toHaveLength(1);
    expect(a[0]?.projectPath).toBe("/repo/a");
    expect(b).toHaveLength(1);
    expect(b[0]?.projectPath).toBe("/repo/b");
  });

  test("removes single comment and clears project queue", async () => {
    const store = createInMemoryAiCommentQueueStore();

    const c1 = await store.add({
      projectPath: "/repo/a",
      filePath: "src/a.ts",
      startLine: 1,
      endLine: 1,
      side: "new",
      source: "diff",
      prompt: "a",
    });
    await store.add({
      projectPath: "/repo/a",
      filePath: "src/b.ts",
      startLine: 2,
      endLine: 2,
      side: "new",
      source: "diff",
      prompt: "b",
    });

    const updated = await store.updatePrompt("/repo/a", c1.id, "edited");
    expect(updated).not.toBeNull();
    expect(updated?.prompt).toBe("edited");

    const removed = await store.remove("/repo/a", c1.id);
    expect(removed).toBe(true);
    expect((await store.list("/repo/a")).length).toBe(1);

    const deletedCount = await store.clear("/repo/a");
    expect(deletedCount).toBe(1);
    expect(await store.list("/repo/a")).toEqual([]);
  });
});
