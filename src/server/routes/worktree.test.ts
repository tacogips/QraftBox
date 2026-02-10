/**
 * Tests for Worktree API Routes
 */

import { describe, it, expect, beforeEach } from "bun:test";
import type { Hono } from "hono";
import {
  createWorktreeRoutes,
  type WorktreeRoutesDependencies,
} from "./worktree";
import type {
  ContextManager,
  ServerContext,
} from "../workspace/context-manager";
import type {
  WorktreeInfo,
  RepositoryDetectionResult,
  CreateWorktreeRequest,
  CreateWorktreeResult,
  RemoveWorktreeResult,
} from "../../types/worktree";
import type { WorkspaceTab } from "../../types/workspace";

// Test constants
const TEST_CONTEXT_ID = "a1b2c3d4-e5f6-7890-1234-567890abcdef";
const INVALID_CONTEXT_ID = "invalid id";
const NON_EXISTENT_CONTEXT_ID = "99999999-9999-9999-9999-999999999999";

// Mock ContextManager
function createMockContextManager(): ContextManager {
  const contexts = new Map<string, WorkspaceTab>();

  return {
    createContext: async (path: string): Promise<WorkspaceTab> => {
      const tab: WorkspaceTab = {
        id: TEST_CONTEXT_ID,
        projectSlug: "test-abc123",
        path,
        name: "test-project",
        repositoryRoot: path,
        isGitRepo: true,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        isWorktree: false,
        mainRepositoryPath: null,
        worktreeName: null,
      };
      contexts.set(tab.id, tab);
      return tab;
    },
    getContext: (id: string): WorkspaceTab | undefined => {
      return contexts.get(id);
    },
    removeContext: (id: string): void => {
      contexts.delete(id);
    },
    getAllContexts: (): readonly WorkspaceTab[] => {
      return Array.from(contexts.values());
    },
    validateDirectory: async (path: string) => {
      return {
        valid: true,
        path,
        isGitRepo: true,
        repositoryRoot: path,
        isWorktree: false,
        mainRepositoryPath: undefined,
      };
    },
    getServerContext: (id: string): ServerContext => {
      const context = contexts.get(id);
      if (!context) {
        throw new Error(`Context not found: ${id}`);
      }
      return {
        projectPath: context.repositoryRoot,
        isGitRepo: true,
      };
    },
    getProjectRegistry: () => ({
      getOrCreateSlug: async () => "test-abc123",
      resolveSlug: async () => undefined,
      removeSlug: async () => {},
      getAllProjects: async () => new Map(),
    }),
  };
}

// Test data
const mockWorktrees: WorktreeInfo[] = [
  {
    path: "/home/user/projects/my-app",
    head: "abc123",
    branch: "main",
    isMain: true,
    locked: false,
    prunable: false,
    mainRepositoryPath: "/home/user/projects/my-app",
  },
  {
    path: "/home/user/.local/qraftbox/worktrees/home__user__projects__my-app/feature-auth",
    head: "def456",
    branch: "feature-auth",
    isMain: false,
    locked: false,
    prunable: false,
    mainRepositoryPath: "/home/user/projects/my-app",
  },
];

const mockDetectionMain: RepositoryDetectionResult = {
  type: "main",
  path: "/home/user/projects/my-app",
  gitDir: "/home/user/projects/my-app/.git",
  mainRepositoryPath: null,
  worktreeName: null,
};

const mockDetectionWorktree: RepositoryDetectionResult = {
  type: "worktree",
  path: "/home/user/.local/qraftbox/worktrees/home__user__projects__my-app/feature-auth",
  gitDir: "/home/user/projects/my-app/.git/worktrees/feature-auth",
  mainRepositoryPath: "/home/user/projects/my-app",
  worktreeName: "feature-auth",
};

