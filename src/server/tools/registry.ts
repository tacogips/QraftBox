/**
 * AyndToolRegistry Module
 *
 * Central aggregator for both built-in and plugin tools.
 * Provides initialization, listing, and MCP server config conversion.
 *
 * The registry manages tool registration, prevents name conflicts, and exposes
 * tools in the format required by ClaudeCodeToolAgent.
 */

import type {
  RegisteredToolInfo,
  ToolRegistrationResult,
  ToolRegistrationError,
  JsonSchema,
} from "../../types/tool.js";
import type { ToolResult, ToolContext } from "./handler-strategies.js";
import { createBuiltinTools } from "./builtin/index.js";
import { loadPluginTools, type LoadedPluginTool } from "./plugin-loader.js";

/**
 * MCP server name used by aynd
 *
 * This is a fixed identifier for the aynd MCP server instance.
 */
const MCP_SERVER_NAME = "aynd-tools";

/**
 * MCP server version
 */
const MCP_SERVER_VERSION = "1.0.0";

/**
 * SdkTool-compatible interface
 *
 * Defined locally to avoid claude-code-agent dependency until it's added.
 * Compatible with claude-code-agent SdkTool type.
 */
interface SdkToolLike {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly handler: (
    args: Record<string, unknown>,
    context: ToolContext,
  ) => Promise<ToolResult>;
}

/**
 * McpSdkServerConfig-compatible interface
 *
 * Defined locally to avoid claude-code-agent dependency until it's added.
 * Compatible with claude-code-agent McpSdkServerConfig type.
 */
interface McpSdkServerConfigLike {
  readonly type: "sdk";
  readonly name: string;
  readonly version: string;
  readonly tools: readonly SdkToolLike[];
}

/**
 * AyndToolRegistry interface
 *
 * Central tool registry for aynd. Manages both built-in and plugin tools,
 * provides tool listing and inspection, and converts tools to MCP server config.
 */
export interface AyndToolRegistry {
  /**
   * Load built-in tools and plugin tools from disk
   *
   * Initializes the registry by:
   * 1. Creating built-in tools
   * 2. Loading plugin tools from plugin directory
   * 3. Registering all tools (rejecting duplicates)
   *
   * @returns Registration result with success status, tool count, and errors
   */
  initialize(): Promise<ToolRegistrationResult>;

  /**
   * Re-scan plugin directory and reload changed tools
   *
   * Clears existing plugin tools (preserving built-in tools) and reloads
   * from disk. Useful for hot-reloading plugin changes without restart.
   *
   * @returns Registration result with success status, tool count, and errors
   */
  reloadPlugins(): Promise<ToolRegistrationResult>;

  /**
   * List metadata for all registered tools
   *
   * @returns Array of registered tool metadata
   */
  listTools(): readonly RegisteredToolInfo[];

  /**
   * Get a specific tool's metadata by name
   *
   * @param name - Tool name to look up
   * @returns Tool metadata if found, undefined otherwise
   */
  getToolInfo(name: string): RegisteredToolInfo | undefined;

  /**
   * Check if a tool exists
   *
   * @param name - Tool name to check
   * @returns True if tool is registered, false otherwise
   */
  hasTool(name: string): boolean;

  /**
   * Total number of registered tools
   *
   * @returns Count of all registered tools (builtin + plugin)
   */
  getToolCount(): number;

  /**
   * Convert all tools to McpSdkServerConfig for ClaudeCodeToolAgent
   *
   * Creates an MCP SDK server config object containing all registered tools.
   * This config can be passed to ClaudeCodeToolAgent's mcpServers option.
   *
   * @returns MCP SDK server configuration
   */
  toMcpServerConfig(): McpSdkServerConfigLike;

  /**
   * Get allowed tool names in MCP format
   *
   * Returns tool names in the MCP naming convention: `mcp__<serverName>__<toolName>`
   * This list can be passed to ClaudeCodeToolAgent's allowedTools option.
   *
   * @returns Array of MCP-formatted tool names
   */
  getAllowedToolNames(): readonly string[];
}

/**
 * Options for creating the tool registry
 */
export interface AyndToolRegistryOptions {
  /**
   * Plugin directory
   *
   * Directory to load plugin JSON files from.
   * Defaults to ~/.config/aynd/tools/ if not specified.
   */
  readonly pluginDir?: string | undefined;

  /**
   * Project path for built-in tools
   *
   * Absolute path to the project root. Required for built-in tools that
   * need workspace context (e.g., git-status, workspace-info).
   */
  readonly projectPath: string;
}

/**
 * Internal registered tool with handler
 *
 * Combines tool metadata with the actual tool handler implementation.
 */
interface InternalTool {
  readonly info: RegisteredToolInfo;
  readonly tool: SdkToolLike;
}

/**
 * Create an AyndToolRegistry instance
 *
 * Creates a new tool registry with the specified options.
 * Call initialize() after creation to load tools.
 *
 * @param options - Registry configuration options
 * @returns AyndToolRegistry instance
 */
