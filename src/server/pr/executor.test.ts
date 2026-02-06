/**
 * PR Executor Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createPRExecutor,
  PRError,
  executePRCreation,
  executePRUpdate,
} from "./executor.js";
import type { PRService } from "../github/pr-service.js";
import type {
  ExistingPR,
  CreatePRParams,
  UpdatePRParams,
  PRRequest,
} from "../../types/pr.js";

describe("PRError", () => {
  it("should create error with code", () => {
    const error = new PRError("Test error", "TEST_CODE");
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("PRError");
  });
});

describe("parseGitHubRemoteUrl", () => {
  // Since parseGitHubRemoteUrl is internal, we test it via getRepoInfo
  it.skip("URL parsing is tested via getRepoInfo integration tests", () => {});
});

describe("createPRExecutor", () => {
  let mockPRService: PRService;

  beforeEach(() => {
    mockPRService = {
      getPR: async () => null,
      getPRForBranch: async () => null,
      listPRs: async () => [],
      createPR: async (owner, repo, params) => ({
        number: 123,
        title: params.title,
        body: params.body,
        state: "open",
        url: `https://github.com/${owner}/${repo}/pull/123`,
        baseBranch: params.base,
        headBranch: params.head,
        isDraft: params.draft ?? false,
        labels: [],
        reviewers: [],
        assignees: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      updatePR: async (owner, repo, prNumber, params) => ({
        number: prNumber,
        title: params.title ?? "Updated PR",
        body: params.body ?? "Updated body",
        state: params.state ?? "open",
        url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        baseBranch: params.base ?? "main",
        headBranch: "feature",
        isDraft: false,
        labels: [],
        reviewers: [],
        assignees: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      addLabels: async () => {},
      requestReviewers: async () => {},
    };
  });

  it("should create executor instance", () => {
    const executor = createPRExecutor(mockPRService);
    expect(executor).toBeDefined();
    expect(executor.getPRStatus).toBeDefined();
    expect(executor.getBaseBranches).toBeDefined();
    expect(executor.buildContext).toBeDefined();
    expect(executor.createPR).toBeDefined();
    expect(executor.updatePR).toBeDefined();
    expect(executor.getRepoInfo).toBeDefined();
  });

  describe("getRepoInfo", () => {
    it("should return null for invalid directory", async () => {
      const executor = createPRExecutor(mockPRService);
      const result = await executor.getRepoInfo("/nonexistent");
      expect(result).toBeNull();
    });

    // Note: Real git operations require a valid git repo
    // These tests would need a test fixture repo or mocking
    it.skip("should parse GitHub HTTPS URL", async () => {
      // Requires test repo setup
    });

    it.skip("should parse GitHub SSH URL", async () => {
      // Requires test repo setup
    });
  });

  describe("getPRStatus", () => {
    it("should return cannot create status for non-git directory", async () => {
      const executor = createPRExecutor(mockPRService);
      const status = await executor.getPRStatus("/tmp");

      expect(status.canCreatePR).toBe(false);
      expect(status.hasPR).toBe(false);
      expect(status.reason).toBeDefined();
    });

    it.skip("should detect existing PR", async () => {
      // Requires test repo setup
      const mockPR: ExistingPR = {
        number: 123,
        title: "Test PR",
        body: "Test body",
        state: "open",
        url: "https://github.com/user/repo/pull/123",
        baseBranch: "main",
        headBranch: "feature",
        isDraft: false,
        labels: [],
        reviewers: [],
        assignees: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockPRService.getPRForBranch = async () => mockPR;

      const executor = createPRExecutor(mockPRService);
      const status = await executor.getPRStatus("/valid/repo");

      expect(status.hasPR).toBe(true);
      expect(status.pr).toEqual(mockPR);
      expect(status.canCreatePR).toBe(false);
      expect(status.reason).toBe("PR already exists for this branch");
    });
  });

  describe("getBaseBranches", () => {
    it("should return empty array for non-git directory", async () => {
      const executor = createPRExecutor(mockPRService);
      const branches = await executor.getBaseBranches("/tmp");
      expect(branches).toEqual([]);
    });

    it.skip("should return common base branches", async () => {
      // Requires test repo setup
    });
  });

  describe("buildContext", () => {
    it("should throw error for invalid directory", async () => {
      const executor = createPRExecutor(mockPRService);

      await expect(
        executor.buildContext("/nonexistent", "main"),
      ).rejects.toThrow(PRError);
    });

    it.skip("should build valid context with commits", async () => {
      // Requires test repo setup
    });

    it.skip("should include existing PR in context", async () => {
      // Requires test repo setup
    });
  });

  describe("createPR", () => {
    it("should throw error for invalid directory", async () => {
      const executor = createPRExecutor(mockPRService);

      const request: PRRequest = {
        promptTemplateId: "pr",
        baseBranch: "main",
      };

      await expect(executor.createPR("/nonexistent", request)).rejects.toThrow(
        PRError,
      );
    });

    it.skip("should throw error if PR already exists", async () => {
      // Requires test repo setup
    });

    it.skip("should return session ID and context", async () => {
      // Requires test repo setup
    });
  });

  describe("updatePR", () => {
    it("should throw error for invalid directory", async () => {
      const executor = createPRExecutor(mockPRService);

      const request: PRRequest = {
        promptTemplateId: "pr-update",
        baseBranch: "main",
      };

      await expect(
        executor.updatePR("/nonexistent", 123, request),
      ).rejects.toThrow(PRError);
    });

    it.skip("should throw error if PR not found", async () => {
      // Requires test repo setup
    });

    it.skip("should return session ID and context", async () => {
      // Requires test repo setup
    });
  });
});

describe("executePRCreation", () => {
  let mockPRService: PRService;

  beforeEach(() => {
    mockPRService = {
      getPR: async () => null,
      getPRForBranch: async () => null,
      listPRs: async () => [],
      createPR: async (owner, repo, params) => ({
        number: 123,
        title: params.title,
        body: params.body,
        state: "open",
        url: `https://github.com/${owner}/${repo}/pull/123`,
        baseBranch: params.base,
        headBranch: params.head,
        isDraft: params.draft ?? false,
        labels: [],
        reviewers: [],
        assignees: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      updatePR: async () => {
        throw new Error("Not implemented");
      },
      addLabels: async () => {},
      requestReviewers: async () => {},
    };
  });

  it("should create PR successfully", async () => {
    const params: CreatePRParams = {
      title: "Test PR",
      body: "Test body",
      head: "feature",
      base: "main",
      draft: false,
    };

    const request: PRRequest = {
      promptTemplateId: "pr",
      baseBranch: "main",
    };

    const result = await executePRCreation(
      mockPRService,
      "user",
      "repo",
      params,
      request,
    );

    expect(result.success).toBe(true);
    expect(result.prNumber).toBe(123);
    expect(result.prUrl).toBe("https://github.com/user/repo/pull/123");
    expect(result.title).toBe("Test PR");
    expect(result.error).toBeUndefined();
  });

  it("should add labels when specified", async () => {
    let labelsAdded: string[] = [];
    mockPRService.addLabels = async (_owner, _repo, _prNumber, labels) => {
      labelsAdded = labels;
    };

    const params: CreatePRParams = {
      title: "Test PR",
      body: "Test body",
      head: "feature",
      base: "main",
    };

    const request: PRRequest = {
      promptTemplateId: "pr",
      baseBranch: "main",
      labels: ["enhancement", "bug"],
    };

    await executePRCreation(mockPRService, "user", "repo", params, request);

    expect(labelsAdded).toEqual(["enhancement", "bug"]);
  });

  it("should request reviewers when specified", async () => {
    let reviewersRequested: string[] = [];
    mockPRService.requestReviewers = async (
      _owner,
      _repo,
      _prNumber,
      reviewers,
    ) => {
      reviewersRequested = reviewers;
    };

    const params: CreatePRParams = {
      title: "Test PR",
      body: "Test body",
      head: "feature",
      base: "main",
    };

    const request: PRRequest = {
      promptTemplateId: "pr",
      baseBranch: "main",
      reviewers: ["reviewer1", "reviewer2"],
    };

    await executePRCreation(mockPRService, "user", "repo", params, request);

    expect(reviewersRequested).toEqual(["reviewer1", "reviewer2"]);
  });

  it("should handle creation errors", async () => {
    mockPRService.createPR = async () => {
      throw new Error("API Error");
    };

    const params: CreatePRParams = {
      title: "Test PR",
      body: "Test body",
      head: "feature",
      base: "main",
    };

    const request: PRRequest = {
      promptTemplateId: "pr",
      baseBranch: "main",
    };

    const result = await executePRCreation(
      mockPRService,
      "user",
      "repo",
      params,
      request,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("API Error");
    expect(result.prNumber).toBeUndefined();
  });
});

describe("executePRUpdate", () => {
  let mockPRService: PRService;

  beforeEach(() => {
    mockPRService = {
      getPR: async () => null,
      getPRForBranch: async () => null,
      listPRs: async () => [],
      createPR: async () => {
        throw new Error("Not implemented");
      },
      updatePR: async (owner, repo, prNumber, params) => ({
        number: prNumber,
        title: params.title ?? "Updated PR",
        body: params.body ?? "Updated body",
        state: params.state ?? "open",
        url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        baseBranch: params.base ?? "main",
        headBranch: "feature",
        isDraft: false,
        labels: [],
        reviewers: [],
        assignees: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      addLabels: async () => {},
      requestReviewers: async () => {},
    };
  });

  it("should update PR successfully", async () => {
    const params: UpdatePRParams = {
      title: "Updated PR",
      body: "Updated body",
    };

    const request: PRRequest = {
      promptTemplateId: "pr-update",
      baseBranch: "main",
    };

    const result = await executePRUpdate(
      mockPRService,
      "user",
      "repo",
      123,
      params,
      request,
    );

    expect(result.success).toBe(true);
    expect(result.prNumber).toBe(123);
    expect(result.title).toBe("Updated PR");
    expect(result.error).toBeUndefined();
  });

  it("should add labels when updating", async () => {
    let labelsAdded: string[] = [];
    mockPRService.addLabels = async (_owner, _repo, _prNumber, labels) => {
      labelsAdded = labels;
    };

    const params: UpdatePRParams = {
      title: "Updated PR",
    };

    const request: PRRequest = {
      promptTemplateId: "pr-update",
      baseBranch: "main",
      labels: ["documentation"],
    };

    await executePRUpdate(mockPRService, "user", "repo", 123, params, request);

    expect(labelsAdded).toEqual(["documentation"]);
  });

  it("should handle update errors", async () => {
    mockPRService.updatePR = async () => {
      throw new Error("Update failed");
    };

    const params: UpdatePRParams = {
      title: "Updated PR",
    };

    const request: PRRequest = {
      promptTemplateId: "pr-update",
      baseBranch: "main",
    };

    const result = await executePRUpdate(
      mockPRService,
      "user",
      "repo",
      123,
      params,
      request,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Update failed");
  });
});
