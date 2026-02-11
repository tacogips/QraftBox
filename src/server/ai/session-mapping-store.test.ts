/**
 * Tests for Session Mapping Store
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createInMemorySessionMappingStore,
  type SessionMappingStore,
} from "./session-mapping-store.js";
import {
  deriveQraftAiSessionIdFromClaude,
  type QraftAiSessionId,
} from "../../types/ai.js";

describe("SessionMappingStore", () => {
  let store: SessionMappingStore;

  beforeEach(() => {
    store = createInMemorySessionMappingStore();
  });

  describe("upsert", () => {
    test("creates a new mapping and returns derived QraftAiSessionId", () => {
      const claudeSessionId = "test-claude-session-123";
      const projectPath = "/test/project";
      const worktreeId = "main";

      const qraftId = store.upsert(claudeSessionId, projectPath, worktreeId);

      expect(qraftId).toBe(deriveQraftAiSessionIdFromClaude(claudeSessionId));
    });

    test("updates existing mapping when upserting same claude_session_id", () => {
      const claudeSessionId = "test-claude-session-123";
      const projectPath1 = "/test/project1";
      const projectPath2 = "/test/project2";
      const worktreeId1 = "main";
      const worktreeId2 = "feature";

      const qraftId1 = store.upsert(claudeSessionId, projectPath1, worktreeId1);
      const qraftId2 = store.upsert(claudeSessionId, projectPath2, worktreeId2);

      // Should return the same qraft ID (derived from same claude session)
      expect(qraftId1).toBe(qraftId2);

      // Should be able to find it
      const found = store.findClaudeSessionId(qraftId2);
      expect(found).toBe(claudeSessionId);
    });
  });

  describe("findClaudeSessionId", () => {
    test("returns the most recent claude_session_id for a qraft_ai_session_id", () => {
      const claudeSessionId = "test-claude-session-456";
      const projectPath = "/test/project";
      const worktreeId = "main";

      const qraftId = store.upsert(claudeSessionId, projectPath, worktreeId);

      const found = store.findClaudeSessionId(qraftId);
      expect(found).toBe(claudeSessionId);
    });

    test("returns undefined for non-existent qraft_ai_session_id", () => {
      const nonExistentId = "qs_nonexistent" as QraftAiSessionId;
      const found = store.findClaudeSessionId(nonExistentId);
      expect(found).toBeUndefined();
    });

    test("returns most recent when multiple mappings share same qraft_ai_session_id", () => {
      // This scenario can occur if the same Claude session is referenced multiple times
      const claudeSessionId = "test-claude-session-789";
      const projectPath = "/test/project";
      const worktreeId = "main";

      const qraftId = store.upsert(claudeSessionId, projectPath, worktreeId);

      // Upsert again (simulating update)
      store.upsert(claudeSessionId, projectPath, "feature");

      const found = store.findClaudeSessionId(qraftId);
      expect(found).toBe(claudeSessionId);
    });
  });

  describe("findByClaudeSessionId", () => {
    test("returns QraftAiSessionId for existing claude_session_id", () => {
      const claudeSessionId = "test-claude-session-abc";
      const projectPath = "/test/project";
      const worktreeId = "main";

      const expectedQraftId = store.upsert(
        claudeSessionId,
        projectPath,
        worktreeId,
      );

      const found = store.findByClaudeSessionId(claudeSessionId);
      expect(found).toBe(expectedQraftId);
    });

    test("returns undefined for non-existent claude_session_id", () => {
      const found = store.findByClaudeSessionId("non-existent-session");
      expect(found).toBeUndefined();
    });
  });

  describe("batchLookupByClaudeIds", () => {
    test("returns empty map for empty input array", () => {
      const result = store.batchLookupByClaudeIds([]);
      expect(result.size).toBe(0);
    });

    test("returns map of all found mappings", () => {
      const claudeIds = [
        "claude-session-1",
        "claude-session-2",
        "claude-session-3",
      ];
      const projectPath = "/test/project";
      const worktreeId = "main";

      const qraftId1 = store.upsert(claudeIds[0]!, projectPath, worktreeId);
      const qraftId2 = store.upsert(claudeIds[1]!, projectPath, worktreeId);
      const qraftId3 = store.upsert(claudeIds[2]!, projectPath, worktreeId);

      const result = store.batchLookupByClaudeIds(claudeIds);

      expect(result.size).toBe(3);
      expect(result.get("claude-session-1") as string).toBe(qraftId1);
      expect(result.get("claude-session-2") as string).toBe(qraftId2);
      expect(result.get("claude-session-3") as string).toBe(qraftId3);
    });

    test("handles partial matches (some IDs not in database)", () => {
      const claudeId1 = "claude-session-found";
      const claudeId2 = "claude-session-not-found";
      const projectPath = "/test/project";
      const worktreeId = "main";

      const expectedQraftId = store.upsert(claudeId1, projectPath, worktreeId);

      const result = store.batchLookupByClaudeIds([claudeId1, claudeId2]);

      expect(result.size).toBe(1);
      expect(result.get(claudeId1)).toBe(expectedQraftId);
      expect(result.has(claudeId2)).toBe(false);
    });

    test("handles large batches (>500 IDs) with chunking", () => {
      const projectPath = "/test/project";
      const worktreeId = "main";

      // Create 750 mappings to test chunking
      const claudeIds: string[] = [];
      const expectedQraftIds = new Map<string, QraftAiSessionId>();

      for (let i = 0; i < 750; i++) {
        const claudeId = `claude-session-${i}`;
        claudeIds.push(claudeId);
        const qraftId = store.upsert(claudeId, projectPath, worktreeId);
        expectedQraftIds.set(claudeId, qraftId);
      }

      const result = store.batchLookupByClaudeIds(claudeIds);

      expect(result.size).toBe(750);

      // Verify all mappings are correct
      for (const [claudeId, qraftId] of expectedQraftIds) {
        expect(result.get(claudeId)).toBe(qraftId);
      }
    });
  });

  describe("close", () => {
    test("closes database connection without error", () => {
      const testStore = createInMemorySessionMappingStore();
      expect(() => testStore.close()).not.toThrow();
    });
  });

  describe("deterministic qraft_ai_session_id derivation", () => {
    test("same claude_session_id always produces same qraft_ai_session_id", () => {
      const claudeSessionId = "deterministic-test-session";
      const projectPath = "/test/project";
      const worktreeId = "main";

      const qraftId1 = store.upsert(claudeSessionId, projectPath, worktreeId);

      // Create a new store and upsert the same claude session
      const store2 = createInMemorySessionMappingStore();
      const qraftId2 = store2.upsert(claudeSessionId, projectPath, worktreeId);

      expect(qraftId1).toBe(qraftId2);

      store2.close();
    });

    test("different claude_session_ids produce different qraft_ai_session_ids", () => {
      const claudeSessionId1 = "session-a";
      const claudeSessionId2 = "session-b";
      const projectPath = "/test/project";
      const worktreeId = "main";

      const qraftId1 = store.upsert(claudeSessionId1, projectPath, worktreeId);
      const qraftId2 = store.upsert(claudeSessionId2, projectPath, worktreeId);

      expect(qraftId1).not.toBe(qraftId2);
    });
  });
});

describe("SessionMappingStore directory scan fallback", () => {
  let tmpDir: string;
  let claudeProjectsDir: string;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `session-mapping-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    claudeProjectsDir = join(tmpDir, "projects");
    mkdirSync(claudeProjectsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: create a fake project directory with .jsonl session files.
   */
  function createFakeProject(encodedName: string, sessionIds: string[]): void {
    const projectDir = join(claudeProjectsDir, encodedName);
    mkdirSync(projectDir, { recursive: true });
    for (const id of sessionIds) {
      writeFileSync(join(projectDir, `${id}.jsonl`), "");
    }
  }

  test("finds claude session via directory scan when not in SQLite", () => {
    const claudeSessionId = "abc-def-123-456";
    createFakeProject("-test-project", [claudeSessionId]);

    const scanStore = createInMemorySessionMappingStore(claudeProjectsDir);
    const qraftId = deriveQraftAiSessionIdFromClaude(claudeSessionId);

    const found = scanStore.findClaudeSessionId(qraftId);
    expect(found).toBe(claudeSessionId);

    scanStore.close();
  });

  test("persists discovered mapping to SQLite after directory scan", () => {
    const claudeSessionId = "persist-test-session-789";
    createFakeProject("-test-project", [claudeSessionId]);

    const scanStore = createInMemorySessionMappingStore(claudeProjectsDir);
    const qraftId = deriveQraftAiSessionIdFromClaude(claudeSessionId);

    // First call: scans directory
    const found1 = scanStore.findClaudeSessionId(qraftId);
    expect(found1).toBe(claudeSessionId);

    // Remove the fixture directory so scan would fail
    rmSync(claudeProjectsDir, { recursive: true, force: true });

    // Second call: should still return from SQLite
    const found2 = scanStore.findClaudeSessionId(qraftId);
    expect(found2).toBe(claudeSessionId);

    scanStore.close();
  });

  test("returns undefined when no matching session exists in directory", () => {
    createFakeProject("-test-project", ["some-other-session"]);

    const scanStore = createInMemorySessionMappingStore(claudeProjectsDir);
    const nonExistentId = "qs_doesnotexist" as QraftAiSessionId;

    const found = scanStore.findClaudeSessionId(nonExistentId);
    expect(found).toBeUndefined();

    scanStore.close();
  });

  test("returns undefined gracefully when claude projects directory does not exist", () => {
    const scanStore = createInMemorySessionMappingStore(
      join(tmpDir, "nonexistent-dir"),
    );
    const nonExistentId = "qs_doesnotexist" as QraftAiSessionId;

    const found = scanStore.findClaudeSessionId(nonExistentId);
    expect(found).toBeUndefined();

    scanStore.close();
  });

  test("scans across multiple project directories", () => {
    const targetSessionId = "target-session-in-project-b";
    createFakeProject("-project-a", ["session-a1", "session-a2"]);
    createFakeProject("-project-b", ["session-b1", targetSessionId]);

    const scanStore = createInMemorySessionMappingStore(claudeProjectsDir);
    const qraftId = deriveQraftAiSessionIdFromClaude(targetSessionId);

    const found = scanStore.findClaudeSessionId(qraftId);
    expect(found).toBe(targetSessionId);

    scanStore.close();
  });

  test("prefers SQLite over directory scan", () => {
    const claudeSessionId = "sqlite-preferred-session";
    createFakeProject("-test-project", [claudeSessionId]);

    const scanStore = createInMemorySessionMappingStore(claudeProjectsDir);

    // Pre-populate SQLite
    scanStore.upsert(claudeSessionId, "/pre-populated", "main");

    const qraftId = deriveQraftAiSessionIdFromClaude(claudeSessionId);
    const found = scanStore.findClaudeSessionId(qraftId);
    expect(found).toBe(claudeSessionId);

    scanStore.close();
  });

  test("ignores non-jsonl files in project directories", () => {
    const projectDir = join(claudeProjectsDir, "-test-project");
    mkdirSync(projectDir, { recursive: true });

    // Create a .jsonl file and some non-.jsonl files
    const claudeSessionId = "real-session";
    writeFileSync(join(projectDir, `${claudeSessionId}.jsonl`), "");
    writeFileSync(join(projectDir, "sessions-index.json"), "{}");
    writeFileSync(join(projectDir, "README.md"), "");

    const scanStore = createInMemorySessionMappingStore(claudeProjectsDir);
    const qraftId = deriveQraftAiSessionIdFromClaude(claudeSessionId);

    const found = scanStore.findClaudeSessionId(qraftId);
    expect(found).toBe(claudeSessionId);

    scanStore.close();
  });
});
