/**
 * File Watcher
 *
 * Monitors a git repository for file changes using fs.watch in recursive mode.
 * Filters changes through gitignore and debounces events before emitting.
 */

import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import type {
  FileChangeEvent,
  FileChangeType,
  WatcherConfig,
  WatcherStatus,
} from "../../types/watcher.js";
import {
  createFileChangeEvent,
  mergeWatcherConfig,
} from "../../types/watcher.js";
import type { GitignoreFilter } from "./gitignore.js";
import { createGitignoreFilter } from "./gitignore.js";
import type { EventCollector } from "./debounce.js";
import { createEventCollector } from "./debounce.js";
import { existsSync, statSync } from "node:fs";
import { createLogger } from "../logger.js";

/**
 * File watcher interface for monitoring file system changes
 */
export interface FileWatcher {
  /**
   * Start watching for file changes
   * @throws Error if watcher is already started or projectPath is invalid
   */
  start(): Promise<void>;

  /**
   * Stop watching for file changes
   */
  stop(): Promise<void>;

  /**
   * Get current watcher status
   */
  getStatus(): WatcherStatus;

  /**
   * Register a handler for file change events
   * Handler receives batched and debounced events
   *
   * @param handler - Function called with array of file change events
   */
  onFileChange(handler: (events: readonly FileChangeEvent[]) => void): void;
}

/**
 * Create a file watcher for monitoring a git repository
 *
 * @param projectPath - Absolute path to project root (git repository)
 * @param config - Optional partial configuration (merged with defaults)
 * @returns FileWatcher instance
 *
 * @example
 * ```typescript
 * const watcher = createFileWatcher('/path/to/repo', {
 *   debounceMs: 200,
 *   ignoreGitignored: true,
 * });
 *
 * watcher.onFileChange((events) => {
 *   console.log('Files changed:', events);
 * });
 *
 * await watcher.start();
 * // Later...
 * await watcher.stop();
 * ```
 */
export function createFileWatcher(
  projectPath: string,
  config?: Partial<WatcherConfig>,
): FileWatcher {
  const logger = createLogger("FileWatcher");
  const fullConfig = mergeWatcherConfig(config ?? {});
  let fsWatcher: FSWatcher | undefined = undefined;
  let gitignoreFilter: GitignoreFilter | undefined = undefined;
  let eventCollector: EventCollector<FileChangeEvent> | undefined = undefined;
  let isActive = false;
  let lastUpdate: number | null = null;
  let fileChangeHandlers: Array<(events: readonly FileChangeEvent[]) => void> =
    [];

  /**
   * Map fs.watch event types to FileChangeType
   */
  function mapEventType(
    eventType: "rename" | "change",
    filePath: string,
  ): FileChangeType {
    // Check if file exists to distinguish create from delete
    try {
      const exists = existsSync(filePath);
      if (eventType === "rename") {
        return exists ? "create" : "delete";
      }
      return "modify";
    } catch {
      // If we can't stat, assume it's a delete for rename, modify for change
      return eventType === "rename" ? "delete" : "modify";
    }
  }

  /**
   * Handle file change events from fs.watch
   */
  async function handleFsWatchEvent(
    eventType: "rename" | "change",
    filename: string | null,
  ): Promise<void> {
    if (filename === null || !gitignoreFilter || !eventCollector) {
      return;
    }

    // Construct full path relative to project root
    const relativePath = filename;

    // Check if file should be ignored
    try {
      const shouldIgnore =
        fullConfig.ignoreGitignored &&
        (await gitignoreFilter.isIgnored(relativePath));

      if (shouldIgnore) {
        return;
      }
    } catch (error) {
      // If gitignore check fails, log and skip this event
      logger.error("Failed to evaluate gitignore", error, { relativePath });
      return;
    }

    // Determine the change type
    const fullPath = `${projectPath}/${relativePath}`;
    const changeType = mapEventType(eventType, fullPath);

    // Create and add event to collector
    const event = createFileChangeEvent(changeType, relativePath);
    eventCollector.add(event);
  }

  /**
   * Handle batched events from event collector
   */
  function handleBatchedEvents(events: readonly FileChangeEvent[]): void {
    if (events.length === 0) {
      return;
    }

    lastUpdate = Date.now();

    // Call all registered handlers
    for (const handler of fileChangeHandlers) {
      try {
        handler(events);
      } catch (error) {
        logger.error("Error in file change handler", error);
      }
    }
  }

  /**
   * Start watching for file changes
   */
  async function start(): Promise<void> {
    if (isActive) {
      throw new Error("Watcher is already started");
    }

    // Validate project path
    if (!existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    try {
      const stats = statSync(projectPath);
      if (!stats.isDirectory()) {
        throw new Error(`Project path is not a directory: ${projectPath}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to access project path: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Initialize gitignore filter
    gitignoreFilter = createGitignoreFilter(projectPath);

    // Initialize event collector
    eventCollector = createEventCollector<FileChangeEvent>(
      handleBatchedEvents,
      fullConfig.debounceMs,
      (event) => event.path, // Deduplicate by path
    );

    // Start fs.watch
    try {
      fsWatcher = watch(
        projectPath,
        {
          recursive: fullConfig.recursive,
          persistent: true,
        },
        (eventType, filename) => {
          // Handle event asynchronously
          void handleFsWatchEvent(eventType, filename);
        },
      );

      isActive = true;
      lastUpdate = Date.now();
      logger.debug("File watcher started", {
        projectPath,
        recursive: fullConfig.recursive,
        debounceMs: fullConfig.debounceMs,
      });
    } catch (error) {
      // Cleanup on failure
      if (eventCollector) {
        eventCollector.dispose();
        eventCollector = undefined;
      }
      gitignoreFilter = undefined;
      throw new Error(
        `Failed to start fs.watch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Stop watching for file changes
   */
  async function stop(): Promise<void> {
    if (!isActive) {
      return;
    }

    // Stop fs.watch
    if (fsWatcher) {
      fsWatcher.close();
      fsWatcher = undefined;
    }

    // Flush any pending events
    if (eventCollector) {
      eventCollector.flush();
      eventCollector.dispose();
      eventCollector = undefined;
    }

    gitignoreFilter = undefined;
    isActive = false;
    logger.debug("File watcher stopped", { projectPath });
  }

  /**
   * Get current watcher status
   */
  function getStatus(): WatcherStatus {
    return {
      enabled: isActive,
      watchedPaths: isActive ? 1 : 0,
      lastUpdate,
    };
  }

  /**
   * Register a file change handler
   */
  function onFileChange(
    handler: (events: readonly FileChangeEvent[]) => void,
  ): void {
    fileChangeHandlers.push(handler);
  }

  return {
    start,
    stop,
    getStatus,
    onFileChange,
  };
}
