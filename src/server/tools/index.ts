/**
 * Tool Registration System - Public Exports
 *
 * Re-exports the public API for the qraftbox tool registration system.
 */

export {
  createQraftBoxToolRegistry,
  type QraftBoxToolRegistry,
  type QraftBoxToolRegistryOptions,
} from "./registry.js";

export {
  loadPluginTools,
  type LoadedPluginTool,
  type PluginLoadResult,
} from "./plugin-loader.js";

export { createBuiltinTools } from "./builtin/index.js";

export {
  createShellHandler,
  createHttpHandler,
  createFileReadHandler,
  createHandlerFromConfig,
  type ToolResult,
  type ToolResultContent,
  type ToolContext,
  type ToolHandler,
} from "./handler-strategies.js";
