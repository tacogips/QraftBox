/**
 * WebSocket Manager for Real-Time Updates
 *
 * Manages WebSocket connections for broadcasting updates to connected clients.
 * Uses Bun's native WebSocket API with ServerWebSocket<T> type.
 */

import type { ServerWebSocket } from "bun";

/**
 * WebSocket client information
 *
 * Tracks connected client with ID and connection metadata.
 */
export interface WebSocketClient {
  readonly id: string;
  readonly ws: ServerWebSocket<unknown>;
  readonly connectedAt: number;
}

/**
 * WebSocket message format
 *
 * Standard message structure sent to/from clients.
 */
export interface WebSocketMessage {
  readonly event: string;
  readonly data: unknown;
}

/**
 * WebSocket manager interface
 *
 * Provides methods for handling WebSocket connections and broadcasting messages.
 */
export interface WebSocketManager {
  /**
   * Handle new WebSocket connection
   *
   * @param ws - WebSocket connection from Bun server
   */
  handleOpen(ws: ServerWebSocket<unknown>): void;

  /**
   * Handle WebSocket disconnection
   *
   * @param ws - WebSocket connection being closed
   */
  handleClose(ws: ServerWebSocket<unknown>): void;

  /**
   * Handle incoming WebSocket message
   *
   * @param ws - WebSocket connection
   * @param message - Message string or buffer
   */
  handleMessage(ws: ServerWebSocket<unknown>, message: string | Buffer): void;

  /**
   * Broadcast message to all connected clients
   *
   * Sends JSON message { event, data } to all clients with readyState === OPEN.
   * Skips clients that are not in OPEN state.
   *
   * @param event - Event name
   * @param data - Event data
   */
  broadcast(event: string, data: unknown): void;

  /**
   * Get number of connected clients
   *
   * @returns Current client count
   */
  getClientCount(): number;

  /**
   * Close all WebSocket connections
   *
   * Closes all connected clients and clears tracking map.
   */
  close(): void;
}

/**
 * Create WebSocket manager
 *
 * Factory function to create a new WebSocket manager instance.
 * Tracks clients using WeakMap for ws->id mapping and Map for client storage.
 *
 * Usage with Bun.serve():
 * ```typescript
 * const wsManager = createWebSocketManager();
 *
 * Bun.serve({
 *   port: 3000,
 *   websocket: {
 *     open(ws) {
 *       wsManager.handleOpen(ws);
 *     },
 *     close(ws) {
 *       wsManager.handleClose(ws);
 *     },
 *     message(ws, message) {
 *       wsManager.handleMessage(ws, message);
 *     },
 *   },
 *   fetch(req, server) {
 *     // Handle WebSocket upgrades
 *     if (server.upgrade(req)) {
 *       return;
 *     }
 *     // Handle HTTP requests
 *     return new Response("Not found", { status: 404 });
 *   },
 * });
 * ```
 *
 * @returns WebSocket manager instance
 */
export function createWebSocketManager(): WebSocketManager {
  // Map WebSocket to client ID (weakly referenced to allow GC)
  const wsToId = new WeakMap<ServerWebSocket<unknown>, string>();

  // Map client ID to client info (strong reference for tracking)
  const clients = new Map<string, WebSocketClient>();

  return {
    handleOpen(ws: ServerWebSocket<unknown>): void {
      const id = crypto.randomUUID();
      const client: WebSocketClient = {
        id,
        ws,
        connectedAt: Date.now(),
      };

      wsToId.set(ws, id);
      clients.set(id, client);

      console.log(
        `[WebSocket] Client connected: ${id} (total: ${clients.size})`,
      );
    },

    handleClose(ws: ServerWebSocket<unknown>): void {
      const id = wsToId.get(ws);
      if (id !== undefined) {
        clients.delete(id);
        console.log(
          `[WebSocket] Client disconnected: ${id} (total: ${clients.size})`,
        );
      }
    },

    handleMessage(
      ws: ServerWebSocket<unknown>,
      message: string | Buffer,
    ): void {
      try {
        // Parse JSON message
        const messageStr =
          typeof message === "string" ? message : message.toString();
        const parsed = JSON.parse(messageStr) as WebSocketMessage;

        // Handle ping-pong
        if (parsed.event === "ping") {
          const response: WebSocketMessage = {
            event: "pong",
            data: parsed.data,
          };
          ws.send(JSON.stringify(response));
          return;
        }

        // Log other messages for debugging
        const id = wsToId.get(ws);
        console.log(
          `[WebSocket] Message from ${id ?? "unknown"}: ${parsed.event}`,
        );
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        console.error(`[WebSocket] Failed to parse message: ${errorMessage}`);
      }
    },

    broadcast(event: string, data: unknown): void {
      const message: WebSocketMessage = { event, data };
      const messageStr = JSON.stringify(message);

      let sentCount = 0;
      let skippedCount = 0;

      for (const client of clients.values()) {
        // Only send to clients with OPEN readyState (1)
        if (client.ws.readyState === 1) {
          try {
            client.ws.send(messageStr);
            sentCount++;
          } catch (e) {
            const errorMessage =
              e instanceof Error ? e.message : "Unknown error";
            console.error(
              `[WebSocket] Failed to send to ${client.id}: ${errorMessage}`,
            );
          }
        } else {
          skippedCount++;
        }
      }

      console.log(
        `[WebSocket] Broadcast ${event}: sent=${sentCount}, skipped=${skippedCount}`,
      );
    },

    getClientCount(): number {
      return clients.size;
    },

    close(): void {
      console.log(
        `[WebSocket] Closing all connections (${clients.size} clients)`,
      );

      for (const client of clients.values()) {
        try {
          client.ws.close();
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : "Unknown error";
          console.error(
            `[WebSocket] Failed to close ${client.id}: ${errorMessage}`,
          );
        }
      }

      clients.clear();
      console.log("[WebSocket] All connections closed");
    },
  };
}
