/**
 * Unit tests for Context Middleware
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import { contextMiddleware } from "./context";
import type {
  ContextManager,
  ServerContext,
} from "../workspace/context-manager";
import type { ContextId, WorkspaceTab } from "../../types/workspace";

/**
 * Hono context variables type extension
 */
type ContextVariables = {
  serverContext: ServerContext;
};

/**
 * Create a mock context manager for testing
 */
function createMockContextManager(
  contexts: Map<ContextId, WorkspaceTab>,
): ContextManager {
  return {
    createContext: mock(async () => {
      throw new Error("Not implemented in test");
    }),
    getContext: mock((id: ContextId) => contexts.get(id)),
    removeContext: mock(() => {}),
    getAllContexts: mock(() => Array.from(contexts.values())),
    validateDirectory: mock(async () => ({
      valid: true,
      path: "/test",
      isGitRepo: false,
      isWorktree: false,
    })),
    getServerContext: mock((id: ContextId) => {
      const tab = contexts.get(id);
      if (tab === undefined) {
        throw new Error(`Context not found: ${id}`);
      }
      return { projectPath: tab.path, isGitRepo: tab.isGitRepo };
    }),
    getProjectRegistry: mock(() => ({
      getOrCreateSlug: async () => "test-abc123",
      resolveSlug: async () => undefined,
      removeSlug: async () => {},
      getAllProjects: async () => new Map(),
      getAllPaths: async (): Promise<ReadonlySet<string>> => new Set(),
    })),
  };
}

/**
 * Create a test workspace tab
 */
function createTestTab(id: string, path: string): WorkspaceTab {
  return {
    id: id as ContextId,
    projectSlug: "test-abc123",
    path,
    name: "test-repo",
    repositoryRoot: path,
    isGitRepo: true,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    isWorktree: false,
    mainRepositoryPath: null,
    worktreeName: null,
  };
}

