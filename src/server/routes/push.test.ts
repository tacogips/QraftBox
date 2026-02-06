/**
 * Push Routes Tests
 *
 * Tests for push API routes using dependency injection.
 * This approach avoids mock.module() which causes global test pollution.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createPushRoutes, validatePushRequest } from "./push";
import type { PushRoutesDependencies } from "./push";
import type { ContextManager } from "../workspace/context-manager";
import type { WorkspaceTab } from "../../types/workspace";
import type {
  PushPromptContext,
  PushResult,
  PushStatus,
} from "../../types/push-context";
import type { Remote } from "../push/executor";

/**
 * Create mock dependencies for testing
 */
function createMockDependencies(): PushRoutesDependencies & {
  mockBuildContext: ReturnType<typeof mock>;
  mockExecutePush: ReturnType<typeof mock>;
  mockPreviewPush: ReturnType<typeof mock>;
  mockGetPushStatus: ReturnType<typeof mock>;
  mockGetRemotes: ReturnType<typeof mock>;
} {
  const mockBuildContext = mock(
    async (): Promise<PushPromptContext> => ({
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      hasUpstream: true,
      aheadCount: 2,
      behindCount: 0,
      unpushedCommits: [
        {
          hash: "abc123def456abc123def456abc123def456abc1",
          shortHash: "abc123d",
          message: "Add new feature",
          author: "Test User",
          date: 1704067200000,
        },
        {
          hash: "def456abc123def456abc123def456abc123def4",
          shortHash: "def456a",
          message: "Fix bug",
          author: "Test User",
          date: 1704153600000,
        },
      ],
      customVariables: {},
    }),
  );

  const mockExecutePush = mock(
    async (): Promise<PushResult> => ({
      success: true,
      remote: "origin",
      branch: "main",
      pushedCommits: 2,
      sessionId: "push-1234567890",
    }),
  );

  const mockPreviewPush = mock(
    async (): Promise<string> => "Preview of push prompt",
  );

  const mockGetPushStatus = mock(
    async (): Promise<PushStatus> => ({
      branchName: "main",
      canPush: true,
      hasUpstream: true,
      remote: {
        name: "origin",
        url: "https://github.com/user/repo.git",
        branch: "main",
      },
      aheadCount: 2,
      behindCount: 0,
      unpushedCommits: [
        {
          hash: "abc123def456abc123def456abc123def456abc1",
          shortHash: "abc123d",
          message: "Add new feature",
          author: "Test User",
          date: 1704067200000,
        },
        {
          hash: "def456abc123def456abc123def456abc123def4",
          shortHash: "def456a",
          message: "Fix bug",
          author: "Test User",
          date: 1704153600000,
        },
      ],
    }),
  );

  const mockGetRemotes = mock(
    async (): Promise<Remote[]> => [
      {
        name: "origin",
        fetchUrl: "https://github.com/user/repo.git",
        pushUrl: "https://github.com/user/repo.git",
      },
      {
        name: "upstream",
        fetchUrl: "https://github.com/upstream/repo.git",
        pushUrl: "https://github.com/upstream/repo.git",
      },
    ],
  );

  return {
    buildContext: mockBuildContext,
    executePush: mockExecutePush,
    previewPush: mockPreviewPush,
    getPushStatus: mockGetPushStatus,
    getRemotes: mockGetRemotes,
    mockBuildContext,
    mockExecutePush,
    mockPreviewPush,
    mockGetPushStatus,
    mockGetRemotes,
  };
}

/**
 * Create mock context manager
 */
function createMockContextManager(): ContextManager {
  const mockTab: WorkspaceTab = {
    id: "ctx-123",
    path: "/test/repo",
    name: "test-repo",
    repositoryRoot: "/test/repo",
    isGitRepo: true,
    lastAccessedAt: Date.now(),
    createdAt: Date.now(),
    isWorktree: false,
    mainRepositoryPath: null,
    worktreeName: null,
  };

  return {
    createContext: mock(async () => mockTab),
    getContext: mock((id: string) => (id === "ctx-123" ? mockTab : undefined)),
    removeContext: mock(() => {}),
    getAllContexts: mock(() => [mockTab]),
    validateDirectory: mock(async () => ({
      valid: true,
      path: "/test/repo",
      isGitRepo: true,
      repositoryRoot: "/test/repo",
      isWorktree: false,
    })),
    getServerContext: mock(() => ({
      projectPath: "/test/repo",
    })),
  };
}

