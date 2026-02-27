/**
 * File Watcher
 *
 * Monitors a git repository for file changes using manual per-directory watching.
 * Skips symlinks and ignored directories to avoid ENOSPC errors.
 * Filters changes through gitignore and debounces events before emitting.
 */

import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import {
  existsSync,
  statSync,
  lstatSync,
  realpathSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
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
import { createLogger } from "../logger.js";

/**
 * Directory names to skip during directory walking and watching.
 * These directories are never watched at any depth to avoid FD/inotify exhaustion.
 */
const SKIP_WATCH_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  ".direnv",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".eggs",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".gradle",
  ".cache",
  "build",
  "bin",
  "out",
  "target",
  ".metadata",
  ".settings",
  ".vscode",
  ".idea",
]);

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
  let directoryWatchers = new Map<string, FSWatcher>();
  let gitignoreFilter: GitignoreFilter | undefined = undefined;
  let eventCollector: EventCollector<FileChangeEvent> | undefined = undefined;
  let isActive = false;
  let lastUpdate: number | null = null;
  let projectRealPath: string | undefined = undefined;
  let fileChangeHandlers: Array<(events: readonly FileChangeEvent[]) => void> =
    [];

  /**
   * Check if a relative path should be skipped during directory walking
   */
  function shouldSkipDirectory(relativePath: string): boolean {
    if (relativePath === "") {
      return false;
    }

    const normalizedPath = relativePath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);

    for (const segment of segments) {
      if (SKIP_WATCH_DIR_NAMES.has(segment)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a symlink points outside the project root
   */
  function isSymlinkOutsideProject(
    absolutePath: string,
    projectRealPathValue: string,
  ): boolean {
    try {
      const stats = lstatSync(absolutePath);
      if (!stats.isSymbolicLink()) {
        return false;
      }
      const realTarget = realpathSync(absolutePath);
      return (
        !realTarget.startsWith(`${projectRealPathValue}/`) &&
        realTarget !== projectRealPathValue
      );
    } catch {
      // If we can't check, skip it to be safe
      return true;
    }
  }

  /**
   * Walk directories and collect paths to watch.
   * Skips ignored directories and symlinks pointing outside the project.
   *
   * @param rootPath - Absolute path to start walking from
   * @param projectRealPathValue - Real path of project root (for symlink checking)
   * @param recursive - Whether to recurse into subdirectories
   * @returns Array of relative directory paths (including "" for root)
   */
  function walkDirectories(
    rootPath: string,
    projectRealPathValue: string,
    recursive: boolean,
  ): string[] {
    const result: string[] = [""];

    if (!recursive) {
      return result;
    }

    const queue: string[] = [""];

    while (queue.length > 0) {
      const currentRelativePath = queue.shift();
      if (currentRelativePath === undefined) {
        continue;
      }

      const currentAbsolutePath =
        currentRelativePath === ""
          ? rootPath
          : join(rootPath, currentRelativePath);

      let entries: ReturnType<typeof readdirSync>;
      try {
        entries = readdirSync(currentAbsolutePath, { withFileTypes: true });
      } catch (error) {
        logger.error("Failed to read directory during walk", error, {
          path: currentAbsolutePath,
        });
        continue;
      }

      for (const entry of entries) {
        const entryRelativePath =
          currentRelativePath === ""
            ? entry.name
            : `${currentRelativePath}/${entry.name}`;
        const entryAbsolutePath = join(currentAbsolutePath, entry.name);

        // Skip non-directories
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue;
        }

        // Skip if matches SKIP_WATCH_PREFIXES
        if (shouldSkipDirectory(entryRelativePath)) {
          logger.debug("Skipping ignored directory", {
            path: entryRelativePath,
          });
          continue;
        }

        // Skip symlinks pointing outside project
        if (isSymlinkOutsideProject(entryAbsolutePath, projectRealPathValue)) {
          logger.debug("Skipping external symlink", {
            path: entryRelativePath,
          });
          continue;
        }

        // Check if it's actually a directory after resolving symlinks
        try {
          const stats = statSync(entryAbsolutePath);
          if (stats.isDirectory()) {
            result.push(entryRelativePath);
            queue.push(entryRelativePath);
          }
        } catch (error) {
          logger.error("Failed to stat directory entry", error, {
            path: entryAbsolutePath,
          });
        }
      }
    }

    return result;
  }

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
   * Register a watcher for a specific directory
   */
  function registerDirectoryWatcher(
    watchDir: string,
    absolutePath: string,
  ): void {
    try {
      const watcher = watch(
        absolutePath,
        {
          recursive: false,
          persistent: true,
        },
        (eventType, filename) => {
          void handleFsWatchEvent(watchDir, eventType, filename);
        },
      );
      directoryWatchers.set(watchDir, watcher);
    } catch (error) {
      logger.error("Failed to register watcher for directory", error, {
        watchDir,
        absolutePath,
      });
    }
  }

  /**
   * Handle file change events from fs.watch
   *
   * @param watchDir - Relative directory path being watched
   * @param eventType - Type of fs.watch event
   * @param filename - Base name of changed file (not full path)
   */
  async function handleFsWatchEvent(
    watchDir: string,
    eventType: "rename" | "change",
    filename: string | null,
  ): Promise<void> {
    if (filename === null || !gitignoreFilter || !eventCollector) {
      return;
    }

    // Construct relative path from watchDir and filename
    const relativePath = watchDir === "" ? filename : `${watchDir}/${filename}`;

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
    const fullPath = join(projectPath, relativePath);
    const changeType = mapEventType(eventType, fullPath);

    // Handle new directory creation
    if (eventType === "rename" && changeType === "create") {
      try {
        const stats = statSync(fullPath);
        if (
          stats.isDirectory() &&
          !shouldSkipDirectory(relativePath) &&
          fullConfig.recursive &&
          projectRealPath !== undefined &&
          !isSymlinkOutsideProject(fullPath, projectRealPath)
        ) {
          // Register watcher for newly created directory
          logger.debug("Registering watcher for new directory", {
            relativePath,
          });
          registerDirectoryWatcher(relativePath, fullPath);
        }
      } catch {
        // If we can't stat, it might have been deleted already
      }
    }

    // Handle directory deletion
    if (eventType === "rename" && changeType === "delete") {
      // Check if this was a directory being watched
      const existingWatcher = directoryWatchers.get(relativePath);
      if (existingWatcher !== undefined) {
        logger.debug("Removing watcher for deleted directory", {
          relativePath,
        });
        existingWatcher.close();
        directoryWatchers.delete(relativePath);
      }

      // Also clean up any child watchers (nested directories)
      const prefixToRemove = `${relativePath}/`;
      for (const [watchedPath, watcher] of directoryWatchers.entries()) {
        if (watchedPath.startsWith(prefixToRemove)) {
          logger.debug("Removing watcher for deleted subdirectory", {
            path: watchedPath,
          });
          watcher.close();
          directoryWatchers.delete(watchedPath);
        }
      }
    }

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

    // Get real path for symlink checking
    try {
      projectRealPath = realpathSync(projectPath);
    } catch (error) {
      throw new Error(
        `Failed to resolve project path: ${error instanceof Error ? error.message : String(error)}`,
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

    // Walk directories to find paths to watch
    try {
      const directoriesToWatch = walkDirectories(
        projectPath,
        projectRealPath,
        fullConfig.recursive,
      );

      logger.debug("Starting file watcher", {
        projectPath,
        recursive: fullConfig.recursive,
        debounceMs: fullConfig.debounceMs,
        directoryCount: directoriesToWatch.length,
      });

      // Register non-recursive watchers for each directory
      for (const watchDir of directoriesToWatch) {
        const absolutePath =
          watchDir === "" ? projectPath : join(projectPath, watchDir);
        registerDirectoryWatcher(watchDir, absolutePath);
      }

      isActive = true;
      lastUpdate = Date.now();

      logger.debug("File watcher started", {
        projectPath,
        watchedDirectories: directoryWatchers.size,
      });
    } catch (error) {
      // Cleanup on failure
      for (const watcher of directoryWatchers.values()) {
        watcher.close();
      }
      directoryWatchers.clear();

      if (eventCollector) {
        eventCollector.dispose();
        eventCollector = undefined;
      }
      gitignoreFilter = undefined;
      projectRealPath = undefined;

      throw new Error(
        `Failed to start file watcher: ${error instanceof Error ? error.message : String(error)}`,
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

    // Stop all directory watchers
    for (const watcher of directoryWatchers.values()) {
      watcher.close();
    }
    directoryWatchers.clear();

    // Flush any pending events
    if (eventCollector) {
      eventCollector.flush();
      eventCollector.dispose();
      eventCollector = undefined;
    }

    gitignoreFilter = undefined;
    projectRealPath = undefined;
    isActive = false;
    logger.debug("File watcher stopped", { projectPath });
  }

  /**
   * Get current watcher status
   */
  function getStatus(): WatcherStatus {
    return {
      enabled: isActive,
      watchedPaths: directoryWatchers.size,
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