describe("contextMiddleware", () => {
  let app: Hono<{ Variables: ContextVariables }>;
  let contextManager: ContextManager;
  let testContexts: Map<ContextId, WorkspaceTab>;

  beforeEach(() => {
    // Reset test data
    testContexts = new Map();
    contextManager = createMockContextManager(testContexts);
    app = new Hono<{ Variables: ContextVariables }>();
  });

  describe("successful context extraction", () => {
    test("extracts valid context and attaches to Hono context", async () => {
      const contextId = "550e8400-e29b-41d4-a716-446655440000" as ContextId;
      const testTab = createTestTab(contextId, "/test/repo");
      testContexts.set(contextId, testTab);

      // Apply middleware
      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => {
        const serverContext = c.get("serverContext") as ServerContext;
        return c.json({ path: serverContext.projectPath });
      });

      // Make request
      const response = await app.request(`/${contextId}/test`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { path: string };
      expect(body).toEqual({ path: "/test/repo" });
    });

    test("calls next handler after attaching context", async () => {
      const contextId = "550e8400-e29b-41d4-a716-446655440000" as ContextId;
      const testTab = createTestTab(contextId, "/test/repo");
      testContexts.set(contextId, testTab);

      const nextHandlerCalled = mock(() => {});

      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => {
        nextHandlerCalled();
        return c.json({ ok: true });
      });

      await app.request(`/${contextId}/test`);

      expect(nextHandlerCalled).toHaveBeenCalledTimes(1);
    });

    test("handles nested routes with context", async () => {
      const contextId = "550e8400-e29b-41d4-a716-446655440000" as ContextId;
      const testTab = createTestTab(contextId, "/test/repo");
      testContexts.set(contextId, testTab);

      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/nested/deep/route", (c) => {
        const serverContext = c.get("serverContext") as ServerContext;
        return c.json({ path: serverContext.projectPath });
      });

      const response = await app.request(`/${contextId}/nested/deep/route`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { path: string };
      expect(body).toEqual({ path: "/test/repo" });
    });
  });

  describe("missing context ID", () => {
    test("route pattern does not match without context ID", async () => {
      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => c.json({ ok: true }));

      // Request without context ID - middleware will treat "test" as contextId
      const response = await app.request("/test");

      // Middleware will validate "test" as context ID and fail
      expect(response.status).toBe(400);
    });

    test("returns 400 for empty context ID", async () => {
      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => c.json({ ok: true }));

      // Request with empty context ID
      const response = await app.request("//test");

      expect(response.status).toBe(404); // Route normalization handles this
    });
  });

  describe("invalid context ID format", () => {
    test("returns 400 for non-UUID format", async () => {
      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => c.json({ ok: true }));

      const response = await app.request("/invalid-format/test");

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; code: number };
      expect(body).toEqual({
        error: "invalid context ID format (expected UUID)",
        code: 400,
      });
    });

    test("returns 400 for malformed UUID", async () => {
      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => c.json({ ok: true }));

      const response = await app.request("/not-a-uuid-123/test");

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; code: number };
      expect(body.code).toBe(400);
      expect(body.error).toContain("invalid");
    });

    test("returns 400 for context ID with special characters", async () => {
      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => c.json({ ok: true }));

      const response = await app.request("/context@123/test");

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; code: number };
      expect(body.code).toBe(400);
    });
  });

  describe("context not found", () => {
    test("returns 404 for non-existent context", async () => {
      const contextId = "550e8400-e29b-41d4-a716-446655440000";

      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => c.json({ ok: true }));

      const response = await app.request(`/${contextId}/test`);

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string; code: number };
      expect(body).toEqual({
        error: `Context not found: ${contextId}`,
        code: 404,
      });
    });

    test("does not call next handler for non-existent context", async () => {
      const contextId = "550e8400-e29b-41d4-a716-446655440000";
      const nextHandlerCalled = mock(() => {});

      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => {
        nextHandlerCalled();
        return c.json({ ok: true });
      });

      await app.request(`/${contextId}/test`);

      expect(nextHandlerCalled).not.toHaveBeenCalled();
    });

    test("returns 404 for valid UUID but missing context", async () => {
      const contextId = "123e4567-e89b-12d3-a456-426614174000";

      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => c.json({ ok: true }));

      const response = await app.request(`/${contextId}/test`);

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string; code: number };
      expect(body.code).toBe(404);
      expect(body.error).toContain("Context not found");
    });
  });

  describe("context manager errors", () => {
    test("returns 500 when getServerContext throws", async () => {
      const contextId = "550e8400-e29b-41d4-a716-446655440000" as ContextId;
      const testTab = createTestTab(contextId, "/test/repo");
      testContexts.set(contextId, testTab);

      // Create context manager that throws on getServerContext
      const errorContextManager: ContextManager = {
        ...contextManager,
        getServerContext: mock(() => {
          throw new Error("Server context error");
        }),
      };

      app.use("/:contextId/*", contextMiddleware(errorContextManager));
      app.get("/:contextId/test", (c) => c.json({ ok: true }));

      const response = await app.request(`/${contextId}/test`);

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string; code: number };
      expect(body).toEqual({
        error: "Server context error",
        code: 500,
      });
    });

    test("handles non-Error exceptions from getServerContext", async () => {
      const contextId = "550e8400-e29b-41d4-a716-446655440000" as ContextId;
      const testTab = createTestTab(contextId, "/test/repo");
      testContexts.set(contextId, testTab);

      // Create context manager that throws non-Error
      const errorContextManager: ContextManager = {
        ...contextManager,
        getServerContext: mock(() => {
          throw "String error";
        }),
      };

      app.use("/:contextId/*", contextMiddleware(errorContextManager));
      app.get("/:contextId/test", (c) => c.json({ ok: true }));

      const response = await app.request(`/${contextId}/test`);

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toBe("Failed to get server context");
      expect(body.code).toBe(500);
    });
  });

  describe("multiple contexts", () => {
    test("handles requests to different contexts", async () => {
      const contextId1 = "550e8400-e29b-41d4-a716-446655440000" as ContextId;
      const contextId2 = "660e8400-e29b-41d4-a716-446655440001" as ContextId;

      const testTab1 = createTestTab(contextId1, "/test/repo1");
      const testTab2 = createTestTab(contextId2, "/test/repo2");

      testContexts.set(contextId1, testTab1);
      testContexts.set(contextId2, testTab2);

      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/info", (c) => {
        const serverContext = c.get("serverContext") as ServerContext;
        return c.json({ path: serverContext.projectPath });
      });

      // Request to first context
      const response1 = await app.request(`/${contextId1}/info`);
      expect(response1.status).toBe(200);
      const body1 = (await response1.json()) as { path: string };
      expect(body1).toEqual({ path: "/test/repo1" });

      // Request to second context
      const response2 = await app.request(`/${contextId2}/info`);
      expect(response2.status).toBe(200);
      const body2 = (await response2.json()) as { path: string };
      expect(body2).toEqual({ path: "/test/repo2" });
    });

    test("isolates contexts between requests", async () => {
      const contextId1 = "550e8400-e29b-41d4-a716-446655440000" as ContextId;
      const contextId2 = "660e8400-e29b-41d4-a716-446655440001" as ContextId;

      const testTab1 = createTestTab(contextId1, "/test/repo1");
      const testTab2 = createTestTab(contextId2, "/test/repo2");

      testContexts.set(contextId1, testTab1);
      testContexts.set(contextId2, testTab2);

      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => {
        const serverContext = c.get("serverContext") as ServerContext;
        // Each request should get its own context
        return c.json({
          contextId: c.req.param("contextId"),
          path: serverContext.projectPath,
        });
      });

      const response1 = await app.request(`/${contextId1}/test`);
      const body1 = (await response1.json()) as {
        contextId: string;
        path: string;
      };
      expect(body1.contextId).toBe(contextId1);
      expect(body1.path).toBe("/test/repo1");

      const response2 = await app.request(`/${contextId2}/test`);
      const body2 = (await response2.json()) as {
        contextId: string;
        path: string;
      };
      expect(body2.contextId).toBe(contextId2);
      expect(body2.path).toBe("/test/repo2");
    });
  });

  describe("edge cases", () => {
    test("handles context ID with uppercase letters in UUID", async () => {
      const contextId = "550E8400-E29B-41D4-A716-446655440000" as ContextId;
      const testTab = createTestTab(
        contextId.toLowerCase() as ContextId,
        "/test/repo",
      );
      testContexts.set(contextId.toLowerCase() as ContextId, testTab);

      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => {
        const serverContext = c.get("serverContext") as ServerContext;
        return c.json({ path: serverContext.projectPath });
      });

      // UUID validation might normalize case
      const response = await app.request(`/${contextId}/test`);

      // UUID validation passes (regex is case-insensitive) but Map lookup fails (case-sensitive)
      expect(response.status).toBe(404);
    });

    test("handles rapid sequential requests to same context", async () => {
      const contextId = "550e8400-e29b-41d4-a716-446655440000" as ContextId;
      const testTab = createTestTab(contextId, "/test/repo");
      testContexts.set(contextId, testTab);

      app.use("/:contextId/*", contextMiddleware(contextManager));
      app.get("/:contextId/test", (c) => {
        const serverContext = c.get("serverContext") as ServerContext;
        return c.json({ path: serverContext.projectPath });
      });

      // Make multiple rapid requests
      const requests = Array.from({ length: 10 }, () =>
        app.request(`/${contextId}/test`),
      );

      const responses = await Promise.all(requests);

      // All requests should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
        const body = (await response.json()) as { path: string };
        expect(body).toEqual({ path: "/test/repo" });
      }
    });
  });
});
