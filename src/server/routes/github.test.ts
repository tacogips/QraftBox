/**
 * Unit tests for GitHub API routes
 */

import { describe, test, expect, mock } from "bun:test";
import { createGitHubRoutes } from "./github";
import type { GitHubAuth } from "../github/auth";
import type { GitHubService } from "../github/service";
import type { ContextManager } from "../workspace/context-manager";
import type { WorkspaceTab } from "../../types/workspace";
import type {
  GitHubUser,
  RepoInfo,
  Label,
  Collaborator,
  BranchComparison,
} from "../../types/github";
import type { Octokit } from "@octokit/rest";

/**
 * Mock implementations for testing
 */

// Mock GitHubUser
const mockUser: GitHubUser = {
  login: "octocat",
  name: "The Octocat",
  email: "octocat@github.com",
  avatarUrl: "https://avatars.githubusercontent.com/u/583231",
};

// Mock RepoInfo
const mockRepoInfo: RepoInfo = {
  owner: "octocat",
  name: "Hello-World",
  fullName: "octocat/Hello-World",
  defaultBranch: "main",
  isPrivate: false,
  htmlUrl: "https://github.com/octocat/Hello-World",
};

// Mock WorkspaceTab
const mockTab: WorkspaceTab = {
  id: "ctx-123" as any,
  projectSlug: "test-abc123",
  path: "/path/to/repo",
  name: "Test Repo",
  repositoryRoot: "/path/to/repo",
  isGitRepo: true,
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
  isWorktree: false,
  mainRepositoryPath: null,
  worktreeName: null,
};

// Mock ContextManager
function createMockContextManager(hasContext: boolean = true): ContextManager {
  return {
    getContext: mock(() => (hasContext ? mockTab : undefined)),
    createContext: mock(async () => mockTab),
    removeContext: mock(() => {}),
    getAllContexts: mock(() => [mockTab]),
    validateDirectory: mock(async () => ({
      valid: true,
      path: "/path/to/repo",
      isGitRepo: true,
      repositoryRoot: "/path/to/repo",
      isWorktree: false,
    })),
    getServerContext: mock(() => ({
      projectPath: mockTab.path,
      isGitRepo: true,
    })),
    getProjectRegistry: mock(() => ({
      getOrCreateSlug: async () => "test-abc123",
      resolveSlug: async () => undefined,
      removeSlug: async () => {},
      getAllProjects: async () => new Map(),
    })),
  };
}

// Mock GitHubAuth
function createMockAuth(
  authenticated: boolean = true,
  method: "env" | "gh-cli" | "none" = "env",
): GitHubAuth {
  return {
    getToken: mock(async () => (authenticated ? "gho_token123" : null)),
    isAuthenticated: mock(async () => authenticated),
    getAuthMethod: mock(async () => method),
    getUser: mock(async () => (authenticated ? mockUser : null)),
  };
}

// Mock GitHubService
function createMockService(hasRepo: boolean = true): GitHubService {
  return {
    getClient: mock(async () => ({}) as Octokit),
    getRepo: mock(async () => (hasRepo ? mockRepoInfo : null)),
    getDefaultBranch: mock(async () => "main"),
    getBranches: mock(async () => ["main", "develop"]),
    getLabels: mock(async () => [] as Label[]),
    getCollaborators: mock(async () => [] as Collaborator[]),
    compareBranches: mock(async () => ({}) as BranchComparison),
  };
}

/**
 * Test GET /api/github/auth endpoint
 */