describe("validatePushRequest", () => {
  test("validates valid request", () => {
    const result = validatePushRequest({
      promptId: "default-push",
      variables: {},
    });
    expect(result.valid).toBe(true);
  });

  test("validates request with all optional fields", () => {
    const result = validatePushRequest({
      promptId: "default-push",
      variables: { key: "value" },
      remote: "origin",
      branch: "main",
      force: true,
      setUpstream: true,
      pushTags: false,
    });
    expect(result.valid).toBe(true);
  });

  test("rejects non-object request", () => {
    const result = validatePushRequest("not an object");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("must be an object");
    }
  });

  test("rejects null request", () => {
    const result = validatePushRequest(null);
    expect(result.valid).toBe(false);
  });

  test("rejects empty promptId", () => {
    const result = validatePushRequest({
      promptId: "",
      variables: {},
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("promptId");
    }
  });

  test("rejects missing promptId", () => {
    const result = validatePushRequest({
      variables: {},
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("promptId");
    }
  });

  test("rejects invalid variables type", () => {
    const result = validatePushRequest({
      promptId: "test",
      variables: "not an object",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("variables");
    }
  });

  test("rejects invalid remote type", () => {
    const result = validatePushRequest({
      promptId: "test",
      remote: 123,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("remote");
    }
  });

  test("rejects invalid branch type", () => {
    const result = validatePushRequest({
      promptId: "test",
      branch: 123,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("branch");
    }
  });

  test("rejects invalid force type", () => {
    const result = validatePushRequest({
      promptId: "test",
      force: "yes",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("force");
    }
  });

  test("rejects invalid setUpstream type", () => {
    const result = validatePushRequest({
      promptId: "test",
      setUpstream: "yes",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("setUpstream");
    }
  });

  test("rejects invalid pushTags type", () => {
    const result = validatePushRequest({
      promptId: "test",
      pushTags: "yes",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("pushTags");
    }
  });
});

describe("createPushRoutes", () => {
  let contextManager: ContextManager;
  let deps: ReturnType<typeof createMockDependencies>;

  beforeEach(() => {
    contextManager = createMockContextManager();
    deps = createMockDependencies();
  });

  describe("POST /:contextId", () => {
    test("executes push successfully", async () => {
      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-push",
        variables: {},
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        result: PushResult;
      };
      expect(data).toHaveProperty("result");
      expect(data.result.success).toBe(true);
      expect(data.result.remote).toBe("origin");
      expect(data.result.branch).toBe("main");
      expect(data.result.pushedCommits).toBe(2);
      expect(deps.mockBuildContext).toHaveBeenCalledTimes(1);
      expect(deps.mockExecutePush).toHaveBeenCalledTimes(1);
    });

    test("executes push with custom options", async () => {
      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-push",
        variables: {},
        remote: "upstream",
        branch: "feature",
        force: true,
        setUpstream: true,
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(200);
      expect(deps.mockExecutePush).toHaveBeenCalledTimes(1);
    });

    test("returns 404 for non-existent context", async () => {
      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-push",
        variables: {},
      };

      const response = await app.request("/ctx-999", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Context not found");
    });

    test("returns 400 for invalid JSON", async () => {
      const app = createPushRoutes(contextManager, deps);

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Invalid JSON");
    });

    test("returns 400 for missing promptId", async () => {
      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        variables: {},
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("promptId");
    });

    test("returns 400 when no commits to push", async () => {
      // Override buildContext to return zero ahead count
      deps.mockBuildContext.mockResolvedValueOnce({
        branchName: "main",
        remoteName: "origin",
        remoteBranch: "main",
        hasUpstream: true,
        aheadCount: 0,
        behindCount: 0,
        unpushedCommits: [],
        customVariables: {},
      });

      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-push",
        variables: {},
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("No commits to push");
    });

    test("returns 500 on push execution error", async () => {
      // Override executePush to throw error
      deps.mockExecutePush.mockRejectedValueOnce(new Error("Git push failed"));

      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-push",
        variables: {},
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(500);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Git push failed");
    });
  });

  describe("POST /:contextId/preview", () => {
    test("generates push preview successfully", async () => {
      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-push",
        variables: {},
      };

      const response = await app.request("/ctx-123/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        preview: string;
        context: PushPromptContext;
      };
      expect(data).toHaveProperty("preview");
      expect(data).toHaveProperty("context");
      expect(data.preview).toBe("Preview of push prompt");
      expect(data.context.branchName).toBe("main");
      expect(data.context.aheadCount).toBe(2);
      expect(deps.mockBuildContext).toHaveBeenCalledTimes(1);
      expect(deps.mockPreviewPush).toHaveBeenCalledTimes(1);
    });

    test("returns 404 for non-existent context", async () => {
      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-push",
        variables: {},
      };

      const response = await app.request("/ctx-999/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Context not found");
    });

    test("returns 400 for invalid JSON", async () => {
      const app = createPushRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Invalid JSON");
    });

    test("returns 400 for missing promptId", async () => {
      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        variables: {},
      };

      const response = await app.request("/ctx-123/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("promptId");
    });

    test("returns 500 on preview generation error", async () => {
      // Override previewPush to throw error
      deps.mockPreviewPush.mockRejectedValueOnce(new Error("Preview error"));

      const app = createPushRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-push",
        variables: {},
      };

      const response = await app.request("/ctx-123/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(500);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Preview error");
    });
  });

  describe("GET /:contextId/status", () => {
    test("returns push status successfully", async () => {
      const app = createPushRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/status", {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        status: PushStatus;
      };
      expect(data).toHaveProperty("status");
      expect(data.status.branchName).toBe("main");
      expect(data.status.canPush).toBe(true);
      expect(data.status.hasUpstream).toBe(true);
      expect(data.status.aheadCount).toBe(2);
      expect(data.status.behindCount).toBe(0);
      expect(deps.mockGetPushStatus).toHaveBeenCalledTimes(1);
    });

    test("returns 404 for non-existent context", async () => {
      const app = createPushRoutes(contextManager, deps);

      const response = await app.request("/ctx-999/status", {
        method: "GET",
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Context not found");
    });

    test("returns 500 on status error", async () => {
      // Override getPushStatus to throw error
      deps.mockGetPushStatus.mockRejectedValueOnce(
        new Error("Git status failed"),
      );

      const app = createPushRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/status", {
        method: "GET",
      });

      expect(response.status).toBe(500);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Git status failed");
    });
  });

  describe("GET /:contextId/remotes", () => {
    test("returns remotes successfully", async () => {
      const app = createPushRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/remotes", {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        remotes: Remote[];
      };
      expect(data).toHaveProperty("remotes");
      expect(data.remotes).toHaveLength(2);
      expect(data.remotes[0]).toMatchObject({
        name: "origin",
        fetchUrl: "https://github.com/user/repo.git",
        pushUrl: "https://github.com/user/repo.git",
      });
      expect(data.remotes[1]).toMatchObject({
        name: "upstream",
        fetchUrl: "https://github.com/upstream/repo.git",
        pushUrl: "https://github.com/upstream/repo.git",
      });
      expect(deps.mockGetRemotes).toHaveBeenCalledTimes(1);
    });

    test("returns empty array when no remotes", async () => {
      // Override getRemotes to return empty array
      deps.mockGetRemotes.mockResolvedValueOnce([]);

      const app = createPushRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/remotes", {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        remotes: Remote[];
      };
      expect(data).toHaveProperty("remotes");
      expect(data.remotes).toHaveLength(0);
    });

    test("returns 404 for non-existent context", async () => {
      const app = createPushRoutes(contextManager, deps);

      const response = await app.request("/ctx-999/remotes", {
        method: "GET",
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Context not found");
    });

    test("returns 500 on remotes error", async () => {
      // Override getRemotes to throw error
      deps.mockGetRemotes.mockRejectedValueOnce(
        new Error("Git remote failed"),
      );

      const app = createPushRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/remotes", {
        method: "GET",
      });

      expect(response.status).toBe(500);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Git remote failed");
    });
  });
});
