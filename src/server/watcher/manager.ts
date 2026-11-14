/**
 * Project Watcher Manager
 *
 * Manages multiple FileWatcher instances, one per project path.
 * When any watcher detects changes, events are broadcast via the shared WebSocketManager.
 */

import type { FileWatcher } from "./index.js";
import { createFileWatcher } from "./index.js";
import {
  createWatcherBroadcaster,
  type WatcherBroadcaster,
} from "./broadcast.js";
import type { WebSocketManager } from "../websocket/index.js";
import { createLogger } from "../logger.js";

/**
 * Project watcher manager interface
 *
 * Manages lifecycle of multiple FileWatcher instances across different project paths.
 * Each project path gets its own watcher, and all watchers broadcast to the same
 * WebSocketManager, enabling real-time file change notifications for all active projects.
 */
export interface ProjectWatcherManager {
  /**
   * Add a project path to watch
   *
   * Creates a new FileWatcher and WatcherBroadcaster for the project if not already watched.
   * If the path is already being watched, this is a no-op.
   *
   * @param projectPath - Absolute path to project root
   */
  addProject(projectPath: string): Promise<void>;

  /**
   * Remove a project path from watching
   *
   * Stops the watcher and broadcaster for the project if it exists.
   * If the path is not being watched, this is a no-op.
   *
   * @param projectPath - Absolute path to project root
   */
  removeProject(projectPath: string): Promise<void>;

  /**
   * Stop all watchers and clean up
   *
   * Stops all active watchers and broadcasters. Should be called during server shutdown.
   */
  stopAll(): Promise<void>;
}

/**
 * Watcher entry for a single project
 */
interface WatcherEntry {
  readonly watcher: FileWatcher;
  readonly broadcaster: WatcherBroadcaster;
}

/**
 * Create project watcher manager
 *
 * Factory function to create a manager that handles multiple FileWatcher instances.
 * Each project path gets its own watcher, and all watchers share the same WebSocketManager
 * for broadcasting events.
 *
 * @param wsManager - WebSocket manager for broadcasting file change events
 * @returns ProjectWatcherManager instance
 *
 * @example
 * ```typescript
 * const wsManager = createWebSocketManager();
 * const watcherManager = createProjectWatcherManager(wsManager);
 *
 * await watcherManager.addProject('/path/to/project1');
 * await watcherManager.addProject('/path/to/project2');
 *
 * // Later, during shutdown
 * await watcherManager.stopAll();
 * ```
 */
export function createProjectWatcherManager(
  wsManager: WebSocketManager,
): ProjectWatcherManager {
  const logger = createLogger("ProjectWatcherManager");
  const watchers = new Map<string, WatcherEntry>();

  async function addProject(projectPath: string): Promise<void> {
    if (watchers.has(projectPath)) {
      logger.debug("Project already being watched", { projectPath });
      return;
    }

    try {
      const watcher = createFileWatcher(projectPath);
      const broadcaster = createWatcherBroadcaster(watcher, wsManager);
      broadcaster.start();
      await watcher.start();
      watchers.set(projectPath, { watcher, broadcaster });
      logger.info("Started watching project", { projectPath });
    } catch (error) {
      logger.error("Failed to start watcher for project", error, {
        projectPath,
      });
    }
  }

  async function removeProject(projectPath: string): Promise<void> {
    const entry = watchers.get(projectPath);
    if (entry === undefined) {
      logger.debug("Project not being watched", { projectPath });
      return;
    }

    entry.broadcaster.stop();
    await entry.watcher.stop();
    watchers.delete(projectPath);
    logger.info("Stopped watching project", { projectPath });
  }

  async function stopAll(): Promise<void> {
    logger.info("Stopping all watchers", { count: watchers.size });
    for (const [projectPath, entry] of watchers) {
      entry.broadcaster.stop();
      await entry.watcher.stop();
      logger.debug("Stopped watcher", { projectPath });
    }
    watchers.clear();
    logger.info("All watchers stopped");
  }

  return { addProject, removeProject, stopAll };
}
