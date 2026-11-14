/**
 * Tests for PR types and validation functions
 */

import { describe, it, expect } from "vitest";
import type {
  ExistingPR,
  PRPromptContext,
  PRRequest,
  PRResult,
  BranchPRStatus,
  CreatePRParams,
  UpdatePRParams,
} from "./pr.js";
import {
  validateExistingPR,
  validatePRPromptContext,
  validatePRRequest,
  validatePRResult,
  validateBranchPRStatus,
  validateCreatePRParams,
  validateUpdatePRParams,
} from "./pr.js";

describe("ExistingPR validation", () => {
  const validPR: ExistingPR = {
    number: 123,
    title: "feat: add new feature",
    body: "This PR adds a new feature",
    state: "open",
    url: "https://github.com/user/repo/pull/123",
    baseBranch: "main",
    headBranch: "feature/new",
    isDraft: false,
    labels: ["enhancement"],
    reviewers: ["reviewer1"],
    assignees: ["user"],
    createdAt: 1000000,
    updatedAt: 1000100,
  };

  it("validates valid PR", () => {
    expect(validateExistingPR(validPR)).toBeNull();
  });

  it("rejects PR with non-positive number", () => {
    const invalid = { ...validPR, number: 0 };
    expect(validateExistingPR(invalid)).toBe("PR number must be positive");
  });

  it("rejects PR with negative number", () => {
    const invalid = { ...validPR, number: -1 };
    expect(validateExistingPR(invalid)).toBe("PR number must be positive");
  });

  it("rejects PR with empty title", () => {
    const invalid = { ...validPR, title: "" };
    expect(validateExistingPR(invalid)).toBe("PR title cannot be empty");
  });

  it("rejects PR with whitespace-only title", () => {
    const invalid = { ...validPR, title: "   " };
    expect(validateExistingPR(invalid)).toBe("PR title cannot be empty");
  });

  it("rejects PR with empty URL", () => {
    const invalid = { ...validPR, url: "" };
    expect(validateExistingPR(invalid)).toBe("PR URL cannot be empty");
  });

  it("rejects PR with empty base branch", () => {
    const invalid = { ...validPR, baseBranch: "" };
    expect(validateExistingPR(invalid)).toBe("Base branch cannot be empty");
  });

  it("rejects PR with empty head branch", () => {
    const invalid = { ...validPR, headBranch: "" };
    expect(validateExistingPR(invalid)).toBe("Head branch cannot be empty");
  });

  it("rejects PR with non-positive createdAt", () => {
    const invalid = { ...validPR, createdAt: 0 };
    expect(validateExistingPR(invalid)).toBe(
      "Created timestamp must be positive",
    );
  });

  it("rejects PR with non-positive updatedAt", () => {
    const invalid = { ...validPR, updatedAt: 0 };
    expect(validateExistingPR(invalid)).toBe(
      "Updated timestamp must be positive",
    );
  });

  it("rejects PR with updatedAt before createdAt", () => {
    const invalid = { ...validPR, createdAt: 2000, updatedAt: 1000 };
    expect(validateExistingPR(invalid)).toBe(
      "Updated timestamp cannot be before created timestamp",
    );
  });

  it("allows PR with updatedAt equal to createdAt", () => {
    const valid = { ...validPR, createdAt: 1000, updatedAt: 1000 };
    expect(validateExistingPR(valid)).toBeNull();
  });

  it("validates all PR states", () => {
    const states: Array<"open" | "closed" | "merged"> = [
      "open",
      "closed",
      "merged",
    ];

    for (const state of states) {
      const pr = { ...validPR, state };
      expect(validateExistingPR(pr)).toBeNull();
    }
  });

  it("allows empty arrays for labels, reviewers, assignees", () => {
    const pr = {
      ...validPR,
      labels: [] as readonly string[],
      reviewers: [] as readonly string[],
      assignees: [] as readonly string[],
    };
    expect(validateExistingPR(pr)).toBeNull();
  });

  it("validates draft PR", () => {
    const pr = { ...validPR, isDraft: true };
    expect(validateExistingPR(pr)).toBeNull();
  });
});

