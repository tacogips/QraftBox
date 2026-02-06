import { describe, test, expect } from "bun:test";
import {
  validateUnpushedCommit,
  validatePushRequest,
  validateRemoteTracking,
  validatePushPromptContext,
  createDefaultPushRequest,
  canPushRepository,
  isBehindRemote,
  requiresForcePush,
  type UnpushedCommit,
  type PushRequest,
  type RemoteTracking,
  type PushPromptContext,
  type PushStatus,
  type PushResult,
} from "./push-context";

describe("validateUnpushedCommit", () => {
  test("accepts valid commit", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d",
      message: "feat: add new feature",
      author: "Alice <alice@example.com>",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts short hash (7 characters)", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d",
      shortHash: "a1b2c3d",
      message: "fix: bug fix",
      author: "Bob",
      date: 1234567890,
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(true);
  });

  test("accepts 8-character shortHash", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d4",
      message: "feat: add feature",
      author: "Charlie",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(true);
  });

  test("rejects empty hash", () => {
    const commit: UnpushedCommit = {
      hash: "",
      shortHash: "a1b2c3d",
      message: "feat: add feature",
      author: "Alice",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("commit hash cannot be empty");
  });

  test("rejects hash with only whitespace", () => {
    const commit: UnpushedCommit = {
      hash: "   ",
      shortHash: "a1b2c3d",
      message: "feat: add feature",
      author: "Alice",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("commit hash cannot be empty");
  });

  test("rejects invalid hash format", () => {
    const commit: UnpushedCommit = {
      hash: "not-a-valid-hash",
      shortHash: "a1b2c3d",
      message: "feat: add feature",
      author: "Alice",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid commit hash format");
  });

  test("rejects empty shortHash", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "",
      message: "feat: add feature",
      author: "Alice",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("commit shortHash cannot be empty");
  });

  test("rejects shortHash with invalid length", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c", // Only 5 characters
      message: "feat: add feature",
      author: "Alice",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "invalid commit shortHash format (expected 7-8 hex characters)",
    );
  });

  test("rejects shortHash longer than 8 characters", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d4e", // 9 characters
      message: "feat: add feature",
      author: "Alice",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "invalid commit shortHash format (expected 7-8 hex characters)",
    );
  });

  test("rejects empty message", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d",
      message: "",
      author: "Alice",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("commit message cannot be empty");
  });

  test("rejects message with only whitespace", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d",
      message: "   ",
      author: "Alice",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("commit message cannot be empty");
  });

  test("rejects empty author", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d",
      message: "feat: add feature",
      author: "",
      date: Date.now(),
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("commit author cannot be empty");
  });

  test("rejects negative date", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d",
      message: "feat: add feature",
      author: "Alice",
      date: -1,
    };
    const result = validateUnpushedCommit(commit);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("commit date must be non-negative");
  });
});

describe("validatePushRequest", () => {
  test("accepts valid request with minimal fields", () => {
    const request: PushRequest = {
      promptTemplateId: "default-push",
    };
    const result = validatePushRequest(request);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts valid request with all fields", () => {
    const request: PushRequest = {
      promptTemplateId: "custom-push",
      remote: "origin",
      branch: "main",
      force: true,
      setUpstream: true,
      pushTags: true,
      customVariables: { key: "value" },
      dryRun: false,
    };
    const result = validatePushRequest(request);
    expect(result.valid).toBe(true);
  });

  test("rejects empty promptTemplateId", () => {
    const request: PushRequest = {
      promptTemplateId: "",
    };
    const result = validatePushRequest(request);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("promptTemplateId cannot be empty");
  });

  test("rejects promptTemplateId with only whitespace", () => {
    const request: PushRequest = {
      promptTemplateId: "   ",
    };
    const result = validatePushRequest(request);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("promptTemplateId cannot be empty");
  });

  test("rejects empty remote string", () => {
    const request: PushRequest = {
      promptTemplateId: "default-push",
      remote: "",
    };
    const result = validatePushRequest(request);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("remote cannot be empty string");
  });

  test("rejects empty branch string", () => {
    const request: PushRequest = {
      promptTemplateId: "default-push",
      branch: "",
    };
    const result = validatePushRequest(request);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("branch cannot be empty string");
  });

  test("accepts undefined remote and branch", () => {
    const request: PushRequest = {
      promptTemplateId: "default-push",
      remote: undefined,
      branch: undefined,
    };
    const result = validatePushRequest(request);
    expect(result.valid).toBe(true);
  });
});

