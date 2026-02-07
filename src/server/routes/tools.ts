/**
 * Tool Management API Routes
 *
 * Provides REST API endpoints for tool listing and management.
 * Supports listing registered tools, retrieving specific tool metadata,
 * and hot-reloading plugin tools from disk.
 */

import { Hono } from "hono";
import type { AyndToolRegistry } from "../tools/registry.js";
import type { RegisteredToolInfo } from "../../types/tool.js";

/**
 * Response format for GET /api/tools
 */
interface ToolsListResponse {
  readonly tools: readonly RegisteredToolInfo[];
  readonly counts: {
    readonly total: number;
    readonly builtin: number;
    readonly plugin: number;
  };
}

/**
 * Response format for POST /api/tools/reload
 */
interface ToolsReloadResponse {
  readonly success: boolean;
  readonly toolCount: number;
  readonly errors: readonly {
    readonly source: string;
    readonly toolName?: string | undefined;
    readonly message: string;
  }[];
}

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
}

/**
 * Create tool management routes
 *
 * Routes:
 * - GET /api/tools - List all registered tools with counts
 * - GET /api/tools/:name - Get specific tool metadata
 * - POST /api/tools/reload - Hot-reload plugin tools from disk
 *
 * @param registry - AyndToolRegistry instance
 * @returns Hono app with tool routes mounted
 */
export function createToolRoutes(registry: AyndToolRegistry): Hono {
  const app = new Hono();

  /**
   * GET /api/tools
   *
   * List all registered tools (builtin + plugin).
   * Returns tool metadata and count statistics.
   *
   * Returns:
   * - tools: Array of registered tool metadata
   * - counts: Statistics (total, builtin, plugin)
   */
  app.get("/", (c) => {
    const tools = registry.listTools();
    const builtinCount = tools.filter((t) => t.source === "builtin").length;
    const pluginCount = tools.filter((t) => t.source === "plugin").length;

    const response: ToolsListResponse = {
      tools,
      counts: {
        total: tools.length,
        builtin: builtinCount,
        plugin: pluginCount,
      },
    };

    return c.json(response);
  });

  /**
   * GET /api/tools/:name
   *
   * Get metadata for a specific tool by name.
   *
   * Path parameters:
   * - name: Tool name
   *
   * Returns:
   * - Tool metadata with name, description, source, inputSchema
   *
   * Error cases:
   * - 404: Tool not found
   */
  app.get("/:name", (c) => {
    const name = c.req.param("name");
    const toolInfo = registry.getToolInfo(name);

    if (toolInfo === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Tool not found: ${name}`,
      };
      return c.json(errorResponse, 404);
    }

    return c.json(toolInfo);
  });

  /**
   * POST /api/tools/reload
   *
   * Hot-reload plugin tools from disk.
   * Built-in tools are unaffected.
   *
   * Returns:
   * - success: True if all tools loaded without errors
   * - toolCount: Total number of tools after reload
   * - errors: Array of errors encountered during reload
   *
   * Error cases:
   * - 500: Failed to reload plugins
   */
  app.post("/reload", async (c) => {
    try {
      const result = await registry.reloadPlugins();

      const response: ToolsReloadResponse = {
        success: result.success,
        toolCount: result.toolCount,
        errors: result.errors,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to reload plugins";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
