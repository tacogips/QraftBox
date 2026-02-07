/**
 * Handler Strategies Module
 *
 * Converts plugin handler configs into executable SdkTool handler functions.
 * Provides shell, HTTP, and file-read execution strategies with security
 * controls and timeout enforcement.
 */

import * as path from "node:path";
import type {
  ShellHandlerConfig,
  HttpHandlerConfig,
  FileReadHandlerConfig,
  PluginHandlerConfig,
} from "../../types/tool.js";

/**
 * Tool result content
 *
 * Compatible with claude-code-agent ToolResultContent.
 */
export interface ToolResultContent {
  readonly type: "text" | "image";
  readonly text?: string | undefined;
  readonly data?: string | undefined;
  readonly mimeType?: string | undefined;
}

/**
 * Tool result
 *
 * Compatible with claude-code-agent ToolResult.
 */
export interface ToolResult {
  readonly content: readonly ToolResultContent[];
  readonly isError?: boolean | undefined;
}

/**
 * Tool context passed to handlers
 *
 * Compatible with claude-code-agent ToolContext.
 */
export interface ToolContext {
  readonly toolUseId: string;
  readonly sessionId: string;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Tool handler function type
 *
 * Compatible with claude-code-agent ToolHandler.
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult>;

/**
 * Maximum length for interpolated parameter values
 */
const MAX_PARAM_LENGTH = 10000;

/**
 * Default timeout for shell commands (30 seconds)
 */
const DEFAULT_SHELL_TIMEOUT = 30000;

/**
 * Default timeout for HTTP requests (10 seconds)
 */
const DEFAULT_HTTP_TIMEOUT = 10000;

/**
 * Default maximum file size (1MB)
 */
const DEFAULT_MAX_FILE_SIZE = 1048576;

/**
 * Create a text ToolResult
 */
function textResult(text: string, isError = false): ToolResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

/**
 * Validate interpolated parameter value
 *
 * Rejects values containing null bytes or exceeding length limit.
 *
 * @param value - Value to validate
 * @param paramName - Parameter name for error messages
 * @throws Error if validation fails
 */
function validateParamValue(value: string, paramName: string): void {
  if (value.includes("\0")) {
    throw new Error(
      `Parameter '${paramName}' contains null bytes - potential security risk`,
    );
  }

  if (value.length > MAX_PARAM_LENGTH) {
    throw new Error(
      `Parameter '${paramName}' exceeds maximum length of ${MAX_PARAM_LENGTH} characters`,
    );
  }
}

/**
 * Interpolate {{param}} placeholders in a template string
 *
 * @param template - Template string with {{param}} placeholders
 * @param args - Argument values for substitution
 * @returns Interpolated string
 * @throws Error if referenced parameter is missing or invalid
 */
function interpolateTemplate(
  template: string,
  args: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, paramName: string) => {
    const value = args[paramName];
    if (value === null || value === undefined) {
      throw new Error(`Missing required parameter: ${paramName}`);
    }

    const stringValue = String(value);
    validateParamValue(stringValue, paramName);
    return stringValue;
  });
}

/**
 * Parse command template into argument array
 *
 * Splits the command template on whitespace and substitutes {{param}} placeholders
 * with argument values. The result is a string array suitable for Bun.spawn.
 *
 * Security: This prevents shell injection by using an argument array instead of
 * shell string interpolation.
 *
 * @param command - Command template with {{param}} placeholders
 * @param args - Argument values for substitution
 * @returns Array of command arguments
 * @throws Error if parameter validation fails
 */
function parseCommandTemplate(
  command: string,
  args: Record<string, unknown>,
): string[] {
  // Split on whitespace to get tokens
  const tokens = command.split(/\s+/).filter((t) => t.length > 0);

  // Process each token
  return tokens.map((token) => {
    // Check if token contains {{param}} placeholder
    if (!token.includes("{{")) {
      // Strip surrounding quotes if present
      if (
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))
      ) {
        return token.slice(1, -1);
      }
      return token;
    }

    // Interpolate the token
    const interpolated = interpolateTemplate(token, args);

    // Strip surrounding quotes from the interpolated result
    if (
      (interpolated.startsWith('"') && interpolated.endsWith('"')) ||
      (interpolated.startsWith("'") && interpolated.endsWith("'"))
    ) {
      return interpolated.slice(1, -1);
    }

    return interpolated;
  });
}

/**
 * Create a shell command handler
 *
 * Executes shell commands via Bun.spawn with argument array interpolation.
 * Uses setTimeout for timeout enforcement.
 *
 * Security:
 * - Uses Bun.spawn with argument array (NOT shell string)
 * - Validates interpolated values (no null bytes, length limits)
 * - Prevents command injection
 *
 * @param config - Shell handler configuration
 * @returns Tool handler function
 */
export function createShellHandler(config: ShellHandlerConfig): ToolHandler {
  const timeout = config.timeout ?? DEFAULT_SHELL_TIMEOUT;

  return async (
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      // Parse command template into argument array
      const commandArgs = parseCommandTemplate(config.command, args);

      if (commandArgs.length === 0) {
        return textResult(
          "Invalid command: template resulted in empty argument list",
          true,
        );
      }

      // Spawn process with argument array
      const proc =
        config.cwd !== undefined
          ? Bun.spawn(commandArgs, {
              stdout: "pipe",
              stderr: "pipe",
              cwd: config.cwd,
            })
          : Bun.spawn(commandArgs, {
              stdout: "pipe",
              stderr: "pipe",
            });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        proc.kill();
      }, timeout);

      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);

        clearTimeout(timeoutId);

        // Non-zero exit code indicates error
        if (exitCode !== 0) {
          const errorOutput =
            stderr.trim() || stdout.trim() || "Command failed";
          return textResult(
            `Command failed with exit code ${exitCode}:\n${errorOutput}`,
            true,
          );
        }

        // Return stdout, include stderr if non-empty
        let output = stdout;
        if (stderr.trim().length > 0) {
          output += `\n--- stderr ---\n${stderr}`;
        }

        return textResult(output);
      } catch (e) {
        clearTimeout(timeoutId);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return textResult(`Process execution failed: ${errorMessage}`, true);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return textResult(`Shell handler error: ${errorMessage}`, true);
    }
  };
}

