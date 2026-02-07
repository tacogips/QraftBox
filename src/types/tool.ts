/**
 * Tool Registration System Types
 *
 * Type definitions for the aynd tool registration system, including built-in
 * tools, plugin tools, and tool registry interfaces.
 *
 * NOTE: JsonSchema and ToolInputSchema types are compatible with claude-code-agent
 * library but defined locally until claude-code-agent is added as a dependency.
 * Once added, these should be imported from "claude-code-agent/sdk/types/tool".
 */

/**
 * JSON Schema representation for tool input validation
 *
 * Compatible with claude-code-agent ToolInputSchema type.
 */
export interface JsonSchema {
  readonly type: string;
  readonly properties?: Record<string, JsonSchemaProperty> | undefined;
  readonly required?: readonly string[] | undefined;
  readonly items?: JsonSchemaProperty | undefined;
  readonly description?: string | undefined;
  readonly enum?: readonly unknown[] | undefined;
  readonly additionalProperties?: boolean | JsonSchemaProperty | undefined;
}

/**
 * JSON Schema property definition
 */
export interface JsonSchemaProperty {
  readonly type: string;
  readonly description?: string | undefined;
  readonly enum?: readonly unknown[] | undefined;
  readonly items?: JsonSchemaProperty | undefined;
  readonly properties?: Record<string, JsonSchemaProperty> | undefined;
  readonly required?: readonly string[] | undefined;
  readonly default?: unknown;
}

/**
 * Tool input schema for validation
 *
 * Alias for JsonSchema - compatible with claude-code-agent ToolInputSchema.
 */
export type ToolInputSchema = JsonSchema;

/**
 * Tool source type
 *
 * - builtin: Tools shipped with aynd (TypeScript implementations)
 * - plugin: User-defined tools loaded from JSON config files
 */
export type ToolSource = "builtin" | "plugin";

/**
 * Plugin handler execution strategy
 *
 * - shell: Execute shell command with argument interpolation
 * - http: Send HTTP request with tool args as JSON body
 * - file-read: Read file content within restricted base path
 */
export type PluginHandlerType = "shell" | "http" | "file-read";

/**
 * Shell command handler configuration
 *
 * Executes a shell command via Bun.spawn with template parameter substitution.
 * Security: Uses argument array to prevent command injection.
 */
export interface ShellHandlerConfig {
  readonly type: "shell";

  /**
   * Command template with {{param}} placeholders for argument substitution
   *
   * Example: "grep -rn '{{pattern}}' {{directory}} || true"
   */
  readonly command: string;

  /**
   * Command timeout in milliseconds
   *
   * @default 30000
   */
  readonly timeout?: number | undefined;

  /**
   * Working directory override
   *
   * If not specified, uses project root.
   */
  readonly cwd?: string | undefined;
}

/**
 * HTTP request handler configuration
 *
 * Sends an HTTP request with tool arguments interpolated into URL or body.
 */
export interface HttpHandlerConfig {
  readonly type: "http";

  /**
   * Target URL with optional {{param}} placeholders
   *
   * Example: "{{url}}/health"
   */
  readonly url: string;

  /**
   * HTTP method
   *
   * @default "POST"
   */
  readonly method?: "GET" | "POST" | "PUT" | undefined;

  /**
   * HTTP headers to include in request
   */
  readonly headers?: Record<string, string> | undefined;

  /**
   * Request timeout in milliseconds
   *
   * @default 10000
   */
  readonly timeout?: number | undefined;
}

/**
 * File read handler configuration
 *
 * Reads file content with path traversal protection.
 */
export interface FileReadHandlerConfig {
  readonly type: "file-read";

  /**
   * Base directory for file access
   *
   * All file paths are resolved relative to this directory.
   * Requests outside this directory are rejected.
   */
  readonly basePath: string;

  /**
   * Maximum file size in bytes
   *
   * @default 1048576 (1MB)
   */
  readonly maxSize?: number | undefined;
}

/**
 * Plugin handler configuration union
 *
 * One of: shell, http, or file-read handler config.
 */
export type PluginHandlerConfig =
  | ShellHandlerConfig
  | HttpHandlerConfig
  | FileReadHandlerConfig;

