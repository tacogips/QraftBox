/**
 * Plugin Loader Module
 *
 * Loads plugin tools from JSON configuration files in the config directory.
 * Scans for *.json files, validates them, and converts tool definitions into
 * SdkTool-compatible objects using handler strategies.
 *
 * Follows the same pattern as src/server/prompts/loader.ts:
 * - Uses readdir() + readFile() from node:fs/promises
 * - Gracefully skips invalid files (collects errors, continues with rest)
 * - Config directory defaults to ~/.config/aynd/tools/
 * - Can be overridden via pluginDir parameter or AYND_TEST_TOOLS_DIR env var
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  PluginConfigFile,
  ToolRegistrationError,
  JsonSchema,
} from "../../types/tool.js";
import { validatePluginConfigFile } from "../../types/tool.js";
import {
  createHandlerFromConfig,
  type ToolResult,
  type ToolContext,
} from "./handler-strategies.js";

/**
 * Default plugin directory
 *
 * User-defined plugin JSON files are stored in ~/.config/aynd/tools/
 */
const DEFAULT_PLUGIN_DIR = join(homedir(), ".config", "aynd", "tools");

/**
 * SdkTool-compatible tool definition
 *
 * Compatible with claude-code-agent SdkTool interface but defined locally
 * until claude-code-agent is added as a dependency.
 */
export interface LoadedPluginTool {
  /**
   * Tool name (unique across all sources)
   */
  readonly name: string;

  /**
   * Human-readable tool description
   */
  readonly description: string;

  /**
   * JSON schema for tool input validation
   */
  readonly inputSchema: JsonSchema;

  /**
   * Tool handler function
   */
  readonly handler: (
    args: Record<string, unknown>,
    context: ToolContext,
  ) => Promise<ToolResult>;

  /**
   * Plugin name (from PluginConfigFile.name)
   */
  readonly pluginName: string;
}

/**
 * Result of loading plugin tools
 *
 * Contains successfully loaded tools and any errors encountered during loading.
 */
export interface PluginLoadResult {
  /**
   * Successfully loaded plugin tools
   */
  readonly tools: readonly LoadedPluginTool[];

  /**
   * Errors encountered during loading
   */
  readonly errors: readonly ToolRegistrationError[];
}

/**
 * Load plugin tools from a directory
 *
 * Scans the plugin directory for *.json files, parses and validates each one,
 * and creates tool handlers for valid definitions.
 *
 * Following the same pattern as src/server/prompts/loader.ts:
 * - Uses readdir() + readFile()
 * - Gracefully skips invalid files (adds error, continues with rest)
 * - Config directory defaults to ~/.config/aynd/tools/
 * - Can be overridden via pluginDir parameter or AYND_TEST_TOOLS_DIR env var
 *
 * @param pluginDir - Directory to load plugins from (optional)
 * @returns Plugin load result with tools and errors
 */
export async function loadPluginTools(
  pluginDir?: string | undefined,
): Promise<PluginLoadResult> {
  const dir =
    pluginDir ?? process.env["AYND_TEST_TOOLS_DIR"] ?? DEFAULT_PLUGIN_DIR;
  const tools: LoadedPluginTool[] = [];
  const errors: ToolRegistrationError[] = [];

  // Check if directory exists
  try {
    const stats = await stat(dir);
    if (!stats.isDirectory()) {
      return { tools: [], errors: [] };
    }
  } catch {
    // Directory doesn't exist - not an error, just no plugins
    return { tools: [], errors: [] };
  }

  // Read all files in directory
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return {
      tools: [],
      errors: [
        {
          source: dir,
          message: `Failed to read plugin directory: ${errorMessage}`,
        },
      ],
    };
  }

  // Filter for .json files
  const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));

  // Process each JSON file
  for (const filename of jsonFiles) {
    const filePath = join(dir, filename);

    // Read file
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      errors.push({
        source: filePath,
        message: `Failed to read file: ${errorMessage}`,
      });
      continue;
    }

    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      errors.push({
        source: filePath,
        message: `Invalid JSON: ${errorMessage}`,
      });
      continue;
    }

    // Validate structure
    const validation = validatePluginConfigFile(data);
    if (!validation.valid || validation.config === undefined) {
      for (const error of validation.errors) {
        errors.push({
          source: filePath,
          message: error,
        });
      }
      continue;
    }

    const config: PluginConfigFile = validation.config;

    // Create tools from definitions
    for (const toolDef of config.tools) {
      try {
        const handler = createHandlerFromConfig(toolDef.handler);
        tools.push({
          name: toolDef.name,
          description: toolDef.description,
          inputSchema: toolDef.inputSchema,
          handler,
          pluginName: config.name,
        });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        errors.push({
          source: filePath,
          toolName: toolDef.name,
          message: `Failed to create handler: ${errorMessage}`,
        });
      }
    }
  }

  return { tools, errors };
}