describe("PRPromptContext validation", () => {
  const validContext: PRPromptContext = {
    branchName: "feature/new",
    baseBranch: "main",
    remoteName: "origin",
    commits: [
      {
        hash: "abc123",
        shortHash: "abc123",
        message: "feat: add feature",
        author: "user",
        date: 1000,
      },
    ],
    existingPR: null,
    diffSummary: "Changed files...",
    repoOwner: "user",
    repoName: "repo",
    customVariables: {},
  };

  it("validates valid context", () => {
    expect(validatePRPromptContext(validContext)).toBeNull();
  });

  it("rejects context with empty branch name", () => {
    const invalid = { ...validContext, branchName: "" };
    expect(validatePRPromptContext(invalid)).toBe(
      "Branch name cannot be empty",
    );
  });

  it("rejects context with empty base branch", () => {
    const invalid = { ...validContext, baseBranch: "" };
    expect(validatePRPromptContext(invalid)).toBe(
      "Base branch cannot be empty",
    );
  });

  it("rejects context with empty remote name", () => {
    const invalid = { ...validContext, remoteName: "" };
    expect(validatePRPromptContext(invalid)).toBe(
      "Remote name cannot be empty",
    );
  });

  it("rejects context with empty repo owner", () => {
    const invalid = { ...validContext, repoOwner: "" };
    expect(validatePRPromptContext(invalid)).toBe(
      "Repository owner cannot be empty",
    );
  });

  it("rejects context with empty repo name", () => {
    const invalid = { ...validContext, repoName: "" };
    expect(validatePRPromptContext(invalid)).toBe(
      "Repository name cannot be empty",
    );
  });

  it("validates context with valid existing PR", () => {
    const context: PRPromptContext = {
      ...validContext,
      existingPR: {
        number: 123,
        title: "Test PR",
        body: "Test body",
        state: "open",
        url: "https://github.com/user/repo/pull/123",
        baseBranch: "main",
        headBranch: "feature/new",
        isDraft: false,
        labels: [],
        reviewers: [],
        assignees: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
    };
    expect(validatePRPromptContext(context)).toBeNull();
  });

  it("rejects context with invalid existing PR", () => {
    const context: PRPromptContext = {
      ...validContext,
      existingPR: {
        number: 0, // Invalid
        title: "Test PR",
        body: "Test body",
        state: "open",
        url: "https://github.com/user/repo/pull/123",
        baseBranch: "main",
        headBranch: "feature/new",
        isDraft: false,
        labels: [],
        reviewers: [],
        assignees: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
    };
    expect(validatePRPromptContext(context)).toContain(
      "Existing PR validation failed",
    );
  });

  it("allows empty commits array", () => {
    const context = { ...validContext, commits: [] as const };
    expect(validatePRPromptContext(context)).toBeNull();
  });

  it("allows empty custom variables", () => {
    const context = { ...validContext, customVariables: {} };
    expect(validatePRPromptContext(context)).toBeNull();
  });

  it("allows custom variables with values", () => {
    const context = {
      ...validContext,
      customVariables: { ticketId: "JIRA-123", scope: "api" },
    };
    expect(validatePRPromptContext(context)).toBeNull();
  });
});

describe("PRRequest validation", () => {
  const validRequest: PRRequest = {
    promptTemplateId: "pr-default",
    baseBranch: "main",
  };

  it("validates valid minimal request", () => {
    expect(validatePRRequest(validRequest)).toBeNull();
  });

  it("validates valid full request", () => {
    const request: PRRequest = {
      promptTemplateId: "pr-detailed",
      baseBranch: "main",
      title: "feat: add feature",
      body: "PR body",
      draft: true,
      labels: ["enhancement"],
      reviewers: ["reviewer1"],
      assignees: ["user"],
      customVariables: { ticketId: "JIRA-123" },
    };
    expect(validatePRRequest(request)).toBeNull();
  });

  it("rejects request with empty template ID", () => {
    const invalid = { ...validRequest, promptTemplateId: "" };
    expect(validatePRRequest(invalid)).toBe(
      "Prompt template ID cannot be empty",
    );
  });

  it("rejects request with whitespace-only template ID", () => {
    const invalid = { ...validRequest, promptTemplateId: "   " };
    expect(validatePRRequest(invalid)).toBe(
      "Prompt template ID cannot be empty",
    );
  });

  it("rejects request with empty base branch", () => {
    const invalid = { ...validRequest, baseBranch: "" };
    expect(validatePRRequest(invalid)).toBe("Base branch cannot be empty");
  });

  it("rejects request with empty title when provided", () => {
    const invalid = { ...validRequest, title: "" };
    expect(validatePRRequest(invalid)).toBe(
      "Title cannot be empty string if provided",
    );
  });

  it("rejects request with whitespace-only title when provided", () => {
    const invalid = { ...validRequest, title: "   " };
    expect(validatePRRequest(invalid)).toBe(
      "Title cannot be empty string if provided",
    );
  });

  it("rejects request with empty body when provided", () => {
    const invalid = { ...validRequest, body: "" };
    expect(validatePRRequest(invalid)).toBe(
      "Body cannot be empty string if provided",
    );
  });

  it("allows omitted title", () => {
    const request: PRRequest = { ...validRequest };
    expect(validatePRRequest(request)).toBeNull();
  });

  it("allows omitted body", () => {
    const request: PRRequest = { ...validRequest };
    expect(validatePRRequest(request)).toBeNull();
  });

  it("allows draft option", () => {
    const request = { ...validRequest, draft: true };
    expect(validatePRRequest(request)).toBeNull();
  });

  it("allows empty arrays", () => {
    const request = {
      ...validRequest,
      labels: [] as const,
      reviewers: [] as const,
      assignees: [] as const,
    };
    expect(validatePRRequest(request)).toBeNull();
  });
});

describe("PRResult validation", () => {
  const validSuccessResult: PRResult = {
    success: true,
    prNumber: 123,
    prUrl: "https://github.com/user/repo/pull/123",
    title: "feat: add feature",
    sessionId: "session-123",
  };

  const validErrorResult: PRResult = {
    success: false,
    error: "Failed to create PR",
    sessionId: "session-456",
  };

  it("validates valid success result", () => {
    expect(validatePRResult(validSuccessResult)).toBeNull();
  });

  it("validates valid error result", () => {
    expect(validatePRResult(validErrorResult)).toBeNull();
  });

  it("rejects result with empty session ID", () => {
    const invalid = { ...validSuccessResult, sessionId: "" };
    expect(validatePRResult(invalid)).toBe("Session ID cannot be empty");
  });

  it("rejects success result without PR number", () => {
    const { prNumber, ...rest } = validSuccessResult;
    const invalid: PRResult = rest as PRResult;
    expect(validatePRResult(invalid)).toBe(
      "PR number is required and must be positive for successful results",
    );
  });

  it("rejects success result with non-positive PR number", () => {
    const invalid = { ...validSuccessResult, prNumber: 0 };
    expect(validatePRResult(invalid)).toBe(
      "PR number is required and must be positive for successful results",
    );
  });

  it("rejects success result without PR URL", () => {
    const { prUrl, ...rest } = validSuccessResult;
    const invalid: PRResult = rest as PRResult;
    expect(validatePRResult(invalid)).toBe(
      "PR URL is required for successful results",
    );
  });

  it("rejects success result with empty PR URL", () => {
    const invalid = { ...validSuccessResult, prUrl: "" };
    expect(validatePRResult(invalid)).toBe(
      "PR URL is required for successful results",
    );
  });

  it("rejects success result without title", () => {
    const { title, ...rest } = validSuccessResult;
    const invalid: PRResult = rest as PRResult;
    expect(validatePRResult(invalid)).toBe(
      "Title is required for successful results",
    );
  });

  it("rejects success result with empty title", () => {
    const invalid = { ...validSuccessResult, title: "" };
    expect(validatePRResult(invalid)).toBe(
      "Title is required for successful results",
    );
  });

  it("rejects error result without error message", () => {
    const { error, ...rest } = validErrorResult;
    const invalid: PRResult = rest as PRResult;
    expect(validatePRResult(invalid)).toBe(
      "Error message is required for failed results",
    );
  });

  it("rejects error result with empty error message", () => {
    const invalid = { ...validErrorResult, error: "" };
    expect(validatePRResult(invalid)).toBe(
      "Error message is required for failed results",
    );
  });
});

describe("BranchPRStatus validation", () => {
  const validStatusWithPR: BranchPRStatus = {
    hasPR: true,
    pr: {
      number: 123,
      title: "Test PR",
      body: "Test body",
      state: "open",
      url: "https://github.com/user/repo/pull/123",
      baseBranch: "main",
      headBranch: "feature/new",
      isDraft: false,
      labels: [],
      reviewers: [],
      assignees: [],
      createdAt: 1000,
      updatedAt: 1000,
    },
    baseBranch: "main",
    canCreatePR: false,
    reason: "PR already exists",
    availableBaseBranches: ["main", "develop"],
    repoOwner: "user",
    repoName: "repo",
  };

  const validStatusNoPR: BranchPRStatus = {
    hasPR: false,
    pr: null,
    baseBranch: "main",
    canCreatePR: true,
    availableBaseBranches: ["main", "develop"],
    repoOwner: "user",
    repoName: "repo",
  };

  it("validates status with existing PR", () => {
    expect(validateBranchPRStatus(validStatusWithPR)).toBeNull();
  });

  it("validates status without PR", () => {
    expect(validateBranchPRStatus(validStatusNoPR)).toBeNull();
  });

  it("rejects status with empty base branch", () => {
    const invalid = { ...validStatusNoPR, baseBranch: "" };
    expect(validateBranchPRStatus(invalid)).toBe("Base branch cannot be empty");
  });

  it("rejects status with empty repo owner", () => {
    const invalid = { ...validStatusNoPR, repoOwner: "" };
    expect(validateBranchPRStatus(invalid)).toBe(
      "Repository owner cannot be empty",
    );
  });

  it("rejects status with empty repo name", () => {
    const invalid = { ...validStatusNoPR, repoName: "" };
    expect(validateBranchPRStatus(invalid)).toBe(
      "Repository name cannot be empty",
    );
  });

  it("rejects status with hasPR=true but null PR", () => {
    const invalid = { ...validStatusWithPR, pr: null };
    expect(validateBranchPRStatus(invalid)).toBe(
      "PR is required when hasPR is true",
    );
  });

  it("rejects status with hasPR=false but non-null PR", () => {
    const invalid = { ...validStatusNoPR, pr: validStatusWithPR.pr };
    expect(validateBranchPRStatus(invalid)).toBe(
      "PR must be null when hasPR is false",
    );
  });

  it("rejects status with invalid PR", () => {
    const invalid = {
      ...validStatusWithPR,
      pr: { ...validStatusWithPR.pr!, number: 0 },
    };
    expect(validateBranchPRStatus(invalid)).toContain("PR validation failed");
  });

  it("rejects status with canCreatePR=false but no reason", () => {
    const { reason, ...rest } = validStatusWithPR;
    const invalid: BranchPRStatus = rest as BranchPRStatus;
    expect(validateBranchPRStatus(invalid)).toBe(
      "Reason is required when canCreatePR is false",
    );
  });

  it("allows status with canCreatePR=true and no reason", () => {
    const status: BranchPRStatus = { ...validStatusNoPR };
    expect(validateBranchPRStatus(status)).toBeNull();
  });

  it("allows empty availableBaseBranches", () => {
    const status = { ...validStatusNoPR, availableBaseBranches: [] as const };
    expect(validateBranchPRStatus(status)).toBeNull();
  });
});

describe("CreatePRParams validation", () => {
  const validParams: CreatePRParams = {
    title: "feat: add feature",
    body: "This PR adds a feature",
    head: "feature/new",
    base: "main",
  };

  it("validates valid params", () => {
    expect(validateCreatePRParams(validParams)).toBeNull();
  });

  it("validates params with draft option", () => {
    const params = { ...validParams, draft: true };
    expect(validateCreatePRParams(params)).toBeNull();
  });

  it("rejects params with empty title", () => {
    const invalid = { ...validParams, title: "" };
    expect(validateCreatePRParams(invalid)).toBe("Title cannot be empty");
  });

  it("rejects params with whitespace-only title", () => {
    const invalid = { ...validParams, title: "   " };
    expect(validateCreatePRParams(invalid)).toBe("Title cannot be empty");
  });

  it("rejects params with empty body", () => {
    const invalid = { ...validParams, body: "" };
    expect(validateCreatePRParams(invalid)).toBe("Body cannot be empty");
  });

  it("rejects params with empty head branch", () => {
    const invalid = { ...validParams, head: "" };
    expect(validateCreatePRParams(invalid)).toBe("Head branch cannot be empty");
  });

  it("rejects params with empty base branch", () => {
    const invalid = { ...validParams, base: "" };
    expect(validateCreatePRParams(invalid)).toBe("Base branch cannot be empty");
  });

  it("rejects params with same head and base", () => {
    const invalid = { ...validParams, head: "main", base: "main" };
    expect(validateCreatePRParams(invalid)).toBe(
      "Head and base branches cannot be the same",
    );
  });
});

describe("UpdatePRParams validation", () => {
  it("validates valid update with title", () => {
    const params: UpdatePRParams = { title: "Updated title" };
    expect(validateUpdatePRParams(params)).toBeNull();
  });

  it("validates valid update with body", () => {
    const params: UpdatePRParams = { body: "Updated body" };
    expect(validateUpdatePRParams(params)).toBeNull();
  });

  it("validates valid update with state", () => {
    const params: UpdatePRParams = { state: "closed" };
    expect(validateUpdatePRParams(params)).toBeNull();
  });

  it("validates valid update with base", () => {
    const params: UpdatePRParams = { base: "develop" };
    expect(validateUpdatePRParams(params)).toBeNull();
  });

  it("validates valid update with multiple fields", () => {
    const params: UpdatePRParams = {
      title: "New title",
      body: "New body",
      state: "open",
      base: "main",
    };
    expect(validateUpdatePRParams(params)).toBeNull();
  });

  it("rejects empty params", () => {
    const params: UpdatePRParams = {};
    expect(validateUpdatePRParams(params)).toBe(
      "At least one field must be provided for update",
    );
  });

  it("rejects params with empty title", () => {
    const params: UpdatePRParams = { title: "" };
    expect(validateUpdatePRParams(params)).toBe(
      "Title cannot be empty string if provided",
    );
  });

  it("rejects params with whitespace-only title", () => {
    const params: UpdatePRParams = { title: "   " };
    expect(validateUpdatePRParams(params)).toBe(
      "Title cannot be empty string if provided",
    );
  });

  it("rejects params with empty body", () => {
    const params: UpdatePRParams = { body: "" };
    expect(validateUpdatePRParams(params)).toBe(
      "Body cannot be empty string if provided",
    );
  });

  it("rejects params with empty base", () => {
    const params: UpdatePRParams = { base: "" };
    expect(validateUpdatePRParams(params)).toBe(
      "Base branch cannot be empty string if provided",
    );
  });

  it("allows body with only whitespace (intentional blank)", () => {
    const params: UpdatePRParams = { body: "   " };
    expect(validateUpdatePRParams(params)).toBe(
      "Body cannot be empty string if provided",
    );
  });
});

describe("Type exports", () => {
  it("exports all type interfaces", () => {
    // This test ensures all types are properly exported
    const _pr: ExistingPR = {
      number: 1,
      title: "Test",
      body: "Test",
      state: "open",
      url: "https://test.com",
      baseBranch: "main",
      headBranch: "test",
      isDraft: false,
      labels: [],
      reviewers: [],
      assignees: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const _context: PRPromptContext = {
      branchName: "test",
      baseBranch: "main",
      remoteName: "origin",
      commits: [],
      existingPR: null,
      diffSummary: "",
      repoOwner: "user",
      repoName: "repo",
      customVariables: {},
    };

    const _request: PRRequest = {
      promptTemplateId: "test",
      baseBranch: "main",
    };

    const _result: PRResult = {
      success: true,
      prNumber: 1,
      prUrl: "https://test.com",
      title: "Test",
      sessionId: "test",
    };

    const _status: BranchPRStatus = {
      hasPR: false,
      pr: null,
      baseBranch: "main",
      canCreatePR: true,
      availableBaseBranches: [],
      repoOwner: "user",
      repoName: "repo",
    };

    const _createParams: CreatePRParams = {
      title: "Test",
      body: "Test",
      head: "test",
      base: "main",
    };

    const _updateParams: UpdatePRParams = {
      title: "Test",
    };

    expect(_pr).toBeDefined();
    expect(_context).toBeDefined();
    expect(_request).toBeDefined();
    expect(_result).toBeDefined();
    expect(_status).toBeDefined();
    expect(_createParams).toBeDefined();
    expect(_updateParams).toBeDefined();
  });
});
