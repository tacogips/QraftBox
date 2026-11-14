/**
 * Sync Manager Module
 *
 * Manages git notes synchronization for push/pull operations.
 * Wraps git push/pull commands to sync qraftbox-comments ref with remotes.
 */

import type { SyncStatus, SyncMode } from "../../types/comments.js";
import { createSyncStatus } from "../../types/comments.js";
import { execGit } from "../git/executor.js";

/**
 * Sync Manager interface for managing git notes synchronization
 */
export interface SyncManager {
  /**
   * Get current synchronization status
   *
   * @returns Promise resolving to sync status with counts and state
   */
  getSyncStatus(): Promise<SyncStatus>;

  /**
   * Push local notes to remote
   *
   * @returns Promise resolving when push completes
   * @throws Error if push fails or no remote configured
   */
  pushNotes(): Promise<void>;

  /**
   * Pull notes from remote
   *
   * @returns Promise resolving when pull completes
   * @throws Error if pull fails or no remote configured
   */
  pullNotes(): Promise<void>;

  /**
   * Set synchronization mode
   *
   * @param mode - Sync mode (manual, auto-push, auto-pull, auto)
   */
  setSyncMode(mode: SyncMode): void;

  /**
   * Get current synchronization mode
   *
   * @returns Current sync mode
   */
  getSyncMode(): SyncMode;

  /**
   * Mark that local changes have occurred
   *
   * Internal method used by bridge integration to track unsynced changes.
   */
  markAsChanged(): void;
}

/**
 * Git notes reference for comments
 */
const NOTES_REF = "qraftbox-comments";

/**
 * Full git ref path for notes
 */
const NOTES_REF_PATH = `refs/notes/${NOTES_REF}`;

/**
 * Create a Sync Manager instance for a git repository
 *
 * @param projectPath - Path to git repository
 * @param initialMode - Initial sync mode (defaults to "manual")
 * @returns SyncManager interface
 *
 * @example
 * ```typescript
 * const manager = createSyncManager('/path/to/repo', 'auto-push');
 * await manager.pushNotes();
 * const status = await manager.getSyncStatus();
 * ```
 */
export function createSyncManager(
  projectPath: string,
  initialMode: SyncMode = "manual",
): SyncManager {
  let syncMode: SyncMode = initialMode;
  let lastSyncAt: number | null = null;
  let hasUnsyncedChanges = false;

  /**
   * Count local notes
   */
  async function countLocalNotes(): Promise<number> {
    const result = await execGit(["notes", "--ref", NOTES_REF, "list"], {
      cwd: projectPath,
    });

    // No notes exist
    if (result.exitCode !== 0) {
      return 0;
    }

    const lines = result.stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
    return lines.length;
  }

  /**
   * Check if remote notes ref exists
   */
  async function checkRemoteExists(): Promise<boolean> {
    const result = await execGit(["ls-remote", "origin", NOTES_REF_PATH], {
      cwd: projectPath,
    });

    // ls-remote succeeds even if ref doesn't exist (returns empty output)
    // Exit code 0 with empty stdout means remote configured but no ref
    // Non-zero exit code means no remote configured
    return result.exitCode === 0 && result.stdout.trim().length > 0;
  }

  /**
   * Count remote notes (returns 0 if remote doesn't exist)
   */
  async function countRemoteNotes(): Promise<number> {
    const remoteExists = await checkRemoteExists();
    if (!remoteExists) {
      return 0;
    }

    // Remote ref exists - count lines in ls-remote output
    const result = await execGit(["ls-remote", "origin", NOTES_REF_PATH], {
      cwd: projectPath,
    });

    if (result.exitCode !== 0) {
      return 0;
    }

    const lines = result.stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
    return lines.length > 0 ? 1 : 0; // Remote ref exists (1) or not (0)
  }

  return {
    async getSyncStatus(): Promise<SyncStatus> {
      const localCount = await countLocalNotes();
      const remoteCount = await countRemoteNotes();

      return createSyncStatus(localCount, remoteCount, syncMode, {
        lastSyncAt,
        hasUnsyncedChanges,
      });
    },

    async pushNotes(): Promise<void> {
      // Check if remote is configured
      const remoteCheckResult = await execGit(["remote", "get-url", "origin"], {
        cwd: projectPath,
      });

      if (remoteCheckResult.exitCode !== 0) {
        throw new Error(
          "No remote 'origin' configured. Add a remote with: git remote add origin <url>",
        );
      }

      // Check if local notes ref exists
      const localCount = await countLocalNotes();
      if (localCount === 0) {
        // No notes to push - still mark as synced
        lastSyncAt = Date.now();
        hasUnsyncedChanges = false;
        return;
      }

      // Push notes ref to remote
      const result = await execGit(["push", "origin", NOTES_REF_PATH], {
        cwd: projectPath,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Failed to push notes: ${result.stderr}`);
      }

      // Update sync state
      lastSyncAt = Date.now();
      hasUnsyncedChanges = false;
    },

    async pullNotes(): Promise<void> {
      // Check if remote is configured
      const remoteCheckResult = await execGit(["remote", "get-url", "origin"], {
        cwd: projectPath,
      });

      if (remoteCheckResult.exitCode !== 0) {
        throw new Error(
          "No remote 'origin' configured. Add a remote with: git remote add origin <url>",
        );
      }

      // Fetch notes ref from remote
      const result = await execGit(
        ["fetch", "origin", `${NOTES_REF_PATH}:${NOTES_REF_PATH}`],
        { cwd: projectPath },
      );

      if (result.exitCode !== 0) {
        throw new Error(`Failed to pull notes: ${result.stderr}`);
      }

      // Update sync state
      lastSyncAt = Date.now();
      hasUnsyncedChanges = false;
    },

    setSyncMode(mode: SyncMode): void {
      syncMode = mode;
    },

    getSyncMode(): SyncMode {
      return syncMode;
    },

    markAsChanged(): void {
      hasUnsyncedChanges = true;
    },
  };
}
