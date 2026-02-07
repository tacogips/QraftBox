/**
 * Tool Management Routes Tests
 *
 * Tests for REST API routes for tool listing and management.
 */

import { describe, test, expect } from "vitest";
import { createToolRoutes } from "./tools.js";
import type {
  RegisteredToolInfo,
  ToolRegistrationResult,
  JsonSchema,
} from "../../types/tool.js";
import type { AyndToolRegistry } from "../tools/registry.js";

/**
 * Create a mock tool registry for testing
 *
 * @param tools - Array of tool info to return
 * @returns Mock AyndToolRegistry instance
 */
function createMockRegistry(tools: RegisteredToolInfo[]): AyndToolRegistry {
  let reloadResult: ToolRegistrationResult = {
    success: true,
    toolCount: tools.length,
    errors: [],
  };

  return {
    initialize: async () => ({
      success: true,
      toolCount: tools.length,
      errors: [],
    }),
    reloadPlugins: async () => reloadResult,
    listTools: () => tools,
    getToolInfo: (name: string) => tools.find((t) => t.name === name),
    hasTool: (name: string) => tools.some((t) => t.name === name),
    getToolCount: () => tools.length,
    toMcpServerConfig: () => ({
      type: "sdk" as const,
      name: "aynd-tools",
      version: "1.0.0",
      tools: [],
    }),
    getAllowedToolNames: () => tools.map((t) => `mcp__aynd-tools__${t.name}`),
    _setReloadResult: (result: ToolRegistrationResult) => {
      reloadResult = result;
    },
  } as AyndToolRegistry & {
    _setReloadResult: (result: ToolRegistrationResult) => void;
  };
}

/**
 * Create sample tool info for testing
 */
function createSampleTool(
  name: string,
  source: "builtin" | "plugin",
  pluginName?: string | undefined,
): RegisteredToolInfo {
  return {
    name,
    description: `Description for ${name}`,
    source,
    pluginName,
    inputSchema: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "Test input",
        },
      },
    } as JsonSchema,
  };
}