describe("GET /api/github/auth", () => {
  test("returns auth status when authenticated via env", async () => {
    const contextManager = createMockContextManager();
    const auth = createMockAuth(true, "env");
    const service = createMockService();
    const app = createGitHubRoutes(contextManager, auth, service);

    const res = await app.request("/auth");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      authenticated: true,
      method: "env",
      user: mockUser,
      ghCliAvailable: false,
    });
  });

  test("returns auth status when authenticated via gh-cli", async () => {
    const contextManager = createMockContextManager();
    const auth = createMockAuth(true, "gh-cli");
    const service = createMockService();
    const app = createGitHubRoutes(contextManager, auth, service);

    const res = await app.request("/auth");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      authenticated: true,
      method: "gh-cli",
      user: mockUser,
      ghCliAvailable: true,
    });
  });

  test("returns auth status when not authenticated", async () => {
    const contextManager = createMockContextManager();
    const auth = createMockAuth(false, "none");
    const service = createMockService();
    const app = createGitHubRoutes(contextManager, auth, service);

    const res = await app.request("/auth");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      authenticated: false,
      method: "none",
      user: null,
      ghCliAvailable: false,
    });
  });

  test("returns 500 on authentication check failure", async () => {
    const contextManager = createMockContextManager();
    const auth: GitHubAuth = {
      getToken: mock(async () => null),
      isAuthenticated: mock(async () => {
        throw new Error("Auth check failed");
      }),
      getAuthMethod: mock(
        async (): Promise<"env" | "gh-cli" | "none"> => "none",
      ),
      getUser: mock(async () => null),
    };
    const service = createMockService();
    const app = createGitHubRoutes(contextManager, auth, service);

    const res = await app.request("/auth");
    expect(res.status).toBe(500);

    const json = (await res.json()) as any;
    expect(json).toHaveProperty("error");
    expect(json.error).toContain("Auth check failed");
  });
});

/**
 * Test GET /api/github/user endpoint
 */
describe("GET /api/github/user", () => {
  test("returns user info when authenticated", async () => {
    const contextManager = createMockContextManager();
    const auth = createMockAuth(true);
    const service = createMockService();
    const app = createGitHubRoutes(contextManager, auth, service);

    const res = await app.request("/user");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      user: mockUser,
    });
  });

  test("returns 401 when not authenticated", async () => {
    const contextManager = createMockContextManager();
    const auth = createMockAuth(false);
    const service = createMockService();
    const app = createGitHubRoutes(contextManager, auth, service);

    const res = await app.request("/user");
    expect(res.status).toBe(401);

    const json = (await res.json()) as any;
    expect(json).toHaveProperty("error");
    expect(json.error).toContain("Not authenticated");
  });

  test("returns 500 on user fetch failure", async () => {
    const contextManager = createMockContextManager();
    const auth: GitHubAuth = {
      getToken: mock(async () => "token"),
      isAuthenticated: mock(async () => true),
      getAuthMethod: mock(
        async (): Promise<"env" | "gh-cli" | "none"> => "env",
      ),
      getUser: mock(async () => {
        throw new Error("User fetch failed");
      }),
    };
    const service = createMockService();
    const app = createGitHubRoutes(contextManager, auth, service);

    const res = await app.request("/user");
    expect(res.status).toBe(500);

    const json = (await res.json()) as any;
    expect(json).toHaveProperty("error");
    expect(json.error).toContain("User fetch failed");
  });
});

/**
 * Test GET /api/ctx/:id/github/repo endpoint
 */
