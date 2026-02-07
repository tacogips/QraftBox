# Custom Tool Registration System

Design specification for the aynd tool registration system. Enables built-in tools, user-defined plugin tools via JSON config, MCP server aggregation for `ClaudeCodeToolAgent`, and a REST API for tool listing and management.

## Overview

aynd needs to provide custom tools to Claude Code agent sessions. These tools extend what the AI can do during sessions -- for example, running git status, reading workspace metadata, or executing user-defined shell commands. The system must:

1. Ship default built-in tools with aynd
2. Support user-defined plugin tools loaded from JSON config files
3. Aggregate all tools into an `McpSdkServerConfig` for `ClaudeCodeToolAgent`
4. Expose a REST API for listing, inspecting, and hot-reloading tools

## Architecture

```
+-------------------------+     +-------------------------+
| Built-in Tools          |     | Plugin JSON Files       |
| (TypeScript functions)  |     | (~/.config/aynd/tools/) |
+------------+------------+     +------------+------------+
             |                               |
             v                               v
+------------+------------+     +------------+------------+
| createBuiltinTools()    |     | loadPluginTools()       |
| returns SdkTool[]       |     | returns SdkTool[]       |
+------------+------------+     +------------+------------+
             |                               |
             +-------+-------+-------+-------+
                     |               |
                     v               v
          +----------+--------------+----------+
          | AyndToolRegistry                    |
          | - builtin tools                     |
          | - plugin tools                      |
          | - toMcpServerConfig()               |
          +----------+-----+-----------+-------+
                     |     |           |
                     v     v           v
    +----------------+  +--+------+  +-+-----------+
    | Session Manager|  | REST API|  | Tool Agent  |
    | integration    |  | /tools  |  | MCP config  |
    +----------------+  +---------+  +-------------+
```

## Key Dependencies

### claude-code-agent Library API (v0.1.0)

Source: `/g/gits/tacogips/claude-code-agent/`

Types consumed by aynd (see `src/sdk/types/tool.ts`, `src/sdk/types/mcp.ts`, `src/sdk/tool-registry.ts`, `src/sdk/agent.ts`):

```typescript
// Tool definition
interface SdkTool<TInput = Record<string, unknown>> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
  readonly handler: (args: TInput, context: ToolContext) => Promise<ToolResult>;
}

// Tool result
interface ToolResult {
  readonly content: readonly ToolResultContent[];
  readonly isError?: boolean;
}

interface ToolResultContent {
  readonly type: "text" | "image";
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
}

// Context passed to handlers
interface ToolContext {
  readonly toolUseId: string;
  readonly sessionId: string;
  readonly signal?: AbortSignal;
}

// MCP server config (in-process)
interface McpSdkServerConfig {
  readonly type: "sdk";
  readonly name: string;
  readonly version?: string;
  readonly tools: readonly SdkTool[];
}

// Factory functions
function tool<TInput>(config: ToolConfig<TInput>): SdkTool<TInput>;
function createSdkMcpServer(options: SdkMcpServerOptions): McpSdkServerConfig;

// Agent accepts mcpServers + allowedTools
interface ToolAgentOptions {
  mcpServers?: Record<string, McpServerConfig>;
  allowedTools?: string[];
  // ...other options
}
```

Tool naming convention for MCP: `mcp__<serverName>__<toolName>`. For example, tools on a server named `aynd-tools` are referenced as `mcp__aynd-tools__git-status`.

## Type Definitions

File: `src/types/tool.ts`

### ToolSource

```typescript
type ToolSource = "builtin" | "plugin";
```

### PluginHandlerType

```typescript
type PluginHandlerType = "shell" | "http" | "file-read";
```

Three execution strategies for plugin-defined tools:
- **shell**: Execute a shell command via `Bun.spawn` with argument interpolation
- **http**: Send an HTTP request to a URL with tool args as JSON body
- **file-read**: Read file content within a restricted base path

### Handler Configs

```typescript
interface ShellHandlerConfig {
  readonly type: "shell";
  readonly command: string;       // Command template with {{param}} placeholders
  readonly timeout?: number;      // Default: 30000ms
  readonly cwd?: string;          // Working directory override
}

interface HttpHandlerConfig {
  readonly type: "http";
  readonly url: string;
  readonly method?: "GET" | "POST" | "PUT";  // Default: POST
  readonly headers?: Record<string, string>;
  readonly timeout?: number;      // Default: 10000ms
}

interface FileReadHandlerConfig {
  readonly type: "file-read";
  readonly basePath: string;      // Restrict reads to this directory
  readonly maxSize?: number;      // Max file size in bytes. Default: 1MB
}
```

