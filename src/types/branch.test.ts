import { describe, test, expect } from "bun:test";
import {
  createBranchInfo,
  createCheckoutSuccess,
  createCheckoutFailure,
  isValidBranchName,
  type BranchInfo,
  type BranchCheckoutResponse,
} from "./branch";

describe("createBranchInfo", () => {
  test("creates branch with minimal defaults", () => {
    const branch = createBranchInfo("main");

    expect(branch.name).toBe("main");
    expect(branch.isCurrent).toBe(false);
    expect(branch.isDefault).toBe(false);
    expect(branch.isRemote).toBe(false);
    expect(branch.lastCommit.hash).toBe("");
    expect(branch.lastCommit.message).toBe("");
    expect(branch.lastCommit.author).toBe("");
    expect(branch.lastCommit.date).toBe(0);
    expect(branch.aheadBehind).toBeUndefined();
  });

  test("creates branch with custom overrides", () => {
    const branch = createBranchInfo("feature/test", {
      isCurrent: true,
      isDefault: false,
      lastCommit: {
        hash: "abc123",
        message: "Test commit",
        author: "John Doe",
        date: 1234567890,
      },
    });

    expect(branch.name).toBe("feature/test");
    expect(branch.isCurrent).toBe(true);
    expect(branch.isDefault).toBe(false);
    expect(branch.lastCommit.hash).toBe("abc123");
    expect(branch.lastCommit.message).toBe("Test commit");
    expect(branch.lastCommit.author).toBe("John Doe");
    expect(branch.lastCommit.date).toBe(1234567890);
  });

  test("creates branch with ahead/behind tracking", () => {
    const branch = createBranchInfo("main", {
      aheadBehind: {
        ahead: 2,
        behind: 3,
      },
    });

    expect(branch.aheadBehind).toBeDefined();
    expect(branch.aheadBehind?.ahead).toBe(2);
    expect(branch.aheadBehind?.behind).toBe(3);
  });

  test("creates remote branch", () => {
    const branch = createBranchInfo("origin/main", {
      isRemote: true,
      isDefault: true,
    });

    expect(branch.isRemote).toBe(true);
    expect(branch.isDefault).toBe(true);
  });
});

describe("createCheckoutSuccess", () => {
  test("creates successful checkout response without stash", () => {
    const response = createCheckoutSuccess("main", "feature/test");

    expect(response.success).toBe(true);
    expect(response.previousBranch).toBe("main");
    expect(response.currentBranch).toBe("feature/test");
    expect(response.stashCreated).toBeUndefined();
    expect(response.error).toBeUndefined();
  });

  test("creates successful checkout response with stash", () => {
    const response = createCheckoutSuccess("main", "feature/test", "stash@{0}");

    expect(response.success).toBe(true);
    expect(response.previousBranch).toBe("main");
    expect(response.currentBranch).toBe("feature/test");
    expect(response.stashCreated).toBe("stash@{0}");
    expect(response.error).toBeUndefined();
  });
});

describe("createCheckoutFailure", () => {
  test("creates failed checkout response", () => {
    const response = createCheckoutFailure(
      "main",
      "Uncommitted changes would be overwritten",
    );

    expect(response.success).toBe(false);
    expect(response.previousBranch).toBe("main");
    expect(response.currentBranch).toBe("main");
    expect(response.stashCreated).toBeUndefined();
    expect(response.error).toBe("Uncommitted changes would be overwritten");
  });

  test("creates failure with branch not found error", () => {
    const response = createCheckoutFailure(
      "main",
      "Branch 'nonexistent' not found",
    );

    expect(response.success).toBe(false);
    expect(response.error).toBe("Branch 'nonexistent' not found");
  });
});

