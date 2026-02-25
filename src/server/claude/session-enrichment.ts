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

  private normalizeClaudeSessionId(sessionId: string): string {
    return sessionId.startsWith("codex-session-")
      ? sessionId.slice("codex-session-".length)
      : sessionId;
  }

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
    const claudeIds = Array.from(
      new Set(
        sessions.flatMap((session) => {
          const rawId = session.sessionId;
          const normalizedId = this.normalizeClaudeSessionId(rawId);
          return normalizedId === rawId
            ? [rawId as ClaudeSessionId]
            : [rawId as ClaudeSessionId, normalizedId as ClaudeSessionId];
        }),
      ),
    );
    const mappings = this.mappingStore.batchLookupByClaudeIds(claudeIds);

    // Enrich each session, auto-registering missing mappings
    for (const session of sessions) {
      const rawId = session.sessionId as ClaudeSessionId;
      const normalizedId = this.normalizeClaudeSessionId(
        session.sessionId,
      ) as ClaudeSessionId;
      const isNormalizedDifferent = normalizedId !== rawId;

      let qraftId = mappings.get(normalizedId) ?? mappings.get(rawId);

      if (qraftId === undefined) {
        // Auto-register missing mapping
        const worktreeId = generateWorktreeId(session.projectPath);
        qraftId = this.mappingStore.upsert(
          rawId,
          session.projectPath,
          worktreeId,
        );
      } else if (isNormalizedDifferent) {
        // Keep prefixed codex-session IDs consistent with canonical mapping.
        const worktreeId = generateWorktreeId(session.projectPath);
        const canonicalIsQraftBox =
          this.mappingStore.isQraftBoxSession(normalizedId);
        this.mappingStore.upsert(
          rawId,
          session.projectPath,
          worktreeId,
          canonicalIsQraftBox ? "qraftbox" : "auto",
          qraftId,
        );
      }

      // Mutate session object to add qraftAiSessionId
      session.qraftAiSessionId = qraftId;
    }
  }
}