describe("validateRemoteTracking", () => {
  test("accepts valid remote tracking", () => {
    const remote: RemoteTracking = {
      name: "origin",
      url: "git@github.com:user/repo.git",
      branch: "main",
    };
    const result = validateRemoteTracking(remote);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts HTTPS URL", () => {
    const remote: RemoteTracking = {
      name: "origin",
      url: "https://github.com/user/repo.git",
      branch: "develop",
    };
    const result = validateRemoteTracking(remote);
    expect(result.valid).toBe(true);
  });

  test("rejects empty name", () => {
    const remote: RemoteTracking = {
      name: "",
      url: "git@github.com:user/repo.git",
      branch: "main",
    };
    const result = validateRemoteTracking(remote);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("remote name cannot be empty");
  });

  test("rejects name with only whitespace", () => {
    const remote: RemoteTracking = {
      name: "   ",
      url: "git@github.com:user/repo.git",
      branch: "main",
    };
    const result = validateRemoteTracking(remote);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("remote name cannot be empty");
  });

  test("rejects empty URL", () => {
    const remote: RemoteTracking = {
      name: "origin",
      url: "",
      branch: "main",
    };
    const result = validateRemoteTracking(remote);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("remote URL cannot be empty");
  });

  test("rejects empty branch", () => {
    const remote: RemoteTracking = {
      name: "origin",
      url: "git@github.com:user/repo.git",
      branch: "",
    };
    const result = validateRemoteTracking(remote);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("remote branch cannot be empty");
  });
});

describe("validatePushPromptContext", () => {
  test("accepts valid context", () => {
    const context: PushPromptContext = {
      branchName: "feature/new-feature",
      remoteName: "origin",
      remoteBranch: "main",
      unpushedCommits: [
        {
          hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
          shortHash: "a1b2c3d",
          message: "feat: add feature",
          author: "Alice",
          date: Date.now(),
        },
      ],
      hasUpstream: true,
      aheadCount: 1,
      behindCount: 0,
      customVariables: {},
    };
    const result = validatePushPromptContext(context);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts context with no unpushed commits", () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      unpushedCommits: [],
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      customVariables: {},
    };
    const result = validatePushPromptContext(context);
    expect(result.valid).toBe(true);
  });

  test("rejects empty branchName", () => {
    const context: PushPromptContext = {
      branchName: "",
      remoteName: "origin",
      remoteBranch: "main",
      unpushedCommits: [],
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      customVariables: {},
    };
    const result = validatePushPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("branchName cannot be empty");
  });

  test("rejects empty remoteName", () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "",
      remoteBranch: "main",
      unpushedCommits: [],
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      customVariables: {},
    };
    const result = validatePushPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("remoteName cannot be empty");
  });

  test("rejects empty remoteBranch", () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "",
      unpushedCommits: [],
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      customVariables: {},
    };
    const result = validatePushPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("remoteBranch cannot be empty");
  });

  test("rejects negative aheadCount", () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      unpushedCommits: [],
      hasUpstream: true,
      aheadCount: -1,
      behindCount: 0,
      customVariables: {},
    };
    const result = validatePushPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("aheadCount must be non-negative");
  });

  test("rejects negative behindCount", () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      unpushedCommits: [],
      hasUpstream: true,
      aheadCount: 0,
      behindCount: -1,
      customVariables: {},
    };
    const result = validatePushPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("behindCount must be non-negative");
  });

  test("rejects invalid commit in unpushedCommits", () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      unpushedCommits: [
        {
          hash: "invalid",
          shortHash: "a1b2c3d",
          message: "feat: add feature",
          author: "Alice",
          date: Date.now(),
        },
      ],
      hasUpstream: true,
      aheadCount: 1,
      behindCount: 0,
      customVariables: {},
    };
    const result = validatePushPromptContext(context);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid commit hash format");
  });
});

describe("createDefaultPushRequest", () => {
  test("creates request with default values", () => {
    const request = createDefaultPushRequest("default-push");
    expect(request.promptTemplateId).toBe("default-push");
    expect(request.remote).toBeUndefined();
    expect(request.branch).toBeUndefined();
    expect(request.force).toBe(false);
    expect(request.setUpstream).toBe(false);
    expect(request.pushTags).toBe(false);
    expect(request.customVariables).toEqual({});
    expect(request.dryRun).toBe(false);
  });

  test("created request passes validation", () => {
    const request = createDefaultPushRequest("test-template");
    const result = validatePushRequest(request);
    expect(result.valid).toBe(true);
  });
});

