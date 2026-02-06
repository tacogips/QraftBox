/**
 * CLI Entry Point
 *
 * Provides CLI argument parsing, browser opening, and shutdown handlers
 * for the aynd server application.
 */

import { Command } from "commander";
import type { CLIConfig, SyncMode } from "../types/index";

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
    .name("aynd")
    .description(
      "All You Need Is Diff - Local diff viewer with git integration",
    )
    .version("0.1.0")
    .argument("[projectPath]", "Path to project directory", ".")
    .option("-p, --port <number>", "Server port", "7144")
    .option("-h, --host <string>", "Server host", "localhost")
    .option("--open", "Open browser automatically (default: true)")
    .option("--no-open", "Do not open browser automatically")
    .option("--watch", "Enable file watching (default: true)")
    .option("--no-watch", "Disable file watching")
    .option(
      "-s, --sync-mode <mode>",
      "Git sync mode: manual, auto-push, auto-pull, auto",
      "manual",
    )
    .option("--ai", "Enable AI features (default: true)")
    .option("--no-ai", "Disable AI features");

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

  return {
    port,
    host: options["host"],
    open: options["open"] ?? true,
    watch: options["watch"] ?? true,
    syncMode,
    ai: options["ai"] ?? true,
    projectPath,
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
    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    try {
      await cleanup();
      console.log("Shutdown complete");
      process.exit(0);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Error during shutdown: ${errorMessage}`);
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
 * Main entry point for the aynd CLI application
 *
 * Orchestrates the startup sequence:
 * 1. Parse command-line arguments
 * 2. Load configuration
 * 3. Start server
 * 4. Setup shutdown handlers
 * 5. Open browser if requested
 *
 * This is a placeholder implementation that will be wired up once
 * other modules (config, server) are implemented.
 *
 * @returns Promise that resolves when startup is complete
 */
export async function main(): Promise<void> {
  try {
    // Parse CLI arguments
    const cliConfig = parseArgs(process.argv);

    console.log("aynd - All You Need Is Diff");
    console.log(`Starting server on ${cliConfig.host}:${cliConfig.port}...`);
    console.log(`Project path: ${cliConfig.projectPath}`);
    console.log(`Sync mode: ${cliConfig.syncMode}`);
    console.log(`AI features: ${cliConfig.ai ? "enabled" : "disabled"}`);
    console.log(`File watching: ${cliConfig.watch ? "enabled" : "disabled"}`);

    // Import and call loadConfig from ../cli/config
    // This will be implemented in the next task
    // const config = await loadConfig(cliConfig);

    // TODO: Start server with configuration
    // TODO: Setup shutdown handlers
    // TODO: Open browser if cliConfig.open is true

    console.log("Server started successfully");
    console.log(
      `Open your browser at http://${cliConfig.host}:${cliConfig.port}`,
    );
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Failed to start server: ${errorMessage}`);
    process.exit(1);
  }
}
