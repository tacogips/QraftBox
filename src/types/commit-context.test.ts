import { describe, test, expect } from "bun:test";
import {
  validateCommitPromptContext,
  validateStagedFile,
  validateCommitRequest,
  validateCommitResult,
  createEmptyCommitPromptContext,
  createDefaultCommitRequest,
  createFailedCommitResult,
  createSuccessCommitResult,
  calculateTotalAdditions,
  calculateTotalDeletions,
  countFilesByStatus,
  type StagedFile,
  type StagedFileStatus,
  type CommitPromptContext,
  type CommitRequest,
  type CommitResult,
} from "./commit-context";

describe("validateStagedFile", () => {
  test("accepts valid staged file", () => {
    const file: StagedFile = {
      path: "src/main.ts",
      status: "M",
      additions: 10,
      deletions: 5,
    };

    const result = validateStagedFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts all valid status codes", () => {
    const statuses: StagedFileStatus[] = ["A", "M", "D", "R"];

    for (const status of statuses) {
      const file: StagedFile = {
        path: "test.ts",
        status,
        additions: 1,
        deletions: 1,
      };

      const result = validateStagedFile(file);
      expect(result.valid).toBe(true);
    }
  });

  test("rejects empty path", () => {
    const file: StagedFile = {
      path: "",
      status: "M",
      additions: 1,
      deletions: 0,
    };

    const result = validateStagedFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("staged file path cannot be empty");
  });

  test("rejects path with only whitespace", () => {
    const file: StagedFile = {
      path: "   ",
      status: "M",
      additions: 1,
      deletions: 0,
    };

    const result = validateStagedFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("staged file path cannot be empty");
  });

  test("rejects invalid status", () => {
    const file = {
      path: "test.ts",
      status: "X",
      additions: 1,
      deletions: 0,
    } as unknown as StagedFile;

    const result = validateStagedFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid status");
  });

  test("rejects negative additions", () => {
    const file: StagedFile = {
      path: "test.ts",
      status: "M",
      additions: -1,
      deletions: 0,
    };

    const result = validateStagedFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("additions must be non-negative");
  });

  test("rejects negative deletions", () => {
    const file: StagedFile = {
      path: "test.ts",
      status: "M",
      additions: 0,
      deletions: -5,
    };

    const result = validateStagedFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("deletions must be non-negative");
  });

  test("accepts zero additions and deletions", () => {
    const file: StagedFile = {
      path: "test.ts",
      status: "M",
      additions: 0,
      deletions: 0,
    };

    const result = validateStagedFile(file);
    expect(result.valid).toBe(true);
  });
});

