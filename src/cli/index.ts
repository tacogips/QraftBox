/**
 * CLI Entry Point
 *
 * Provides CLI argument parsing, browser opening, and shutdown handlers
 * for the qraftbox server application.
 */

import { Command } from "commander";
import type { CLIConfig, SyncMode } from "../types/index";
import { loadConfig, validateConfig } from "./config";
import { createContextManager } from "../server/workspace/context-manager";
import { createServer, startServer } from "../server/index";
import { createWebSocketManager } from "../server/websocket/index.js";
import { createFileWatcher } from "../server/watcher/index.js";
import type { FileWatcher } from "../server/watcher/index.js";
import { createWatcherBroadcaster } from "../server/watcher/broadcast.js";
import type { WatcherBroadcaster } from "../server/watcher/broadcast.js";
import { createRecentDirectoryStore } from "../server/workspace/recent-store";
import { createLogger } from "../server/logger";

const logger = createLogger("CLI");

/**
 * Parse command-line arguments into CLIConfig
 *
 * Uses commander library to parse CLI arguments including:
 * - --port: Server port (default: 7144)
 * - --host: Server host (default: "localhost")
 * - --open/--no-open: Open browser automatically (default: true)
 * - --watch/--no-watch: Enable file watching (default: true)
 * - --sync-mode: Git sync mode (default: "manual")
 * - --ai/--no-ai: Enable AI features (default: true)
 * - [projectPath]: Positional argument for project path (default: ".")
 *
 * @param args - Command-line arguments (e.g., process.argv)
 * @returns Parsed CLI configuration
 *
 * @example
 * ```typescript
 * const config = parseArgs(process.argv);
 * console.log(config.port); // 7144
 * ```
 */
