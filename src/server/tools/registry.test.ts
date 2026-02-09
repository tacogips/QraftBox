/**
 * QraftBoxToolRegistry Tests
 *
 * Tests for tool registry initialization, plugin loading, and MCP config generation.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { createQraftBoxToolRegistry } from "./registry.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("QraftBoxToolRegistry", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test plugins
    tempDir = await mkdtemp(join(tmpdir(), "qraftbox-tools-test-"));
  });

  test("initialize() registers built-in tools", async () => {
    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    const result = await registry.initialize();

    expect(result.success).toBe(true);
    expect(result.toolCount).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // Should have built-in tools
    const tools = registry.listTools();
    expect(tools.length).toBeGreaterThan(0);

    // Check for specific built-in tools
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("git-status");
    expect(toolNames).toContain("git-diff-summary");
    expect(toolNames).toContain("workspace-info");
    expect(toolNames).toContain("file-reader");
  });

  test("initialize() loads plugin tools from directory", async () => {
    // Create a test plugin config file
    const pluginConfig = {
      name: "test-plugin",
      version: "1.0.0",
      tools: [
        {
          name: "test-tool",
          description: "A test tool",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "Message to echo",
              },
            },
          },
          handler: {
            type: "shell",
            command: "echo {{message}}",
          },
        },
      ],
    };

    await writeFile(
      join(tempDir, "test-plugin.json"),
      JSON.stringify(pluginConfig, null, 2),
    );

    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    const result = await registry.initialize();

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Should have both built-in and plugin tools
    const tools = registry.listTools();
    const pluginTool = tools.find((t) => t.name === "test-tool");

    expect(pluginTool).toBeDefined();
    expect(pluginTool?.source).toBe("plugin");
    expect(pluginTool?.pluginName).toBe("test-plugin");
  });

  test("initialize() rejects plugin tools with duplicate names", async () => {
    // Create a plugin that conflicts with a built-in tool
    const conflictingPlugin = {
      name: "conflicting-plugin",
      version: "1.0.0",
      tools: [
        {
          name: "git-status",
          description: "Conflicting tool",
          inputSchema: { type: "object" },
          handler: {
            type: "shell",
            command: "echo conflict",
          },
        },
      ],
    };

    await writeFile(
      join(tempDir, "conflict.json"),
      JSON.stringify(conflictingPlugin, null, 2),
    );

    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    const result = await registry.initialize();

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    const conflictError = result.errors.find(
      (e) => e.toolName === "git-status",
    );
    expect(conflictError).toBeDefined();
    expect(conflictError?.message).toContain("conflicts with built-in tool");
  });

  test("getToolInfo() returns tool metadata", async () => {
    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    await registry.initialize();

    const gitStatusInfo = registry.getToolInfo("git-status");
    expect(gitStatusInfo).toBeDefined();
    expect(gitStatusInfo?.name).toBe("git-status");
    expect(gitStatusInfo?.source).toBe("builtin");
    expect(gitStatusInfo?.description).toBeTruthy();
  });

  test("hasTool() checks tool existence", async () => {
    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    await registry.initialize();

    expect(registry.hasTool("git-status")).toBe(true);
    expect(registry.hasTool("nonexistent-tool")).toBe(false);
  });

  test("toMcpServerConfig() returns valid MCP config", async () => {
    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    await registry.initialize();

    const mcpConfig = registry.toMcpServerConfig();

    expect(mcpConfig.type).toBe("sdk");
    expect(mcpConfig.name).toBe("qraftbox-tools");
    expect(mcpConfig.version).toBe("1.0.0");
    expect(mcpConfig.tools.length).toBeGreaterThan(0);

    // Check tool structure
    const firstTool = mcpConfig.tools[0];
    expect(firstTool).toHaveProperty("name");
    expect(firstTool).toHaveProperty("description");
    expect(firstTool).toHaveProperty("inputSchema");
    expect(firstTool).toHaveProperty("handler");
    expect(typeof firstTool?.handler).toBe("function");
  });

  test("getAllowedToolNames() returns MCP-formatted names", async () => {
    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    await registry.initialize();

    const allowedNames = registry.getAllowedToolNames();

    expect(allowedNames.length).toBeGreaterThan(0);

    // All names should follow mcp__qraftbox-tools__<name> format
    for (const name of allowedNames) {
      expect(name).toMatch(/^mcp__qraftbox-tools__[a-zA-Z0-9_-]+$/);
    }

    // Should contain known built-in tools
    expect(allowedNames).toContain("mcp__qraftbox-tools__git-status");
    expect(allowedNames).toContain("mcp__qraftbox-tools__workspace-info");
  });

  test("reloadPlugins() preserves built-in tools", async () => {
    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    await registry.initialize();
    const initialCount = registry.getToolCount();

    // Reload plugins
    const result = await registry.reloadPlugins();

    expect(result.success).toBe(true);
    expect(registry.getToolCount()).toBe(initialCount); // Same count, no plugin tools

    // Built-in tools should still be there
    expect(registry.hasTool("git-status")).toBe(true);
  });

  test("reloadPlugins() picks up new plugin files", async () => {
    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    await registry.initialize();

    // Add a new plugin file
    const newPlugin = {
      name: "new-plugin",
      version: "1.0.0",
      tools: [
        {
          name: "new-tool",
          description: "A new tool",
          inputSchema: { type: "object" },
          handler: {
            type: "shell",
            command: "echo new",
          },
        },
      ],
    };

    await writeFile(
      join(tempDir, "new-plugin.json"),
      JSON.stringify(newPlugin, null, 2),
    );

    // Reload plugins
    await registry.reloadPlugins();

    // New tool should be loaded
    expect(registry.hasTool("new-tool")).toBe(true);

    const toolInfo = registry.getToolInfo("new-tool");
    expect(toolInfo?.source).toBe("plugin");
    expect(toolInfo?.pluginName).toBe("new-plugin");
  });

  test("reloadPlugins() removes deleted plugin tools", async () => {
    // Create initial plugin
    const initialPlugin = {
      name: "temp-plugin",
      version: "1.0.0",
      tools: [
        {
          name: "temp-tool",
          description: "Temporary tool",
          inputSchema: { type: "object" },
          handler: {
            type: "shell",
            command: "echo temp",
          },
        },
      ],
    };

    const pluginPath = join(tempDir, "temp-plugin.json");
    await writeFile(pluginPath, JSON.stringify(initialPlugin, null, 2));

    const registry = createQraftBoxToolRegistry({
      projectPath: process.cwd(),
      pluginDir: tempDir,
    });

    await registry.initialize();
    expect(registry.hasTool("temp-tool")).toBe(true);

    // Delete the plugin file
    await rm(pluginPath);

    // Reload plugins
    await registry.reloadPlugins();

    // Tool should be gone
    expect(registry.hasTool("temp-tool")).toBe(false);
  });
});
