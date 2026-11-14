import { describe, test, expect } from "bun:test";
import {
  TOOL_NAME_PATTERN,
  validatePluginConfigFile,
  validatePluginToolDefinition,
  type PluginConfigFile,
  type PluginToolDefinition,
} from "./tool";

describe("tool types", () => {
  describe("TOOL_NAME_PATTERN", () => {
    test("accepts valid tool names", () => {
      expect(TOOL_NAME_PATTERN.test("git-status")).toBe(true);
      expect(TOOL_NAME_PATTERN.test("workspace_info")).toBe(true);
      expect(TOOL_NAME_PATTERN.test("tool123")).toBe(true);
      expect(TOOL_NAME_PATTERN.test("my-tool-v2")).toBe(true);
    });

    test("rejects invalid tool names", () => {
      expect(TOOL_NAME_PATTERN.test("tool name")).toBe(false); // space
      expect(TOOL_NAME_PATTERN.test("tool.name")).toBe(false); // dot
      expect(TOOL_NAME_PATTERN.test("tool/name")).toBe(false); // slash
      expect(TOOL_NAME_PATTERN.test("")).toBe(false); // empty
    });
  });

  describe("validatePluginToolDefinition", () => {
    test("accepts valid shell handler tool", () => {
      const tool: PluginToolDefinition = {
        name: "list-files",
        description: "List files in directory",
        inputSchema: {
          type: "object",
          properties: {
            directory: {
              type: "string",
              description: "Directory path",
            },
          },
        },
        handler: {
          type: "shell",
          command: "ls -la {{directory}}",
          timeout: 10000,
        },
      };

      const result = validatePluginToolDefinition(tool);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("accepts valid http handler tool", () => {
      const tool: PluginToolDefinition = {
        name: "check-api",
        description: "Check API health",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "API URL",
            },
          },
          required: ["url"],
        },
        handler: {
          type: "http",
          url: "{{url}}/health",
          method: "GET",
          timeout: 5000,
        },
      };

      const result = validatePluginToolDefinition(tool);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("accepts valid file-read handler tool", () => {
      const tool: PluginToolDefinition = {
        name: "read-config",
        description: "Read config file",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path",
            },
          },
          required: ["path"],
        },
        handler: {
          type: "file-read",
          basePath: "/home/user/configs",
          maxSize: 1024000,
        },
      };

      const result = validatePluginToolDefinition(tool);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("rejects tool with invalid name pattern", () => {
      const tool = {
        name: "invalid tool name",
        description: "Test tool",
        inputSchema: { type: "object" },
        handler: { type: "shell", command: "echo test" },
      };

      const result = validatePluginToolDefinition(tool);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("must match pattern"))).toBe(
        true,
      );
    });

    test("rejects tool without description", () => {
      const tool = {
        name: "test-tool",
        description: "",
        inputSchema: { type: "object" },
        handler: { type: "shell", command: "echo test" },
      };

      const result = validatePluginToolDefinition(tool);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("description is required")),
      ).toBe(true);
    });

    test("rejects shell handler without command", () => {
      const tool = {
        name: "test-tool",
        description: "Test tool",
        inputSchema: { type: "object" },
        handler: { type: "shell" },
      };

      const result = validatePluginToolDefinition(tool);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("command"))).toBe(true);
    });

    test("rejects http handler with invalid method", () => {
      const tool = {
        name: "test-tool",
        description: "Test tool",
        inputSchema: { type: "object" },
        handler: { type: "http", url: "http://example.com", method: "DELETE" },
      };

      const result = validatePluginToolDefinition(tool);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("method"))).toBe(true);
    });

    test("rejects file-read handler without basePath", () => {
      const tool = {
        name: "test-tool",
        description: "Test tool",
        inputSchema: { type: "object" },
        handler: { type: "file-read" },
      };

      const result = validatePluginToolDefinition(tool);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("basePath"))).toBe(true);
    });

    test("rejects non-object input", () => {
      const result = validatePluginToolDefinition("not an object");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Tool definition must be an object");
    });

    test("rejects null input", () => {
      const result = validatePluginToolDefinition(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Tool definition must be an object");
    });
  });

  describe("validatePluginConfigFile", () => {
    test("accepts valid plugin config", () => {
      const config: PluginConfigFile = {
        name: "my-tools",
        version: "1.0.0",
        tools: [
          {
            name: "test-tool",
            description: "Test tool",
            inputSchema: {
              type: "object",
              properties: {
                param: {
                  type: "string",
                },
              },
            },
            handler: {
              type: "shell",
              command: "echo {{param}}",
            },
          },
        ],
      };

      const result = validatePluginConfigFile(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config).toBeDefined();
      expect(result.config?.name).toBe("my-tools");
    });

    test("accepts valid plugin config without version", () => {
      const config = {
        name: "my-tools",
        tools: [
          {
            name: "test-tool",
            description: "Test tool",
            inputSchema: { type: "object" },
            handler: { type: "shell", command: "echo test" },
          },
        ],
      };

      const result = validatePluginConfigFile(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("rejects config without name", () => {
      const config = {
        tools: [
          {
            name: "test-tool",
            description: "Test tool",
            inputSchema: { type: "object" },
            handler: { type: "shell", command: "echo test" },
          },
        ],
      };

      const result = validatePluginConfigFile(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("name is required"))).toBe(
        true,
      );
    });

    test("rejects config with empty name", () => {
      const config = {
        name: "",
        tools: [
          {
            name: "test-tool",
            description: "Test tool",
            inputSchema: { type: "object" },
            handler: { type: "shell", command: "echo test" },
          },
        ],
      };

      const result = validatePluginConfigFile(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("name is required"))).toBe(
        true,
      );
    });

    test("rejects config with non-string version", () => {
      const config = {
        name: "my-tools",
        version: 123,
        tools: [
          {
            name: "test-tool",
            description: "Test tool",
            inputSchema: { type: "object" },
            handler: { type: "shell", command: "echo test" },
          },
        ],
      };

      const result = validatePluginConfigFile(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("version"))).toBe(true);
    });

    test("rejects config without tools array", () => {
      const config = {
        name: "my-tools",
      };

      const result = validatePluginConfigFile(config);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Tools must be an array")),
      ).toBe(true);
    });

    test("rejects config with empty tools array", () => {
      const config = {
        name: "my-tools",
        tools: [],
      };

      const result = validatePluginConfigFile(config);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Tools array cannot be empty")),
      ).toBe(true);
    });

    test("propagates tool validation errors with index", () => {
      const config = {
        name: "my-tools",
        tools: [
          {
            name: "valid-tool",
            description: "Valid tool",
            inputSchema: { type: "object" },
            handler: { type: "shell", command: "echo test" },
          },
          {
            name: "invalid tool",
            description: "Invalid tool",
            inputSchema: { type: "object" },
            handler: { type: "shell", command: "echo test" },
          },
        ],
      };

      const result = validatePluginConfigFile(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Tool [1]"))).toBe(true);
    });

    test("rejects non-object input", () => {
      const result = validatePluginConfigFile("not an object");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Config must be an object");
    });

    test("rejects null input", () => {
      const result = validatePluginConfigFile(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Config must be an object");
    });
  });
});
