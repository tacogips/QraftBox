/**
 * Unified Session Types
 *
 * Discriminated union type for rendering both QraftBox AI sessions
 * and Claude CLI sessions in a single unified list.
 */

import type { AISession } from "../../../src/types/ai";
import type { ExtendedSessionEntry } from "../../../src/types/claude-session";

/**
 * Unified session item - discriminated union for rendering either session type.
 * The `kind` field drives source badge rendering and available actions.
 */
export type UnifiedSessionItem =
  | { kind: "qraftbox"; session: AISession }
  | { kind: "claude-cli"; session: ExtendedSessionEntry };

/**
 * Sub-navigation view within the unified Sessions screen.
 * - "active": Running + queued sessions
 * - "history": Completed QraftBox + Claude CLI sessions
 */
export type SessionsSubView = "active" | "history";
