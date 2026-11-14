# Server Layer Core Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#architecture-overview
**Phase**: 1
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Hono-based HTTP server providing REST API endpoints for diff, files, and static asset serving. Core infrastructure for all server-side features.

### Scope
**Included**: Hono server setup, route registration, static file serving, WebSocket setup, error handling
**Excluded**: Route implementations (separate plans), client build

---

## Modules

### 1. Server Setup

#### src/server/index.ts

**Status**: NOT_STARTED

```typescript
import { Hono } from 'hono';

interface ServerConfig {
  port: number;
  host: string;
  projectPath: string;
  diffTarget: DiffTarget;
  config: CLIConfig;
}

// Create and configure Hono server
function createServer(config: ServerConfig): Hono;

// Start server and return handle for shutdown
function startServer(app: Hono, config: ServerConfig): Promise<Server>;

// Mount all routes
function mountRoutes(app: Hono, context: ServerContext): void;

// Server context available to all routes
interface ServerContext {
  projectPath: string;
  diffTarget: DiffTarget;
  config: CLIConfig;
}
```

**Checklist**:
- [ ] Implement createServer()
- [ ] Implement startServer()
- [ ] Implement mountRoutes()
- [ ] Configure CORS for local development
- [ ] Add request logging middleware
- [ ] Add error handling middleware
- [ ] Unit tests

### 2. Static File Serving

#### src/server/static.ts

**Status**: NOT_STARTED

```typescript
// Serve built client assets
function serveStatic(basePath: string): MiddlewareHandler;

// Handle SPA fallback (serve index.html for non-API routes)
function spaFallback(indexPath: string): MiddlewareHandler;
```

**Checklist**:
- [ ] Implement serveStatic()
- [ ] Implement spaFallback()
- [ ] Configure proper MIME types
- [ ] Handle caching headers
- [ ] Unit tests

### 3. WebSocket Server

#### src/server/websocket/index.ts

**Status**: COMPLETED

```typescript
// WebSocket event types
type WSEventType = 'file-change' | 'comment-added' | 'diff-updated';

interface WSMessage {
  type: WSEventType;
  payload: unknown;
}

// Setup WebSocket upgrade handler
function setupWebSocket(server: Server): WebSocketServer;

// Broadcast message to all connected clients
function broadcast(ws: WebSocketServer, message: WSMessage): void;

// WebSocket connection manager
interface WSManager {
  broadcast(message: WSMessage): void;
  getConnectionCount(): number;
}
```

**Checklist**:
- [x] Implement setupWebSocket()
- [x] Implement broadcast()
- [x] Handle connection/disconnection
- [x] Add ping/pong keepalive
- [x] Unit tests (24 tests passing)

### 4. Error Handling

#### src/server/errors.ts

**Status**: COMPLETED

```typescript
// Application error classes
class AppError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, public readonly statusCode: number, cause?: unknown);
}

class NotFoundError extends AppError; // statusCode: 404
class ValidationError extends AppError; // statusCode: 400
class GitError extends AppError { // statusCode: 500
  public readonly command?: string;
}

// Error handler middleware
function errorHandler(): ErrorHandler;

// Format error response
function formatErrorResponse(error: Error): { error: string; code: number };

// Helper utilities
function isAppError(error: unknown): error is AppError;
function getErrorMessage(error: unknown): string;
```

**Checklist**:
- [x] Define error classes
- [x] Implement errorHandler()
- [x] Implement formatErrorResponse()
- [x] Log errors appropriately (5xx as error, 4xx as warning)
- [x] Unit tests (24 tests passing)

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Server Setup | `src/server/index.ts` | COMPLETED | 8 tests |
| Static Serving | `src/server/static.ts` | COMPLETED | 13 tests |
| WebSocket | `src/server/websocket/index.ts` | COMPLETED | 24 tests |
| Error Handling | `src/server/errors.ts` | COMPLETED | 24 tests |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Server | Hono package | To install |
| Server | CLI layer | Phase 1 |
| WebSocket | Bun native WS | Available |

## Completion Criteria

- [ ] Server starts and serves static files
- [ ] WebSocket connections work
- [ ] Error handling middleware catches errors
- [ ] Health check endpoint works
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created

### Session: 2026-02-03 (Impl)
**Tasks Completed**: TASK-004 Error Handling
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented src/server/errors.ts with AppError, NotFoundError, ValidationError, GitError classes. Added errorHandler middleware for Hono. 24 unit tests passing.

### Session: 2026-02-03 (WebSocket)
**Tasks Completed**: TASK-003 WebSocket Server
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented src/server/websocket/index.ts with WSManager, setupWebSocket, broadcast, and createWebSocketHandler. Added connection management, ping/pong keepalive mechanism. 24 unit tests passing. Type checking passes. All 267 tests passing in full suite.

## Related Plans

- **Previous**: 01-cli-layer.md
- **Next**: 03-git-operations.md
- **Depends On**: 01-cli-layer.md (CLIConfig types)
