import { describe, expect, test } from "bun:test";
import { createGitActionsRoutes } from "./git-actions";

describe("git-actions routes", () => {
  test("GET /prompts/:name returns commit prompt", async () => {
    const app = createGitActionsRoutes();
    const res = await app.request("/prompts/commit");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      path: string;
      content: string;
      source: string;
    };
    expect(body.name).toBe("commit");
    expect(body.path).toContain(".config/qraftbox/prompt/commit.md");
    expect(body.content.length).toBeGreaterThan(0);
    expect(body.source).toBe("file");
  });

  test("GET /prompts/:name returns create-pr prompt", async () => {
    const app = createGitActionsRoutes();
    const res = await app.request("/prompts/create-pr");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      path: string;
      content: string;
      source: string;
    };
    expect(body.name).toBe("create-pr");
    expect(body.path).toContain(".config/qraftbox/prompt/create-pr.md");
    expect(body.content.length).toBeGreaterThan(0);
    expect(body.source).toBe("file");
  });

  test("GET /prompts/:name returns session-purpose prompt", async () => {
    const app = createGitActionsRoutes();
    const res = await app.request("/prompts/ai-session-purpose");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      path: string;
      content: string;
      source: string;
    };
    expect(body.name).toBe("ai-session-purpose");
    expect(body.path).toContain(
      ".config/qraftbox/prompt/ai-session-purpose.md",
    );
    expect(body.content).toContain(
      "You summarize a coding session's current objective.",
    );
    expect(body.source).toBe("file");
  });

  test("GET /prompts/:name rejects invalid names", async () => {
    const app = createGitActionsRoutes();
    const res = await app.request("/prompts/unknown");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid prompt name");
  });
});
