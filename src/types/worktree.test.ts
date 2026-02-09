import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  encodeProjectPath,
  decodeProjectPath,
  generateDefaultWorktreePath,
  validateWorktreeName,
  type RepositoryType,
  type WorktreeInfo,
  type RepositoryDetectionResult,
  type CreateWorktreeRequest,
  type CreateWorktreeResult,
  type RemoveWorktreeResult,
  type ValidationResult,
} from "./worktree.js";

describe("worktree types", () => {
  describe("RepositoryType", () => {
    it("should have correct literal types", () => {
      const types: RepositoryType[] = ["main", "worktree", "bare", "not-git"];
      expect(types).toHaveLength(4);
    });
  });

  describe("WorktreeInfo", () => {
    it("should enforce readonly properties", () => {
      const info: WorktreeInfo = {
        path: "/path/to/worktree",
        head: "abc123",
        branch: "main",
        isMain: true,
        locked: false,
        prunable: false,
        mainRepositoryPath: "/path/to/main",
      };
      expect(info.path).toBe("/path/to/worktree");
      expect(info.mainRepositoryPath).toBe("/path/to/main");
    });

    it("should allow null branch for detached HEAD", () => {
      const info: WorktreeInfo = {
        path: "/path/to/worktree",
        head: "abc123",
        branch: null,
        isMain: false,
        locked: false,
        prunable: false,
        mainRepositoryPath: "/path/to/main",
      };
      expect(info.branch).toBeNull();
    });
  });

  describe("RepositoryDetectionResult", () => {
    it("should represent main repository", () => {
      const result: RepositoryDetectionResult = {
        type: "main",
        path: "/home/user/project",
        gitDir: "/home/user/project/.git",
        mainRepositoryPath: null,
        worktreeName: null,
      };
      expect(result.type).toBe("main");
      expect(result.mainRepositoryPath).toBeNull();
    });

    it("should represent worktree", () => {
      const result: RepositoryDetectionResult = {
        type: "worktree",
        path: "/home/user/.local/qraftbox/worktrees/project/feature",
        gitDir: "/home/user/project/.git/worktrees/feature",
        mainRepositoryPath: "/home/user/project",
        worktreeName: "feature",
      };
      expect(result.type).toBe("worktree");
      expect(result.mainRepositoryPath).toBe("/home/user/project");
      expect(result.worktreeName).toBe("feature");
    });
  });

  describe("CreateWorktreeRequest", () => {
    it("should have required branch field", () => {
      const request: CreateWorktreeRequest = {
        branch: "feature-auth",
      };
      expect(request.branch).toBe("feature-auth");
    });

    it("should support all optional fields", () => {
      const request: CreateWorktreeRequest = {
        branch: "feature-auth",
        worktreeName: "auth-work",
        createBranch: true,
        baseBranch: "main",
        customPath: "/custom/path",
      };
      expect(request.worktreeName).toBe("auth-work");
      expect(request.createBranch).toBe(true);
    });
  });

  describe("CreateWorktreeResult", () => {
    it("should represent success", () => {
      const result: CreateWorktreeResult = {
        success: true,
        path: "/path/to/worktree",
        branch: "feature",
      };
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should represent failure", () => {
      const result: CreateWorktreeResult = {
        success: false,
        path: "",
        branch: "",
        error: "Branch already exists",
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe("Branch already exists");
    });
  });

  describe("RemoveWorktreeResult", () => {
    it("should represent successful removal", () => {
      const result: RemoveWorktreeResult = {
        success: true,
        removed: true,
      };
      expect(result.success).toBe(true);
      expect(result.removed).toBe(true);
    });

    it("should represent failed removal", () => {
      const result: RemoveWorktreeResult = {
        success: false,
        removed: false,
        error: "Worktree is locked",
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe("Worktree is locked");
    });
  });

  describe("ValidationResult", () => {
    it("should represent valid result", () => {
      const result: ValidationResult = {
        valid: true,
      };
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should represent invalid result", () => {
      const result: ValidationResult = {
        valid: false,
        error: "Invalid format",
      };
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid format");
    });
  });
});

describe("encodeProjectPath", () => {
  it("should encode absolute path correctly", () => {
    expect(encodeProjectPath("/home/user/projects/my-app")).toBe(
      "home__user__projects__my-app",
    );
  });

  it("should encode path without leading slash", () => {
    expect(encodeProjectPath("home/user/projects/my-app")).toBe(
      "home__user__projects__my-app",
    );
  });

  it("should handle single directory", () => {
    expect(encodeProjectPath("/project")).toBe("project");
  });

  it("should handle complex path", () => {
    expect(encodeProjectPath("/g/gits/tacogips/qraftbox")).toBe(
      "g__gits__tacogips__qraftbox",
    );
  });

  it("should handle path with hyphens and underscores", () => {
    expect(encodeProjectPath("/home/user/my-project_v2")).toBe(
      "home__user__my-project_v2",
    );
  });
});

describe("decodeProjectPath", () => {
  it("should decode encoded path correctly", () => {
    expect(decodeProjectPath("home__user__projects__my-app")).toBe(
      "/home/user/projects/my-app",
    );
  });

  it("should handle single directory", () => {
    expect(decodeProjectPath("project")).toBe("/project");
  });

  it("should handle complex path", () => {
    expect(decodeProjectPath("g__gits__tacogips__qraftbox")).toBe(
      "/g/gits/tacogips/qraftbox",
    );
  });

  it("should be inverse of encodeProjectPath", () => {
    const originalPaths = [
      "/home/user/projects/my-app",
      "/g/gits/tacogips/qraftbox",
      "/project",
      "/a/b/c/d/e",
    ];

    for (const path of originalPaths) {
      const encoded = encodeProjectPath(path);
      const decoded = decodeProjectPath(encoded);
      expect(decoded).toBe(path.startsWith("/") ? path : `/${path}`);
    }
  });
});

describe("generateDefaultWorktreePath", () => {
  const home = homedir();

  it("should generate correct default path", () => {
    const result = generateDefaultWorktreePath(
      "/home/user/projects/my-app",
      "feature-auth",
    );
    const expected = join(
      home,
      ".local",
      "qraftbox",
      "worktrees",
      "home__user__projects__my-app",
      "feature-auth",
    );
    expect(result).toBe(expected);
  });

  it("should encode project path correctly", () => {
    const result = generateDefaultWorktreePath(
      "/g/gits/tacogips/qraftbox",
      "feature-worktree",
    );
    const expected = join(
      home,
      ".local",
      "qraftbox",
      "worktrees",
      "g__gits__tacogips__qraftbox",
      "feature-worktree",
    );
    expect(result).toBe(expected);
  });

  it("should handle different worktree names", () => {
    const projectPath = "/home/user/project";
    const names = ["main-backup", "feature-1", "hotfix-2.0"];

    for (const name of names) {
      const result = generateDefaultWorktreePath(projectPath, name);
      expect(result).toContain(name);
      expect(result).toContain("home__user__project");
    }
  });

  it("should use consistent base directory", () => {
    const result1 = generateDefaultWorktreePath("/project1", "branch1");
    const result2 = generateDefaultWorktreePath("/project2", "branch2");

    const base = join(home, ".local", "qraftbox", "worktrees");
    expect(result1).toContain(base);
    expect(result2).toContain(base);
  });
});

describe("validateWorktreeName", () => {
  describe("valid names", () => {
    it("should accept alphanumeric names", () => {
      expect(validateWorktreeName("feature").valid).toBe(true);
      expect(validateWorktreeName("feature123").valid).toBe(true);
      expect(validateWorktreeName("ABC123").valid).toBe(true);
    });

    it("should accept names with hyphens", () => {
      expect(validateWorktreeName("feature-auth").valid).toBe(true);
      expect(validateWorktreeName("hotfix-2.0").valid).toBe(true);
    });

    it("should accept names with single underscores", () => {
      expect(validateWorktreeName("feature_auth").valid).toBe(true);
      expect(validateWorktreeName("main_backup").valid).toBe(true);
    });

    it("should accept names with dots", () => {
      expect(validateWorktreeName("v2.0.1").valid).toBe(true);
      expect(validateWorktreeName("release.candidate").valid).toBe(true);
    });

    it("should accept mixed valid characters", () => {
      expect(validateWorktreeName("feature-auth_v2.0").valid).toBe(true);
      expect(validateWorktreeName("ABC-123_test.v1").valid).toBe(true);
    });
  });

  describe("invalid names", () => {
    it("should reject empty string", () => {
      const result = validateWorktreeName("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Worktree name cannot be empty");
    });

    it("should reject names exceeding 100 characters", () => {
      const longName = "a".repeat(101);
      const result = validateWorktreeName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Worktree name cannot exceed 100 characters");
    });

    it("should reject names with forward slash", () => {
      const result = validateWorktreeName("feature/auth");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot contain slashes");
    });

    it("should reject names with backslash", () => {
      const result = validateWorktreeName("feature\\auth");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot contain slashes");
    });

    it("should reject names with double underscore", () => {
      const result = validateWorktreeName("feature__auth");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot contain double underscore");
    });

    it("should reject names with spaces", () => {
      const result = validateWorktreeName("feature auth");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("alphanumeric characters");
    });

    it("should reject names with special characters", () => {
      const invalidChars = ["@", "#", "$", "%", "^", "&", "*", "(", ")", "="];
      for (const char of invalidChars) {
        const result = validateWorktreeName(`feature${char}auth`);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("alphanumeric characters");
      }
    });
  });

  describe("edge cases", () => {
    it("should accept exactly 100 characters", () => {
      const exactName = "a".repeat(100);
      expect(validateWorktreeName(exactName).valid).toBe(true);
    });

    it("should reject 101 characters", () => {
      const tooLong = "a".repeat(101);
      expect(validateWorktreeName(tooLong).valid).toBe(false);
    });

    it("should handle single character", () => {
      expect(validateWorktreeName("a").valid).toBe(true);
      expect(validateWorktreeName("1").valid).toBe(true);
      expect(validateWorktreeName("-").valid).toBe(true);
    });
  });
});