### Plugin Definitions (JSON-parsed)

```typescript
interface PluginToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly handler: ShellHandlerConfig | HttpHandlerConfig | FileReadHandlerConfig;
}

interface PluginConfigFile {
  readonly name: string;          // Plugin collection name (e.g. "my-tools")
  readonly version?: string;
  readonly tools: readonly PluginToolDefinition[];
}
```

### Registry Types

```typescript
interface RegisteredToolInfo {
  readonly name: string;
  readonly description: string;
  readonly source: ToolSource;
  readonly pluginName?: string;   // Only for source: "plugin"
  readonly inputSchema: JsonSchema;
}

interface ToolRegistrationResult {
  readonly success: boolean;
  readonly toolCount: number;
  readonly errors: readonly ToolRegistrationError[];
}

interface ToolRegistrationError {
  readonly source: string;        // File path or "builtin"
  readonly toolName?: string;
  readonly message: string;
}
```

### Validation

```typescript
function validatePluginConfigFile(data: unknown): {
  valid: boolean;
  errors: string[];
  config?: PluginConfigFile;
};

function validatePluginToolDefinition(data: unknown): {
  valid: boolean;
  errors: string[];
};
```

## File Structure

```
src/
  types/tool.ts                          # Type definitions above
  server/tools/
    index.ts                             # Public exports
    registry.ts                          # AyndToolRegistry implementation
    plugin-loader.ts                     # JSON plugin file loading + validation
    handler-strategies.ts                # Shell/HTTP/file-read handler execution
    builtin/
      index.ts                           # createBuiltinTools() aggregator
      git-status.ts                      # git status tool
      git-diff-summary.ts               # git diff summary tool
      workspace-info.ts                  # workspace metadata tool
      file-reader.ts                     # file content reader tool
  server/routes/tools.ts                 # REST API for tool listing
```

## AyndToolRegistry

File: `src/server/tools/registry.ts`

### Interface

```typescript
interface AyndToolRegistry {
  /** Load built-in tools and plugin tools from disk */
  initialize(): Promise<ToolRegistrationResult>;

  /** Re-scan plugin directory and reload changed tools */
  reloadPlugins(): Promise<ToolRegistrationResult>;

  /** List metadata for all registered tools */
  listTools(): readonly RegisteredToolInfo[];

  /** Get a specific tool's metadata by name */
  getToolInfo(name: string): RegisteredToolInfo | undefined;

  /** Check if a tool exists */
  hasTool(name: string): boolean;

  /** Total number of registered tools */
  getToolCount(): number;

  /** Convert all tools to McpSdkServerConfig for ClaudeCodeToolAgent */
  toMcpServerConfig(): McpSdkServerConfig;

  /** Get allowed tool names in MCP format (mcp__<server>__<name>) */
  getAllowedToolNames(): readonly string[];
}
```

### Implementation Notes

- Uses a fixed MCP server name: `"aynd-tools"`
- `initialize()` calls `createBuiltinTools()` then `loadPluginTools()`
- `reloadPlugins()` clears plugin tools only, then reloads from disk; built-in tools are kept
- `toMcpServerConfig()` calls `createSdkMcpServer()` from claude-code-agent with all registered `SdkTool[]`
- Duplicate tool names between builtin and plugin are rejected (plugin load fails for that tool with error in result)

### Factory Function

```typescript
function createAyndToolRegistry(options: {
  pluginDir?: string;   // Default: ~/.config/aynd/tools/
  projectPath?: string; // For tools that need workspace context
}): AyndToolRegistry;
```

## Plugin Loader

File: `src/server/tools/plugin-loader.ts`

### Behavior

1. Scans `pluginDir` for `*.json` files
2. Parses each file as `PluginConfigFile`
3. Validates structure using `validatePluginConfigFile()`
4. For each valid tool definition, creates an `SdkTool` using the appropriate handler strategy
5. Returns `SdkTool[]` plus any `ToolRegistrationError[]` for malformed entries

Follows the same pattern as `src/server/prompts/loader.ts`:
- Uses `readdir()` + `readFile()` from `node:fs/promises`
- Gracefully skips invalid files (logs error, continues with rest)
- Config directory defaults to `~/.config/aynd/tools/`
- Can be overridden via `AYND_TEST_TOOLS_DIR` env var for testing

