/**
 * GitHub Authentication Module Tests
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createGitHubAuth, clearAuthCache } from "./auth.js";

describe("GitHub Authentication", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear environment variables
    delete process.env["GITHUB_TOKEN"];
    delete process.env["GH_TOKEN"];
    clearAuthCache();
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    clearAuthCache();
  });

  describe("getToken", () => {
    it("should return token from GITHUB_TOKEN env var", async () => {
      process.env["GITHUB_TOKEN"] = "ghp_test_token_123";
      const auth = createGitHubAuth();
      const token = await auth.getToken();
      expect(token).toBe("ghp_test_token_123");
    });

    it("should return token from GH_TOKEN env var as fallback", async () => {
      process.env["GH_TOKEN"] = "ghp_fallback_token_456";
      const auth = createGitHubAuth();
      const token = await auth.getToken();
      expect(token).toBe("ghp_fallback_token_456");
    });

    it("should prioritize GITHUB_TOKEN over GH_TOKEN", async () => {
      process.env["GITHUB_TOKEN"] = "ghp_priority_token";
      process.env["GH_TOKEN"] = "ghp_fallback_token";
      const auth = createGitHubAuth();
      const token = await auth.getToken();
      expect(token).toBe("ghp_priority_token");
    });

    it("should trim whitespace from tokens", async () => {
      process.env["GITHUB_TOKEN"] = "  ghp_token_with_spaces  ";
      const auth = createGitHubAuth();
      const token = await auth.getToken();
      expect(token).toBe("ghp_token_with_spaces");
    });

    it("should return null for empty token string", async () => {
      process.env["GITHUB_TOKEN"] = "   ";
      const auth = createGitHubAuth();
      const token = await auth.getToken();
      expect(token).toBe(null);
    });

    it("should return null when no token is available", async () => {
      // Mock execAsync to simulate gh CLI not available
      const mockExec = mock(async () => {
        throw new Error("gh CLI not available");
      });

      const auth = createGitHubAuth({ execAsync: mockExec as any });
      const token = await auth.getToken();
      expect(token).toBe(null);
    });

    it("should cache token after first resolution", async () => {
      process.env["GITHUB_TOKEN"] = "ghp_cached_token";
      const auth = createGitHubAuth();

      const token1 = await auth.getToken();
      expect(token1).toBe("ghp_cached_token");

      // Change env var (should still return cached value)
      process.env["GITHUB_TOKEN"] = "ghp_new_token";
      const token2 = await auth.getToken();
      expect(token2).toBe("ghp_cached_token");
    });
  });

  describe("isAuthenticated", () => {
    it("should return true when GITHUB_TOKEN is set", async () => {
      process.env["GITHUB_TOKEN"] = "ghp_test_token";
      const auth = createGitHubAuth();
      const authenticated = await auth.isAuthenticated();
      expect(authenticated).toBe(true);
    });

    it("should return true when GH_TOKEN is set", async () => {
      process.env["GH_TOKEN"] = "ghp_test_token";
      const auth = createGitHubAuth();
      const authenticated = await auth.isAuthenticated();
      expect(authenticated).toBe(true);
    });

    it("should return false when no token is available", async () => {
      // Mock execAsync to simulate gh CLI not available
      const mockExec = mock(async () => {
        throw new Error("gh CLI not available");
      });

      const auth = createGitHubAuth({ execAsync: mockExec as any });
      const authenticated = await auth.isAuthenticated();
      expect(authenticated).toBe(false);
    });

    it("should return false for empty token string", async () => {
      process.env["GITHUB_TOKEN"] = "   ";
      const auth = createGitHubAuth();
      const authenticated = await auth.isAuthenticated();
      expect(authenticated).toBe(false);
    });
  });

  describe("getAuthMethod", () => {
    it("should return 'env' when GITHUB_TOKEN is used", async () => {
      process.env["GITHUB_TOKEN"] = "ghp_test_token";
      const auth = createGitHubAuth();
      const method = await auth.getAuthMethod();
      expect(method).toBe("env");
    });

    it("should return 'env' when GH_TOKEN is used", async () => {
      process.env["GH_TOKEN"] = "ghp_test_token";
      const auth = createGitHubAuth();
      const method = await auth.getAuthMethod();
      expect(method).toBe("env");
    });

    it("should return 'none' when no authentication is available", async () => {
      // Mock execAsync to simulate gh CLI not available
      const mockExec = mock(async () => {
        throw new Error("gh CLI not available");
      });

      const auth = createGitHubAuth({ execAsync: mockExec as any });
      const method = await auth.getAuthMethod();
      expect(method).toBe("none");
    });

    it("should cache auth method after first resolution", async () => {
      process.env["GITHUB_TOKEN"] = "ghp_cached_token";
      const auth = createGitHubAuth();

      const method1 = await auth.getAuthMethod();
      expect(method1).toBe("env");

      // Change env var (should still return cached value)
      delete process.env["GITHUB_TOKEN"];
      const method2 = await auth.getAuthMethod();
      expect(method2).toBe("env");
    });
  });

  describe("getUser", () => {
    it("should return null when not authenticated", async () => {
      // Mock execAsync to simulate gh CLI not available
      const mockExec = mock(async () => {
        throw new Error("gh CLI not available");
      });

      const auth = createGitHubAuth({ execAsync: mockExec as any });
      const user = await auth.getUser();
      expect(user).toBe(null);
    });

    it("should return user info when authenticated with valid token", async () => {
      // Mock fetch to return user data
      const mockFetch = mock(async (url: string, _options?: RequestInit) => {
        if (url === "https://api.github.com/user") {
          return {
            ok: true,
            json: async () => ({
              login: "testuser",
              name: "Test User",
              email: "test@example.com",
              avatar_url: "https://avatars.githubusercontent.com/u/123",
            }),
          };
        }
        throw new Error("Unexpected URL");
      });

      process.env["GITHUB_TOKEN"] = "ghp_valid_token";
      const auth = createGitHubAuth({ fetch: mockFetch as any });
      const user = await auth.getUser();

      expect(user).toEqual({
        login: "testuser",
        name: "Test User",
        email: "test@example.com",
        avatarUrl: "https://avatars.githubusercontent.com/u/123",
      });

      expect(mockFetch).toHaveBeenCalledWith("https://api.github.com/user", {
        headers: {
          Authorization: "Bearer ghp_valid_token",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    });

    it("should use login as name when name is null", async () => {
      const mockFetch = mock(async () => ({
        ok: true,
        json: async () => ({
          login: "testuser",
          name: null,
          email: "test@example.com",
          avatar_url: "https://avatars.githubusercontent.com/u/123",
        }),
      }));

      process.env["GITHUB_TOKEN"] = "ghp_valid_token";
      const auth = createGitHubAuth({ fetch: mockFetch as any });
      const user = await auth.getUser();

      expect(user).toEqual({
        login: "testuser",
        name: "testuser",
        email: "test@example.com",
        avatarUrl: "https://avatars.githubusercontent.com/u/123",
      });
    });

    it("should use empty string as email when email is null", async () => {
      const mockFetch = mock(async () => ({
        ok: true,
        json: async () => ({
          login: "testuser",
          name: "Test User",
          email: null,
          avatar_url: "https://avatars.githubusercontent.com/u/123",
        }),
      }));

      process.env["GITHUB_TOKEN"] = "ghp_valid_token";
      const auth = createGitHubAuth({ fetch: mockFetch as any });
      const user = await auth.getUser();

      expect(user?.email).toBe("");
    });

    it("should return null when API returns non-OK status", async () => {
      const mockFetch = mock(async () => ({
        ok: false,
        status: 401,
      }));

      process.env["GITHUB_TOKEN"] = "ghp_invalid_token";
      const auth = createGitHubAuth({ fetch: mockFetch as any });
      const user = await auth.getUser();

      expect(user).toBe(null);
    });

    it("should return null when network error occurs", async () => {
      const mockFetch = mock(async () => {
        throw new Error("Network error");
      });

      process.env["GITHUB_TOKEN"] = "ghp_valid_token";
      const auth = createGitHubAuth({ fetch: mockFetch as any });
      const user = await auth.getUser();

      expect(user).toBe(null);
    });

    it("should return null when JSON parsing fails", async () => {
      const mockFetch = mock(async () => ({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      }));

      process.env["GITHUB_TOKEN"] = "ghp_valid_token";
      const auth = createGitHubAuth({ fetch: mockFetch as any });
      const user = await auth.getUser();

      expect(user).toBe(null);
    });
  });

  describe("clearAuthCache", () => {
    it("should clear cached token and method", async () => {
      process.env["GITHUB_TOKEN"] = "ghp_cached_token";
      const auth = createGitHubAuth();

      // First call caches the value
      const token1 = await auth.getToken();
      expect(token1).toBe("ghp_cached_token");

      // Change env and clear cache
      process.env["GITHUB_TOKEN"] = "ghp_new_token";
      clearAuthCache();

      // Should get new token
      const token2 = await auth.getToken();
      expect(token2).toBe("ghp_new_token");
    });
  });
});
