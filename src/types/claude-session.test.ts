import { describe, expect, test } from "bun:test";
import {
  isClaudeSessionIndex,
  isClaudeSessionEntry,
  isSessionSource,
  isExtendedSessionEntry,
  type ClaudeSessionIndex,
  type ClaudeSessionEntry,
  type ExtendedSessionEntry,
} from "./claude-session";
import { deriveQraftAiSessionIdFromClaude, type ClaudeSessionId } from "./ai";

describe("Type Guards", () => {
  describe("isSessionSource", () => {
    test("returns true for valid session sources", () => {
      expect(isSessionSource("qraftbox")).toBe(true);
      expect(isSessionSource("claude-cli")).toBe(true);
      expect(isSessionSource("unknown")).toBe(true);
    });

    test("returns false for invalid values", () => {
      expect(isSessionSource("invalid")).toBe(false);
      expect(isSessionSource("")).toBe(false);
      expect(isSessionSource(null)).toBe(false);
      expect(isSessionSource(undefined)).toBe(false);
      expect(isSessionSource(123)).toBe(false);
      expect(isSessionSource({})).toBe(false);
    });
  });

  describe("isClaudeSessionEntry", () => {
    const validEntry: ClaudeSessionEntry = {
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      fullPath:
        "/home/user/.claude/projects/-g-gits-tacogips-qraftbox/session.jsonl",
      fileMtime: 1704067200000,
      firstPrompt: "Implement feature X",
      summary: "Discussion about feature X implementation",
      messageCount: 15,
      created: "2024-01-01T00:00:00.000Z",
      modified: "2024-01-01T12:00:00.000Z",
      gitBranch: "main",
      projectPath: "/g/gits/tacogips/qraftbox",
      isSidechain: false,
    };

    test("returns true for valid session entry", () => {
      expect(isClaudeSessionEntry(validEntry)).toBe(true);
    });

    test("returns false for missing required fields", () => {
      const { sessionId, ...withoutSessionId } = validEntry;
      expect(isClaudeSessionEntry(withoutSessionId)).toBe(false);

      const { fullPath, ...withoutFullPath } = validEntry;
      expect(isClaudeSessionEntry(withoutFullPath)).toBe(false);

      const { messageCount, ...withoutMessageCount } = validEntry;
      expect(isClaudeSessionEntry(withoutMessageCount)).toBe(false);
    });

    test("returns false for wrong types", () => {
      expect(
        isClaudeSessionEntry({
          ...validEntry,
          sessionId: 123, // Should be string
        }),
      ).toBe(false);

      expect(
        isClaudeSessionEntry({
          ...validEntry,
          messageCount: "15", // Should be number
        }),
      ).toBe(false);

      expect(
        isClaudeSessionEntry({
          ...validEntry,
          isSidechain: "false", // Should be boolean
        }),
      ).toBe(false);
    });

    test("returns false for null and undefined", () => {
      expect(isClaudeSessionEntry(null)).toBe(false);
      expect(isClaudeSessionEntry(undefined)).toBe(false);
    });

    test("returns false for non-objects", () => {
      expect(isClaudeSessionEntry("string")).toBe(false);
      expect(isClaudeSessionEntry(123)).toBe(false);
      expect(isClaudeSessionEntry(true)).toBe(false);
    });
  });

  describe("isClaudeSessionIndex", () => {
    const validIndex: ClaudeSessionIndex = {
      version: 1,
      entries: [
        {
          sessionId: "123e4567-e89b-12d3-a456-426614174000",
          fullPath:
            "/home/user/.claude/projects/-g-gits-tacogips-qraftbox/session.jsonl",
          fileMtime: 1704067200000,
          firstPrompt: "Implement feature X",
          summary: "Discussion about feature X implementation",
          messageCount: 15,
          created: "2024-01-01T00:00:00.000Z",
          modified: "2024-01-01T12:00:00.000Z",
          gitBranch: "main",
          projectPath: "/g/gits/tacogips/qraftbox",
          isSidechain: false,
        },
      ],
      originalPath: "/g/gits/tacogips/qraftbox",
    };

    test("returns true for valid session index", () => {
      expect(isClaudeSessionIndex(validIndex)).toBe(true);
    });

    test("returns true for empty entries array", () => {
      expect(
        isClaudeSessionIndex({
          version: 1,
          entries: [],
          originalPath: "/some/path",
        }),
      ).toBe(true);
    });

    test("returns false for missing required fields", () => {
      const { version, ...withoutVersion } = validIndex;
      expect(isClaudeSessionIndex(withoutVersion)).toBe(false);

      const { entries, ...withoutEntries } = validIndex;
      expect(isClaudeSessionIndex(withoutEntries)).toBe(false);

      const { originalPath, ...withoutOriginalPath } = validIndex;
      expect(isClaudeSessionIndex(withoutOriginalPath)).toBe(false);
    });

    test("returns false for wrong types", () => {
      expect(
        isClaudeSessionIndex({
          ...validIndex,
          version: "1", // Should be number
        }),
      ).toBe(false);

      expect(
        isClaudeSessionIndex({
          ...validIndex,
          entries: "not-an-array", // Should be array
        }),
      ).toBe(false);

      expect(
        isClaudeSessionIndex({
          ...validIndex,
          originalPath: 123, // Should be string
        }),
      ).toBe(false);
    });

    test("returns false for null and undefined", () => {
      expect(isClaudeSessionIndex(null)).toBe(false);
      expect(isClaudeSessionIndex(undefined)).toBe(false);
    });
  });

  describe("isExtendedSessionEntry", () => {
    const sessionId = "123e4567-e89b-12d3-a456-426614174000";
    const validExtendedEntry: ExtendedSessionEntry = {
      sessionId,
      fullPath:
        "/home/user/.claude/projects/-g-gits-tacogips-qraftbox/session.jsonl",
      fileMtime: 1704067200000,
      firstPrompt: "Implement feature X",
      summary: "Discussion about feature X implementation",
      messageCount: 15,
      created: "2024-01-01T00:00:00.000Z",
      modified: "2024-01-01T12:00:00.000Z",
      gitBranch: "main",
      projectPath: "/g/gits/tacogips/qraftbox",
      isSidechain: false,
      source: "qraftbox",
      projectEncoded: "-g-gits-tacogips-qraftbox",
      qraftAiSessionId: deriveQraftAiSessionIdFromClaude(
        sessionId as ClaudeSessionId,
      ),
    };

    test("returns true for valid extended session entry", () => {
      expect(isExtendedSessionEntry(validExtendedEntry)).toBe(true);
    });

    test("returns true for all valid source types", () => {
      expect(
        isExtendedSessionEntry({
          ...validExtendedEntry,
          source: "qraftbox",
        }),
      ).toBe(true);

      expect(
        isExtendedSessionEntry({
          ...validExtendedEntry,
          source: "claude-cli",
        }),
      ).toBe(true);

      expect(
        isExtendedSessionEntry({
          ...validExtendedEntry,
          source: "unknown",
        }),
      ).toBe(true);
    });

    test("returns false for missing extended fields", () => {
      const { source, ...withoutSource } = validExtendedEntry;
      expect(isExtendedSessionEntry(withoutSource)).toBe(false);

      const { projectEncoded, ...withoutProjectEncoded } = validExtendedEntry;
      expect(isExtendedSessionEntry(withoutProjectEncoded)).toBe(false);
    });

    test("returns false for invalid source", () => {
      expect(
        isExtendedSessionEntry({
          ...validExtendedEntry,
          source: "invalid-source",
        }),
      ).toBe(false);
    });

    test("returns false for wrong types in extended fields", () => {
      expect(
        isExtendedSessionEntry({
          ...validExtendedEntry,
          projectEncoded: 123, // Should be string
        }),
      ).toBe(false);
    });

    test("returns false if base entry is invalid", () => {
      expect(
        isExtendedSessionEntry({
          source: "qraftbox",
          projectEncoded: "-g-gits-tacogips-qraftbox",
          // Missing all ClaudeSessionEntry fields
        }),
      ).toBe(false);
    });
  });
});