/**
 * Plugin tool definition from JSON config
 *
 * Defines a single tool with its metadata and execution handler.
 */
export interface PluginToolDefinition {
  /**
   * Tool name (must match /^[a-zA-Z0-9_-]+$/)
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
   * Execution handler configuration
   */
  readonly handler: PluginHandlerConfig;
}

/**
 * Plugin configuration file structure
 *
 * Top-level structure for JSON config files in ~/.config/aynd/tools/*.json
 */
export interface PluginConfigFile {
  /**
   * Plugin collection name (e.g., "my-tools")
   */
  readonly name: string;

  /**
   * Plugin version (semver recommended)
   */
  readonly version?: string | undefined;

  /**
   * Tool definitions in this plugin
   */
  readonly tools: readonly PluginToolDefinition[];
}

/**
 * Registered tool metadata
 *
 * Metadata for a tool registered in the tool registry.
 * Used for listing, inspection, and API responses.
 */
export interface RegisteredToolInfo {
  /**
   * Tool name (unique across all sources)
   */
  readonly name: string;

  /**
   * Human-readable tool description
   */
  readonly description: string;

  /**
   * Tool source (builtin or plugin)
   */
  readonly source: ToolSource;

  /**
   * Plugin name (only for source: "plugin")
   */
  readonly pluginName?: string | undefined;

  /**
   * JSON schema for tool input
   */
  readonly inputSchema: JsonSchema;
}

/**
 * Tool registration result
 *
 * Result of loading and registering tools from disk.
 * Contains success status, tool count, and any errors encountered.
 */
export interface ToolRegistrationResult {
  /**
   * Whether all tools loaded successfully
   *
   * False if any errors occurred during loading.
   */
  readonly success: boolean;

  /**
   * Total number of tools successfully registered
   */
  readonly toolCount: number;

  /**
   * Errors encountered during registration
   */
  readonly errors: readonly ToolRegistrationError[];
}

/**
 * Tool registration error
 *
 * Details about a specific tool registration failure.
 */
export interface ToolRegistrationError {
  /**
   * Error source (file path or "builtin")
   */
  readonly source: string;

  /**
   * Tool name (if error is tool-specific)
   */
  readonly toolName?: string | undefined;

  /**
   * Error message
   */
  readonly message: string;
}

/**
 * Tool name validation pattern
 *
 * Tool names must consist only of alphanumeric characters, hyphens, and underscores.
 */
export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validation result for plugin config file
 */
export interface PluginConfigValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly config?: PluginConfigFile | undefined;
}

/**
 * Validation result for plugin tool definition
 */
export interface PluginToolValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Type guard for shell handler config
 */
export function isShellHandlerConfig(
  config: PluginHandlerConfig,
): config is ShellHandlerConfig {
  return config.type === "shell";
}

/**
 * Type guard for HTTP handler config
 */
export function isHttpHandlerConfig(
  config: PluginHandlerConfig,
): config is HttpHandlerConfig {
  return config.type === "http";
}

/**
 * Type guard for file-read handler config
 */
export function isFileReadHandlerConfig(
  config: PluginHandlerConfig,
): config is FileReadHandlerConfig {
  return config.type === "file-read";
}

/**
 * Validate plugin configuration file
 *
 * Validates the structure and content of a plugin config file parsed from JSON.
 *
 * @param data - Unknown data to validate
 * @returns Validation result with errors and typed config if valid
 */
