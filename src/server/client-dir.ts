/**
 * Client Directory Resolution
 *
 * Provides logic to locate the client build directory (dist/client/)
 * which contains the built Svelte SPA files (index.html, assets/, etc.).
 *
 * Resolution order:
 * 1. QRAFTBOX_CLIENT_DIR environment variable (explicit override)
 * 2. Adjacent to executable: dirname(process.execPath)/dist/client/ (for compiled binary)
 * 3. Relative to bundle output: join(import.meta.dir, "client") (for npm install where dist/main.js runs)
 * 4. Relative to source file: resolve(import.meta.dir, "..", "..", "dist", "client") (for development)
 * 5. Fallback to process.cwd()/dist/client (legacy behavior)
 */

import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { createLogger } from "./logger.js";

const logger = createLogger("ClientDir");

/**
 * Check if directory contains index.html
 *
 * @param directoryPath - Absolute path to directory to check
 * @returns true if index.html exists in the directory
 */
function containsIndexHtml(directoryPath: string): boolean {
  const indexPath = join(directoryPath, "index.html");
  return existsSync(indexPath);
}

/**
 * Resolve the client build directory location
 *
 * Checks multiple candidate locations in priority order and returns
 * the first one that contains index.html. This allows the server to
 * work in different deployment scenarios (development, bundled, binary).
 *
 * QRAFTBOX_CLIENT_DIR environment variable is an unconditional override
 * that skips validation - it is returned immediately if set.
 *
 * @returns Absolute path to client build directory
 * @throws Error if no valid client directory is found
 */
export function resolveClientDir(): string {
  // 1. QRAFTBOX_CLIENT_DIR environment variable (explicit unconditional override)
  const envClientDir = process.env["QRAFTBOX_CLIENT_DIR"];
  if (envClientDir !== undefined) {
    logger.info("Client directory resolved (explicit override)", {
      source: "QRAFTBOX_CLIENT_DIR environment variable",
      clientDir: envClientDir,
    });
    return envClientDir;
  }

  const candidates: Array<{ source: string; path: string }> = [];

  // 2. Adjacent to executable: dirname(process.execPath)/dist/client/
  // For compiled binary distribution
  const executableDir = dirname(process.execPath);
  candidates.push({
    source: "adjacent to executable",
    path: join(executableDir, "dist", "client"),
  });

  // 3. Relative to bundle output: join(import.meta.dir, "client")
  // For npm install where dist/main.js runs and dist/client/ is a sibling
  candidates.push({
    source: "relative to bundle output",
    path: join(import.meta.dir, "client"),
  });

  // 4. Relative to source file: resolve(import.meta.dir, "..", "..", "dist", "client")
  // For development where the source file is in src/server/
  candidates.push({
    source: "relative to source file (development)",
    path: resolve(import.meta.dir, "..", "..", "dist", "client"),
  });

  // 5. Fallback to process.cwd()/dist/client (legacy behavior)
  candidates.push({
    source: "process.cwd() fallback",
    path: join(process.cwd(), "dist", "client"),
  });

  // Check each candidate in order
  for (const candidate of candidates) {
    if (containsIndexHtml(candidate.path)) {
      logger.info("Client directory resolved", {
        source: candidate.source,
        clientDir: candidate.path,
      });
      return candidate.path;
    }
  }

  // No valid client directory found - return cwd-based fallback without crashing.
  // The server can still start; static file serving will simply 404 until client is built.
  const fallbackPath = join(process.cwd(), "dist", "client");
  logger.warn(
    "No client directory with index.html found; static file serving will be unavailable",
    {
      checkedPaths: candidates.map((candidate) => candidate.path),
      fallback: fallbackPath,
    },
  );
  return fallbackPath;
}