### Plugin JSON Format

Config directory: `~/.config/aynd/tools/*.json`

```json
{
  "name": "my-tools",
  "version": "1.0.0",
  "tools": [
    {
      "name": "list-todos",
      "description": "Find TODO comments in source code",
      "inputSchema": {
        "type": "object",
        "properties": {
          "pattern": {
            "type": "string",
            "description": "Search pattern (default: TODO)"
          },
          "directory": {
            "type": "string",
            "description": "Directory to search in"
          }
        }
      },
      "handler": {
        "type": "shell",
        "command": "grep -rn '{{pattern}}' {{directory}} || true",
        "timeout": 10000
      }
    },
    {
      "name": "check-api",
      "description": "Check API health endpoint",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "description": "API URL to check"
          }
        },
        "required": ["url"]
      },
      "handler": {
        "type": "http",
        "url": "{{url}}/health",
        "method": "GET",
        "timeout": 5000
      }
    }
  ]
}
```

## Handler Strategies

File: `src/server/tools/handler-strategies.ts`

Converts `PluginToolDefinition.handler` into an `SdkTool.handler` function.

### Shell Handler

```
Input: ShellHandlerConfig + tool args
Process:
  1. For each {{param}} in command, replace with sanitized arg value
  2. Execute via Bun.spawn with arg array (NOT shell string) for injection safety
  3. Capture stdout/stderr
  4. Return ToolResult with stdout as text content
```

**Security**: Shell handler MUST NOT use shell interpolation. The command template is split into an argument array, and `{{param}}` values are inserted as individual array elements passed to `Bun.spawn`. This prevents command injection.