/**
 * Create an HTTP request handler
 *
 * Sends HTTP requests with URL parameter interpolation.
 * GET requests put args as query params, POST/PUT send args as JSON body.
 *
 * Security:
 * - Uses encodeURIComponent for URL parameter values
 * - Only allows http:// and https:// schemes
 * - Timeout enforcement via AbortController
 *
 * @param config - HTTP handler configuration
 * @returns Tool handler function
 */
export function createHttpHandler(config: HttpHandlerConfig): ToolHandler {
  const timeout = config.timeout ?? DEFAULT_HTTP_TIMEOUT;
  const method = config.method ?? "POST";

  return async (
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      // Interpolate URL with encodeURIComponent for parameter values
      let url = config.url.replace(
        /\{\{(\w+)\}\}/g,
        (_, paramName: string) => {
          const value = args[paramName];
          if (value === null || value === undefined) {
            throw new Error(`Missing required parameter: ${paramName}`);
          }
          return encodeURIComponent(String(value));
        },
      );

      // Validate URL scheme
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return textResult(
          "Invalid URL scheme: only http:// and https:// are allowed",
          true,
        );
      }

      // For GET requests, add remaining args as query parameters
      if (method === "GET") {
        const urlObj = new URL(url);
        for (const [key, value] of Object.entries(args)) {
          // Skip if already in URL template
          if (config.url.includes(`{{${key}}}`)) {
            continue;
          }
          urlObj.searchParams.append(key, String(value));
        }
        url = urlObj.toString();
      }

      // Set up timeout via AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Build headers
        const headers: Record<string, string> = {};
        if (config.headers !== undefined) {
          Object.assign(headers, config.headers);
        }

        // For POST/PUT, send remaining args as JSON body
        let body: string | undefined;
        if (method === "POST" || method === "PUT") {
          const bodyArgs: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(args)) {
            if (!config.url.includes(`{{${key}}}`)) {
              bodyArgs[key] = value;
            }
          }

          if (Object.keys(bodyArgs).length > 0) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(bodyArgs);
          }
        }

        const requestInit: RequestInit = {
          method,
          signal: controller.signal,
          headers,
        };
        if (body !== undefined) {
          requestInit.body = body;
        }

        const response = await fetch(url, requestInit);
        clearTimeout(timeoutId);

        const responseText = await response.text();

        // Non-2xx responses are errors
        if (!response.ok) {
          return textResult(
            `HTTP ${response.status} ${response.statusText}:\n${responseText}`,
            true,
          );
        }

        return textResult(responseText);
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === "AbortError") {
          return textResult(`Request timed out after ${timeout}ms`, true);
        }
        const errorMessage = e instanceof Error ? e.message : String(e);
        return textResult(`Request failed: ${errorMessage}`, true);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return textResult(`HTTP handler error: ${errorMessage}`, true);
    }
  };
}

/**
 * Create a file-read handler
 *
 * Reads file content with path traversal protection.
 * All paths are resolved relative to basePath and verified to be within it.
 *
 * Security:
 * - Uses path.resolve + startsWith check to prevent directory traversal
 * - Enforces file size limit
 * - Only reads files within basePath
 *
 * @param config - File-read handler configuration
 * @returns Tool handler function
 */
export function createFileReadHandler(
  config: FileReadHandlerConfig,
): ToolHandler {
  const maxSize = config.maxSize ?? DEFAULT_MAX_FILE_SIZE;

  return async (
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const requestedPath = args["path"];
      if (typeof requestedPath !== "string") {
        return textResult(
          "Missing or invalid 'path' parameter: must be a string",
          true,
        );
      }

      // Resolve path relative to basePath
      const resolvedPath = path.resolve(config.basePath, requestedPath);

      // Verify resolved path is within basePath (prevent directory traversal)
      if (!resolvedPath.startsWith(config.basePath)) {
        return textResult(
          `Path traversal detected: ${requestedPath} resolves outside base path`,
          true,
        );
      }

      // Check if file exists and get size
      const file = Bun.file(resolvedPath);
      const fileSize = file.size;

      if (fileSize > maxSize) {
        return textResult(
          `File size (${fileSize} bytes) exceeds maximum allowed size (${maxSize} bytes)`,
          true,
        );
      }

      // Read file content
      const content = await file.text();

      return textResult(content);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return textResult(`File-read handler error: ${errorMessage}`, true);
    }
  };
}

/**
 * Create a handler from plugin handler config
 *
 * Dispatches to the appropriate handler creation function based on config type.
 *
 * @param config - Plugin handler configuration
 * @returns Tool handler function
 * @throws Error if handler type is unknown
 */
export function createHandlerFromConfig(
  config: PluginHandlerConfig,
): ToolHandler {
  switch (config.type) {
    case "shell":
      return createShellHandler(config);
    case "http":
      return createHttpHandler(config);
    case "file-read":
      return createFileReadHandler(config);
    default: {
      const exhaustive: never = config;
      throw new Error(
        `Unknown handler type: ${(exhaustive as { type: string }).type}`,
      );
    }
  }
}