describe("validateCommitPromptContext", () => {
  test("accepts valid context", () => {
    const context: CommitPromptContext = {
      stagedFiles: [
        {
          path: "src/main.ts",
          status: "M",
          additions: 10,
          deletions: 5,
        },
      ],
      stagedDiff: "diff content",
      branchName: "main",
      recentCommits: [],
      repositoryRoot: "/home/user/project",
    };

    const result = validateCommitPromptContext(context);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("rejects empty repository root", () => {
    const context: CommitPromptContext = {
      stagedFiles: [
        {
          path: "test.ts",
          status: "M",
          additions: 1,
          deletions: 0,
        },
      ],
      stagedDiff: "diff",
      branchName: "main",
      recentCommits: [],
      repositoryRoot: "",
    };

    const result = validateCommitPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("repositoryRoot cannot be empty");
  });

  test("rejects repository root with only whitespace", () => {
    const context: CommitPromptContext = {
      stagedFiles: [
        {
          path: "test.ts",
          status: "M",
          additions: 1,
          deletions: 0,
        },
      ],
      stagedDiff: "diff",
      branchName: "main",
      recentCommits: [],
      repositoryRoot: "   ",
    };

    const result = validateCommitPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("repositoryRoot cannot be empty");
  });

  test("rejects empty branch name", () => {
    const context: CommitPromptContext = {
      stagedFiles: [
        {
          path: "test.ts",
          status: "M",
          additions: 1,
          deletions: 0,
        },
      ],
      stagedDiff: "diff",
      branchName: "",
      recentCommits: [],
      repositoryRoot: "/home/user/project",
    };

    const result = validateCommitPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("branchName cannot be empty");
  });

  test("rejects empty staged files", () => {
    const context: CommitPromptContext = {
      stagedFiles: [],
      stagedDiff: "diff",
      branchName: "main",
      recentCommits: [],
      repositoryRoot: "/home/user/project",
    };

    const result = validateCommitPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("stagedFiles cannot be empty");
  });

  test("validates each staged file", () => {
    const context: CommitPromptContext = {
      stagedFiles: [
        {
          path: "valid.ts",
          status: "M",
          additions: 1,
          deletions: 0,
        },
        {
          path: "",
          status: "M",
          additions: 1,
          deletions: 0,
        },
      ],
      stagedDiff: "diff",
      branchName: "main",
      recentCommits: [],
      repositoryRoot: "/home/user/project",
    };

    const result = validateCommitPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("staged file path cannot be empty");
  });
});

describe("validateCommitRequest", () => {
  test("accepts valid commit request", () => {
    const request: CommitRequest = {
      promptId: "default-commit",
      variables: { scope: "feature" },
      dryRun: false,
    };

    const result = validateCommitRequest(request);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts empty variables", () => {
    const request: CommitRequest = {
      promptId: "default-commit",
      variables: {},
      dryRun: false,
    };

    const result = validateCommitRequest(request);
    expect(result.valid).toBe(true);
  });

  test("rejects empty prompt ID", () => {
    const request: CommitRequest = {
      promptId: "",
      variables: {},
      dryRun: false,
    };

    const result = validateCommitRequest(request);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("promptId cannot be empty");
  });

  test("rejects prompt ID with only whitespace", () => {
    const request: CommitRequest = {
      promptId: "   ",
      variables: {},
      dryRun: false,
    };

    const result = validateCommitRequest(request);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("promptId cannot be empty");
  });

  test("rejects null variables", () => {
    const request = {
      promptId: "default-commit",
      variables: null,
      dryRun: false,
    } as unknown as CommitRequest;

    const result = validateCommitRequest(request);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("variables must be an object");
  });

  test("rejects empty variable key", () => {
    const request: CommitRequest = {
      promptId: "default-commit",
      variables: { "": "value" },
      dryRun: false,
    };

    const result = validateCommitRequest(request);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("variable keys cannot be empty");
  });

  test("rejects non-string variable value", () => {
    const request = {
      promptId: "default-commit",
      variables: { key: 123 },
      dryRun: false,
    } as unknown as CommitRequest;

    const result = validateCommitRequest(request);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("must be a string");
  });
});

describe("validateCommitResult", () => {
  test("accepts valid success result", () => {
    const result: CommitResult = {
      success: true,
      commitHash: "abc123def456789012345678901234567890abcd",
      message: "feat: add new feature",
      error: null,
    };

    const validation = validateCommitResult(result);
    expect(validation.valid).toBe(true);
    expect(validation.error).toBeUndefined();
  });

  test("accepts valid failure result", () => {
    const result: CommitResult = {
      success: false,
      commitHash: null,
      message: "Commit failed",
      error: "No staged changes found",
    };

    const validation = validateCommitResult(result);
    expect(validation.valid).toBe(true);
  });

  test("rejects success without commit hash", () => {
    const result: CommitResult = {
      success: true,
      commitHash: null,
      message: "Success",
      error: null,
    };

    const validation = validateCommitResult(result);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe(
      "commitHash must be present when success is true",
    );
  });

  test("rejects failure without error message", () => {
    const result: CommitResult = {
      success: false,
      commitHash: null,
      message: "Failed",
      error: null,
    };

    const validation = validateCommitResult(result);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe(
      "error should be present when success is false",
    );
  });

  test("rejects invalid commit hash format", () => {
    const result: CommitResult = {
      success: true,
      commitHash: "invalid-hash",
      message: "Success",
      error: null,
    };

    const validation = validateCommitResult(result);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe("invalid commit hash format");
  });

  test("accepts short commit hash", () => {
    const result: CommitResult = {
      success: true,
      commitHash: "abc1234",
      message: "Success",
      error: null,
    };

    const validation = validateCommitResult(result);
    expect(validation.valid).toBe(true);
  });

  test("rejects empty message", () => {
    const result: CommitResult = {
      success: true,
      commitHash: "abc123def456789012345678901234567890abcd",
      message: "",
      error: null,
    };

    const validation = validateCommitResult(result);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe("message cannot be empty");
  });

  test("rejects message with only whitespace", () => {
    const result: CommitResult = {
      success: true,
      commitHash: "abc123def456789012345678901234567890abcd",
      message: "   ",
      error: null,
    };

    const validation = validateCommitResult(result);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe("message cannot be empty");
  });
});

describe("createEmptyCommitPromptContext", () => {
  test("creates empty context with required fields", () => {
    const context = createEmptyCommitPromptContext(
      "/home/user/project",
      "main",
    );

    expect(context.repositoryRoot).toBe("/home/user/project");
    expect(context.branchName).toBe("main");
    expect(context.stagedFiles).toHaveLength(0);
    expect(context.stagedDiff).toBe("");
    expect(context.recentCommits).toHaveLength(0);
  });

  test("creates readonly arrays", () => {
    const context = createEmptyCommitPromptContext("/path", "branch");

    expect(context.stagedFiles).toBeDefined();
    expect(context.recentCommits).toBeDefined();
  });
});

describe("createDefaultCommitRequest", () => {
  test("creates request with specified prompt ID", () => {
    const request = createDefaultCommitRequest("custom-prompt");

    expect(request.promptId).toBe("custom-prompt");
    expect(request.variables).toEqual({});
    expect(request.dryRun).toBe(false);
  });

  test("creates request with empty variables", () => {
    const request = createDefaultCommitRequest("default-commit");

    expect(Object.keys(request.variables)).toHaveLength(0);
  });
});

describe("createFailedCommitResult", () => {
  test("creates failed result with error", () => {
    const result = createFailedCommitResult(
      "No staged changes",
      "Commit failed",
    );

    expect(result.success).toBe(false);
    expect(result.commitHash).toBeNull();
    expect(result.message).toBe("Commit failed");
    expect(result.error).toBe("No staged changes");
  });
});

describe("createSuccessCommitResult", () => {
  test("creates success result with commit hash", () => {
    const result = createSuccessCommitResult(
      "abc1234",
      "feat: add new feature",
    );

    expect(result.success).toBe(true);
    expect(result.commitHash).toBe("abc1234");
    expect(result.message).toBe("feat: add new feature");
    expect(result.error).toBeNull();
  });
});

describe("calculateTotalAdditions", () => {
  test("sums additions across multiple files", () => {
    const files: StagedFile[] = [
      { path: "file1.ts", status: "M", additions: 10, deletions: 5 },
      { path: "file2.ts", status: "A", additions: 25, deletions: 0 },
      { path: "file3.ts", status: "M", additions: 8, deletions: 3 },
    ];

    const total = calculateTotalAdditions(files);
    expect(total).toBe(43);
  });

  test("returns 0 for empty file list", () => {
    const total = calculateTotalAdditions([]);
    expect(total).toBe(0);
  });

  test("handles files with zero additions", () => {
    const files: StagedFile[] = [
      { path: "file1.ts", status: "D", additions: 0, deletions: 10 },
      { path: "file2.ts", status: "M", additions: 0, deletions: 5 },
    ];

    const total = calculateTotalAdditions(files);
    expect(total).toBe(0);
  });
});

describe("calculateTotalDeletions", () => {
  test("sums deletions across multiple files", () => {
    const files: StagedFile[] = [
      { path: "file1.ts", status: "M", additions: 10, deletions: 5 },
      { path: "file2.ts", status: "D", additions: 0, deletions: 20 },
      { path: "file3.ts", status: "M", additions: 8, deletions: 3 },
    ];

    const total = calculateTotalDeletions(files);
    expect(total).toBe(28);
  });

  test("returns 0 for empty file list", () => {
    const total = calculateTotalDeletions([]);
    expect(total).toBe(0);
  });

  test("handles files with zero deletions", () => {
    const files: StagedFile[] = [
      { path: "file1.ts", status: "A", additions: 10, deletions: 0 },
      { path: "file2.ts", status: "A", additions: 5, deletions: 0 },
    ];

    const total = calculateTotalDeletions(files);
    expect(total).toBe(0);
  });
});

describe("countFilesByStatus", () => {
  test("counts files by each status", () => {
    const files: StagedFile[] = [
      { path: "file1.ts", status: "M", additions: 1, deletions: 0 },
      { path: "file2.ts", status: "A", additions: 1, deletions: 0 },
      { path: "file3.ts", status: "M", additions: 1, deletions: 0 },
      { path: "file4.ts", status: "D", additions: 0, deletions: 1 },
      { path: "file5.ts", status: "R", additions: 1, deletions: 1 },
      { path: "file6.ts", status: "M", additions: 1, deletions: 0 },
    ];

    const counts = countFilesByStatus(files);

    expect(counts.M).toBe(3);
    expect(counts.A).toBe(1);
    expect(counts.D).toBe(1);
    expect(counts.R).toBe(1);
  });

  test("returns zero counts for empty file list", () => {
    const counts = countFilesByStatus([]);

    expect(counts.A).toBe(0);
    expect(counts.M).toBe(0);
    expect(counts.D).toBe(0);
    expect(counts.R).toBe(0);
  });

  test("counts only present statuses", () => {
    const files: StagedFile[] = [
      { path: "file1.ts", status: "A", additions: 1, deletions: 0 },
      { path: "file2.ts", status: "A", additions: 1, deletions: 0 },
    ];

    const counts = countFilesByStatus(files);

    expect(counts.A).toBe(2);
    expect(counts.M).toBe(0);
    expect(counts.D).toBe(0);
    expect(counts.R).toBe(0);
  });
});

describe("Type definitions", () => {
  test("StagedFile type structure", () => {
    const file: StagedFile = {
      path: "src/main.ts",
      status: "M",
      additions: 10,
      deletions: 5,
    };
    expect(file).toBeDefined();
  });

  test("CommitPromptContext type structure", () => {
    const context: CommitPromptContext = {
      stagedFiles: [],
      stagedDiff: "diff content",
      branchName: "main",
      recentCommits: [],
      repositoryRoot: "/home/user/project",
    };
    expect(context).toBeDefined();
  });

  test("CommitRequest type structure", () => {
    const request: CommitRequest = {
      promptId: "default-commit",
      variables: { scope: "feature" },
      dryRun: false,
    };
    expect(request).toBeDefined();
  });

  test("CommitResult type structure", () => {
    const result: CommitResult = {
      success: true,
      commitHash: "abc1234",
      message: "feat: add feature",
      error: null,
    };
    expect(result).toBeDefined();
  });
});
