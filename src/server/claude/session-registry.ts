/**
 * Session Registry
 *
 * Tracks qraftbox-created Claude Code sessions for source detection.
 * Stores session IDs in ~/.local/qraftbox/session-registry.json.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

/**
 * Registry entry for a QraftBox-created session
 */
export interface QraftBoxSessionRecord {
  /** Claude session ID (UUID) */
  sessionId: string;
  /** Session creation timestamp (ISO 8601) */
  createdAt: string;
  /** Working directory path at session creation */
  projectPath: string;
}

/**
 * Registry structure stored in file
 */
export interface QraftBoxSessionRegistry {
  /** All qraftbox-created sessions */
  sessions: QraftBoxSessionRecord[];
}

/**
 * File lock for concurrent access protection
 */
interface LockInfo {
  pid: number;
  timestamp: number;
}

const REGISTRY_DIR = join(homedir(), ".local", "qraftbox");
const REGISTRY_FILE = join(REGISTRY_DIR, "session-registry.json");
const LOCK_FILE = join(REGISTRY_DIR, "session-registry.lock");
const LOCK_TIMEOUT_MS = 10000; // 10 seconds
const LOCK_STALE_MS = 30000; // 30 seconds for stale lock detection

/**
 * SessionRegistry manages qraftbox-created session tracking
 */
export class SessionRegistry {
  private readonly registryPath: string;
  private readonly lockPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.registryPath = customPath;
      this.lockPath = `${customPath}.lock`;
    } else {
      this.registryPath = REGISTRY_FILE;
      this.lockPath = LOCK_FILE;
    }
  }

  /**
   * Register a new qraftbox session
   */
  async register(sessionId: string, projectPath: string): Promise<void> {
    await this.acquireLock();

    try {
      const registry = await this.loadRegistryUnsafe();

      // Check if already registered
      const existing = registry.sessions.find((s) => s.sessionId === sessionId);
      if (existing) {
        return;
      }

      // Add new record
      registry.sessions.push({
        sessionId,
        createdAt: new Date().toISOString(),
        projectPath,
      });

      await this.saveRegistryUnsafe(registry);
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Check if a session was created by qraftbox
   */
  async isQraftBoxSession(sessionId: string): Promise<boolean> {
    const registry = await this.getRegistry();
    return registry.sessions.some((s) => s.sessionId === sessionId);
  }

  /**
   * Get the full registry
   */
  async getRegistry(): Promise<QraftBoxSessionRegistry> {
    await this.ensureRegistryExists();
    return this.loadRegistryUnsafe();
  }

  /**
   * Ensure registry directory and file exist
   */
  private async ensureRegistryExists(): Promise<void> {
    // Create directory if needed
    const dir = this.registryPath.substring(
      0,
      this.registryPath.lastIndexOf("/"),
    );
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Create empty registry if file doesn't exist
    if (!existsSync(this.registryPath)) {
      const emptyRegistry: QraftBoxSessionRegistry = { sessions: [] };
      await writeFile(
        this.registryPath,
        JSON.stringify(emptyRegistry, null, 2),
        "utf-8",
      );
    }
  }

  /**
   * Load registry without locking (internal use only)
   */
  private async loadRegistryUnsafe(): Promise<QraftBoxSessionRegistry> {
    await this.ensureRegistryExists();

    const content = await readFile(this.registryPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;

    // Validate structure
    if (!isQraftBoxSessionRegistry(parsed)) {
      throw new Error("Invalid registry format");
    }

    return parsed;
  }

  /**
   * Save registry without locking (internal use only)
   */
  private async saveRegistryUnsafe(
    registry: QraftBoxSessionRegistry,
  ): Promise<void> {
    await writeFile(
      this.registryPath,
      JSON.stringify(registry, null, 2),
      "utf-8",
    );
  }

  /**
   * Acquire file lock for concurrent access
   */
  private async acquireLock(): Promise<void> {
    const startTime = Date.now();
    const backoffMs = 50; // Start with 50ms backoff

    // Ensure lock directory exists
    const lockDir = this.lockPath.substring(0, this.lockPath.lastIndexOf("/"));
    if (!existsSync(lockDir)) {
      await mkdir(lockDir, { recursive: true });
    }

    while (true) {
      try {
        // Check timeout first
        if (Date.now() - startTime > LOCK_TIMEOUT_MS) {
          throw new Error("Lock acquisition timeout");
        }

        // Check if lock exists
        if (existsSync(this.lockPath)) {
          try {
            const lockContent = await readFile(this.lockPath, "utf-8");
            const lockInfo: LockInfo = JSON.parse(lockContent);

            // Check if lock is stale (holder may have crashed)
            if (Date.now() - lockInfo.timestamp > LOCK_STALE_MS) {
              // Remove stale lock
              await this.releaseLock();
              continue; // Retry immediately
            }
          } catch {
            // If we can't read lock file, try to remove it
            await this.releaseLock();
            continue;
          }

          // Lock is valid, wait and retry
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Try to create lock atomically using exclusive flag
        const lockInfo: LockInfo = {
          pid: process.pid,
          timestamp: Date.now(),
        };

        // Use exclusive write (fails if file exists)
        const { open } = await import("fs/promises");
        const handle = await open(this.lockPath, "wx");
        await handle.writeFile(JSON.stringify(lockInfo), "utf-8");
        await handle.close();

        // Lock acquired successfully
        return;
      } catch (error: unknown) {
        // Check for file exists error (race condition - someone else got the lock)
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EEXIST"
        ) {
          // Wait and retry
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Check timeout on other errors
        if (Date.now() - startTime > LOCK_TIMEOUT_MS) {
          throw new Error("Lock acquisition timeout");
        }

        // Retry on other errors
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  /**
   * Release file lock
   */
  private async releaseLock(): Promise<void> {
    if (existsSync(this.lockPath)) {
      try {
        const { unlink } = await import("fs/promises");
        await unlink(this.lockPath);
      } catch {
        // Ignore errors (file might already be deleted)
      }
    }
  }
}

/**
 * Type guard for QraftBoxSessionRegistry
 */
function isQraftBoxSessionRegistry(
  value: unknown,
): value is QraftBoxSessionRegistry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (!Array.isArray(obj["sessions"])) {
    return false;
  }

  // Validate each session record
  return obj["sessions"].every((session: unknown) => {
    if (typeof session !== "object" || session === null) {
      return false;
    }

    const record = session as Record<string, unknown>;

    return (
      typeof record["sessionId"] === "string" &&
      typeof record["createdAt"] === "string" &&
      typeof record["projectPath"] === "string"
    );
  });
}
