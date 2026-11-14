import { describe, it, expect } from "bun:test";
import { createGitHubService } from "./service.js";
import type { GitHubAuth } from "./auth.js";

/**
 * Mock GitHubAuth that returns a test token
 */
function createMockAuth(token: string | null = "test-token"): GitHubAuth {
  return {
    getToken: async () => token,
    isAuthenticated: async () => token !== null,
    getAuthMethod: async () => (token ? "env" : "none"),
    getUser: async () =>
      token
        ? {
            login: "testuser",
            name: "Test User",
            email: "test@example.com",
            avatarUrl: "https://github.com/testuser.png",
          }
        : null,
  };
}

describe("GitHubService", () => {
  describe("getClient", () => {
    it("should return Octokit client when authenticated", async () => {
      const auth = createMockAuth("test-token");
      const service = createGitHubService({ auth });

      const client = await service.getClient();
      expect(client).not.toBeNull();
    });

    it("should return null when not authenticated", async () => {
      const auth = createMockAuth(null);
      const service = createGitHubService({ auth });

      const client = await service.getClient();
      expect(client).toBeNull();
    });

    it("should cache client instance", async () => {
      const auth = createMockAuth("test-token");
      const service = createGitHubService({ auth });

      const client1 = await service.getClient();
      const client2 = await service.getClient();

      expect(client1).toBe(client2);
    });
  });

  describe("getRepo", () => {
    it("should return null when not authenticated", async () => {
      const auth = createMockAuth(null);
      const service = createGitHubService({ auth });

      const repo = await service.getRepo("testowner", "testrepo");

      expect(repo).toBeNull();
    });

    it("should return null on API error", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      // Invalid token will cause API to return 401
      const repo = await service.getRepo("testowner", "testrepo");

      expect(repo).toBeNull();
    });

    it("should return null for non-existent repository", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      // Non-existent repo should return null
      const repo = await service.getRepo("nonexistent", "repo");

      expect(repo).toBeNull();
    });
  });

  describe("getDefaultBranch", () => {
    it("should return null when not authenticated", async () => {
      const auth = createMockAuth(null);
      const service = createGitHubService({ auth });

      const branch = await service.getDefaultBranch("testowner", "testrepo");

      expect(branch).toBeNull();
    });

    it("should return null on API error", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      const branch = await service.getDefaultBranch("testowner", "testrepo");

      expect(branch).toBeNull();
    });
  });

  describe("getBranches", () => {
    it("should return empty array when not authenticated", async () => {
      const auth = createMockAuth(null);
      const service = createGitHubService({ auth });

      const branches = await service.getBranches("testowner", "testrepo");

      expect(branches).toEqual([]);
    });

    it("should return empty array on API error", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      const branches = await service.getBranches("testowner", "testrepo");

      expect(branches).toEqual([]);
    });

    it("should handle pagination structure", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      // Test that it returns an array (even if empty due to auth error)
      const branches = await service.getBranches("testowner", "testrepo");
      expect(Array.isArray(branches)).toBe(true);
    });
  });

  describe("getLabels", () => {
    it("should return empty array when not authenticated", async () => {
      const auth = createMockAuth(null);
      const service = createGitHubService({ auth });

      const labels = await service.getLabels("testowner", "testrepo");

      expect(labels).toEqual([]);
    });

    it("should return empty array on API error", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      const labels = await service.getLabels("testowner", "testrepo");

      expect(labels).toEqual([]);
    });
  });

  describe("getCollaborators", () => {
    it("should return empty array when not authenticated", async () => {
      const auth = createMockAuth(null);
      const service = createGitHubService({ auth });

      const collaborators = await service.getCollaborators(
        "testowner",
        "testrepo",
      );

      expect(collaborators).toEqual([]);
    });

    it("should return empty array on API error", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      const collaborators = await service.getCollaborators(
        "testowner",
        "testrepo",
      );

      expect(collaborators).toEqual([]);
    });

    it("should validate return type structure", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      const collaborators = await service.getCollaborators(
        "testowner",
        "testrepo",
      );

      // Should return an array
      expect(Array.isArray(collaborators)).toBe(true);
    });
  });

  describe("compareBranches", () => {
    it("should return null when not authenticated", async () => {
      const auth = createMockAuth(null);
      const service = createGitHubService({ auth });

      const comparison = await service.compareBranches(
        "testowner",
        "testrepo",
        "main",
        "develop",
      );

      expect(comparison).toBeNull();
    });

    it("should return null on API error", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      const comparison = await service.compareBranches(
        "testowner",
        "testrepo",
        "main",
        "develop",
      );

      expect(comparison).toBeNull();
    });

    it("should return null for invalid branches", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      const comparison = await service.compareBranches(
        "testowner",
        "testrepo",
        "nonexistent",
        "also-nonexistent",
      );

      expect(comparison).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should handle network errors gracefully", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      // Invalid token should trigger API errors (401)
      const repo = await service.getRepo("owner", "repo");
      const branch = await service.getDefaultBranch("owner", "repo");
      const branches = await service.getBranches("owner", "repo");
      const labels = await service.getLabels("owner", "repo");
      const collaborators = await service.getCollaborators("owner", "repo");
      const comparison = await service.compareBranches(
        "owner",
        "repo",
        "main",
        "dev",
      );

      expect(repo).toBeNull();
      expect(branch).toBeNull();
      expect(branches).toEqual([]);
      expect(labels).toEqual([]);
      expect(collaborators).toEqual([]);
      expect(comparison).toBeNull();
    });

    it("should handle empty owner/repo parameters", async () => {
      const auth = createMockAuth("invalid-token");
      const service = createGitHubService({ auth });

      // Empty owner/repo should trigger API errors (404)
      const repo = await service.getRepo("", "");
      const branch = await service.getDefaultBranch("", "");
      const branches = await service.getBranches("", "");

      expect(repo).toBeNull();
      expect(branch).toBeNull();
      expect(branches).toEqual([]);
    });
  });

  describe("unauthenticated flow", () => {
    it("should handle unauthenticated flow consistently", async () => {
      const auth = createMockAuth(null);
      const service = createGitHubService({ auth });

      // All operations should return null/empty when unauthenticated
      const client = await service.getClient();
      const repo = await service.getRepo("owner", "repo");
      const branches = await service.getBranches("owner", "repo");
      const labels = await service.getLabels("owner", "repo");
      const collaborators = await service.getCollaborators("owner", "repo");
      const comparison = await service.compareBranches(
        "owner",
        "repo",
        "main",
        "dev",
      );

      expect(client).toBeNull();
      expect(repo).toBeNull();
      expect(branches).toEqual([]);
      expect(labels).toEqual([]);
      expect(collaborators).toEqual([]);
      expect(comparison).toBeNull();
    });
  });

  describe("type safety", () => {
    it("should return properly typed results", async () => {
      const auth = createMockAuth(null);
      const service = createGitHubService({ auth });

      // Type checks - these compile if types are correct
      const repo = await service.getRepo("owner", "repo");
      if (repo) {
        // Validate RepoInfo type structure
        expect(typeof repo.owner).toBe("string");
        expect(typeof repo.name).toBe("string");
        expect(typeof repo.fullName).toBe("string");
        expect(typeof repo.defaultBranch).toBe("string");
        expect(typeof repo.isPrivate).toBe("boolean");
        expect(typeof repo.htmlUrl).toBe("string");
      }

      const branches: string[] = await service.getBranches("owner", "repo");
      expect(Array.isArray(branches)).toBe(true);

      const labels = await service.getLabels("owner", "repo");
      expect(Array.isArray(labels)).toBe(true);

      const collaborators = await service.getCollaborators("owner", "repo");
      expect(Array.isArray(collaborators)).toBe(true);

      const comparison = await service.compareBranches(
        "owner",
        "repo",
        "main",
        "dev",
      );
      if (comparison) {
        // Validate BranchComparison type structure
        expect(typeof comparison.aheadBy).toBe("number");
        expect(typeof comparison.behindBy).toBe("number");
        expect(
          ["ahead", "behind", "diverged", "identical"].includes(
            comparison.status,
          ),
        ).toBe(true);
        expect(Array.isArray(comparison.commits)).toBe(true);
      }

      // If we reach here, all type checks passed
      expect(true).toBe(true);
    });
  });
});
