/**
 * Tests for PR routes
 */

import { describe, test, expect, mock } from "bun:test";
import { Hono } from "hono";
import {
  createPRRoutes,
  validatePRRequest,
  validateLabelsRequest,
  validateReviewersRequest,
} from "./pr.js";
import type { ContextManager } from "../workspace/context-manager.js";
import type { ContextId, WorkspaceTab } from "../../types/workspace.js";
import type { PRExecutor } from "../pr/executor.js";
import type { PRService } from "../github/pr-service.js";
import type {
  BranchPRStatus,
  PRRequest,
  PRPromptContext,
} from "../../types/pr.js";

/**
 * Create mock context manager
 */
function createMockContextManager(
  contexts: Map<ContextId, WorkspaceTab>,
): ContextManager {
  return {
    getContext: (id: ContextId) => contexts.get(id),
    createContext: mock(() => {
      throw new Error("Not implemented");
    }),
    removeContext: mock(() => {
      throw new Error("Not implemented");
    }),
    getAllContexts: mock(() => {
      throw new Error("Not implemented");
    }),
    validateDirectory: mock(() => {
      throw new Error("Not implemented");
    }),
    getServerContext: mock(() => {
      throw new Error("Not implemented");
    }),
  } as unknown as ContextManager;
}

/**
 * Create mock workspace tab
 */
function createMockContext(
  id: ContextId,
  repositoryRoot: string,
): WorkspaceTab {
  return {
    id,
    path: repositoryRoot,
    name: "test-repo",
    repositoryRoot,
    isGitRepo: true,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    isWorktree: false,
    mainRepositoryPath: null,
    worktreeName: null,
  };
}

/**
 * Create mock PR executor
 */
function createMockPRExecutor(): PRExecutor {
  return {
    getPRStatus: mock(() =>
      Promise.resolve({
        hasPR: false,
        pr: null,
        baseBranch: "main",
        canCreatePR: true,
        availableBaseBranches: ["main", "develop"],
        repoOwner: "test-owner",
        repoName: "test-repo",
      } as BranchPRStatus),
    ),
    getBaseBranches: mock(() => Promise.resolve(["main", "develop", "feature"])),
    buildContext: mock(() =>
      Promise.resolve({
        branchName: "feature-branch",
        baseBranch: "main",
        remoteName: "origin",
        commits: [],
        existingPR: null,
        diffSummary: "Test diff",
        repoOwner: "test-owner",
        repoName: "test-repo",
        customVariables: {},
      } as PRPromptContext),
    ),
    createPR: mock(() =>
      Promise.resolve({
        sessionId: "test-session-id",
        context: {
          branchName: "feature-branch",
          baseBranch: "main",
          remoteName: "origin",
          commits: [],
          existingPR: null,
          diffSummary: "Test diff",
          repoOwner: "test-owner",
          repoName: "test-repo",
          customVariables: {},
        } as PRPromptContext,
      }),
    ),
    updatePR: mock(() =>
      Promise.resolve({
        sessionId: "test-session-id",
        context: {
          branchName: "feature-branch",
          baseBranch: "main",
          remoteName: "origin",
          commits: [],
          existingPR: null,
          diffSummary: "Test diff",
          repoOwner: "test-owner",
          repoName: "test-repo",
          customVariables: {},
        } as PRPromptContext,
      }),
    ),
    getRepoInfo: mock(() =>
      Promise.resolve({ owner: "test-owner", name: "test-repo" }),
    ),
  };
}

/**
 * Create mock PR service
 */
