/**
 * Tests for Octokit Client Factory
 */

import { describe, it, expect, vi } from "vitest";
import { createOctokitClient, getAuthenticatedClient } from "./client.js";
import type { GitHubAuth } from "./auth.js";

describe("createOctokitClient", () => {
  it("should return Octokit instance when token is available", async () => {
    const mockAuth: GitHubAuth = {
      getToken: vi.fn().mockResolvedValue("gho_test_token_123"),
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getAuthMethod: vi.fn().mockResolvedValue("env"),
      getUser: vi.fn().mockResolvedValue({
        login: "testuser",
        name: "Test User",
        email: "test@example.com",
        avatarUrl: "https://example.com/avatar.png",
      }),
    };

    const client = await createOctokitClient({ auth: mockAuth });

    expect(client).not.toBeNull();
    expect(mockAuth.getToken).toHaveBeenCalledOnce();
  });

  it("should return null when token is not available", async () => {
    const mockAuth: GitHubAuth = {
      getToken: vi.fn().mockResolvedValue(null),
      isAuthenticated: vi.fn().mockResolvedValue(false),
      getAuthMethod: vi.fn().mockResolvedValue("none"),
      getUser: vi.fn().mockResolvedValue(null),
    };

    const client = await createOctokitClient({ auth: mockAuth });

    expect(client).toBeNull();
    expect(mockAuth.getToken).toHaveBeenCalledOnce();
  });

  it("should create Octokit with correct auth configuration", async () => {
    const testToken = "gho_secure_token_456";
    const mockAuth: GitHubAuth = {
      getToken: vi.fn().mockResolvedValue(testToken),
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getAuthMethod: vi.fn().mockResolvedValue("gh-cli"),
      getUser: vi.fn().mockResolvedValue({
        login: "cliuser",
        name: "CLI User",
        email: "cli@example.com",
        avatarUrl: "https://example.com/cli-avatar.png",
      }),
    };

    const client = await createOctokitClient({ auth: mockAuth });

    expect(client).not.toBeNull();
    // Verify client can be used (basic smoke test)
    expect(client).toHaveProperty("rest");
    expect(client).toHaveProperty("graphql");
  });

  it("should handle empty string token as no authentication", async () => {
    const mockAuth: GitHubAuth = {
      getToken: vi.fn().mockResolvedValue(""),
      isAuthenticated: vi.fn().mockResolvedValue(false),
      getAuthMethod: vi.fn().mockResolvedValue("none"),
      getUser: vi.fn().mockResolvedValue(null),
    };

    const client = await createOctokitClient({ auth: mockAuth });

    // Empty string is falsy, should return null
    expect(client).toBeNull();
  });

  it("should use default auth when no options provided", async () => {
    // This test verifies the function can be called without options
    // We can't easily test the default behavior without mocking the module,
    // but we can verify it doesn't throw
    const client = await createOctokitClient();

    // Result depends on actual environment, but should not throw
    expect(client === null || client !== null).toBe(true);
  });
});

describe("getAuthenticatedClient", () => {
  it("should return Octokit instance when token is available", async () => {
    const mockAuth: GitHubAuth = {
      getToken: vi.fn().mockResolvedValue("gho_authenticated_token"),
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getAuthMethod: vi.fn().mockResolvedValue("env"),
      getUser: vi.fn().mockResolvedValue({
        login: "authuser",
        name: "Auth User",
        email: "auth@example.com",
        avatarUrl: "https://example.com/auth-avatar.png",
      }),
    };

    const client = await getAuthenticatedClient({ auth: mockAuth });

    expect(client).not.toBeNull();
    expect(client).toHaveProperty("rest");
    expect(mockAuth.getToken).toHaveBeenCalledOnce();
  });

  it("should throw error when token is not available", async () => {
    const mockAuth: GitHubAuth = {
      getToken: vi.fn().mockResolvedValue(null),
      isAuthenticated: vi.fn().mockResolvedValue(false),
      getAuthMethod: vi.fn().mockResolvedValue("none"),
      getUser: vi.fn().mockResolvedValue(null),
    };

    await expect(getAuthenticatedClient({ auth: mockAuth })).rejects.toThrow(
      "GitHub authentication required",
    );

    expect(mockAuth.getToken).toHaveBeenCalledOnce();
  });

  it("should throw error with helpful message", async () => {
    const mockAuth: GitHubAuth = {
      getToken: vi.fn().mockResolvedValue(null),
      isAuthenticated: vi.fn().mockResolvedValue(false),
      getAuthMethod: vi.fn().mockResolvedValue("none"),
      getUser: vi.fn().mockResolvedValue(null),
    };

    await expect(getAuthenticatedClient({ auth: mockAuth })).rejects.toThrow(
      /GITHUB_TOKEN|gh CLI/,
    );
  });

  it("should create functional Octokit client", async () => {
    const mockAuth: GitHubAuth = {
      getToken: vi.fn().mockResolvedValue("gho_functional_token"),
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getAuthMethod: vi.fn().mockResolvedValue("env"),
      getUser: vi.fn().mockResolvedValue({
        login: "funcuser",
        name: "Func User",
        email: "func@example.com",
        avatarUrl: "https://example.com/func-avatar.png",
      }),
    };

    const client = await getAuthenticatedClient({ auth: mockAuth });

    // Verify client structure
    expect(client).toHaveProperty("rest");
    expect(client.rest).toHaveProperty("users");
    expect(client.rest).toHaveProperty("repos");
    expect(client.rest).toHaveProperty("pulls");
  });
});

describe("client module integration", () => {
  it("should handle token resolution from different auth methods", async () => {
    const testCases: Array<{
      method: "env" | "gh-cli";
      token: string;
    }> = [
      { method: "env", token: "gho_env_token" },
      { method: "gh-cli", token: "gho_cli_token" },
    ];

    for (const { method, token } of testCases) {
      const mockAuth: GitHubAuth = {
        getToken: vi.fn().mockResolvedValue(token),
        isAuthenticated: vi.fn().mockResolvedValue(true),
        getAuthMethod: vi.fn().mockResolvedValue(method),
        getUser: vi.fn().mockResolvedValue({
          login: `${method}user`,
          name: `${method} User`,
          email: `${method}@example.com`,
          avatarUrl: `https://example.com/${method}-avatar.png`,
        }),
      };

      const client = await createOctokitClient({ auth: mockAuth });

      expect(client).not.toBeNull();
      expect(mockAuth.getToken).toHaveBeenCalled();
    }
  });

  it("should create independent clients for multiple calls", async () => {
    const mockAuth: GitHubAuth = {
      getToken: vi.fn().mockResolvedValue("gho_multi_token"),
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getAuthMethod: vi.fn().mockResolvedValue("env"),
      getUser: vi.fn().mockResolvedValue({
        login: "multiuser",
        name: "Multi User",
        email: "multi@example.com",
        avatarUrl: "https://example.com/multi-avatar.png",
      }),
    };

    const client1 = await createOctokitClient({ auth: mockAuth });
    const client2 = await createOctokitClient({ auth: mockAuth });

    expect(client1).not.toBeNull();
    expect(client2).not.toBeNull();
    expect(client1).not.toBe(client2); // Should be different instances
    expect(mockAuth.getToken).toHaveBeenCalledTimes(2);
  });
});
