/**
 * PR Service Tests
 */

import { describe, test, expect, mock } from "bun:test";
import { createPRService } from "./pr-service";
import type { Octokit } from "@octokit/rest";
import type { CreatePRParams, UpdatePRParams } from "../../types/pr";

/**
 * Create mock PR response
 */
function createMockPRResponse(
  overrides: Partial<{
    number: number;
    title: string;
    body: string | null;
    state: string;
    html_url: string;
    base: { ref: string };
    head: { ref: string };
    draft: boolean;
    labels: Array<{ name: string }>;
    requested_reviewers: Array<{ login: string }>;
    assignees: Array<{ login: string }>;
    created_at: string;
    updated_at: string;
    merged_at: string | null;
  }> = {},
) {
  return {
    number: 123,
    title: "Test PR",
    body: "Test body",
    state: "open",
    html_url: "https://github.com/owner/repo/pull/123",
    base: { ref: "main" },
    head: { ref: "feature" },
    draft: false,
    labels: [{ name: "bug" }],
    requested_reviewers: [{ login: "reviewer1" }],
    assignees: [{ login: "assignee1" }],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    merged_at: null,
    ...overrides,
  };
}

/**
 * Create mock Octokit
 */
function createMockOctokit(): Octokit {
  return {
    rest: {
      pulls: {
        get: mock(async () => ({ data: createMockPRResponse() })),
        list: mock(async () => ({ data: [createMockPRResponse()] })),
        create: mock(async () => ({ data: createMockPRResponse() })),
        update: mock(async () => ({ data: createMockPRResponse() })),
        requestReviewers: mock(async () => ({ data: {} })),
      },
      issues: {
        addLabels: mock(async () => ({ data: {} })),
      },
    },
  } as unknown as Octokit;
}

describe("PRService", () => {
  describe("getPR", () => {
    test("returns PR when found", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      const result = await service.getPR("owner", "repo", 123);

      expect(result).not.toBeNull();
      expect(result?.number).toBe(123);
      expect(result?.title).toBe("Test PR");
      expect(result?.baseBranch).toBe("main");
      expect(result?.headBranch).toBe("feature");
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 123,
      });
    });

    test("returns null when PR not found", async () => {
      const mockOctokit = createMockOctokit();
      const error = new Error("Not Found") as Error & { status: number };
      error.status = 404;
      (mockOctokit.rest.pulls as any).get = mock(async () => {
        throw error;
      });
      const service = createPRService({ octokit: mockOctokit });

      const result = await service.getPR("owner", "repo", 999);

      expect(result).toBeNull();
    });

    test("throws on non-404 errors", async () => {
      const mockOctokit = createMockOctokit();
      (mockOctokit.rest.pulls as any).get = mock(async () => {
        throw new Error("Server error");
      });
      const service = createPRService({ octokit: mockOctokit });

      await expect(service.getPR("owner", "repo", 123)).rejects.toThrow(
        "Server error",
      );
    });

    test("maps merged state correctly", async () => {
      const mockOctokit = createMockOctokit();
      (mockOctokit.rest.pulls as any).get = mock(async () => ({
        data: createMockPRResponse({
          state: "closed",
          merged_at: "2026-01-03T00:00:00Z",
        }),
      }));
      const service = createPRService({ octokit: mockOctokit });

      const result = await service.getPR("owner", "repo", 123);

      expect(result?.state).toBe("merged");
    });
  });

  describe("getPRForBranch", () => {
    test("returns PR when found for branch", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      const result = await service.getPRForBranch("owner", "repo", "feature");

      expect(result).not.toBeNull();
      expect(result?.headBranch).toBe("feature");
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        head: "owner:feature",
        state: "all",
      });
    });

    test("includes base when provided", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      await service.getPRForBranch("owner", "repo", "feature", "develop");

      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        head: "owner:feature",
        state: "all",
        base: "develop",
      });
    });

    test("returns null when no PRs found", async () => {
      const mockOctokit = createMockOctokit();
      (mockOctokit.rest.pulls as any).list = mock(async () => ({ data: [] }));
      const service = createPRService({ octokit: mockOctokit });

      const result = await service.getPRForBranch("owner", "repo", "no-pr");

      expect(result).toBeNull();
    });

    test("handles head with colon format", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      await service.getPRForBranch("owner", "repo", "fork:feature");

      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        head: "fork:feature",
        state: "all",
      });
    });
  });

  describe("listPRs", () => {
    test("lists open PRs by default", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      const result = await service.listPRs("owner", "repo");

      expect(result).toHaveLength(1);
      expect(result[0]?.number).toBe(123);
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        state: "open",
        per_page: 100,
      });
    });

    test("lists PRs with specified state", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      await service.listPRs("owner", "repo", "all");

      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        state: "all",
        per_page: 100,
      });
    });

    test("returns empty array when no PRs", async () => {
      const mockOctokit = createMockOctokit();
      (mockOctokit.rest.pulls as any).list = mock(async () => ({ data: [] }));
      const service = createPRService({ octokit: mockOctokit });

      const result = await service.listPRs("owner", "repo");

      expect(result).toEqual([]);
    });
  });

  describe("createPR", () => {
    test("creates PR with required params", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      const params: CreatePRParams = {
        title: "New PR",
        body: "PR description",
        head: "feature",
        base: "main",
      };

      const result = await service.createPR("owner", "repo", params);

      expect(result.number).toBe(123);
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        title: "New PR",
        body: "PR description",
        head: "feature",
        base: "main",
      });
    });

    test("creates draft PR when specified", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      const params: CreatePRParams = {
        title: "Draft PR",
        body: "WIP",
        head: "feature",
        base: "main",
        draft: true,
      };

      await service.createPR("owner", "repo", params);

      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        title: "Draft PR",
        body: "WIP",
        head: "feature",
        base: "main",
        draft: true,
      });
    });
  });

  describe("updatePR", () => {
    test("updates PR title", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      const params: UpdatePRParams = {
        title: "Updated Title",
      };

      const result = await service.updatePR("owner", "repo", 123, params);

      expect(result.number).toBe(123);
      expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 123,
        title: "Updated Title",
      });
    });

    test("updates multiple fields", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      const params: UpdatePRParams = {
        title: "New Title",
        body: "New Body",
        state: "closed",
      };

      await service.updatePR("owner", "repo", 123, params);

      expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 123,
        title: "New Title",
        body: "New Body",
        state: "closed",
      });
    });
  });

  describe("addLabels", () => {
    test("adds labels to PR", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      await service.addLabels("owner", "repo", 123, ["bug", "urgent"]);

      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        issue_number: 123,
        labels: ["bug", "urgent"],
      });
    });

    test("does nothing with empty labels array", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      await service.addLabels("owner", "repo", 123, []);

      expect(mockOctokit.rest.issues.addLabels).not.toHaveBeenCalled();
    });
  });

  describe("requestReviewers", () => {
    test("requests reviewers for PR", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      await service.requestReviewers("owner", "repo", 123, [
        "reviewer1",
        "reviewer2",
      ]);

      expect(mockOctokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 123,
        reviewers: ["reviewer1", "reviewer2"],
      });
    });

    test("does nothing with empty reviewers array", async () => {
      const mockOctokit = createMockOctokit();
      const service = createPRService({ octokit: mockOctokit });

      await service.requestReviewers("owner", "repo", 123, []);

      expect(mockOctokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
    });
  });
});
