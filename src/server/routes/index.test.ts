/**
 * Tests for Route Registry
 *
 * Verifies that the route registry correctly assembles and mounts all API routes.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { ContextManager } from "../workspace/context-manager.js";
import type { SessionManager } from "../ai/session-manager.js";
import {
  mountAllRoutes,
  getContextScopedRouteGroups,
  getNonContextRouteGroups,
  type MountRoutesConfig,
} from "./index.js";

describe("Route Registry", () => {
  let mockContextManager: ContextManager;
  let mockSessionManager: SessionManager;
  let config: MountRoutesConfig;

  beforeEach(() => {
    // Create minimal mocks
    mockContextManager = {
      createContext: mock(async () => ({
        id: "ctx-test",
        name: "test",
        path: "/test",
        isGitRepo: true,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      })),
      getContext: mock(() => ({
        id: "ctx-test",
        name: "test",
        path: "/test",
        isGitRepo: true,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      })),
      removeContext: mock(() => {}),
      getAllContexts: mock(() => []),
      validateDirectory: mock(async () => ({
        valid: true,
        path: "/test",
        isGitRepo: true,
        isWorktree: false,
      })),
      getServerContext: mock(() => ({
        projectPath: "/test",
      })),
    } as unknown as ContextManager;

    mockSessionManager = {
      submit: mock(async () => ({ sessionId: "test-session" })),
      getQueueStatus: mock(() => ({ queued: 0, running: 0 })),
      listSessions: mock(() => []),
      getSession: mock(() => null),
      subscribe: mock(() => () => {}),
      cancel: mock(async () => {}),
    } as unknown as SessionManager;

    config = {
      contextManager: mockContextManager,
      sessionManager: mockSessionManager,
      configDir: undefined,
    };
  });

  describe("getContextScopedRouteGroups", () => {
    test("returns all context-scoped route groups", () => {
      const groups = getContextScopedRouteGroups(config);

      expect(groups.length).toBeGreaterThan(0);

      // Verify essential route groups are present
      const prefixes = groups.map((g) => g.prefix);

      expect(prefixes).toContain("/diff");
      expect(prefixes).toContain("/files");
      expect(prefixes).toContain("/status");
      expect(prefixes).toContain("/commits");
      expect(prefixes).toContain("/search");
      expect(prefixes).toContain("/commit");
      expect(prefixes).toContain("/push");
      expect(prefixes).toContain("/worktree");
      expect(prefixes).toContain("/github");
      expect(prefixes).toContain("/pr");
      expect(prefixes).toContain("/claude-sessions");
      expect(prefixes).toContain("/prompts");
    });

    test("each route group has prefix and routes", () => {
      const groups = getContextScopedRouteGroups(config);

      for (const group of groups) {
        expect(group.prefix).toBeDefined();
        expect(typeof group.prefix).toBe("string");
        expect(group.prefix).toStartWith("/");

        expect(group.routes).toBeDefined();
        expect(group.routes).toBeInstanceOf(Hono);
      }
    });
  });

  describe("getNonContextRouteGroups", () => {
    test("returns all non-context route groups", () => {
      const groups = getNonContextRouteGroups(config);

      expect(groups.length).toBeGreaterThan(0);

      // Verify essential route groups are present
      const prefixes = groups.map((g) => g.prefix);

      expect(prefixes).toContain("/workspace");
      expect(prefixes).toContain("/browse");
      expect(prefixes).toContain("/ai");
    });

    test("each route group has prefix and routes", () => {
      const groups = getNonContextRouteGroups(config);

      for (const group of groups) {
        expect(group.prefix).toBeDefined();
        expect(typeof group.prefix).toBe("string");
        expect(group.prefix).toStartWith("/");

        expect(group.routes).toBeDefined();
        expect(group.routes).toBeInstanceOf(Hono);
      }
    });
  });

  describe("mountAllRoutes", () => {
    test("mounts routes without error", () => {
      const app = new Hono();

      // Should not throw
      expect(() => {
        mountAllRoutes(app, config);
      }).not.toThrow();
    });

    test("mounts non-context routes under /api", async () => {
      const app = new Hono();
      mountAllRoutes(app, config);

      // Test workspace route exists
      const workspaceReq = new Request("http://localhost/api/workspace");
      const workspaceRes = await app.fetch(workspaceReq);

      // Should not be 404 (route exists)
      expect(workspaceRes.status).not.toBe(404);
    });

    test("mounts context-scoped routes under /api/ctx/:contextId", async () => {
      const app = new Hono();
      mountAllRoutes(app, config);

      // Test diff route exists (will fail validation due to missing context, but route exists)
      const diffReq = new Request("http://localhost/api/ctx/ctx-test/diff");
      const diffRes = await app.fetch(diffReq);

      // Should not be 404 (route exists), even if it fails for other reasons
      expect(diffRes.status).not.toBe(404);
    });

    test("all context routes share the context middleware", async () => {
      const app = new Hono();
      mountAllRoutes(app, config);

      // Test that multiple context routes exist
      const routes = [
        "/api/ctx/ctx-test/diff",
        "/api/ctx/ctx-test/files",
        "/api/ctx/ctx-test/status",
        "/api/ctx/ctx-test/commits",
      ];

      for (const route of routes) {
        const req = new Request(`http://localhost${route}`);
        const res = await app.fetch(req);

        // Should not be 404 (route exists)
        expect(res.status).not.toBe(404);
      }
    });

    test("health check route still works after mounting", async () => {
      const app = new Hono();

      // Add health check like in real server
      app.get("/api/health", (c) =>
        c.json({ status: "ok", timestamp: Date.now() }),
      );

      mountAllRoutes(app, config);

      const req = new Request("http://localhost/api/health");
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("status", "ok");
    });

    test("non-existent routes return 404", async () => {
      const app = new Hono();
      mountAllRoutes(app, config);

      const req = new Request("http://localhost/api/nonexistent");
      const res = await app.fetch(req);

      expect(res.status).toBe(404);
    });
  });

  describe("Route Prefixes", () => {
    test("no duplicate prefixes in context-scoped routes", () => {
      const groups = getContextScopedRouteGroups(config);
      const prefixes = groups.map((g) => g.prefix);
      const uniquePrefixes = new Set(prefixes);

      expect(prefixes.length).toBe(uniquePrefixes.size);
    });

    test("no duplicate prefixes in non-context routes", () => {
      const groups = getNonContextRouteGroups(config);
      const prefixes = groups.map((g) => g.prefix);
      const uniquePrefixes = new Set(prefixes);

      expect(prefixes.length).toBe(uniquePrefixes.size);
    });

    test("all prefixes start with /", () => {
      const contextGroups = getContextScopedRouteGroups(config);
      const nonContextGroups = getNonContextRouteGroups(config);
      const allGroups = [...contextGroups, ...nonContextGroups];

      for (const group of allGroups) {
        expect(group.prefix).toStartWith("/");
      }
    });
  });
});
