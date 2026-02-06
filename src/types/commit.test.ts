import { describe, test, expect } from "bun:test";
import {
  validateCommitLogQuery,
  validateCommitHash,
  createEmptyPagination,
  createDefaultQuery,
  type CommitLogQuery,
  type CommitPagination,
  type CommitInfo,
  type CommitDetail,
  type CommitFileChange,
  type FileChangeStatus,
} from "./commit";

describe("validateCommitLogQuery", () => {
  test("accepts valid query with all fields", () => {
    const query: CommitLogQuery = {
      branch: "main",
      limit: 50,
      offset: 0,
      search: "fix bug",
    };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts empty query", () => {
    const query: CommitLogQuery = {};
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(true);
  });

  test("rejects limit less than 1", () => {
    const query: CommitLogQuery = { limit: 0 };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("limit must be at least 1");
  });

  test("rejects limit greater than 1000", () => {
    const query: CommitLogQuery = { limit: 1001 };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("limit must not exceed 1000");
  });

  test("accepts limit at boundaries", () => {
    expect(validateCommitLogQuery({ limit: 1 }).valid).toBe(true);
    expect(validateCommitLogQuery({ limit: 1000 }).valid).toBe(true);
  });

  test("rejects negative offset", () => {
    const query: CommitLogQuery = { offset: -1 };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("offset must be non-negative");
  });

  test("accepts zero offset", () => {
    const query: CommitLogQuery = { offset: 0 };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(true);
  });

  test("rejects search query exceeding 500 characters", () => {
    const query: CommitLogQuery = { search: "a".repeat(501) };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "search query exceeds maximum length of 500 characters",
    );
  });

  test("accepts search query at 500 characters", () => {
    const query: CommitLogQuery = { search: "a".repeat(500) };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(true);
  });

  test("rejects empty branch name", () => {
    const query: CommitLogQuery = { branch: "" };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("branch name cannot be empty");
  });

  test("rejects branch with only whitespace", () => {
    const query: CommitLogQuery = { branch: "   " };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("branch name cannot be empty");
  });

  test("accepts valid branch name", () => {
    const query: CommitLogQuery = { branch: "feature/new-feature" };
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(true);
  });
});

describe("validateCommitHash", () => {
  test("accepts full 40-character SHA-1 hash", () => {
    const hash = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
    const result = validateCommitHash(hash);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts short hash (7 characters)", () => {
    const hash = "a1b2c3d";
    const result = validateCommitHash(hash);
    expect(result.valid).toBe(true);
  });

  test("accepts short hash (8-39 characters)", () => {
    expect(validateCommitHash("a1b2c3d4").valid).toBe(true);
    expect(validateCommitHash("a1b2c3d4e5f6").valid).toBe(true);
    expect(
      validateCommitHash("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9").valid,
    ).toBe(true);
  });

  test("accepts uppercase hex characters", () => {
    const hash = "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0";
    const result = validateCommitHash(hash);
    expect(result.valid).toBe(true);
  });

  test("accepts mixed case hex characters", () => {
    const hash = "A1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0";
    const result = validateCommitHash(hash);
    expect(result.valid).toBe(true);
  });

  test("rejects empty hash", () => {
    const result = validateCommitHash("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Commit hash cannot be empty");
  });

  test("rejects hash with only whitespace", () => {
    const result = validateCommitHash("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Commit hash cannot be empty");
  });

  test("rejects hash shorter than 7 characters", () => {
    const result = validateCommitHash("a1b2c3");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid commit hash format");
  });

  test("rejects hash longer than 40 characters", () => {
    const result = validateCommitHash(
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid commit hash format");
  });

  test("rejects hash with non-hex characters", () => {
    expect(validateCommitHash("g1b2c3d").valid).toBe(false);
    expect(
      validateCommitHash("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9bz").valid,
    ).toBe(false);
    expect(validateCommitHash("a1b2c3d4!").valid).toBe(false);
  });

  test("rejects hash with spaces", () => {
    const result = validateCommitHash("a1b2c3 d4e5f6");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid commit hash format");
  });
});

describe("createEmptyPagination", () => {
  test("creates pagination with correct default values", () => {
    const pagination = createEmptyPagination();
    expect(pagination.offset).toBe(0);
    expect(pagination.limit).toBe(50);
    expect(pagination.total).toBe(0);
    expect(pagination.hasMore).toBe(false);
  });

  test("creates readonly pagination object", () => {
    const pagination = createEmptyPagination();
    // TypeScript ensures readonly - this is a type-level test
    // Runtime test would be: expect(() => { (pagination as any).offset = 10; }).toThrow();
    expect(Object.isFrozen(pagination)).toBe(false); // Objects are not frozen, just typed as readonly
  });
});

describe("createDefaultQuery", () => {
  test("creates query with correct default values", () => {
    const query = createDefaultQuery();
    expect(query.branch).toBeUndefined();
    expect(query.limit).toBe(50);
    expect(query.offset).toBe(0);
    expect(query.search).toBeUndefined();
  });

  test("created query passes validation", () => {
    const query = createDefaultQuery();
    const result = validateCommitLogQuery(query);
    expect(result.valid).toBe(true);
  });
});

describe("Type definitions", () => {
  test("CommitInfo type structure", () => {
    const commit: CommitInfo = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d",
      message: "feat: add new feature",
      body: "This is the commit body",
      author: { name: "Alice", email: "alice@example.com" },
      committer: { name: "Bob", email: "bob@example.com" },
      date: Date.now(),
      parentHashes: ["parent1hash", "parent2hash"],
    };
    expect(commit).toBeDefined();
  });

  test("CommitDetail extends CommitInfo", () => {
    const detail: CommitDetail = {
      hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      shortHash: "a1b2c3d",
      message: "feat: add new feature",
      body: "This is the commit body",
      author: { name: "Alice", email: "alice@example.com" },
      committer: { name: "Bob", email: "bob@example.com" },
      date: Date.now(),
      parentHashes: ["parent1hash"],
      stats: {
        filesChanged: 3,
        additions: 150,
        deletions: 20,
      },
      files: [
        {
          path: "src/feature.ts",
          status: "M",
          additions: 100,
          deletions: 10,
        },
        {
          path: "src/new.ts",
          status: "A",
          additions: 50,
          deletions: 0,
        },
        {
          path: "src/renamed.ts",
          status: "R",
          additions: 0,
          deletions: 10,
          oldPath: "src/old.ts",
        },
      ],
    };
    expect(detail).toBeDefined();
    expect(detail.stats).toBeDefined();
    expect(detail.files).toHaveLength(3);
  });

  test("FileChangeStatus type validation", () => {
    const statuses: FileChangeStatus[] = ["A", "M", "D", "R", "C"];
    statuses.forEach((status) => {
      const change: CommitFileChange = {
        path: "test.ts",
        status,
        additions: 0,
        deletions: 0,
      };
      expect(change.status).toBe(status);
    });
  });

  test("CommitPagination type structure", () => {
    const pagination: CommitPagination = {
      offset: 0,
      limit: 50,
      total: 100,
      hasMore: true,
    };
    expect(pagination).toBeDefined();
    expect(pagination.hasMore).toBe(true);
  });
});