describe("GET /api/ctx/:id/github/repo", () => {
  test("returns repo info for valid context", async () => {
    const contextManager = createMockContextManager(true);
    const auth = createMockAuth(true);
    const service = createMockService(true);

    const mockGetRepoFromRemote = mock(async () => ({
      owner: "octocat",
      repo: "Hello-World",
    }));

    const app = createGitHubRoutes(contextManager, auth, service, {
      getRepoFromRemote: mockGetRepoFromRemote,
    });

    const res = await app.request("/ctx/ctx-123/repo");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      repo: mockRepoInfo,
    });

    // Verify getRepoFromRemote was called with correct path
    expect(mockGetRepoFromRemote).toHaveBeenCalledWith(mockTab.repositoryRoot);

    // Verify service.getRepo was called with correct owner/repo
    expect(service.getRepo).toHaveBeenCalledWith("octocat", "Hello-World");
  });

  test("returns 404 when context not found", async () => {
    const contextManager = createMockContextManager(false);
    const auth = createMockAuth(true);
    const service = createMockService(true);
    const app = createGitHubRoutes(contextManager, auth, service);

    const res = await app.request("/ctx/ctx-999/repo");
    expect(res.status).toBe(404);

    const json = (await res.json()) as any;
    expect(json).toHaveProperty("error");
    expect(json.error).toContain("Context not found");
  });

  test("returns 404 when git remote not configured", async () => {
    const contextManager = createMockContextManager(true);
    const auth = createMockAuth(true);
    const service = createMockService(true);

    const mockGetRepoFromRemote = mock(async () => null);

    const app = createGitHubRoutes(contextManager, auth, service, {
      getRepoFromRemote: mockGetRepoFromRemote,
    });

    const res = await app.request("/ctx/ctx-123/repo");
    expect(res.status).toBe(404);

    const json = (await res.json()) as any;
    expect(json).toHaveProperty("error");
    expect(json.error).toContain("Git remote not configured");
  });

  test("returns 404 when repository not found on GitHub", async () => {
    const contextManager = createMockContextManager(true);
    const auth = createMockAuth(true);
    const service = createMockService(false); // No repo

    const mockGetRepoFromRemote = mock(async () => ({
      owner: "octocat",
      repo: "NonExistent",
    }));

    const app = createGitHubRoutes(contextManager, auth, service, {
      getRepoFromRemote: mockGetRepoFromRemote,
    });

    const res = await app.request("/ctx/ctx-123/repo");
    expect(res.status).toBe(404);

    const json = (await res.json()) as any;
    expect(json).toHaveProperty("error");
    expect(json.error).toContain("Repository not found");
  });

  test("returns 500 on service failure", async () => {
    const contextManager = createMockContextManager(true);
    const auth = createMockAuth(true);
    const service: GitHubService = {
      getClient: mock(async () => ({}) as Octokit),
      getRepo: mock(async () => {
        throw new Error("API error");
      }),
      getDefaultBranch: mock(async () => "main"),
      getBranches: mock(async () => []),
      getLabels: mock(async () => []),
      getCollaborators: mock(async () => []),
      compareBranches: mock(async () => ({}) as BranchComparison),
    };

    const mockGetRepoFromRemote = mock(async () => ({
      owner: "octocat",
      repo: "Hello-World",
    }));

    const app = createGitHubRoutes(contextManager, auth, service, {
      getRepoFromRemote: mockGetRepoFromRemote,
    });

    const res = await app.request("/ctx/ctx-123/repo");
    expect(res.status).toBe(500);

    const json = (await res.json()) as any;
    expect(json).toHaveProperty("error");
    expect(json.error).toContain("API error");
  });
});

/**
 * Integration tests
 */
describe("GitHub routes integration", () => {
  test("all endpoints are accessible", async () => {
    const contextManager = createMockContextManager(true);
    const auth = createMockAuth(true);
    const service = createMockService(true);
    const app = createGitHubRoutes(contextManager, auth, service);

    // Test /auth
    const authRes = await app.request("/auth");
    expect(authRes.status).toBe(200);

    // Test /user
    const userRes = await app.request("/user");
    expect(userRes.status).toBe(200);

    // Test /ctx/:id/repo
    const mockGetRepoFromRemote = mock(async () => ({
      owner: "octocat",
      repo: "Hello-World",
    }));

    const appWithDeps = createGitHubRoutes(contextManager, auth, service, {
      getRepoFromRemote: mockGetRepoFromRemote,
    });

    const repoRes = await appWithDeps.request("/ctx/ctx-123/repo");
    expect(repoRes.status).toBe(200);
  });

  test("dependency injection works correctly", async () => {
    const contextManager = createMockContextManager(true);
    const auth = createMockAuth(true);
    const service = createMockService(true);

    const mockGetRepoFromRemote = mock(async (_cwd: string) => ({
      owner: "test-owner",
      repo: "test-repo",
    }));

    const app = createGitHubRoutes(contextManager, auth, service, {
      getRepoFromRemote: mockGetRepoFromRemote,
    });

    const res = await app.request("/ctx/ctx-123/repo");
    expect(res.status).toBe(200);

    // Verify our mock was called
    expect(mockGetRepoFromRemote).toHaveBeenCalled();
  });
});