export function validatePluginConfigFile(
  data: unknown,
): PluginConfigValidationResult {
  const errors: string[] = [];

  // Check if data is an object
  if (typeof data !== "object" || data === null) {
    return {
      valid: false,
      errors: ["Config must be an object"],
    };
  }

  const obj = data as Record<string, unknown>;

  // Validate name
  if (typeof obj["name"] !== "string" || obj["name"].trim().length === 0) {
    errors.push("Plugin name is required and must be a non-empty string");
  }

  // Validate version (optional)
  if (obj["version"] !== undefined && typeof obj["version"] !== "string") {
    errors.push("Plugin version must be a string if provided");
  }

  // Validate tools array
  if (!Array.isArray(obj["tools"])) {
    errors.push("Tools must be an array");
  } else {
    const tools = obj["tools"];
    if (tools.length === 0) {
      errors.push("Tools array cannot be empty");
    }

    // Validate each tool definition
    for (let i = 0; i < tools.length; i++) {
      const toolResult = validatePluginToolDefinition(tools[i]);
      if (!toolResult.valid) {
        for (const error of toolResult.errors) {
          errors.push(`Tool [${i}]: ${error}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    config: data as PluginConfigFile,
  };
}

/**
 * Validate plugin tool definition
 *
 * Validates a single tool definition from a plugin config file.
 *
 * @param data - Unknown data to validate
 * @returns Validation result with errors
 */
export function validatePluginToolDefinition(
  data: unknown,
): PluginToolValidationResult {
  const errors: string[] = [];

  // Check if data is an object
  if (typeof data !== "object" || data === null) {
    return {
      valid: false,
      errors: ["Tool definition must be an object"],
    };
  }

  const obj = data as Record<string, unknown>;

  // Validate name
  if (typeof obj["name"] !== "string") {
    errors.push("Tool name is required and must be a string");
  } else {
    if (!TOOL_NAME_PATTERN.test(obj["name"])) {
      errors.push(
        `Tool name "${obj["name"]}" must match pattern ${TOOL_NAME_PATTERN.source}`,
      );
    }
  }

  // Validate description
  if (
    typeof obj["description"] !== "string" ||
    obj["description"].trim().length === 0
  ) {
    errors.push("Tool description is required and must be a non-empty string");
  }

  // Validate inputSchema
  if (typeof obj["inputSchema"] !== "object" || obj["inputSchema"] === null) {
    errors.push("Tool inputSchema is required and must be an object");
  } else {
    const schema = obj["inputSchema"] as Record<string, unknown>;
    if (typeof schema["type"] !== "string") {
      errors.push("Tool inputSchema must have a 'type' property");
    }
  }

  // Validate handler
  if (typeof obj["handler"] !== "object" || obj["handler"] === null) {
    errors.push("Tool handler is required and must be an object");
  } else {
    const handler = obj["handler"] as Record<string, unknown>;
    const handlerType = handler["type"];

    if (
      handlerType !== "shell" &&
      handlerType !== "http" &&
      handlerType !== "file-read"
    ) {
      errors.push(
        `Handler type must be "shell", "http", or "file-read", got: ${handlerType}`,
      );
    } else {
      // Type-specific validation
      if (handlerType === "shell") {
        if (
          typeof handler["command"] !== "string" ||
          handler["command"].trim().length === 0
        ) {
          errors.push("Shell handler requires a non-empty 'command' string");
        }
        if (
          handler["timeout"] !== undefined &&
          typeof handler["timeout"] !== "number"
        ) {
          errors.push("Shell handler timeout must be a number if provided");
        }
        if (
          handler["cwd"] !== undefined &&
          typeof handler["cwd"] !== "string"
        ) {
          errors.push("Shell handler cwd must be a string if provided");
        }
      } else if (handlerType === "http") {
        if (
          typeof handler["url"] !== "string" ||
          handler["url"].trim().length === 0
        ) {
          errors.push("HTTP handler requires a non-empty 'url' string");
        }
        if (handler["method"] !== undefined) {
          const method = handler["method"];
          if (method !== "GET" && method !== "POST" && method !== "PUT") {
            errors.push(
              `HTTP handler method must be "GET", "POST", or "PUT", got: ${method}`,
            );
          }
        }
        if (handler["headers"] !== undefined) {
          if (
            typeof handler["headers"] !== "object" ||
            handler["headers"] === null
          ) {
            errors.push("HTTP handler headers must be an object if provided");
          }
        }
        if (
          handler["timeout"] !== undefined &&
          typeof handler["timeout"] !== "number"
        ) {
          errors.push("HTTP handler timeout must be a number if provided");
        }
      } else if (handlerType === "file-read") {
        if (
          typeof handler["basePath"] !== "string" ||
          handler["basePath"].trim().length === 0
        ) {
          errors.push(
            "File-read handler requires a non-empty 'basePath' string",
          );
        }
        if (
          handler["maxSize"] !== undefined &&
          typeof handler["maxSize"] !== "number"
        ) {
          errors.push("File-read handler maxSize must be a number if provided");
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
