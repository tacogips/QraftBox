/**
 * Watcher Types for the qraftbox file watching system
 *
 * This module defines types for monitoring file system changes with
 * gitignore-aware filtering and debouncing capabilities.
 */

/**
 * Type of file change event
 */
export type FileChangeType = "create" | "modify" | "delete";

/**
 * A single file change event
 *
 * Represents a detected file system change with timestamp for ordering.
 */
export interface FileChangeEvent {
  readonly type: FileChangeType;
  readonly path: string;
  readonly timestamp: number;
}

/**
 * Current status of the file watcher
 *
 * Tracks watcher state including enabled status and activity metrics.
 */
export interface WatcherStatus {
  readonly enabled: boolean;
  readonly watchedPaths: number;
  readonly lastUpdate: number | null;
}

/**
 * Configuration for the file watcher
 *
 * Controls watcher behavior including debouncing, recursion, and gitignore filtering.
 */
export interface WatcherConfig {
  readonly debounceMs: number;
  readonly recursive: boolean;
  readonly ignoreGitignored: boolean;
}

/**
 * Type guard to check if a string is a valid FileChangeType
 *
 * @param value - String to check
 * @returns True if value is a valid FileChangeType
 */
export function isFileChangeType(value: string): value is FileChangeType {
  return value === "create" || value === "modify" || value === "delete";
}

/**
 * Create a default WatcherConfig
 *
 * @returns Default watcher configuration with sensible defaults
 */
export function createDefaultWatcherConfig(): WatcherConfig {
  return {
    debounceMs: 100,
    recursive: true,
    ignoreGitignored: true,
  };
}

/**
 * Create a FileChangeEvent
 *
 * @param type - Type of file change
 * @param path - Path to the changed file
 * @returns A new FileChangeEvent with current timestamp
 */
export function createFileChangeEvent(
  type: FileChangeType,
  path: string,
): FileChangeEvent {
  return {
    type,
    path,
    timestamp: Date.now(),
  };
}

/**
 * Check if watcher is active
 *
 * A watcher is considered active if it is enabled and has at least one watched path.
 *
 * @param status - WatcherStatus to check
 * @returns True if watcher is enabled and watching paths
 */
export function isWatcherActive(status: WatcherStatus): boolean {
  return status.enabled && status.watchedPaths > 0;
}

/**
 * Create an inactive WatcherStatus
 *
 * @returns WatcherStatus representing an inactive watcher
 */
export function createInactiveWatcherStatus(): WatcherStatus {
  return {
    enabled: false,
    watchedPaths: 0,
    lastUpdate: null,
  };
}

/**
 * Create an active WatcherStatus
 *
 * @param watchedPaths - Number of paths being watched (default: 1)
 * @returns WatcherStatus representing an active watcher
 */
export function createActiveWatcherStatus(watchedPaths = 1): WatcherStatus {
  if (watchedPaths < 0) {
    throw new Error("watchedPaths must be non-negative");
  }

  return {
    enabled: true,
    watchedPaths,
    lastUpdate: Date.now(),
  };
}

/**
 * Update the last update timestamp for a watcher status
 *
 * @param status - The status to update
 * @returns Updated status with new lastUpdate timestamp
 */
export function updateWatcherLastUpdate(status: WatcherStatus): WatcherStatus {
  return {
    ...status,
    lastUpdate: Date.now(),
  };
}

/**
 * Merge partial WatcherConfig with defaults
 *
 * @param partial - Partial configuration to merge
 * @returns Complete WatcherConfig with defaults for missing fields
 */
export function mergeWatcherConfig(
  partial: Partial<WatcherConfig>,
): WatcherConfig {
  const defaults = createDefaultWatcherConfig();

  return {
    debounceMs: partial.debounceMs ?? defaults.debounceMs,
    recursive: partial.recursive ?? defaults.recursive,
    ignoreGitignored: partial.ignoreGitignored ?? defaults.ignoreGitignored,
  };
}

/**
 * Validate debounce milliseconds value
 *
 * @param ms - Debounce value to validate
 * @returns True if valid (0 or positive)
 */
export function isValidDebounceMs(ms: number): boolean {
  return ms >= 0 && Number.isFinite(ms);
}