describe("canPushRepository", () => {
  test("returns true when canPush and has commits ahead", () => {
    const status: PushStatus = {
      canPush: true,
      branchName: "main",
      remote: {
        name: "origin",
        url: "git@github.com:user/repo.git",
        branch: "main",
      },
      hasUpstream: true,
      aheadCount: 3,
      behindCount: 0,
      unpushedCommits: [],
    };
    expect(canPushRepository(status)).toBe(true);
  });

  test("returns false when canPush but no commits ahead", () => {
    const status: PushStatus = {
      canPush: true,
      branchName: "main",
      remote: null,
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      unpushedCommits: [],
    };
    expect(canPushRepository(status)).toBe(false);
  });

  test("returns false when cannot push", () => {
    const status: PushStatus = {
      canPush: false,
      branchName: "main",
      remote: null,
      hasUpstream: false,
      aheadCount: 3,
      behindCount: 0,
      unpushedCommits: [],
      error: "not a git repository",
    };
    expect(canPushRepository(status)).toBe(false);
  });
});

describe("isBehindRemote", () => {
  test("returns true when behindCount is positive", () => {
    const status: PushStatus = {
      canPush: true,
      branchName: "main",
      remote: {
        name: "origin",
        url: "git@github.com:user/repo.git",
        branch: "main",
      },
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 5,
      unpushedCommits: [],
    };
    expect(isBehindRemote(status)).toBe(true);
  });

  test("returns false when behindCount is zero", () => {
    const status: PushStatus = {
      canPush: true,
      branchName: "main",
      remote: null,
      hasUpstream: false,
      aheadCount: 3,
      behindCount: 0,
      unpushedCommits: [],
    };
    expect(isBehindRemote(status)).toBe(false);
  });
});

describe("requiresForcePush", () => {
  test("returns true when both ahead and behind", () => {
    const status: PushStatus = {
      canPush: true,
      branchName: "main",
      remote: {
        name: "origin",
        url: "git@github.com:user/repo.git",
        branch: "main",
      },
      hasUpstream: true,
      aheadCount: 3,
      behindCount: 2,
      unpushedCommits: [],
    };
    expect(requiresForcePush(status)).toBe(true);
  });

  test("returns false when only ahead", () => {
    const status: PushStatus = {
      canPush: true,
      branchName: "main",
      remote: null,
      hasUpstream: false,
      aheadCount: 3,
      behindCount: 0,
      unpushedCommits: [],
    };
    expect(requiresForcePush(status)).toBe(false);
  });

  test("returns false when only behind", () => {
    const status: PushStatus = {
      canPush: true,
      branchName: "main",
      remote: null,
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 2,
      unpushedCommits: [],
    };
    expect(requiresForcePush(status)).toBe(false);
  });

  test("returns false when neither ahead nor behind", () => {
    const status: PushStatus = {
      canPush: true,
      branchName: "main",
      remote: null,
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      unpushedCommits: [],
    };
    expect(requiresForcePush(status)).toBe(false);
  });
});

describe("Type definitions", () => {
  test("UnpushedCommit type structure", () => {
    const commit: UnpushedCommit = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d",
      message: "feat: add feature",
      author: "Alice <alice@example.com>",
      date: Date.now(),
    };
    expect(commit).toBeDefined();
  });

  test("PushPromptContext type structure", () => {
    const context: PushPromptContext = {
      branchName: "main",
      remoteName: "origin",
      remoteBranch: "main",
      unpushedCommits: [],
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      customVariables: {},
    };
    expect(context).toBeDefined();
  });

  test("PushRequest type structure", () => {
    const request: PushRequest = {
      promptTemplateId: "default-push",
      remote: "origin",
      branch: "main",
      force: false,
      setUpstream: false,
      pushTags: false,
      customVariables: {},
      dryRun: false,
    };
    expect(request).toBeDefined();
  });

  test("PushResult type structure", () => {
    const result: PushResult = {
      success: true,
      remote: "origin",
      branch: "main",
      pushedCommits: 3,
      error: undefined,
      sessionId: "session-123",
    };
    expect(result).toBeDefined();
  });

  test("RemoteTracking type structure", () => {
    const remote: RemoteTracking = {
      name: "origin",
      url: "git@github.com:user/repo.git",
      branch: "main",
    };
    expect(remote).toBeDefined();
  });

  test("PushStatus type structure", () => {
    const status: PushStatus = {
      canPush: true,
      branchName: "main",
      remote: {
        name: "origin",
        url: "git@github.com:user/repo.git",
        branch: "main",
      },
      hasUpstream: true,
      aheadCount: 3,
      behindCount: 0,
      unpushedCommits: [],
      error: undefined,
    };
    expect(status).toBeDefined();
  });
});
