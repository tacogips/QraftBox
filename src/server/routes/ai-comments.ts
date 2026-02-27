import { Hono } from "hono";
import type {
  AiCommentQueueStore,
  NewQueuedAiComment,
} from "../ai/comment-queue-store";
import { isAiCommentSide } from "../ai/comment-queue-store";

function parseProjectPath(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveLine(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export function createAiCommentRoutes(store: AiCommentQueueStore): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const projectPath = parseProjectPath(c.req.query("projectPath"));
    if (projectPath === null) {
      return c.json({ error: "projectPath query is required" }, 400);
    }

    const comments = await store.list(projectPath);
    return c.json({ comments });
  });

  app.post("/", async (c) => {
    const body = (await c.req.json()) as Partial<NewQueuedAiComment>;

    const projectPath = parseProjectPath(body.projectPath);
    const filePath =
      typeof body.filePath === "string" && body.filePath.trim().length > 0
        ? body.filePath
        : null;
    const startLine = parsePositiveLine(body.startLine);
    const endLine = parsePositiveLine(body.endLine);
    const side = body.side;
    const source = body.source;
    const prompt =
      typeof body.prompt === "string" && body.prompt.trim().length > 0
        ? body.prompt.trim()
        : null;

    if (projectPath === null) {
      return c.json({ error: "projectPath is required" }, 400);
    }
    if (filePath === null) {
      return c.json({ error: "filePath is required" }, 400);
    }
    if (startLine === null || endLine === null || endLine < startLine) {
      return c.json({ error: "startLine/endLine are invalid" }, 400);
    }
    if (!isAiCommentSide(side)) {
      return c.json({ error: "side must be old or new" }, 400);
    }
    if (
      source !== "diff" &&
      source !== "current-state" &&
      source !== "full-file"
    ) {
      return c.json({ error: "source is invalid" }, 400);
    }
    if (prompt === null) {
      return c.json({ error: "prompt is required" }, 400);
    }

    const saved = await store.add({
      projectPath,
      filePath,
      startLine,
      endLine,
      side,
      source,
      prompt,
    });

    return c.json({ comment: saved }, 201);
  });

  app.delete("/:commentId", async (c) => {
    const projectPath = parseProjectPath(c.req.query("projectPath"));
    const commentId = c.req.param("commentId");

    if (projectPath === null) {
      return c.json({ error: "projectPath query is required" }, 400);
    }
    if (commentId.trim().length === 0) {
      return c.json({ error: "commentId is required" }, 400);
    }

    const deleted = await store.remove(projectPath, commentId);
    return c.json({ success: deleted });
  });

  app.put("/:commentId", async (c) => {
    const projectPath = parseProjectPath(c.req.query("projectPath"));
    const commentId = c.req.param("commentId");
    const body = (await c.req.json()) as { prompt?: unknown };
    const prompt =
      typeof body.prompt === "string" ? body.prompt.trim() : undefined;

    if (projectPath === null) {
      return c.json({ error: "projectPath query is required" }, 400);
    }
    if (commentId.trim().length === 0) {
      return c.json({ error: "commentId is required" }, 400);
    }
    if (prompt === undefined || prompt.length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }

    const updated = await store.updatePrompt(projectPath, commentId, prompt);
    if (updated === null) {
      return c.json({ error: "comment not found" }, 404);
    }
    return c.json({ comment: updated });
  });

  app.delete("/", async (c) => {
    const projectPath = parseProjectPath(c.req.query("projectPath"));
    if (projectPath === null) {
      return c.json({ error: "projectPath query is required" }, 400);
    }

    const deletedCount = await store.clear(projectPath);
    return c.json({ success: true, deletedCount });
  });

  return app;
}
