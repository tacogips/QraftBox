/**
 * Tests for Plugin Loader Module
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPluginTools } from "./plugin-loader";
import type { PluginConfigFile } from "../../types/tool.js";
import type { ToolContext } from "./handler-strategies.js";

/**
 * Test fixture directory
 */
let testDir: string;

/**
 * Setup test directory before all tests
 */
beforeAll(async () => {
  testDir = join(tmpdir(), `qraftbox-plugin-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

/**
 * Cleanup test directory after all tests
 */
afterAll(async () => {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
});

/**
 * Clean test directory before each test
 */
beforeEach(async () => {
  // Remove all files in test directory
  try {
    const entries = await readdir(testDir);
    for (const entry of entries) {
      await rm(join(testDir, entry), { recursive: true, force: true });
    }
  } catch {
    // Ignore errors
  }
});

/**
 * Create a test plugin JSON file
 */
async function createPluginFile(
  filename: string,
  config: PluginConfigFile,
): Promise<void> {
  const filePath = join(testDir, filename);
  await writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Mock ToolContext for testing
 */
const mockContext: ToolContext = {
  toolUseId: "test-tool-use-id",
  sessionId: "test-session-id",
};

describe("loadPluginTools", () => {
  test("should return empty tools and no errors when directory has no JSON files", async () => {
    // Create a non-JSON file
    await writeFile(join(testDir, "readme.txt"), "Not a plugin", "utf-8");

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test("should return empty result when directory doesn't exist", async () => {
    const nonExistentDir = join(testDir, "does-not-exist");

    const result = await loadPluginTools(nonExistentDir);

    expect(result.tools).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test("should load a shell-handler tool correctly", async () => {
    const config: PluginConfigFile = {
      name: "test-tools",
      version: "1.0.0",
      tools: [
        {
          name: "echo-tool",
          description: "Echo a message",
          inputSchema: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
          handler: {
            type: "shell",
            command: "echo {{message}}",
          },
        },
      ],
    };

    await createPluginFile("test-tools.json", config);

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    const tool = result.tools[0];
    expect(tool).toBeDefined();
    if (tool !== undefined) {
      expect(tool.name).toBe("echo-tool");
      expect(tool.description).toBe("Echo a message");
      expect(tool.pluginName).toBe("test-tools");
      expect(tool.inputSchema).toEqual({
        type: "object",
        properties: {
          message: { type: "string" },
        },
      });
      expect(typeof tool.handler).toBe("function");
    }
  });

  test("should load all tools from a single plugin config", async () => {
    const config: PluginConfigFile = {
      name: "multi-tools",
      version: "1.0.0",
      tools: [
        {
          name: "tool-one",
          description: "First tool",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo one" },
        },
        {
          name: "tool-two",
          description: "Second tool",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo two" },
        },
        {
          name: "tool-three",
          description: "Third tool",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo three" },
        },
      ],
    };

    await createPluginFile("multi-tools.json", config);

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(3);
    expect(result.errors).toHaveLength(0);

    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["tool-one", "tool-three", "tool-two"]);

    // All should have same plugin name
    for (const tool of result.tools) {
      expect(tool.pluginName).toBe("multi-tools");
    }
  });

  test("should load tools from multiple JSON files", async () => {
    const config1: PluginConfigFile = {
      name: "plugin-one",
      tools: [
        {
          name: "tool-a",
          description: "Tool A",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo a" },
        },
      ],
    };

    const config2: PluginConfigFile = {
      name: "plugin-two",
      tools: [
        {
          name: "tool-b",
          description: "Tool B",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo b" },
        },
      ],
    };

    await createPluginFile("plugin-one.json", config1);
    await createPluginFile("plugin-two.json", config2);

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    const pluginNames = result.tools.map((t) => t.pluginName).sort();
    expect(pluginNames).toEqual(["plugin-one", "plugin-two"]);
  });

  test("should report error for invalid JSON file", async () => {
    await writeFile(
      join(testDir, "invalid.json"),
      "{ not valid json }",
      "utf-8",
    );

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);

    const error = result.errors[0];
    expect(error).toBeDefined();
    if (error !== undefined) {
      expect(error.source).toContain("invalid.json");
      expect(error.message).toContain("Invalid JSON");
    }
  });

  test("should report validation error for missing required name field", async () => {
    const invalidConfig = {
      // Missing 'name' field
      version: "1.0.0",
      tools: [
        {
          name: "test-tool",
          description: "Test",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo test" },
        },
      ],
    };

    await writeFile(
      join(testDir, "missing-name.json"),
      JSON.stringify(invalidConfig, null, 2),
      "utf-8",
    );

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);

    const error = result.errors[0];
    expect(error).toBeDefined();
    if (error !== undefined) {
      expect(error.source).toContain("missing-name.json");
      expect(error.message).toContain("name");
    }
  });

  test("should report validation error for missing tool handler", async () => {
    const invalidConfig = {
      name: "test-plugin",
      tools: [
        {
          name: "invalid-tool",
          description: "Tool without handler",
          inputSchema: { type: "object" },
          // Missing 'handler' field
        },
      ],
    };

    await writeFile(
      join(testDir, "missing-handler.json"),
      JSON.stringify(invalidConfig, null, 2),
      "utf-8",
    );

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);

    const error = result.errors[0];
    expect(error).toBeDefined();
    if (error !== undefined) {
      expect(error.source).toContain("missing-handler.json");
      expect(error.message).toContain("handler");
    }
  });

  test("should report validation error for invalid tool name with spaces", async () => {
    const invalidConfig: PluginConfigFile = {
      name: "test-plugin",
      tools: [
        {
          name: "invalid tool name",
          description: "Tool with spaces in name",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo test" },
        },
      ],
    };

    await createPluginFile("invalid-name.json", invalidConfig);

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);

    const error = result.errors[0];
    expect(error).toBeDefined();
    if (error !== undefined) {
      expect(error.source).toContain("invalid-name.json");
      expect(error.message).toContain("must match pattern");
    }
  });

  test("should create handler for http-type tools", async () => {
    const config: PluginConfigFile = {
      name: "http-tools",
      tools: [
        {
          name: "http-tool",
          description: "HTTP request tool",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string" },
            },
          },
          handler: {
            type: "http",
            url: "{{url}}",
            method: "GET",
          },
        },
      ],
    };

    await createPluginFile("http-tools.json", config);

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    const tool = result.tools[0];
    expect(tool).toBeDefined();
    if (tool !== undefined) {
      expect(tool.name).toBe("http-tool");
      expect(typeof tool.handler).toBe("function");
    }
  });

  test("should create handler for file-read-type tools", async () => {
    const config: PluginConfigFile = {
      name: "file-tools",
      tools: [
        {
          name: "read-file",
          description: "Read file content",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
            },
          },
          handler: {
            type: "file-read",
            basePath: testDir,
          },
        },
      ],
    };

    await createPluginFile("file-tools.json", config);

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    const tool = result.tools[0];
    expect(tool).toBeDefined();
    if (tool !== undefined) {
      expect(tool.name).toBe("read-file");
      expect(typeof tool.handler).toBe("function");
    }
  });

  test("should load valid files and report errors for invalid ones", async () => {
    // Valid plugin
    const validConfig: PluginConfigFile = {
      name: "valid-plugin",
      tools: [
        {
          name: "valid-tool",
          description: "Valid tool",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo valid" },
        },
      ],
    };

    // Invalid JSON
    await writeFile(join(testDir, "invalid.json"), "{ invalid }", "utf-8");
    await createPluginFile("valid.json", validConfig);

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]?.name).toBe("valid-tool");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.source).toContain("invalid.json");
  });

  test("should ignore non-JSON files", async () => {
    const config: PluginConfigFile = {
      name: "test-plugin",
      tools: [
        {
          name: "test-tool",
          description: "Test",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo test" },
        },
      ],
    };

    await createPluginFile("valid.json", config);
    await writeFile(join(testDir, "readme.md"), "# README", "utf-8");
    await writeFile(join(testDir, "config.txt"), "config", "utf-8");

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  test("should execute shell handler and return result", async () => {
    const config: PluginConfigFile = {
      name: "echo-plugin",
      tools: [
        {
          name: "echo-hello",
          description: "Echo Hello",
          inputSchema: { type: "object" },
          handler: {
            type: "shell",
            command: "echo Hello",
          },
        },
      ],
    };

    await createPluginFile("echo-plugin.json", config);

    const result = await loadPluginTools(testDir);

    expect(result.tools).toHaveLength(1);

    const tool = result.tools[0];
    expect(tool).toBeDefined();
    if (tool !== undefined) {
      // Execute handler
      const handlerResult = await tool.handler({}, mockContext);

      expect(handlerResult.content).toHaveLength(1);
      const content = handlerResult.content[0];
      expect(content).toBeDefined();
      if (content !== undefined && content.type === "text") {
        expect(content.text).toContain("Hello");
      }
    }
  });

  test("should verify handler is async function returning ToolResult", async () => {
    const config: PluginConfigFile = {
      name: "test-plugin",
      tools: [
        {
          name: "test-tool",
          description: "Test tool",
          inputSchema: { type: "object" },
          handler: { type: "shell", command: "echo test" },
        },
      ],
    };

    await createPluginFile("test-plugin.json", config);

    const result = await loadPluginTools(testDir);

    const tool = result.tools[0];
    expect(tool).toBeDefined();
    if (tool !== undefined) {
      // Verify handler is a function
      expect(typeof tool.handler).toBe("function");

      // Verify handler returns a Promise
      const handlerResult = tool.handler({}, mockContext);
      expect(handlerResult).toBeInstanceOf(Promise);

      // Verify result is ToolResult
      const awaitedResult = await handlerResult;
      expect(awaitedResult).toHaveProperty("content");
      expect(Array.isArray(awaitedResult.content)).toBe(true);
    }
  });
});