export function parseArgs(args: string[]): CLIConfig {
  const program = new Command();

  program
    .name("qraftbox")
    .description(
      "All You Need Is Diff - Local diff viewer with git integration",
    )
    .version("0.1.0")
    .argument("[projectPath]", "Path to project directory", ".")
    .option("-p, --port <number>", "Server port", "7144")
    .option("-h, --host <string>", "Server host", "localhost")
    .option("--open", "Open browser automatically")
    .option("--watch", "Enable file watching (default: true)")
    .option("--no-watch", "Disable file watching")
    .option(
      "-s, --sync-mode <mode>",
      "Git sync mode: manual, auto-push, auto-pull, auto",
      "manual",
    )
    .option("--ai", "Enable AI features (default: true)")
    .option("--no-ai", "Disable AI features")
    .option(
      "--assistant-additional-args <args>",
      "Additional CLI arguments for AI assistant (comma-separated)",
    )
    .option(
      "-d, --project-dir <paths...>",
      "Project directories to open at startup",
    );

  program.parse(args);

  const options = program.opts();
  const projectPath = program.args[0] ?? ".";

  // Parse port as number
  const port = parseInt(options["port"], 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${options["port"]}`);
  }

  // Validate sync mode
  const validSyncModes: SyncMode[] = [
    "manual",
    "auto-push",
    "auto-pull",
    "auto",
  ];
  const syncMode = options["syncMode"] as SyncMode;
  if (!validSyncModes.includes(syncMode)) {
    throw new Error(
      `Invalid sync mode: ${options["syncMode"]}. Must be one of: ${validSyncModes.join(", ")}`,
    );
  }

  // Parse project directories
  const projectDirs: string[] =
    options["projectDir"] !== undefined
      ? Array.isArray(options["projectDir"])
        ? (options["projectDir"] as string[])
        : [options["projectDir"] as string]
      : [];

  return {
    port,
    host: options["host"],
    open: options["open"] ?? false,
    watch: options["watch"] ?? true,
    syncMode,
    ai: options["ai"] ?? true,
    projectPath,
    promptModel: options["promptModel"] ?? "claude-opus-4-6",
    assistantModel: options["assistantModel"] ?? "claude-opus-4-6",
    assistantAdditionalArgs:
      options["assistantAdditionalArgs"] !== undefined
        ? (options["assistantAdditionalArgs"] as string).split(",")
        : ["--dangerously-skip-permissions"],
    projectDirs,
  };
}

/**
 * Open browser with the specified URL
 *
 * Uses Bun.spawn to open the default browser based on platform detection:
 * - Linux: xdg-open
 * - macOS: open
 * - Windows: start
 *
 * This is a best-effort operation. Failures are silently ignored since
 * browser opening is optional functionality.
 *
 * @param url - URL to open in the browser
 * @returns Promise that resolves when browser command is spawned
 *
 * @example
 * ```typescript
 * await openBrowser('http://localhost:7144');
 * ```
 */
export async function openBrowser(url: string): Promise<void> {
  // Detect platform
  const platform = process.platform;

  let command: string;
  let args: string[];

  if (platform === "darwin") {
    // macOS
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    // Windows
    command = "cmd";
    args = ["/c", "start", url];
  } else {
    // Linux and others
    command = "xdg-open";
    args = [url];
  }

  try {
    const proc = Bun.spawn([command, ...args], {
      stdout: "ignore",
      stderr: "ignore",
    });

    // Wait for the process to exit (don't care about exit code)
    await proc.exited;
  } catch (e) {
    // Silently ignore errors - browser opening is best-effort
    // User can manually navigate to the URL if this fails
  }
}

/**
 * Setup signal handlers for graceful shutdown
 *
 * Registers handlers for SIGINT (Ctrl+C) and SIGTERM signals.
 * When a signal is received:
 * 1. Call the provided cleanup function
 * 2. Exit the process with code 0
 *
 * @param cleanup - Async cleanup function to call before exit
 *
 * @example
 * ```typescript
 * setupShutdownHandlers(async () => {
 *   console.log('Cleaning up...');
 *   await server.stop();
 * });
 * ```
 */
export function setupShutdownHandlers(cleanup: () => Promise<void>): void {
  const handleShutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      await cleanup();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (e) {
      logger.error("Error during shutdown", e);
      process.exit(1);
    }
  };

  // Register signal handlers
  process.on("SIGINT", () => {
    void handleShutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void handleShutdown("SIGTERM");
  });
}

/**
 * Main entry point for the qraftbox CLI application
 *
 * Orchestrates the startup sequence:
 * 1. Parse command-line arguments
 * 2. Load configuration
 * 3. Create WebSocket manager for real-time updates
 * 4. Start server with WebSocket support
 * 5. Start file watcher if enabled
 * 6. Setup shutdown handlers
 * 7. Open browser if requested
 *
 * @returns Promise that resolves when startup is complete
 */
export async function main(): Promise<void> {
  let watcher: FileWatcher | undefined = undefined;
  let broadcaster: WatcherBroadcaster | undefined = undefined;

  try {
    // Parse CLI arguments
    const cliConfig = parseArgs(process.argv);

    // Validate and resolve config
    const config = loadConfig(cliConfig);
    const validation = validateConfig(config);
    if (!validation.valid) {
      logger.error(`Invalid configuration: ${validation.error}`);
      process.exit(1);
    }

    logger.info("qraftbox - All You Need Is Diff");
    logger.info(`Starting server on ${config.host}:${config.port}...`);
    logger.info(`Project path: ${config.projectPath}`);
    logger.info(`Sync mode: ${config.syncMode}`);
    logger.info(`AI features: ${config.ai ? "enabled" : "disabled"}`);
    logger.info(`File watching: ${config.watch ? "enabled" : "disabled"}`);

    // Create context manager
    const contextManager = createContextManager();

    // Create recent store for persistent tracking
    const recentStore = createRecentDirectoryStore();

    // Determine which project directories to open
    let dirsToOpen = [...config.projectDirs];

    // If no --project-dir specified, restore the most recent project
    if (dirsToOpen.length === 0) {
      const recentDirs = await recentStore.getAll();
      const mostRecent = recentDirs[0];
      if (mostRecent !== undefined) {
        logger.info(`Restoring previous project: ${mostRecent.path}`);
        dirsToOpen.push(mostRecent.path);
      }
    }

    // Create contexts for project directories
    for (const dir of dirsToOpen) {
      try {
        const tab = await contextManager.createContext(dir);
        await recentStore.add({
          path: tab.path,
          name: tab.name,
          lastOpened: Date.now(),
          isGitRepo: tab.isGitRepo,
        });
      } catch (e) {
        logger.error(`Failed to open project directory: ${dir}`, e);
      }
    }

    // Create WebSocket manager for realtime updates
    const wsManager = createWebSocketManager();

    // Create and start the HTTP server with WebSocket support
    const app = createServer({ config, contextManager, recentStore });
    const server = startServer(app, config, wsManager);

    logger.info(`Server started on http://${server.hostname}:${server.port}`);

    // Start file watcher for realtime updates
    if (config.watch) {
      watcher = createFileWatcher(config.projectPath);
      broadcaster = createWatcherBroadcaster(watcher, wsManager);
      broadcaster.start();
      await watcher.start();
      logger.info(
        `File watching: enabled (WebSocket at ws://${server.hostname}:${server.port}/ws)`,
      );
    }

    // Setup graceful shutdown
    setupShutdownHandlers(async () => {
      // Stop watcher if active
      if (watcher !== undefined) {
        await watcher.stop();
      }
      if (broadcaster !== undefined) {
        broadcaster.stop();
      }
      wsManager.close();
      server.stop();
    });

    // Open browser if requested
    if (config.open) {
      await openBrowser(`http://${server.hostname}:${server.port}`);
    }
  } catch (e) {
    logger.error("Failed to start server", e);
    process.exit(1);
  }
}
