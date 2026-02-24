import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

  test("GET /prompts/:name returns session refresh-purpose prompt", async () => {
    const app = createGitActionsRoutes();
    const res = await app.request("/prompts/ai-session-refresh-purpose");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      path: string;
      content: string;
      source: string;
    };
    expect(body.name).toBe("ai-session-refresh-purpose");
    expect(body.path).toContain(
      ".config/qraftbox/prompt/ai-session-refresh-purpose.md",
    );
    expect(body.content).toContain("Refresh the current session purpose");
    expect(body.source).toBe("file");
  });

  test("GET /prompts/:name returns session resume prompt", async () => {
    const app = createGitActionsRoutes();
    const res = await app.request("/prompts/ai-session-resume");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      path: string;
      content: string;
      source: string;
    };
    expect(body.name).toBe("ai-session-resume");
    expect(body.path).toContain(".config/qraftbox/prompt/ai-session-resume.md");
    expect(body.content).toContain("resume this session");
    expect(body.source).toBe("file");
  });

  test("GET /prompts/:name rejects invalid names", async () => {
    const app = createGitActionsRoutes();
    const res = await app.request("/prompts/unknown");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid prompt name");
  });

  test("PUT /prompts/:name updates commit prompt", async () => {
    const homeBackup = process.env["HOME"];
    const tempHome = await mkdtemp(path.join(tmpdir(), "qraftbox-home-"));
    process.env["HOME"] = tempHome;
    const app = createGitActionsRoutes();

    try {
      const res = await app.request("/prompts/commit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content:
            "You are the commit agent. Summarize staged changes clearly.",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        name: string;
        path: string;
        content: string;
        source: string;
      };
      expect(body.name).toBe("commit");
      expect(body.path).toContain(".config/qraftbox/prompt/commit.md");
      expect(body.content).toContain("You are the commit agent.");
      expect(body.source).toBe("file");
    } finally {
      if (homeBackup === undefined) {
        delete process.env["HOME"];
      } else {
        process.env["HOME"] = homeBackup;
      }
      await rm(tempHome, { recursive: true, force: true });
    }
  });

  test("PUT /prompts/:name rejects empty content", async () => {
    const app = createGitActionsRoutes();
    const res = await app.request("/prompts/create-pr", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "   " }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("content must be a non-empty string");
  });

  test("PUT /prompts/:name updates session resume prompt", async () => {
    const homeBackup = process.env["HOME"];
    const tempHome = await mkdtemp(path.join(tmpdir(), "qraftbox-home-"));
    process.env["HOME"] = tempHome;
    const app = createGitActionsRoutes();

    try {
      const res = await app.request("/prompts/ai-session-resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "resume this session and continue from latest context",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        name: string;
        path: string;
        content: string;
        source: string;
      };
      expect(body.name).toBe("ai-session-resume");
      expect(body.path).toContain(".config/qraftbox/prompt/ai-session-resume.md");
      expect(body.content).toContain(
        "resume this session and continue from latest context",
      );
      expect(body.source).toBe("file");
    } finally {
      if (homeBackup === undefined) {
        delete process.env["HOME"];
      } else {
        process.env["HOME"] = homeBackup;
      }
      await rm(tempHome, { recursive: true, force: true });
    }
  });

  test("POST /init initializes a non-git directory", async () => {
    const app = createGitActionsRoutes();
    const dir = await mkdtemp(path.join(tmpdir(), "qraftbox-git-init-"));

    try {
      const res = await app.request("/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath: dir }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        output: string;
        error?: string;
      };
      expect(body.success).toBe(true);
      expect(body.error).toBeUndefined();
      expect(body.output.toLowerCase()).toContain("initialized");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("POST /init rejects existing git repository", async () => {
    const app = createGitActionsRoutes();
    const dir = await mkdtemp(path.join(tmpdir(), "qraftbox-git-init-"));

    try {
      await Bun.$`git init ${dir}`.quiet();

      const res = await app.request("/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath: dir }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("already a git repository");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
