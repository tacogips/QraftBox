/**
 * WebSocket Broadcast for File Watcher
 *
 * Bridges FileWatcher events to WebSocket broadcast, enabling real-time
 * file change notifications to connected clients.
 */

import type { FileChangeEvent } from "../../types/watcher.js";
import type { FileWatcher } from "./index.js";
import type { WebSocketManager } from "../websocket/index.js";
import { createLogger } from "../logger.js";

/**
 * Watcher broadcaster interface
 *
 * Manages lifecycle of broadcasting file change events from FileWatcher to WebSocket clients.
 */
export interface WatcherBroadcaster {
  /**
   * Start broadcasting file change events
   *
   * Registers handler on FileWatcher to receive file change events.
   * Events are formatted and broadcast to all WebSocket clients.
   */
  start(): void;

  /**
   * Stop broadcasting file change events
   *
   * Prevents further broadcasts but does not unregister the handler
   * (handler registration is permanent for the lifetime of FileWatcher).
   */
  stop(): void;
}

/**
 * File change broadcast data format
 *
 * Wrapper for file change events sent via WebSocket.
 */
export interface FileChangeBroadcast {
  readonly changes: readonly FileChangeEvent[];
}

/**
 * Create watcher broadcaster
 *
 * Factory function to create a broadcaster that bridges FileWatcher events
 * to WebSocket broadcast. The broadcaster registers a handler on the FileWatcher
 * that formats and broadcasts events to all connected WebSocket clients.
 *
 * The "file-change" event is broadcast with data: { changes: FileChangeEvent[] }.
 *
 * @param watcher - FileWatcher instance to listen to
 * @param wsManager - WebSocketManager instance for broadcasting
 * @returns WatcherBroadcaster instance
 *
 * @example
 * ```typescript
 * const watcher = createFileWatcher('/path/to/repo');
 * const wsManager = createWebSocketManager();
 * const broadcaster = createWatcherBroadcaster(watcher, wsManager);
 *
 * broadcaster.start();
 * await watcher.start();
 *
 * // File changes are now broadcast to all WebSocket clients
 *
 * broadcaster.stop();
 * await watcher.stop();
 * ```
 */
export function createWatcherBroadcaster(
  watcher: FileWatcher,
  wsManager: WebSocketManager,
): WatcherBroadcaster {
  const logger = createLogger("WatcherBroadcaster");
  let isActive = false;

  /**
   * Handle file change events from FileWatcher
   *
   * Formats events and broadcasts to WebSocket clients when active.
   */
  function handleFileChanges(events: readonly FileChangeEvent[]): void {
    // Only broadcast if active
    if (!isActive) {
      return;
    }

    // Skip empty event arrays
    if (events.length === 0) {
      return;
    }

    // Format and broadcast
    const broadcast: FileChangeBroadcast = {
      changes: events,
    };

    try {
      wsManager.broadcast("file-change", broadcast);
    } catch (error) {
      logger.error("Failed to broadcast file changes", error, {
        eventCount: events.length,
      });
    }
  }

  // Register handler immediately (permanent for watcher lifetime)
  watcher.onFileChange(handleFileChanges);

  return {
    start(): void {
      if (isActive) {
        logger.debug("Start called while already active");
        return;
      }
      isActive = true;
      logger.debug("Started broadcasting file changes");
    },

    stop(): void {
      if (!isActive) {
        return;
      }
      isActive = false;
      logger.debug("Stopped broadcasting file changes");
    },
  };
}
