import { afterEach, describe, expect, test } from "bun:test";
import { createWorkersRoutes } from "./workers";
import { processWorkerStore } from "../workers/process-worker-store.js";

afterEach(() => {
  processWorkerStore.clear();
});

describe("workers routes", () => {
  test("lists workers filtered by project path", async () => {
    processWorkerStore.createWorker({
      workerId: "worker-1",
      title: "git push",
      projectPath: "/repo-a",
      phase: "pushing",
      source: "git",
      canCancel: true,
    });
    processWorkerStore.createWorker({
      workerId: "worker-2",
      title: "AI git commit",
      projectPath: "/repo-b",
      phase: "committing",
      source: "claude-code-agent",
      canCancel: true,
    });

    const app = createWorkersRoutes();
    const response = await app.request("/?projectPath=%2Frepo-a");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      readonly workers: readonly { readonly id: string }[];
    };
    expect(body.workers.map((worker) => worker.id)).toEqual(["worker-1"]);
  });

  test("returns worker detail when found", async () => {
    processWorkerStore.createWorker({
      workerId: "worker-detail",
      title: "git pull",
      projectPath: "/repo",
      phase: "pulling",
      source: "git",
      canCancel: true,
    });
    const commandId = processWorkerStore.recordCommandStart("worker-detail", {
      commandText: "git pull",
      cwd: "/repo",
    });
    processWorkerStore.recordCommandOutput("worker-detail", {
      commandId: commandId ?? undefined,
      channel: "stdout",
      text: "Already up to date.\n",
    });

    const app = createWorkersRoutes();
    const response = await app.request("/worker-detail");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      readonly worker: {
        readonly id: string;
        readonly commands: readonly { readonly commandText: string }[];
        readonly logs: readonly { readonly text: string }[];
      };
    };
    expect(body.worker.id).toBe("worker-detail");
    expect(body.worker.commands[0]?.commandText).toBe("git pull");
    expect(body.worker.logs[0]?.text).toContain("Already up to date.");
  });

  test("returns 404 for unknown workers", async () => {
    const app = createWorkersRoutes();
    const response = await app.request("/missing-worker");

    expect(response.status).toBe(404);
    const body = (await response.json()) as { readonly error: string };
    expect(body.error).toContain("Worker not found");
  });
});
