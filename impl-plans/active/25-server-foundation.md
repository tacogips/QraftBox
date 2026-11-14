# Server Foundation Implementation Plan

**Status**: Ready
**Phase**: 11
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#architecture-overview
**Replaces**: 01-cli-layer (SUPERSEDED), 02-server-core (SUPERSEDED)
**Created**: 2026-02-07
**Last Updated**: 2026-02-07

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Foundation layer providing CLI entry point, HTTP server (Hono), WebSocket manager, static file serving, and error handling. This is the base layer that all other server-side features build upon.

### Scope
**Included**: CLI argument parsing, configuration loading, Hono server creation, route mounting, static file serving with SPA fallback, WebSocket manager for real-time updates, error hierarchy and middleware
**Excluded**: Client-side code, individual API route handlers (covered by Plan 27), git operations (covered by Plan 26)

---

## Modules

### 1. Shared Base Types

#### src/types/index.ts

**Status**: COMPLETED

```typescript
interface CLIConfig {
  readonly port: number;
  readonly host: string;
  readonly open: boolean;
  readonly watch: boolean;
  readonly syncMode: SyncMode;
  readonly ai: boolean;
  readonly projectPath: string;
}

type ViewMode = "diff" | "current-state";

type SyncMode = "manual" | "auto-push" | "auto-pull" | "auto";

// ServerContext re-exported from context-manager.ts
export type { ServerContext } from "../server/workspace/context-manager";
```

**Checklist**:
- [x] Define CLIConfig interface
- [x] Define ViewMode type
- [x] Define SyncMode type
- [x] Re-export ServerContext from existing context-manager.ts
- [x] Re-export ValidationResult from workspace types
- [x] Export all types
- [x] All types have JSDoc comments
- [x] All interface fields are readonly

---

### 2. CLI Entry Point

#### src/cli/index.ts

**Status**: NOT_STARTED

```typescript
function parseArgs(args: string[]): CLIConfig;
function openBrowser(url: string): Promise<void>;
function setupShutdownHandlers(cleanup: () => Promise<void>): void;
function main(): Promise<void>;
```

**Checklist**:
- [ ] parseArgs using Commander
- [ ] openBrowser with platform detection (open npm package or Bun shell)
- [ ] setupShutdownHandlers for SIGINT/SIGTERM
- [ ] main() orchestrating startup sequence
- [ ] Unit tests

---

### 3. Configuration

#### src/cli/config.ts

**Status**: NOT_STARTED

```typescript
interface ConfigDefaults {
  readonly PORT: number;        // 7144
  readonly HOST: string;        // "localhost"
  readonly OPEN: boolean;       // true
  readonly WATCH: boolean;      // true
  readonly SYNC_MODE: SyncMode; // "manual"
  readonly AI: boolean;         // true
}

const DEFAULT_CONFIG: ConfigDefaults;

function loadConfig(overrides?: Partial<CLIConfig>): CLIConfig;
function validateConfig(config: CLIConfig): ValidationResult;
```

**Checklist**:
- [ ] Define DEFAULT_CONFIG constants
- [ ] loadConfig merging defaults with overrides
- [ ] validateConfig checking port range, path existence
- [ ] Unit tests

---

### 4. HTTP Server

#### src/server/index.ts

**Status**: NOT_STARTED

```typescript
interface ServerOptions {
  readonly config: CLIConfig;
  readonly contextManager: ContextManager;
}

function createServer(options: ServerOptions): Hono;
function startServer(app: Hono, config: CLIConfig): Promise<Server>;
function stopServer(server: Server): Promise<void>;
```

