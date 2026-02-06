/**
 * Unit tests for GitHub types
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  GitHubUser,
  GitHubAuthStatus,
  RepoInfo,
  Label,
  Collaborator,
  CollaboratorPermissions,
  BranchComparison,
} from "./github.js";
import type { CommitInfo } from "./commit.js";

describe("GitHub types", () => {
  describe("GitHubUser", () => {
    it("should have correct structure", () => {
      const user: GitHubUser = {
        login: "octocat",
        name: "The Octocat",
        email: "octocat@github.com",
        avatarUrl: "https://github.com/images/error/octocat_happy.gif",
      };

      expectTypeOf(user.login).toEqualTypeOf<string>();
      expectTypeOf(user.name).toEqualTypeOf<string>();
      expectTypeOf(user.email).toEqualTypeOf<string>();
      expectTypeOf(user.avatarUrl).toEqualTypeOf<string>();

      expect(user.login).toBe("octocat");
      expect(user.name).toBe("The Octocat");
      expect(user.email).toBe("octocat@github.com");
      expect(user.avatarUrl).toBe(
        "https://github.com/images/error/octocat_happy.gif",
      );
    });

    it("should be readonly", () => {
      const user: GitHubUser = {
        login: "octocat",
        name: "The Octocat",
        email: "octocat@github.com",
        avatarUrl: "https://github.com/images/error/octocat_happy.gif",
      };

      // @ts-expect-error - readonly properties cannot be reassigned
      user.login = "newname";
    });
  });

  describe("GitHubAuthStatus", () => {
    it("should support authenticated env method", () => {
      const status: GitHubAuthStatus = {
        authenticated: true,
        method: "env",
        user: {
          login: "octocat",
          name: "The Octocat",
          email: "octocat@github.com",
          avatarUrl: "https://github.com/images/error/octocat_happy.gif",
        },
        ghCliAvailable: false,
      };

      expect(status.authenticated).toBe(true);
      expect(status.method).toBe("env");
      expect(status.user).not.toBeNull();
      expect(status.ghCliAvailable).toBe(false);
    });

    it("should support authenticated gh-cli method", () => {
      const status: GitHubAuthStatus = {
        authenticated: true,
        method: "gh-cli",
        user: {
          login: "octocat",
          name: "The Octocat",
          email: "octocat@github.com",
          avatarUrl: "https://github.com/images/error/octocat_happy.gif",
        },
        ghCliAvailable: true,
      };

      expect(status.authenticated).toBe(true);
      expect(status.method).toBe("gh-cli");
      expect(status.ghCliAvailable).toBe(true);
    });

    it("should support unauthenticated status", () => {
      const status: GitHubAuthStatus = {
        authenticated: false,
        method: "none",
        user: null,
        ghCliAvailable: false,
      };

      expect(status.authenticated).toBe(false);
      expect(status.method).toBe("none");
      expect(status.user).toBeNull();
    });
  });

  describe("RepoInfo", () => {
    it("should have correct structure", () => {
      const repo: RepoInfo = {
        owner: "octocat",
        name: "Hello-World",
        fullName: "octocat/Hello-World",
        defaultBranch: "main",
        isPrivate: false,
        htmlUrl: "https://github.com/octocat/Hello-World",
      };

      expect(repo.owner).toBe("octocat");
      expect(repo.name).toBe("Hello-World");
      expect(repo.fullName).toBe("octocat/Hello-World");
      expect(repo.defaultBranch).toBe("main");
      expect(repo.isPrivate).toBe(false);
      expect(repo.htmlUrl).toBe("https://github.com/octocat/Hello-World");
    });

    it("should support private repositories", () => {
      const repo: RepoInfo = {
        owner: "company",
        name: "private-repo",
        fullName: "company/private-repo",
        defaultBranch: "develop",
        isPrivate: true,
        htmlUrl: "https://github.com/company/private-repo",
      };

      expect(repo.isPrivate).toBe(true);
      expect(repo.defaultBranch).toBe("develop");
    });
  });

  describe("Label", () => {
    it("should have correct structure with description", () => {
      const label: Label = {
        name: "bug",
        color: "d73a4a",
        description: "Something isn't working",
      };

      expect(label.name).toBe("bug");
      expect(label.color).toBe("d73a4a");
      expect(label.description).toBe("Something isn't working");
    });

    it("should support null description", () => {
      const label: Label = {
        name: "enhancement",
        color: "a2eeef",
        description: null,
      };

      expect(label.description).toBeNull();
    });
  });

  describe("CollaboratorPermissions", () => {
    it("should have correct structure", () => {
      const permissions: CollaboratorPermissions = {
        admin: true,
        push: true,
        pull: true,
      };

      expect(permissions.admin).toBe(true);
      expect(permissions.push).toBe(true);
      expect(permissions.pull).toBe(true);
    });

    it("should support read-only permissions", () => {
      const permissions: CollaboratorPermissions = {
        admin: false,
        push: false,
        pull: true,
      };

      expect(permissions.admin).toBe(false);
      expect(permissions.push).toBe(false);
      expect(permissions.pull).toBe(true);
    });
  });

  describe("Collaborator", () => {
    it("should have correct structure", () => {
      const collaborator: Collaborator = {
        login: "octocat",
        avatarUrl: "https://github.com/images/error/octocat_happy.gif",
        permissions: {
          admin: false,
          push: true,
          pull: true,
        },
      };

      expect(collaborator.login).toBe("octocat");
      expect(collaborator.avatarUrl).toBe(
        "https://github.com/images/error/octocat_happy.gif",
      );
      expect(collaborator.permissions.push).toBe(true);
    });
  });

  describe("BranchComparison", () => {
    it("should support ahead status", () => {
      const comparison: BranchComparison = {
        aheadBy: 3,
        behindBy: 0,
        status: "ahead",
        commits: [],
      };

      expect(comparison.aheadBy).toBe(3);
      expect(comparison.behindBy).toBe(0);
      expect(comparison.status).toBe("ahead");
      expect(comparison.commits).toEqual([]);
    });

    it("should support behind status", () => {
      const comparison: BranchComparison = {
        aheadBy: 0,
        behindBy: 2,
        status: "behind",
        commits: [],
      };

      expect(comparison.status).toBe("behind");
      expect(comparison.behindBy).toBe(2);
    });

    it("should support diverged status", () => {
      const comparison: BranchComparison = {
        aheadBy: 3,
        behindBy: 2,
        status: "diverged",
        commits: [],
      };

      expect(comparison.status).toBe("diverged");
      expect(comparison.aheadBy).toBe(3);
      expect(comparison.behindBy).toBe(2);
    });

    it("should support identical status", () => {
      const comparison: BranchComparison = {
        aheadBy: 0,
        behindBy: 0,
        status: "identical",
        commits: [],
      };

      expect(comparison.status).toBe("identical");
      expect(comparison.aheadBy).toBe(0);
      expect(comparison.behindBy).toBe(0);
    });

    it("should contain CommitInfo array", () => {
      const commit: CommitInfo = {
        hash: "abc1234567890123456789012345678901234567",
        shortHash: "abc1234",
        message: "feat: add new feature",
        body: "Detailed description",
        author: { name: "John Doe", email: "john@example.com" },
        committer: { name: "John Doe", email: "john@example.com" },
        date: 1234567890,
        parentHashes: ["parent123"],
      };

      const comparison: BranchComparison = {
        aheadBy: 1,
        behindBy: 0,
        status: "ahead",
        commits: [commit],
      };

      expect(comparison.commits).toHaveLength(1);
      expect(comparison.commits[0]?.hash).toBe(
        "abc1234567890123456789012345678901234567",
      );
      expect(comparison.commits[0]?.message).toBe("feat: add new feature");
    });
  });
});