function createMockPRService(): PRService {
  return {
    getPR: mock(() => Promise.resolve(null)),
    getPRForBranch: mock(() => Promise.resolve(null)),
    listPRs: mock(() => Promise.resolve([])),
    createPR: mock(() =>
      Promise.resolve({
        number: 1,
        title: "Test PR",
        body: "Test body",
        state: "open" as const,
        url: "https://github.com/test/test/pull/1",
        baseBranch: "main",
        headBranch: "feature",
        isDraft: false,
        labels: [],
        reviewers: [],
        assignees: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ),
    updatePR: mock(() =>
      Promise.resolve({
        number: 1,
        title: "Updated PR",
        body: "Updated body",
        state: "open" as const,
        url: "https://github.com/test/test/pull/1",
        baseBranch: "main",
        headBranch: "feature",
        isDraft: false,
        labels: [],
        reviewers: [],
        assignees: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ),
    addLabels: mock(() => Promise.resolve()),
    requestReviewers: mock(() => Promise.resolve()),
    mergePR: mock(() => Promise.resolve({ merged: true, message: "Merged" })),
  };
}

describe("validatePRRequest", () => {
  test("should accept valid request", () => {
    const request: PRRequest = {
      promptTemplateId: "pr-template",
      baseBranch: "main",
    };
    expect(validatePRRequest(request)).toEqual({ valid: true });
  });

  test("should accept request with all optional fields", () => {
    const request: PRRequest = {
      promptTemplateId: "pr-template",
      baseBranch: "main",
      title: "Test PR",
      body: "Test body",
      draft: true,
      labels: ["bug", "feature"],
      reviewers: ["user1", "user2"],
      assignees: ["user3"],
      customVariables: { key: "value" },
    };
    expect(validatePRRequest(request)).toEqual({ valid: true });
  });

  test("should reject non-object", () => {
    expect(validatePRRequest(null)).toEqual({
      valid: false,
      error: "Request must be an object",
    });
    expect(validatePRRequest("string")).toEqual({
      valid: false,
      error: "Request must be an object",
    });
  });

  test("should reject missing promptTemplateId", () => {
    expect(validatePRRequest({ baseBranch: "main" })).toEqual({
      valid: false,
      error: "promptTemplateId must be a non-empty string",
    });
  });

  test("should reject empty promptTemplateId", () => {
    expect(validatePRRequest({ promptTemplateId: "", baseBranch: "main" })).toEqual({
      valid: false,
      error: "promptTemplateId must be a non-empty string",
    });
  });

  test("should reject missing baseBranch", () => {
    expect(validatePRRequest({ promptTemplateId: "test" })).toEqual({
      valid: false,
      error: "baseBranch must be a non-empty string",
    });
  });

  test("should reject empty baseBranch", () => {
    expect(
      validatePRRequest({ promptTemplateId: "test", baseBranch: "" }),
    ).toEqual({
      valid: false,
      error: "baseBranch must be a non-empty string",
    });
  });

  test("should reject invalid title type", () => {
    expect(
      validatePRRequest({
        promptTemplateId: "test",
        baseBranch: "main",
        title: 123,
      }),
    ).toEqual({
      valid: false,
      error: "title must be a string if provided",
    });
  });

  test("should reject invalid draft type", () => {
    expect(
      validatePRRequest({
        promptTemplateId: "test",
        baseBranch: "main",
        draft: "true",
      }),
    ).toEqual({
      valid: false,
      error: "draft must be a boolean if provided",
    });
  });

  test("should reject invalid labels type", () => {
    expect(
      validatePRRequest({
        promptTemplateId: "test",
        baseBranch: "main",
        labels: "label1",
      }),
    ).toEqual({
      valid: false,
      error: "labels must be an array of strings if provided",
    });
    expect(
      validatePRRequest({
        promptTemplateId: "test",
        baseBranch: "main",
        labels: [1, 2, 3],
      }),
    ).toEqual({
      valid: false,
      error: "labels must be an array of strings if provided",
    });
  });
});

describe("validateLabelsRequest", () => {
  test("should accept valid request", () => {
    expect(validateLabelsRequest({ labels: ["bug", "feature"] })).toEqual({
      valid: true,
    });
  });

  test("should reject non-object", () => {
    expect(validateLabelsRequest(null)).toEqual({
      valid: false,
      error: "Request must be an object",
    });
  });

  test("should reject empty labels array", () => {
    expect(validateLabelsRequest({ labels: [] })).toEqual({
      valid: false,
      error: "labels must be a non-empty array",
    });
  });

  test("should reject non-string labels", () => {
    expect(validateLabelsRequest({ labels: [1, 2, 3] })).toEqual({
      valid: false,
      error: "labels must be an array of strings",
    });
  });
});

describe("validateReviewersRequest", () => {
  test("should accept valid request", () => {
    expect(validateReviewersRequest({ reviewers: ["user1", "user2"] })).toEqual({
      valid: true,
    });
  });

  test("should reject non-object", () => {
    expect(validateReviewersRequest(null)).toEqual({
      valid: false,
      error: "Request must be an object",
    });
  });

  test("should reject empty reviewers array", () => {
    expect(validateReviewersRequest({ reviewers: [] })).toEqual({
      valid: false,
      error: "reviewers must be a non-empty array",
    });
  });

  test("should reject non-string reviewers", () => {
    expect(validateReviewersRequest({ reviewers: [1, 2, 3] })).toEqual({
      valid: false,
      error: "reviewers must be an array of strings",
    });
  });
});

describe("createPRRoutes", () => {
  test("should create Hono app with PR routes", () => {
    const contexts = new Map<ContextId, WorkspaceTab>();
    const contextManager = createMockContextManager(contexts);
    const executor = createMockPRExecutor();
    const prService = createMockPRService();

    const app = createPRRoutes(contextManager, { executor, prService });

    expect(app).toBeInstanceOf(Hono);
  });

  describe("GET /:contextId/status", () => {
    test("should return PR status", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}/status`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      expect(data).toHaveProperty("status");
      const status = data["status"] as Record<string, unknown>;
      expect(status).toHaveProperty("hasPR", false);
      expect(status).toHaveProperty("canCreatePR", true);
    });

    test("should return 404 for unknown context", async () => {
      const contexts = new Map<ContextId, WorkspaceTab>();
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request("/unknown-context/status");
      expect(res.status).toBe(404);

      const data = (await res.json()) as Record<string, unknown>;
      expect(data).toHaveProperty("error");
    });

    test("should return 500 on executor error", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      executor.getPRStatus = mock(() =>
        Promise.reject(new Error("Executor error")),
      );
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}/status`);
      expect(res.status).toBe(500);

      const data = (await res.json()) as Record<string, unknown>;
      expect(data).toHaveProperty("error", "Executor error");
    });
  });

  describe("GET /:contextId/branches", () => {
    test("should return available branches", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}/branches`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      expect(data).toHaveProperty("branches");
      const branches = data["branches"];
      expect(Array.isArray(branches)).toBe(true);
      expect((branches as string[]).includes("main")).toBe(true);
    });

    test("should return 404 for unknown context", async () => {
      const contexts = new Map<ContextId, WorkspaceTab>();
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request("/unknown-context/branches");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /:contextId", () => {
    test("should create PR", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}`, {
        method: "POST",
        body: JSON.stringify({
          promptTemplateId: "pr-template",
          baseBranch: "main",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("sessionId", "test-session-id");
      expect(data).toHaveProperty("context");
    });

    test("should return 400 for invalid request", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}`, {
        method: "POST",
        body: JSON.stringify({ baseBranch: "main" }), // Missing promptTemplateId
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(400);
    });

    test("should return 400 when no repo info", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      executor.getRepoInfo = mock(() => Promise.resolve(null));
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}`, {
        method: "POST",
        body: JSON.stringify({
          promptTemplateId: "pr-template",
          baseBranch: "main",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error", "No GitHub repository information available");
    });
  });

  describe("PUT /:contextId/:prNumber", () => {
    test("should update PR", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}/123`, {
        method: "PUT",
        body: JSON.stringify({
          promptTemplateId: "pr-template",
          baseBranch: "main",
          title: "Updated title",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("sessionId", "test-session-id");
      expect(data).toHaveProperty("context");
    });

    test("should return 400 for invalid PR number", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}/invalid`, {
        method: "PUT",
        body: JSON.stringify({
          promptTemplateId: "pr-template",
          baseBranch: "main",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error", "Invalid PR number");
    });
  });

  describe("POST /:contextId/:prNumber/labels", () => {
    test("should add labels", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}/123/labels`, {
        method: "POST",
        body: JSON.stringify({ labels: ["bug", "feature"] }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("success", true);
      expect(prService.addLabels).toHaveBeenCalled();
    });

    test("should return 400 for invalid labels", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}/123/labels`, {
        method: "POST",
        body: JSON.stringify({ labels: [] }), // Empty array
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /:contextId/:prNumber/reviewers", () => {
    test("should request reviewers", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}/123/reviewers`, {
        method: "POST",
        body: JSON.stringify({ reviewers: ["user1", "user2"] }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("success", true);
      expect(prService.requestReviewers).toHaveBeenCalled();
    });

    test("should return 400 for invalid reviewers", async () => {
      const contextId = "test-context" as ContextId;
      const context = createMockContext(contextId, "/test/repo");
      const contexts = new Map<ContextId, WorkspaceTab>([
        [contextId, context],
      ]);
      const contextManager = createMockContextManager(contexts);
      const executor = createMockPRExecutor();
      const prService = createMockPRService();

      const app = createPRRoutes(contextManager, { executor, prService });

      const res = await app.request(`/${contextId}/123/reviewers`, {
        method: "POST",
        body: JSON.stringify({ reviewers: [] }), // Empty array
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(400);
    });
  });
});