describe("createToolRoutes", () => {
  describe("GET /", () => {
    test("returns tools list with counts", async () => {
      const mockTools: RegisteredToolInfo[] = [
        createSampleTool("builtin-tool-1", "builtin"),
        createSampleTool("builtin-tool-2", "builtin"),
        createSampleTool("plugin-tool-1", "plugin", "test-plugin"),
      ];

      const registry = createMockRegistry(mockTools);
      const app = createToolRoutes(registry);

      const res = await app.request("/");
      const body = (await res.json()) as {
        tools: unknown[];
        counts: { total: number; builtin: number; plugin: number };
      };

      expect(res.status).toBe(200);
      expect(body).toHaveProperty("tools");
      expect(body).toHaveProperty("counts");
      expect(body.tools).toHaveLength(3);
      expect(body.counts).toEqual({
        total: 3,
        builtin: 2,
        plugin: 1,
      });
    });

    test("returns correct counts for builtin and plugin tools", async () => {
      const mockTools: RegisteredToolInfo[] = [
        createSampleTool("builtin-1", "builtin"),
        createSampleTool("builtin-2", "builtin"),
        createSampleTool("builtin-3", "builtin"),
        createSampleTool("plugin-1", "plugin", "plugin-a"),
        createSampleTool("plugin-2", "plugin", "plugin-b"),
      ];

      const registry = createMockRegistry(mockTools);
      const app = createToolRoutes(registry);

      const res = await app.request("/");
      const body = (await res.json()) as {
        tools: unknown[];
        counts: { total: number; builtin: number; plugin: number };
      };

      expect(res.status).toBe(200);
      expect(body.counts).toEqual({
        total: 5,
        builtin: 3,
        plugin: 2,
      });
    });

    test("returns empty list when no tools registered", async () => {
      const registry = createMockRegistry([]);
      const app = createToolRoutes(registry);

      const res = await app.request("/");
      const body = (await res.json()) as {
        tools: unknown[];
        counts: { total: number; builtin: number; plugin: number };
      };

      expect(res.status).toBe(200);
      expect(body.tools).toHaveLength(0);
      expect(body.counts).toEqual({
        total: 0,
        builtin: 0,
        plugin: 0,
      });
    });
  });

  describe("GET /:name", () => {
    test("returns tool info when tool exists", async () => {
      const mockTools: RegisteredToolInfo[] = [
        createSampleTool("test-tool", "builtin"),
      ];

      const registry = createMockRegistry(mockTools);
      const app = createToolRoutes(registry);

      const res = await app.request("/test-tool");
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body).toHaveProperty("name", "test-tool");
      expect(body).toHaveProperty("description");
      expect(body).toHaveProperty("source", "builtin");
      expect(body).toHaveProperty("inputSchema");
    });

    test("returns 404 when tool does not exist", async () => {
      const registry = createMockRegistry([]);
      const app = createToolRoutes(registry);

      const res = await app.request("/nonexistent-tool");
      const body = (await res.json()) as { error: string };

      expect(res.status).toBe(404);
      expect(body).toHaveProperty("error");
      expect(body.error).toContain("Tool not found: nonexistent-tool");
    });

    test("returns plugin tool info with plugin name", async () => {
      const mockTools: RegisteredToolInfo[] = [
        createSampleTool("plugin-tool", "plugin", "my-plugin"),
      ];

      const registry = createMockRegistry(mockTools);
      const app = createToolRoutes(registry);

      const res = await app.request("/plugin-tool");
      const body = (await res.json()) as {
        name: string;
        source: string;
        pluginName: string;
      };

      expect(res.status).toBe(200);
      expect(body.name).toBe("plugin-tool");
      expect(body.source).toBe("plugin");
      expect(body.pluginName).toBe("my-plugin");
    });
  });

  describe("POST /reload", () => {
    test("returns success when reload succeeds", async () => {
      const mockTools: RegisteredToolInfo[] = [
        createSampleTool("builtin-1", "builtin"),
        createSampleTool("plugin-1", "plugin", "test-plugin"),
      ];

      const registry = createMockRegistry(mockTools) as AyndToolRegistry & {
        _setReloadResult: (result: ToolRegistrationResult) => void;
      };

      registry._setReloadResult({
        success: true,
        toolCount: 2,
        errors: [],
      });

      const app = createToolRoutes(registry);

      const res = await app.request("/reload", {
        method: "POST",
      });
      const body = (await res.json()) as {
        success: boolean;
        toolCount: number;
        errors: unknown[];
      };

      expect(res.status).toBe(200);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("toolCount", 2);
      expect(body).toHaveProperty("errors");
      expect(body.errors).toHaveLength(0);
    });

    test("returns errors when reload encounters problems", async () => {
      const mockTools: RegisteredToolInfo[] = [];

      const registry = createMockRegistry(mockTools) as AyndToolRegistry & {
        _setReloadResult: (result: ToolRegistrationResult) => void;
      };

      registry._setReloadResult({
        success: false,
        toolCount: 1,
        errors: [
          {
            source: "plugin-a.json",
            toolName: "broken-tool",
            message: "Invalid schema",
          },
          {
            source: "plugin-b.json",
            message: "Failed to parse JSON",
          },
        ],
      });

      const app = createToolRoutes(registry);

      const res = await app.request("/reload", {
        method: "POST",
      });
      const body = (await res.json()) as {
        success: boolean;
        toolCount: number;
        errors: Array<Record<string, unknown>>;
      };

      expect(res.status).toBe(200);
      expect(body.success).toBe(false);
      expect(body.toolCount).toBe(1);
      expect(body.errors).toHaveLength(2);
      expect(body.errors[0]).toHaveProperty("source", "plugin-a.json");
      expect(body.errors[0]).toHaveProperty("toolName", "broken-tool");
      expect(body.errors[0]).toHaveProperty("message", "Invalid schema");
      expect(body.errors[1]).toHaveProperty("source", "plugin-b.json");
      expect(body.errors[1]).toHaveProperty("message", "Failed to parse JSON");
    });

    test("returns 500 when reload throws exception", async () => {
      const registry: AyndToolRegistry = {
        initialize: async () => ({ success: true, toolCount: 0, errors: [] }),
        reloadPlugins: async () => {
          throw new Error("Reload failed");
        },
        listTools: () => [],
        getToolInfo: () => undefined,
        hasTool: () => false,
        getToolCount: () => 0,
        toMcpServerConfig: () => ({
          type: "sdk" as const,
          name: "aynd-tools",
          version: "1.0.0",
          tools: [],
        }),
        getAllowedToolNames: () => [],
      };

      const app = createToolRoutes(registry);

      const res = await app.request("/reload", {
        method: "POST",
      });
      const body = (await res.json()) as { error: string };

      expect(res.status).toBe(500);
      expect(body).toHaveProperty("error");
      expect(body.error).toBe("Reload failed");
    });

    test("returns 500 with fallback message when non-Error thrown", async () => {
      const registry: AyndToolRegistry = {
        initialize: async () => ({ success: true, toolCount: 0, errors: [] }),
        reloadPlugins: async () => {
          throw "String error";
        },
        listTools: () => [],
        getToolInfo: () => undefined,
        hasTool: () => false,
        getToolCount: () => 0,
        toMcpServerConfig: () => ({
          type: "sdk" as const,
          name: "aynd-tools",
          version: "1.0.0",
          tools: [],
        }),
        getAllowedToolNames: () => [],
      };

      const app = createToolRoutes(registry);

      const res = await app.request("/reload", {
        method: "POST",
      });
      const body = (await res.json()) as { error: string };

      expect(res.status).toBe(500);
      expect(body).toHaveProperty("error");
      expect(body.error).toBe("Failed to reload plugins");
    });
  });
});
