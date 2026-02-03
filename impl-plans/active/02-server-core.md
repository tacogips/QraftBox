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

**Status**: NOT_STARTED

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
- [ ] Implement setupWebSocket()
- [ ] Implement broadcast()
- [ ] Handle connection/disconnection
- [ ] Add ping/pong keepalive
- [ ] Unit tests

### 4. Error Handling

#### src/server/errors.ts

**Status**: NOT_STARTED

```typescript
// Application error classes
class AppError extends Error {
  constructor(message: string, statusCode: number);
  statusCode: number;
}

class NotFoundError extends AppError;
class ValidationError extends AppError;
class GitError extends AppError;

// Error handler middleware
function errorHandler(): ErrorHandler;

// Format error response
function formatErrorResponse(error: Error): { error: string; code: number };
```

**Checklist**:
- [ ] Define error classes
- [ ] Implement errorHandler()
- [ ] Implement formatErrorResponse()
- [ ] Log errors appropriately
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Server Setup | `src/server/index.ts` | NOT_STARTED | - |
| Static Serving | `src/server/static.ts` | NOT_STARTED | - |
| WebSocket | `src/server/websocket/index.ts` | NOT_STARTED | - |
| Error Handling | `src/server/errors.ts` | NOT_STARTED | - |

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
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 01-cli-layer.md
- **Next**: 03-git-operations.md
- **Depends On**: 01-cli-layer.md (CLIConfig types)