export function createAyndToolRegistry(
  options: AyndToolRegistryOptions,
): AyndToolRegistry {
  // Store tools: Map<name, InternalTool>
  const builtinTools = new Map<string, InternalTool>();
  const pluginTools = new Map<string, InternalTool>();

  /**
   * Register built-in tools
   *
   * Creates built-in tools and adds them to the builtin tools map.
   * Returns errors for any tool that fails registration.
   *
   * @returns Array of registration errors
   */
  function registerBuiltinTools(): readonly ToolRegistrationError[] {
    const errors: ToolRegistrationError[] = [];

    try {
      const tools = createBuiltinTools(options.projectPath);

      for (const tool of tools) {
        // Check for duplicates
        if (builtinTools.has(tool.name)) {
          errors.push({
            source: "builtin",
            toolName: tool.name,
            message: `Duplicate built-in tool name: ${tool.name}`,
          });
          continue;
        }

        const info: RegisteredToolInfo = {
          name: tool.name,
          description: tool.description,
          source: "builtin",
          inputSchema: tool.inputSchema as JsonSchema,
        };

        builtinTools.set(tool.name, { info, tool: tool as SdkToolLike });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      errors.push({
        source: "builtin",
        message: `Failed to create built-in tools: ${errorMessage}`,
      });
    }

    return errors;
  }

  /**
   * Register plugin tools from load result
   *
   * Processes loaded plugin tools and adds them to the plugin tools map.
   * Returns errors for duplicate names or other issues.
   *
   * @param loadedTools - Plugin tools loaded from disk
   * @returns Array of registration errors
   */
  function registerPluginTools(
    loadedTools: readonly LoadedPluginTool[],
  ): readonly ToolRegistrationError[] {
    const errors: ToolRegistrationError[] = [];

    for (const loaded of loadedTools) {
      // Check for name conflict with built-in tools
      if (builtinTools.has(loaded.name)) {
        errors.push({
          source: "plugin",
          toolName: loaded.name,
          message: `Plugin tool "${loaded.name}" conflicts with built-in tool of the same name`,
        });
        continue;
      }

      // Check for duplicate among other plugin tools
      if (pluginTools.has(loaded.name)) {
        errors.push({
          source: "plugin",
          toolName: loaded.name,
          message: `Duplicate plugin tool name: ${loaded.name}`,
        });
        continue;
      }

      const info: RegisteredToolInfo = {
        name: loaded.name,
        description: loaded.description,
        source: "plugin",
        pluginName: loaded.pluginName,
        inputSchema: loaded.inputSchema,
      };

      pluginTools.set(loaded.name, { info, tool: loaded });
    }

    return errors;
  }

  /**
   * Get all tools as an array
   *
   * Combines built-in and plugin tools into a single array.
   *
   * @returns Array of all internal tools
   */
  function getAllTools(): readonly InternalTool[] {
    return [...builtinTools.values(), ...pluginTools.values()];
  }

  return {
    async initialize(): Promise<ToolRegistrationResult> {
      const allErrors: ToolRegistrationError[] = [];

      // 1. Register built-in tools
      const builtinErrors = registerBuiltinTools();
      allErrors.push(...builtinErrors);

      // 2. Load and register plugin tools
      const loadResult = await loadPluginTools(options.pluginDir);
      allErrors.push(...loadResult.errors);

      const pluginErrors = registerPluginTools(loadResult.tools);
      allErrors.push(...pluginErrors);

      const totalCount = builtinTools.size + pluginTools.size;

      return {
        success: allErrors.length === 0,
        toolCount: totalCount,
        errors: allErrors,
      };
    },

    async reloadPlugins(): Promise<ToolRegistrationResult> {
      // Clear existing plugin tools
      pluginTools.clear();

      // Reload from disk
      const loadResult = await loadPluginTools(options.pluginDir);
      const allErrors: ToolRegistrationError[] = [...loadResult.errors];

      const pluginErrors = registerPluginTools(loadResult.tools);
      allErrors.push(...pluginErrors);

      const totalCount = builtinTools.size + pluginTools.size;

      return {
        success: allErrors.length === 0,
        toolCount: totalCount,
        errors: allErrors,
      };
    },

    listTools(): readonly RegisteredToolInfo[] {
      return getAllTools().map((t) => t.info);
    },

    getToolInfo(name: string): RegisteredToolInfo | undefined {
      const builtin = builtinTools.get(name);
      if (builtin !== undefined) return builtin.info;
      const plugin = pluginTools.get(name);
      if (plugin !== undefined) return plugin.info;
      return undefined;
    },

    hasTool(name: string): boolean {
      return builtinTools.has(name) || pluginTools.has(name);
    },

    getToolCount(): number {
      return builtinTools.size + pluginTools.size;
    },

    toMcpServerConfig(): McpSdkServerConfigLike {
      const allSdkTools = getAllTools().map((t) => t.tool);
      return {
        type: "sdk",
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
        tools: allSdkTools,
      };
    },

    getAllowedToolNames(): readonly string[] {
      return getAllTools().map(
        (t) => `mcp__${MCP_SERVER_NAME}__${t.tool.name}`,
      );
    },
  };
}