Implementation approach:
- Parse command template into tokens
- For tokens containing `{{param}}`, substitute the value from tool args
- Pass the resulting `string[]` to `Bun.spawn(tokens, { ... })`
- Reject commands containing shell metacharacters (`;`, `|`, `&&`, `` ` ``, `$()`) in interpolated values

### HTTP Handler

```
Input: HttpHandlerConfig + tool args
Process:
  1. Replace {{param}} in URL with arg values
  2. Send fetch() request with remaining args as JSON body (for POST/PUT)
  3. Return response body as text ToolResult content
```

### File-Read Handler

```
Input: FileReadHandlerConfig + tool args { path: string }
Process:
  1. Resolve requested path relative to basePath
  2. Verify resolved path is within basePath (prevent directory traversal)
  3. Check file size against maxSize limit
  4. Read and return file content as text ToolResult content
```

## Built-in Tools

File: `src/server/tools/builtin/index.ts`

```typescript
function createBuiltinTools(projectPath: string): SdkTool[];
```

### git-status

Returns working tree status for the current project.

| Field | Value |
|-------|-------|
| Name | `git-status` |
| Input | `{ path?: string }` - optional subdirectory |
| Output | `git status --porcelain` output as text |
| Implementation | Uses `execGit()` from `src/server/git/executor.ts` |

### git-diff-summary

Returns a summary of uncommitted changes.

| Field | Value |
|-------|-------|
| Name | `git-diff-summary` |
| Input | `{ staged?: boolean }` - staged or unstaged diff |
| Output | `git diff --stat` output as text |
| Implementation | Uses `execGit()` |

### workspace-info

Returns metadata about the current workspace.

| Field | Value |
|-------|-------|
| Name | `workspace-info` |
| Input | `{}` (no input) |
| Output | JSON with project path, git branch, remote URL |
| Implementation | Uses `execGit()` for branch/remote info |

### file-reader

Reads file content from the project directory.

| Field | Value |
|-------|-------|
| Name | `file-reader` |
| Input | `{ path: string, startLine?: number, endLine?: number }` |
| Output | File content (with optional line range) as text |
| Implementation | Uses `Bun.file()`, path restricted to project root |

## REST API Routes

File: `src/server/routes/tools.ts`

### Endpoints

#### GET /api/tools

List all registered tools.

Response:
```json
{
  "tools": [
    {
      "name": "git-status",
      "description": "Returns working tree status",
      "source": "builtin",
      "inputSchema": { "type": "object", "properties": { ... } }
    },
    {
      "name": "list-todos",
      "description": "Find TODO comments in source code",
      "source": "plugin",
      "pluginName": "my-tools",
      "inputSchema": { "type": "object", "properties": { ... } }
    }
  ],
  "counts": {
    "total": 5,
    "builtin": 4,
    "plugin": 1
  }
}
```

#### GET /api/tools/:name

Get metadata for a specific tool.

Response: Single `RegisteredToolInfo` object, or 404.

#### POST /api/tools/reload

Hot-reload plugin tools from disk. Built-in tools are unaffected.

Response:
```json
{
  "success": true,
  "toolCount": 5,
  "errors": []
}
```

### Route Integration

Add tool routes as a non-context route group in `src/server/routes/index.ts`:

```typescript
// In getNonContextRouteGroups():
{
  prefix: "/tools",
  routes: createToolRoutes(toolRegistry),
}
```

This mounts the tools API at `/api/tools`.

## Session Manager Integration

File: `src/server/ai/session-manager.ts`

### Changes to createSessionManager

```typescript
// Updated signature
function createSessionManager(
  config: AIConfig,
  toolRegistry: AyndToolRegistry,
): SessionManager;
```

### Replace Stubbed executeSession

The current `executeSession()` (line 151-209) simulates a session with timeouts. Replace with real `ClaudeCodeToolAgent` integration:

```
executeSession(sessionId):
  1. Get session from sessions map
  2. Create ClaudeCodeToolAgent with:
     - mcpServers: { "aynd-tools": toolRegistry.toMcpServerConfig() }
     - allowedTools: toolRegistry.getAllowedToolNames()
     - cwd: session.request.options.projectPath
     - permissionMode: "bypassPermissions"
  3. Start session with prompt via agent.startSession()
  4. Iterate session.messages(), forwarding events to SSE listeners:
     - "message" -> emitEvent("message", ...)
     - "toolCall" -> emitEvent("tool_use", ...)
     - "toolResult" -> emitEvent("tool_result", ...)
     - "error" -> emitEvent("error", ...)
  5. On completion, update session state and emit "completed"
  6. Store AbortController for cancellation support
```

### Dependency Addition

Add `claude-code-agent` as a dependency in `package.json`:

```json
{
  "dependencies": {
    "claude-code-agent": "file:../claude-code-agent"
  }
}
```

Use file reference since the library is local. This matches the repository layout at `/g/gits/tacogips/claude-code-agent/`.

## Security Considerations

### Shell Command Injection Prevention

The shell handler MUST use `Bun.spawn` with an argument array, never `Bun.spawn` with a shell string. Interpolated values are individual array elements, preventing injection.

Additionally, interpolated values are validated:
- Reject values containing null bytes
- Limit value length (max 10000 chars)
- Log a warning for values containing common shell metacharacters

### File-Read Path Restriction

The file-read handler resolves paths using `path.resolve(basePath, requestedPath)` and verifies the result starts with `basePath`. This prevents directory traversal attacks (e.g., `../../etc/passwd`).

### Plugin Validation

- Malformed JSON files are skipped; other plugins still load
- Tool names must match `/^[a-zA-Z0-9_-]+$/`
- Tool names must be unique across all sources
- Missing required fields produce specific error messages in `ToolRegistrationResult`

### HTTP Handler

- URL interpolation uses `encodeURIComponent()` for parameter values
- Timeout enforcement prevents hanging requests
- Only `http://` and `https://` schemes are allowed

## Initialization Flow

Application startup sequence (in `src/main.ts` or server setup):

```
1. createAyndToolRegistry({ projectPath, pluginDir })
2. await registry.initialize()
   - createBuiltinTools(projectPath)     -> SdkTool[]
   - loadPluginTools(pluginDir)          -> SdkTool[] + errors
   - Register all tools
3. createSessionManager(aiConfig, registry)
4. mountAllRoutes(app, { ..., toolRegistry: registry })
```

## Verification Criteria

1. `bun run typecheck` passes with all new types
2. Plugin JSON files load correctly from `~/.config/aynd/tools/`
3. `GET /api/tools` returns both built-in and plugin tools with correct source labels
4. Built-in tools execute correctly via `ClaudeCodeToolAgent` (git-status returns real status)
5. Shell handler sanitizes arguments -- injected shell metacharacters do not execute
6. `POST /api/tools/reload` reloads plugin tools without restarting the server
7. Invalid plugin files are gracefully skipped with errors reported in reload response
8. File-read handler blocks directory traversal attempts