**Checklist**:
- [ ] createServer with Hono instance and middleware
- [ ] Mount context middleware for /api/ctx/:contextId/*
- [ ] Mount all route groups
- [ ] startServer binding to host:port
- [ ] stopServer for graceful shutdown
- [ ] Integration with existing route files
- [ ] Unit tests

---

### 5. Static File Serving

#### src/server/static.ts

**Status**: COMPLETED

```typescript
function createStaticMiddleware(clientDir: string): MiddlewareHandler;
function createSPAFallback(indexPath: string): MiddlewareHandler;
```

**Checklist**:
- [x] Serve static files from client build directory
- [x] SPA fallback returning index.html for non-API routes
- [x] Proper MIME type handling
- [x] Cache headers for static assets
- [x] Unit tests

---

### 6. WebSocket Manager

#### src/server/websocket/index.ts

**Status**: COMPLETED

```typescript
interface WebSocketClient {
  readonly id: string;
  readonly ws: ServerWebSocket<unknown>;
  readonly connectedAt: number;
}

interface WebSocketMessage {
  readonly event: string;
  readonly data: unknown;
}

interface WebSocketManager {
  handleOpen(ws: ServerWebSocket<unknown>): void;
  handleClose(ws: ServerWebSocket<unknown>): void;
  handleMessage(ws: ServerWebSocket<unknown>, message: string | Buffer): void;
  broadcast(event: string, data: unknown): void;
  getClientCount(): number;
  close(): void;
}

function createWebSocketManager(): WebSocketManager;
```

**Checklist**:
- [x] WebSocketClient and WebSocketManager interfaces defined
- [x] createWebSocketManager factory function
- [x] Client tracking (connect/disconnect)
- [x] broadcast to all connected clients
- [x] JSON message serialization
- [x] Heartbeat/ping-pong handling
- [x] close() method cleans up all connections
- [x] Type checking passes (`bun run typecheck`)
- [x] Unit test file at src/server/websocket/index.test.ts

---

### 7. Error Handling

#### src/server/errors.ts

**Status**: COMPLETED

```typescript
type ErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "GIT_ERROR"
  | "INTERNAL_ERROR"
  | "CONFLICT";

class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
}

function createErrorHandler(): ErrorHandler;
function notFoundError(message: string): AppError;
function validationError(message: string, details?: Record<string, unknown>): AppError;
function gitError(message: string, details?: Record<string, unknown>): AppError;
function internalError(message: string, details?: Record<string, unknown>): AppError;
function conflictError(message: string, details?: Record<string, unknown>): AppError;
```

**Checklist**:
- [x] AppError class with code, statusCode, details
- [x] Factory functions for common error types (notFoundError, validationError, gitError, internalError, conflictError)
- [x] Error handler using Hono's ErrorHandler type (app.onError) converting AppError to JSON response
- [x] Unit tests (14 tests, all passing)

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Shared Base Types | `src/types/index.ts` | COMPLETED | N/A (type-only) |
| CLI Entry Point | `src/cli/index.ts` | NOT_STARTED | - |
| Configuration | `src/cli/config.ts` | NOT_STARTED | - |
| HTTP Server | `src/server/index.ts` | NOT_STARTED | - |
| Static Serving | `src/server/static.ts` | COMPLETED | 22 tests passing |
| WebSocket Manager | `src/server/websocket/index.ts` | COMPLETED | 21 tests passing |
| Error Handling | `src/server/errors.ts` | COMPLETED | 14 tests passing |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Server Foundation | None (foundation layer) | - |
| Must integrate with | `src/server/middleware/context.ts` | Exists |
| Must integrate with | `src/server/workspace/context-manager.ts` | Exists |
| Must integrate with | Existing route files in `src/server/routes/` | Exist |

## Completion Criteria

- [ ] All 7 modules implemented
- [ ] All tests passing
- [ ] Type checking passes
- [ ] Server starts and serves static files
- [ ] WebSocket connections work
- [ ] Error handler catches and formats errors
- [ ] CLI parses arguments and starts server
- [ ] Integrates with existing context middleware and routes

## Progress Log

### Session: 2026-02-07 (TASK-006)

**Status**: COMPLETED

**Tasks Completed**:
- TASK-006: WebSocket Manager (src/server/websocket/index.ts, src/server/websocket/index.test.ts)

**Details**:
- Created `src/server/websocket/index.ts` with WebSocketManager implementation
- Uses Bun's ServerWebSocket<unknown> type for WebSocket connections
- Implemented client tracking using WeakMap (ws->id) and Map (id->client)
- Added handleOpen, handleClose, handleMessage lifecycle handlers
- Implemented broadcast to all connected clients (skips non-OPEN connections)
- Added ping-pong heartbeat handling in handleMessage
- Created comprehensive test suite with 21 tests covering all functionality
- All tests passing with bun test
- Type checking passes with strict TypeScript config
- WebSocket manager is ready for integration with Bun.serve()
- Uses factory pattern (createWebSocketManager) for easy instantiation
- Proper error handling for send/close failures
- Logging added for debugging WebSocket events

### Session: 2026-02-07 (TASK-007)

**Status**: COMPLETED

**Tasks Completed**:
- TASK-007: Error Handling (src/server/errors.ts, src/server/errors.test.ts)

**Details**:
- Implemented AppError class with ErrorCode type and status codes
- Created factory functions: notFoundError, validationError, gitError, internalError, conflictError
- Implemented createErrorHandler using Hono's ErrorHandler type (app.onError)
- Error handler properly catches AppError and returns JSON with statusCode and optional details
- All 14 unit tests passing
- Type checking passes
- Followed existing patterns from src/server/middleware/context.ts and src/server/routes/commits.ts

---

### Session: 2026-02-07 (TASK-005)

**Status**: COMPLETED

**Tasks Completed**:
- TASK-005: Static File Serving (src/server/static.ts, src/server/static.test.ts)

**Implementation Details**:
- Created `createStaticMiddleware(clientDir)` for serving static files from directory
- Implemented MIME type detection using Bun.file().type with manual fallback
- Added cache headers: immutable for hashed assets, no-cache for others
- Implemented hash pattern detection for assets (e.g., main.abc123.js)
- Only handles GET and HEAD requests, skips /api/* routes
- Falls through to next handler for missing files
- Created `createSPAFallback(indexPath)` for client-side routing
- Returns index.html for routes without file extension (excluding /api/*)
- Comprehensive test suite with 22 tests covering:
  - MIME type handling for HTML, JS, CSS, JSON, PNG
  - Cache control headers for hashed vs non-hashed assets
  - HEAD request handling
  - API route bypassing
  - SPA fallback behavior
  - Integration scenarios
- All tests passing with bun test
- Type checking passes with strict TypeScript config
- Follows existing middleware patterns from context.ts

---

### Session: 2026-02-07 (TASK-001)

**Status**: COMPLETED

**Tasks Completed**:
- TASK-001: Shared Base Types (src/types/index.ts)

**Implementation Details**:
- Created src/types/index.ts with CLIConfig, ViewMode, and SyncMode types
- Re-exported ServerContext from context-manager.ts (avoiding duplication)
- Re-exported ValidationResult from workspace types
- All types include JSDoc comments
- All interface fields are readonly following strictness guidelines
- Followed existing codebase patterns from src/types/workspace.ts

**Files Modified**:
- Created: src/types/index.ts

**Tests**:
- Type-only module, no runtime tests needed
- Verified Bun can build the file successfully
- Verified proper re-exports from existing modules

**Notes**:
- ServerContext was already defined in src/server/workspace/context-manager.ts, so we re-export it instead of redefining
- ValidationResult was already defined in src/types/workspace.ts, so we re-export it
- Pre-existing TypeScript errors in node_modules exist but are unrelated to this change

## Related Plans

- **Replaces**: 01-cli-layer, 02-server-core (both SUPERSEDED - source files never existed)
- **Next**: Plan 27 (Diff & File API Routes) depends on this
- **Depended on by**: Plans 26, 27, 28, 29, 30, 31
