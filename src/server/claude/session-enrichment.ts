/**
 * Session Enrichment Service
 *
 * Enriches Claude sessions with qraftAiSessionId via SQLite mapping store.
 * Automatically registers missing mappings to ensure consistent client-side IDs.
 */

import type { ExtendedSessionEntry } from "../../types/claude-session";
import type { SessionMappingStore } from "../ai/session-mapping-store";
import type { ClaudeSessionId } from "../../types/ai";
import { generateWorktreeId } from "../ai/session-manager";

/**
 * SessionEnrichmentService enriches sessions with qraftAiSessionId.
 *
 * This service:
 * - Performs batch SQLite lookups to find existing qraft IDs
 * - Auto-registers missing mappings so all sessions have qraft IDs
 * - Mutates the session objects in-place (side-effect)
 */
export class SessionEnrichmentService {
  constructor(private readonly mappingStore: SessionMappingStore) {}

  /**
   * Enrich sessions with qraftAiSessionId via batch lookup and auto-registration.
   *
   * This method mutates the sessions array in-place by setting the
   * qraftAiSessionId property on each session object.
   *
   * @param sessions - Array of sessions to enrich (mutated in-place)
   */
  enrichSessionsWithQraftIds(sessions: ExtendedSessionEntry[]): void {
    if (sessions.length === 0) {
      return;
    }

    // Batch lookup existing mappings
    const claudeIds = sessions.map((s) => s.sessionId as ClaudeSessionId);
    const mappings = this.mappingStore.batchLookupByClaudeIds(claudeIds);

    // Enrich each session, auto-registering missing mappings
    for (const session of sessions) {
      let qraftId = mappings.get(session.sessionId as ClaudeSessionId);

      if (qraftId === undefined) {
        // Auto-register missing mapping
        const worktreeId = generateWorktreeId(session.projectPath);
        qraftId = this.mappingStore.upsert(
          session.sessionId as ClaudeSessionId,
          session.projectPath,
          worktreeId,
        );
      }

      // Mutate session object to add qraftAiSessionId
      session.qraftAiSessionId = qraftId;
    }
  }
}
