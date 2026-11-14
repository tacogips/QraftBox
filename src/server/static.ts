/**
 * Static File Serving Middleware
 *
 * Provides middleware for serving static files from a directory and
 * SPA fallback for client-side routing.
 */

import type { MiddlewareHandler } from "hono";
import { join } from "path";

/**
 * MIME type mapping for common file extensions
 */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
} as const;

/**
 * Get MIME type for file extension
 *
 * @param filename - File name or path
 * @returns MIME type string
 */
function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Check if file is a hashed asset (immutable cache)
 *
 * Hashed assets have hash patterns like:
 * - main.abc123.js
 * - style.def456.css
 * - image.789xyz.png
 *
 * @param filename - File name
 * @returns true if file appears to be hashed
 */
function isHashedAsset(filename: string): boolean {
  // Match pattern like: name.hash.ext where hash is 6+ alphanumeric chars
  const hashedPattern = /\.[a-f0-9]{6,}\./i;
  return hashedPattern.test(filename);
}

/**
 * Get cache control header for file
 *
 * @param filename - File name
 * @returns Cache-Control header value
 */
function getCacheControl(filename: string): string {
  if (isHashedAsset(filename)) {
    // Hashed assets never change, cache forever
    return "public, max-age=31536000, immutable";
  }
  // Other files should revalidate
  return "no-cache";
}

/**
 * Create static file serving middleware
 *
 * Serves files from the specified directory. Only handles GET and HEAD requests.
 * Returns 404 for missing files (falls through to next handler).
 *
 * Usage:
 * ```typescript
 * const app = new Hono();
 * app.use("*", createStaticMiddleware("./dist/client"));
 * ```
 *
 * @param clientDir - Absolute path to directory containing static files
 * @returns Hono middleware handler
 */
export function createStaticMiddleware(clientDir: string): MiddlewareHandler {
  return async (c, next): Promise<Response | void> => {
    // Only handle GET and HEAD requests
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD") {
      return next();
    }

    // Get request path
    const requestPath = c.req.path;

    // Skip API routes
    if (requestPath.startsWith("/api")) {
      return next();
    }

    // Build file path
    const filePath = join(clientDir, requestPath);

    // Try to read the file
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      // File not found, fall through to next handler
      return next();
    }

    // Get MIME type from Bun.file first, fallback to manual mapping
    const mimeType = file.type || getMimeType(filePath);

    // Get cache control header
    const cacheControl = getCacheControl(filePath);

    // For HEAD requests, return headers only
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": cacheControl,
          "Content-Length": String(file.size),
        },
      });
    }

    // For GET requests, return file content
    const content = await file.arrayBuffer();
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": cacheControl,
      },
    });
  };
}

/**
 * Create SPA fallback middleware
 *
 * Returns index.html for any GET request that:
 * - Does not match /api/* paths
 * - Does not have a file extension (assumed to be client-side route)
 *
 * This enables client-side routing for single-page applications.
 *
 * Usage:
 * ```typescript
 * const app = new Hono();
 * app.use("*", createStaticMiddleware("./dist/client"));
 * app.use("*", createSPAFallback("./dist/client/index.html"));
 * ```
 *
 * @param indexPath - Absolute path to index.html file
 * @returns Hono middleware handler
 */
export function createSPAFallback(indexPath: string): MiddlewareHandler {
  return async (c, next): Promise<Response | void> => {
    // Only handle GET requests
    if (c.req.method !== "GET") {
      return next();
    }

    const requestPath = c.req.path;

    // Skip API routes
    if (requestPath.startsWith("/api")) {
      return next();
    }

    // Check if path has file extension
    const lastSegment = requestPath.substring(requestPath.lastIndexOf("/") + 1);
    const hasExtension = lastSegment.includes(".");

    // If path has extension, it's a file request - let it fall through
    if (hasExtension) {
      return next();
    }

    // No extension - assume client-side route, return index.html
    const file = Bun.file(indexPath);
    const exists = await file.exists();

    if (!exists) {
      // Index file not found - fall through
      return next();
    }

    // Return index.html for SPA
    const content = await file.text();
    return c.html(content);
  };
}
