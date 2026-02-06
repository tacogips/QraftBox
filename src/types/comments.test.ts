import { describe, test, expect } from "bun:test";
import {
  type Author,
  type Comment,
  type CommentReply,
  type NewComment,
  type NewReply,
  type SyncMode,
  type SyncStatus,
  createAuthor,
  createComment,
  createCommentReply,
  createNewComment,
  createNewReply,
  createSyncStatus,
  isSyncMode,
  isValidAuthor,
  isValidComment,
  isValidLineNumber,
  isValidLineRange,
  isCommentUpdated,
  hasReplies,
  isMultiLineComment,
} from "./comments";

describe("Comment Types", () => {
  describe("createAuthor", () => {
    test("creates author with name and email", () => {
      const author = createAuthor("John Doe", "john@example.com");

      expect(author.name).toBe("John Doe");
      expect(author.email).toBe("john@example.com");
    });

    test("creates author with unicode characters", () => {
      const author = createAuthor("田中太郎", "tanaka@example.jp");

      expect(author.name).toBe("田中太郎");
      expect(author.email).toBe("tanaka@example.jp");
    });
  });

  describe("createComment", () => {
    test("creates comment with minimal fields", () => {
      const author = createAuthor("Alice", "alice@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "This is a comment",
        author,
        1234567890,
      );

      expect(comment.id).toBe("c1");
      expect(comment.commitHash).toBe("abc123");
      expect(comment.filePath).toBe("src/main.ts");
      expect(comment.lineNumber).toBe(10);
      expect(comment.endLineNumber).toBeUndefined();
      expect(comment.body).toBe("This is a comment");
      expect(comment.author).toBe(author);
      expect(comment.createdAt).toBe(1234567890);
      expect(comment.updatedAt).toBeUndefined();
      expect(comment.replies).toEqual([]);
    });

    test("creates comment with all optional fields", () => {
      const author = createAuthor("Bob", "bob@example.com");
      const reply = createCommentReply("r1", "Reply text", author, 1234567900);
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment body",
        author,
        1234567890,
        {
          endLineNumber: 15,
          updatedAt: 1234567895,
          replies: [reply],
        },
      );

      expect(comment.endLineNumber).toBe(15);
      expect(comment.updatedAt).toBe(1234567895);
      expect(comment.replies).toHaveLength(1);
      expect(comment.replies[0]).toBe(reply);
    });

    test("creates multi-line comment", () => {
      const author = createAuthor("Charlie", "charlie@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Multi-line comment",
        author,
        1234567890,
        {
          endLineNumber: 20,
        },
      );

      expect(comment.lineNumber).toBe(10);
      expect(comment.endLineNumber).toBe(20);
    });
  });

  describe("createCommentReply", () => {
    test("creates reply with all required fields", () => {
      const author = createAuthor("Dave", "dave@example.com");
      const reply = createCommentReply(
        "r1",
        "This is a reply",
        author,
        1234567890,
      );

      expect(reply.id).toBe("r1");
      expect(reply.body).toBe("This is a reply");
      expect(reply.author).toBe(author);
      expect(reply.createdAt).toBe(1234567890);
    });

    test("creates reply with different author", () => {
      const author1 = createAuthor("Eve", "eve@example.com");
      const author2 = createAuthor("Frank", "frank@example.com");
      const reply1 = createCommentReply("r1", "Reply 1", author1, 1234567890);
      const reply2 = createCommentReply("r2", "Reply 2", author2, 1234567900);

      expect(reply1.author.name).toBe("Eve");
      expect(reply2.author.name).toBe("Frank");
    });
  });

  describe("createNewComment", () => {
    test("creates new comment with minimal fields", () => {
      const newComment = createNewComment("src/lib.ts", 5, "New comment");

      expect(newComment.filePath).toBe("src/lib.ts");
      expect(newComment.lineNumber).toBe(5);
      expect(newComment.body).toBe("New comment");
      expect(newComment.endLineNumber).toBeUndefined();
      expect(newComment.author).toBeUndefined();
    });

    test("creates new comment with all optional fields", () => {
      const author = createAuthor("Grace", "grace@example.com");
      const newComment = createNewComment("src/lib.ts", 5, "New comment", {
        endLineNumber: 10,
        author,
      });

      expect(newComment.endLineNumber).toBe(10);
      expect(newComment.author).toBe(author);
    });

    test("creates multi-line new comment", () => {
      const newComment = createNewComment("src/lib.ts", 5, "Multi-line", {
        endLineNumber: 15,
      });

      expect(newComment.lineNumber).toBe(5);
      expect(newComment.endLineNumber).toBe(15);
    });
  });

  describe("createNewReply", () => {
    test("creates reply without author", () => {
      const reply = createNewReply("Reply text");

      expect(reply.body).toBe("Reply text");
      expect(reply.author).toBeUndefined();
    });

    test("creates reply with author", () => {
      const author = createAuthor("Henry", "henry@example.com");
      const reply = createNewReply("Reply text", author);

      expect(reply.body).toBe("Reply text");
      expect(reply.author).toBe(author);
    });
  });

  describe("createSyncStatus", () => {
    test("creates sync status with defaults", () => {
      const status = createSyncStatus(5, 5, "manual");

      expect(status.localCount).toBe(5);
      expect(status.remoteCount).toBe(5);
      expect(status.syncMode).toBe("manual");
      expect(status.lastSyncAt).toBeNull();
      expect(status.hasUnsyncedChanges).toBe(false);
    });

    test("creates sync status with all fields", () => {
      const status = createSyncStatus(5, 3, "auto", {
        lastSyncAt: 1234567890,
        hasUnsyncedChanges: true,
      });

      expect(status.localCount).toBe(5);
      expect(status.remoteCount).toBe(3);
      expect(status.syncMode).toBe("auto");
      expect(status.lastSyncAt).toBe(1234567890);
      expect(status.hasUnsyncedChanges).toBe(true);
    });

    test("creates sync status with different sync modes", () => {
      const manual = createSyncStatus(0, 0, "manual");
      const autoPush = createSyncStatus(1, 0, "auto-push");
      const autoPull = createSyncStatus(0, 1, "auto-pull");
      const auto = createSyncStatus(1, 1, "auto");

      expect(manual.syncMode).toBe("manual");
      expect(autoPush.syncMode).toBe("auto-push");
      expect(autoPull.syncMode).toBe("auto-pull");
      expect(auto.syncMode).toBe("auto");
    });
  });

  describe("isSyncMode", () => {
    test("returns true for valid sync modes", () => {
      expect(isSyncMode("manual")).toBe(true);
      expect(isSyncMode("auto-push")).toBe(true);
      expect(isSyncMode("auto-pull")).toBe(true);
      expect(isSyncMode("auto")).toBe(true);
    });

    test("returns false for invalid sync modes", () => {
      expect(isSyncMode("invalid")).toBe(false);
      expect(isSyncMode("")).toBe(false);
      expect(isSyncMode("Manual")).toBe(false);
      expect(isSyncMode("auto_push")).toBe(false);
      expect(isSyncMode("sync")).toBe(false);
    });
  });

  describe("isValidAuthor", () => {
    test("returns true for valid author", () => {
      const author = createAuthor("John", "john@example.com");
      expect(isValidAuthor(author)).toBe(true);
    });

    test("returns false for invalid authors", () => {
      expect(isValidAuthor(null)).toBe(false);
      expect(isValidAuthor(undefined)).toBe(false);
      expect(isValidAuthor({})).toBe(false);
      expect(isValidAuthor({ name: "John" })).toBe(false);
      expect(isValidAuthor({ email: "john@example.com" })).toBe(false);
      expect(isValidAuthor({ name: "", email: "john@example.com" })).toBe(
        false,
      );
      expect(isValidAuthor({ name: "   ", email: "john@example.com" })).toBe(
        false,
      );
      expect(isValidAuthor({ name: "John", email: "" })).toBe(false);
      expect(isValidAuthor({ name: "John", email: "invalid" })).toBe(false);
      expect(isValidAuthor({ name: 123, email: "john@example.com" })).toBe(
        false,
      );
      expect(isValidAuthor("not an object")).toBe(false);
    });

    test("validates email contains @", () => {
      expect(isValidAuthor({ name: "John", email: "john.example.com" })).toBe(
        false,
      );
      expect(isValidAuthor({ name: "John", email: "john@example.com" })).toBe(
        true,
      );
    });
  });

  describe("isValidComment", () => {
    test("returns true for valid comment", () => {
      const author = createAuthor("Alice", "alice@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
      );
      expect(isValidComment(comment)).toBe(true);
    });

    test("returns false for missing required fields", () => {
      const author = createAuthor("Bob", "bob@example.com");

      expect(isValidComment(null)).toBe(false);
      expect(isValidComment(undefined)).toBe(false);
      expect(isValidComment({})).toBe(false);

      // Missing id
      expect(
        isValidComment({
          commitHash: "abc",
          filePath: "src/main.ts",
          lineNumber: 10,
          body: "Comment",
          author,
          createdAt: 1234567890,
          replies: [],
        }),
      ).toBe(false);

      // Empty id
      expect(
        isValidComment({
          id: "",
          commitHash: "abc",
          filePath: "src/main.ts",
          lineNumber: 10,
          body: "Comment",
          author,
          createdAt: 1234567890,
          replies: [],
        }),
      ).toBe(false);

      // Invalid line number (zero)
      expect(
        isValidComment({
          id: "c1",
          commitHash: "abc",
          filePath: "src/main.ts",
          lineNumber: 0,
          body: "Comment",
          author,
          createdAt: 1234567890,
          replies: [],
        }),
      ).toBe(false);

      // Invalid line number (negative)
      expect(
        isValidComment({
          id: "c1",
          commitHash: "abc",
          filePath: "src/main.ts",
          lineNumber: -1,
          body: "Comment",
          author,
          createdAt: 1234567890,
          replies: [],
        }),
      ).toBe(false);

      // Invalid line number (float)
      expect(
        isValidComment({
          id: "c1",
          commitHash: "abc",
          filePath: "src/main.ts",
          lineNumber: 10.5,
          body: "Comment",
          author,
          createdAt: 1234567890,
          replies: [],
        }),
      ).toBe(false);

      // Empty body
      expect(
        isValidComment({
          id: "c1",
          commitHash: "abc",
          filePath: "src/main.ts",
          lineNumber: 10,
          body: "   ",
          author,
          createdAt: 1234567890,
          replies: [],
        }),
      ).toBe(false);

      // Invalid author
      expect(
        isValidComment({
          id: "c1",
          commitHash: "abc",
          filePath: "src/main.ts",
          lineNumber: 10,
          body: "Comment",
          author: { name: "", email: "" },
          createdAt: 1234567890,
          replies: [],
        }),
      ).toBe(false);

      // Missing replies array
      expect(
        isValidComment({
          id: "c1",
          commitHash: "abc",
          filePath: "src/main.ts",
          lineNumber: 10,
          body: "Comment",
          author,
          createdAt: 1234567890,
        }),
      ).toBe(false);
    });
  });

  describe("isValidLineNumber", () => {
    test("returns true for valid line numbers", () => {
      expect(isValidLineNumber(1)).toBe(true);
      expect(isValidLineNumber(10)).toBe(true);
      expect(isValidLineNumber(1000)).toBe(true);
    });

    test("returns false for invalid line numbers", () => {
      expect(isValidLineNumber(0)).toBe(false);
      expect(isValidLineNumber(-1)).toBe(false);
      expect(isValidLineNumber(1.5)).toBe(false);
      expect(isValidLineNumber(NaN)).toBe(false);
      expect(isValidLineNumber(Infinity)).toBe(false);
      expect(isValidLineNumber(-Infinity)).toBe(false);
    });
  });

  describe("isValidLineRange", () => {
    test("returns true for valid single line", () => {
      expect(isValidLineRange(10)).toBe(true);
      expect(isValidLineRange(1)).toBe(true);
    });

    test("returns true for valid line range", () => {
      expect(isValidLineRange(10, 10)).toBe(true);
      expect(isValidLineRange(10, 15)).toBe(true);
      expect(isValidLineRange(1, 100)).toBe(true);
    });

    test("returns false for invalid start line", () => {
      expect(isValidLineRange(0)).toBe(false);
      expect(isValidLineRange(-1)).toBe(false);
      expect(isValidLineRange(1.5)).toBe(false);
    });

    test("returns false for invalid end line", () => {
      expect(isValidLineRange(10, 0)).toBe(false);
      expect(isValidLineRange(10, -1)).toBe(false);
      expect(isValidLineRange(10, 9)).toBe(false);
      expect(isValidLineRange(10, 1.5)).toBe(false);
    });

    test("returns false when end line is before start line", () => {
      expect(isValidLineRange(20, 10)).toBe(false);
      expect(isValidLineRange(100, 50)).toBe(false);
    });
  });

  describe("isCommentUpdated", () => {
    test("returns false for comment without updatedAt", () => {
      const author = createAuthor("Charlie", "charlie@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
      );

      expect(isCommentUpdated(comment)).toBe(false);
    });

    test("returns true for comment with updatedAt", () => {
      const author = createAuthor("Diana", "diana@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
        {
          updatedAt: 1234567900,
        },
      );

      expect(isCommentUpdated(comment)).toBe(true);
    });

    test("returns false for comment with invalid updatedAt", () => {
      const author = createAuthor("Eve", "eve@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
        {
          updatedAt: 0,
        },
      );

      expect(isCommentUpdated(comment)).toBe(false);
    });
  });

  describe("hasReplies", () => {
    test("returns false for comment without replies", () => {
      const author = createAuthor("Frank", "frank@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
      );

      expect(hasReplies(comment)).toBe(false);
    });

    test("returns true for comment with replies", () => {
      const author = createAuthor("Grace", "grace@example.com");
      const reply = createCommentReply("r1", "Reply", author, 1234567900);
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
        {
          replies: [reply],
        },
      );

      expect(hasReplies(comment)).toBe(true);
    });

    test("returns true for comment with multiple replies", () => {
      const author = createAuthor("Henry", "henry@example.com");
      const reply1 = createCommentReply("r1", "Reply 1", author, 1234567900);
      const reply2 = createCommentReply("r2", "Reply 2", author, 1234567910);
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
        {
          replies: [reply1, reply2],
        },
      );

      expect(hasReplies(comment)).toBe(true);
      expect(comment.replies).toHaveLength(2);
    });
  });

  describe("isMultiLineComment", () => {
    test("returns false for single-line comment", () => {
      const author = createAuthor("Irene", "irene@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
      );

      expect(isMultiLineComment(comment)).toBe(false);
    });

    test("returns false when endLineNumber equals lineNumber", () => {
      const author = createAuthor("Jack", "jack@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
        {
          endLineNumber: 10,
        },
      );

      expect(isMultiLineComment(comment)).toBe(false);
    });

    test("returns true for multi-line comment", () => {
      const author = createAuthor("Karen", "karen@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
        {
          endLineNumber: 15,
        },
      );

      expect(isMultiLineComment(comment)).toBe(true);
    });

    test("returns true for large multi-line comment", () => {
      const author = createAuthor("Larry", "larry@example.com");
      const comment = createComment(
        "c1",
        "abc123",
        "src/main.ts",
        10,
        "Comment",
        author,
        1234567890,
        {
          endLineNumber: 100,
        },
      );

      expect(isMultiLineComment(comment)).toBe(true);
    });
  });

  describe("Type completeness", () => {
    test("Author has all required fields", () => {
      const author: Author = {
        name: "Test User",
        email: "test@example.com",
      };

      expect(author).toBeDefined();
    });

    test("Comment has all required fields", () => {
      const author = createAuthor("Test", "test@example.com");
      const comment: Comment = {
        id: "c1",
        commitHash: "abc123",
        filePath: "src/main.ts",
        lineNumber: 10,
        endLineNumber: undefined,
        body: "Comment",
        author,
        createdAt: 1234567890,
        updatedAt: undefined,
        replies: [],
      };

      expect(comment).toBeDefined();
    });

    test("CommentReply has all required fields", () => {
      const author = createAuthor("Test", "test@example.com");
      const reply: CommentReply = {
        id: "r1",
        body: "Reply",
        author,
        createdAt: 1234567890,
      };

      expect(reply).toBeDefined();
    });

    test("NewComment has all required fields", () => {
      const newComment: NewComment = {
        filePath: "src/main.ts",
        lineNumber: 10,
        endLineNumber: undefined,
        body: "Comment",
        author: undefined,
      };

      expect(newComment).toBeDefined();
    });

    test("NewReply has all required fields", () => {
      const reply: NewReply = {
        body: "Reply",
        author: undefined,
      };

      expect(reply).toBeDefined();
    });

    test("SyncStatus has all required fields", () => {
      const status: SyncStatus = {
        localCount: 5,
        remoteCount: 5,
        syncMode: "manual",
        lastSyncAt: null,
        hasUnsyncedChanges: false,
      };

      expect(status).toBeDefined();
    });

    test("SyncMode supports all modes", () => {
      const manual: SyncMode = "manual";
      const autoPush: SyncMode = "auto-push";
      const autoPull: SyncMode = "auto-pull";
      const auto: SyncMode = "auto";

      expect(manual).toBe("manual");
      expect(autoPush).toBe("auto-push");
      expect(autoPull).toBe("auto-pull");
      expect(auto).toBe("auto");
    });
  });
});