describe("isValidBranchName", () => {
  describe("valid branch names", () => {
    test("accepts simple branch name", () => {
      expect(isValidBranchName("main")).toBe(true);
    });

    test("accepts branch with slashes", () => {
      expect(isValidBranchName("feature/test")).toBe(true);
      expect(isValidBranchName("bugfix/issue-123")).toBe(true);
    });

    test("accepts branch with hyphens", () => {
      expect(isValidBranchName("my-feature")).toBe(true);
    });

    test("accepts branch with underscores", () => {
      expect(isValidBranchName("my_feature")).toBe(true);
    });

    test("accepts branch with dots in valid positions", () => {
      expect(isValidBranchName("v1.0.0")).toBe(true);
      expect(isValidBranchName("release.2024")).toBe(true);
    });

    test("accepts numeric branch names", () => {
      expect(isValidBranchName("123")).toBe(true);
    });
  });

  describe("invalid branch names", () => {
    test("rejects empty string", () => {
      expect(isValidBranchName("")).toBe(false);
    });

    test("rejects whitespace-only string", () => {
      expect(isValidBranchName("   ")).toBe(false);
    });

    test("rejects branch with spaces", () => {
      expect(isValidBranchName("my branch")).toBe(false);
      expect(isValidBranchName("feature test")).toBe(false);
    });

    test("rejects branch with double dots", () => {
      expect(isValidBranchName("feature..test")).toBe(false);
      expect(isValidBranchName("..")).toBe(false);
    });

    test("rejects branch with tilde", () => {
      expect(isValidBranchName("branch~1")).toBe(false);
    });

    test("rejects branch with caret", () => {
      expect(isValidBranchName("branch^")).toBe(false);
    });

    test("rejects branch with colon", () => {
      expect(isValidBranchName("branch:name")).toBe(false);
    });

    test("rejects branch with question mark", () => {
      expect(isValidBranchName("branch?")).toBe(false);
    });

    test("rejects branch with asterisk", () => {
      expect(isValidBranchName("branch*")).toBe(false);
    });

    test("rejects branch with square brackets", () => {
      expect(isValidBranchName("branch[0]")).toBe(false);
    });

    test("rejects branch with backslash", () => {
      expect(isValidBranchName("branch\\name")).toBe(false);
    });

    test("rejects branch with @{", () => {
      expect(isValidBranchName("branch@{0}")).toBe(false);
    });

    test("rejects branch starting with slash", () => {
      expect(isValidBranchName("/branch")).toBe(false);
    });

    test("rejects branch ending with slash", () => {
      expect(isValidBranchName("branch/")).toBe(false);
    });

    test("rejects branch with consecutive slashes", () => {
      expect(isValidBranchName("feature//test")).toBe(false);
    });

    test("rejects branch ending with .lock", () => {
      expect(isValidBranchName("branch.lock")).toBe(false);
      expect(isValidBranchName("feature/test.lock")).toBe(false);
    });
  });
});

describe("BranchInfo type", () => {
  test("has readonly properties", () => {
    const branch: BranchInfo = createBranchInfo("main");

    // TypeScript compile-time check - these should error if uncommented:
    // branch.name = "changed"; // Error: Cannot assign to 'name' because it is a read-only property
    // branch.isCurrent = true; // Error: Cannot assign to 'isCurrent' because it is a read-only property

    expect(branch.name).toBe("main");
  });

  test("has optional aheadBehind property", () => {
    const withoutTracking: BranchInfo = createBranchInfo("main");
    const withTracking: BranchInfo = createBranchInfo("main", {
      aheadBehind: { ahead: 1, behind: 2 },
    });

    expect(withoutTracking.aheadBehind).toBeUndefined();
    expect(withTracking.aheadBehind).toBeDefined();
  });
});

describe("BranchCheckoutResponse type", () => {
  test("has readonly properties", () => {
    const response: BranchCheckoutResponse = createCheckoutSuccess(
      "main",
      "feature",
    );

    // TypeScript compile-time check - these should error if uncommented:
    // response.success = false; // Error: Cannot assign to 'success' because it is a read-only property
    // response.currentBranch = "changed"; // Error: Cannot assign to 'currentBranch' because it is a read-only property

    expect(response.success).toBe(true);
  });

  test("has optional stashCreated property", () => {
    const withoutStash: BranchCheckoutResponse = createCheckoutSuccess(
      "main",
      "feature",
    );
    const withStash: BranchCheckoutResponse = createCheckoutSuccess(
      "main",
      "feature",
      "stash@{0}",
    );

    expect(withoutStash.stashCreated).toBeUndefined();
    expect(withStash.stashCreated).toBe("stash@{0}");
  });

  test("has optional error property", () => {
    const success: BranchCheckoutResponse = createCheckoutSuccess(
      "main",
      "feature",
    );
    const failure: BranchCheckoutResponse = createCheckoutFailure(
      "main",
      "Error occurred",
    );

    expect(success.error).toBeUndefined();
    expect(failure.error).toBe("Error occurred");
  });
});