describe("Worktree Routes", () => {
  let app: Hono;
  let contextManager: ContextManager;

  // Create default mock dependencies function
  const createMockDeps = (): WorktreeRoutesDependencies => ({
    detectRepositoryType: async (
      _path: string,
    ): Promise<RepositoryDetectionResult> => {
      return mockDetectionMain;
    },
    listWorktrees: async (_cwd: string): Promise<WorktreeInfo[]> => {
      return mockWorktrees;
    },
    createWorktree: async (
      _cwd: string,
      _request: CreateWorktreeRequest,
    ): Promise<CreateWorktreeResult> => {
      return {
        success: true,
        path: "/home/user/.local/qraftbox/worktrees/home__user__projects__my-app/feature-new",
        branch: "feature-new",
      };
    },
    removeWorktree: async (
      _cwd: string,
      _path: string,
      _force?: boolean,
    ): Promise<RemoveWorktreeResult> => {
      return {
        success: true,
        removed: true,
      };
    },
    getMainRepositoryPath: async (_path: string): Promise<string | null> => {
      return null; // Main repo by default
    },
    generateDefaultWorktreePath: (
      _projectPath: string,
      worktreeName: string,
    ): string => {
      return `/home/user/.local/qraftbox/worktrees/home__user__projects__my-app/${worktreeName}`;
    },
  });

  beforeEach(async () => {
    contextManager = createMockContextManager();

    // Create test context
    await contextManager.createContext("/home/user/projects/my-app");

    // Create app with default mocks
    app = createWorktreeRoutes(contextManager, createMockDeps());
  });

  describe("GET /:id/worktree", () => {
    it("should list worktrees for valid context", async () => {
      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree`, {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        worktrees: WorktreeInfo[];
        mainRepository: string;
      };
      expect(body.worktrees).toEqual(mockWorktrees);
      expect(body.mainRepository).toBe("/home/user/projects/my-app");
    });

    it("should return 400 for invalid context ID", async () => {
      const response = await app.request(`/${INVALID_CONTEXT_ID}/worktree`, {
        method: "GET",
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("invalid context ID");
    });

    it("should return 404 for non-existent context", async () => {
      const response = await app.request(
        `/${NON_EXISTENT_CONTEXT_ID}/worktree`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Context not found");
    });

    it("should return 500 when git operation fails", async () => {
      const failingDeps: WorktreeRoutesDependencies = {
        ...createMockDeps(),
        listWorktrees: async (_cwd: string): Promise<WorktreeInfo[]> => {
          throw new Error("Git error");
        },
      };

      app = createWorktreeRoutes(contextManager, failingDeps);

      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree`, {
        method: "GET",
      });

      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Git error");
    });
  });

  describe("GET /:id/worktree/detect", () => {
    it("should detect main repository", async () => {
      const response = await app.request(
        `/${TEST_CONTEXT_ID}/worktree/detect`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        detection: RepositoryDetectionResult;
      };
      expect(body.detection).toEqual(mockDetectionMain);
    });

    it("should detect worktree", async () => {
      const worktreeDeps: WorktreeRoutesDependencies = {
        ...createMockDeps(),
        detectRepositoryType: async (
          _path: string,
        ): Promise<RepositoryDetectionResult> => {
          return mockDetectionWorktree;
        },
      };

      app = createWorktreeRoutes(contextManager, worktreeDeps);

      const response = await app.request(
        `/${TEST_CONTEXT_ID}/worktree/detect`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        detection: RepositoryDetectionResult;
      };
      expect(body.detection).toEqual(mockDetectionWorktree);
    });

    it("should return 400 for invalid context ID", async () => {
      const response = await app.request(
        `/${INVALID_CONTEXT_ID}/worktree/detect`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("invalid context ID");
    });

    it("should return 404 for non-existent context", async () => {
      const response = await app.request(
        `/${NON_EXISTENT_CONTEXT_ID}/worktree/detect`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Context not found");
    });

    it("should return 500 when detection fails", async () => {
      const failingDeps: WorktreeRoutesDependencies = {
        ...createMockDeps(),
        detectRepositoryType: async (
          _path: string,
        ): Promise<RepositoryDetectionResult> => {
          throw new Error("Detection error");
        },
      };

      app = createWorktreeRoutes(contextManager, failingDeps);

      const response = await app.request(
        `/${TEST_CONTEXT_ID}/worktree/detect`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Detection error");
    });
  });

  describe("GET /:id/worktree/main", () => {
    it("should return null for main repository", async () => {
      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree/main`, {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        isWorktree: boolean;
        mainRepositoryPath: string | null;
        mainRepositoryName: string | null;
      };
      expect(body.isWorktree).toBe(false);
      expect(body.mainRepositoryPath).toBe(null);
      expect(body.mainRepositoryName).toBe(null);
    });

    it("should return main repository path for worktree", async () => {
      const worktreeDeps: WorktreeRoutesDependencies = {
        ...createMockDeps(),
        getMainRepositoryPath: async (
          _path: string,
        ): Promise<string | null> => {
          return "/home/user/projects/my-app";
        },
      };

      app = createWorktreeRoutes(contextManager, worktreeDeps);

      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree/main`, {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        isWorktree: boolean;
        mainRepositoryPath: string | null;
        mainRepositoryName: string | null;
      };
      expect(body.isWorktree).toBe(true);
      expect(body.mainRepositoryPath).toBe("/home/user/projects/my-app");
      expect(body.mainRepositoryName).toBe("my-app");
    });

    it("should return 400 for invalid context ID", async () => {
      const response = await app.request(
        `/${INVALID_CONTEXT_ID}/worktree/main`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("invalid context ID");
    });

    it("should return 404 for non-existent context", async () => {
      const response = await app.request(
        `/${NON_EXISTENT_CONTEXT_ID}/worktree/main`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Context not found");
    });

    it("should return 500 when operation fails", async () => {
      const failingDeps: WorktreeRoutesDependencies = {
        ...createMockDeps(),
        getMainRepositoryPath: async (
          _path: string,
        ): Promise<string | null> => {
          throw new Error("Operation failed");
        },
      };

      app = createWorktreeRoutes(contextManager, failingDeps);

      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree/main`, {
        method: "GET",
      });

      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Operation failed");
    });
  });

  describe("GET /default-path", () => {
    it("should return default path with exists flag", async () => {
      const response = await app.request(
        "/default-path?projectPath=/home/user/projects/my-app&name=feature-test",
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as { path: string; exists: boolean };
      expect(body.path).toBe(
        "/home/user/.local/qraftbox/worktrees/home__user__projects__my-app/feature-test",
      );
      expect(typeof body.exists).toBe("boolean");
    });

    it("should return 400 when projectPath is missing", async () => {
      const response = await app.request("/default-path?name=feature-test", {
        method: "GET",
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain(
        "Missing required query parameter: projectPath",
      );
    });

    it("should return 400 when name is missing", async () => {
      const response = await app.request(
        "/default-path?projectPath=/home/user/projects/my-app",
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Missing required query parameter: name");
    });

    it("should return 500 when path generation fails", async () => {
      const failingDeps: WorktreeRoutesDependencies = {
        ...createMockDeps(),
        generateDefaultWorktreePath: (
          _projectPath: string,
          _worktreeName: string,
        ): string => {
          throw new Error("Generation failed");
        },
      };

      app = createWorktreeRoutes(contextManager, failingDeps);

      const response = await app.request(
        "/default-path?projectPath=/home/user/projects/my-app&name=feature-test",
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Generation failed");
    });
  });

  describe("POST /:id/worktree", () => {
    it("should create worktree with minimal request", async () => {
      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "feature-new",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as CreateWorktreeResult;
      expect(body.success).toBe(true);
      expect(body.path).toContain("feature-new");
      expect(body.branch).toBe("feature-new");
    });

    it("should create worktree with full request", async () => {
      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "feature-full",
          worktreeName: "custom-name",
          createBranch: true,
          baseBranch: "main",
          customPath: "/tmp/custom-worktree",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as CreateWorktreeResult;
      expect(body.success).toBe(true);
    });

    it("should return 400 for invalid context ID", async () => {
      const response = await app.request(`/${INVALID_CONTEXT_ID}/worktree`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "feature-new",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("invalid context ID");
    });

    it("should return 404 for non-existent context", async () => {
      const response = await app.request(
        `/${NON_EXISTENT_CONTEXT_ID}/worktree`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            branch: "feature-new",
          }),
        },
      );

      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Context not found");
    });

    it("should return 400 for invalid JSON", async () => {
      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json",
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Invalid JSON");
    });

    it("should return 400 when branch is missing", async () => {
      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Missing required field: branch");
    });

    it("should return 400 when branch is empty", async () => {
      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("branch must be a non-empty string");
    });

    it("should return 500 when creation fails", async () => {
      const failingDeps: WorktreeRoutesDependencies = {
        ...createMockDeps(),
        createWorktree: async (
          _cwd: string,
          _request: CreateWorktreeRequest,
        ): Promise<CreateWorktreeResult> => {
          throw new Error("Creation failed");
        },
      };

      app = createWorktreeRoutes(contextManager, failingDeps);

      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "feature-new",
        }),
      });

      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Creation failed");
    });
  });

  describe("DELETE /:id/worktree", () => {
    it("should remove worktree", async () => {
      const response = await app.request(
        `/${TEST_CONTEXT_ID}/worktree?path=/home/user/.local/qraftbox/worktrees/feature-old`,
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as RemoveWorktreeResult;
      expect(body.success).toBe(true);
      expect(body.removed).toBe(true);
    });

    it("should remove worktree with force flag", async () => {
      const response = await app.request(
        `/${TEST_CONTEXT_ID}/worktree?path=/home/user/.local/qraftbox/worktrees/feature-old&force=true`,
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as RemoveWorktreeResult;
      expect(body.success).toBe(true);
      expect(body.removed).toBe(true);
    });

    it("should return 400 for invalid context ID", async () => {
      const response = await app.request(
        `/${INVALID_CONTEXT_ID}/worktree?path=/home/user/.local/qraftbox/worktrees/feature-old`,
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("invalid context ID");
    });

    it("should return 404 for non-existent context", async () => {
      const response = await app.request(
        `/${NON_EXISTENT_CONTEXT_ID}/worktree?path=/home/user/.local/qraftbox/worktrees/feature-old`,
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Context not found");
    });

    it("should return 400 when path is missing", async () => {
      const response = await app.request(`/${TEST_CONTEXT_ID}/worktree`, {
        method: "DELETE",
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Missing required query parameter: path");
    });

    it("should return 500 when removal fails", async () => {
      const failingDeps: WorktreeRoutesDependencies = {
        ...createMockDeps(),
        removeWorktree: async (
          _cwd: string,
          _path: string,
          _force?: boolean,
        ): Promise<RemoveWorktreeResult> => {
          throw new Error("Removal failed");
        },
      };

      app = createWorktreeRoutes(contextManager, failingDeps);

      const response = await app.request(
        `/${TEST_CONTEXT_ID}/worktree?path=/home/user/.local/qraftbox/worktrees/feature-old`,
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string; code: number };
      expect(body.error).toContain("Removal failed");
    });
  });
});
