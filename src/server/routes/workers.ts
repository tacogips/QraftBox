import { Hono } from "hono";
import { cancelGitAction } from "../git-actions/executor.js";
import { processWorkerStore } from "../workers/process-worker-store.js";

interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function createWorkersRoutes(): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const projectPath = c.req.query("projectPath");
    return c.json({
      workers: processWorkerStore.listWorkers({
        projectPath,
      }),
    });
  });

  app.get("/:id", (c) => {
    const workerId = c.req.param("id");
    const worker = processWorkerStore.getWorker(workerId);
    if (worker === null) {
      const errorResponse: ErrorResponse = {
        error: `Worker not found: ${workerId}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    return c.json({ worker });
  });

  app.post("/:id/cancel", async (c) => {
    const workerId = c.req.param("id");
    if (!isNonEmptyString(workerId)) {
      const errorResponse: ErrorResponse = {
        error: "workerId must be a non-empty string",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const cancelled = await cancelGitAction(workerId);
    return c.json({
      success: true,
      workerId,
      cancelled,
    });
  });

  return app;
}
