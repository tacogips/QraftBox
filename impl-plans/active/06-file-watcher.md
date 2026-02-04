# File Watcher System Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#file-watching
**Phase**: 2
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary

File system monitoring using Bun native fs.watch, filtering gitignored files, debouncing rapid changes, and notifying clients via WebSocket.

### Scope

**Included**: File watcher setup, gitignore filtering, debouncing, WebSocket notifications
**Excluded**: Client-side handling (client plans), full diff refresh logic

---

## Modules

### 1. Watcher Types

#### src/types/watcher.ts

**Status**: COMPLETED

```typescript
// File change event types
interface FileChangeEvent {
  readonly type: "create" | "modify" | "delete";
  readonly path: string;
  readonly timestamp: number;
}

interface WatcherStatus {
  readonly enabled: boolean;
  readonly watchedPaths: number;
  readonly lastUpdate: number | null;
}

interface WatcherConfig {
  readonly enabled: boolean;
  readonly debounceMs: number;
  readonly excludePatterns: readonly string[];
}
```

**Checklist**:

- [x] Define FileChangeEvent interface
- [x] Define WatcherStatus interface
- [x] Define WatcherConfig interface
- [x] Export all types
- [x] Add type guards for runtime validation
- [x] Create comprehensive test suite (32 tests)

### 2. Gitignore Filter

#### src/server/watcher/gitignore.ts

**Status**: COMPLETED

```typescript
// Check if file should be ignored
interface GitignoreFilter {
  // Check single path
  isIgnored(path: string): Promise<boolean>;

  // Check multiple paths (batch)
  filterIgnored(paths: string[]): Promise<string[]>;

  // Refresh gitignore cache
  refresh(): Promise<void>;
}

// Create gitignore filter using 'git check-ignore --stdin'
function createGitignoreFilter(cwd: string): GitignoreFilter;
```

**Checklist**:

- [x] Implement createGitignoreFilter()
- [x] Implement isIgnored() using git check-ignore
- [x] Implement filterIgnored() for batch checking with stdin
- [x] Implement refresh()
- [x] Cache results for performance with TTL
- [x] Unit tests (13 tests, all passing)

### 3. Debounce Utility

#### src/server/watcher/debounce.ts

**Status**: COMPLETED

```typescript
// Debounce function with trailing edge
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void;

// Debounced event collector - collects events and emits batch
interface EventCollector<T> {
  add(event: T): void;
  flush(): T[];
  onFlush(handler: (events: T[]) => void): void;
  destroy(): void;
}

function createEventCollector<T>(debounceMs: number): EventCollector<T>;
```

**Checklist**:

- [x] Implement debounce()
- [x] Implement createEventCollector()
- [x] Handle edge cases (rapid fire, cancel)
- [x] Unit tests

### 4. File Watcher

#### src/server/watcher/index.ts

**Status**: COMPLETED

```typescript
interface FileWatcher {
  // Start watching
  start(): Promise<void>;

  // Stop watching
  stop(): void;

  // Get status
  getStatus(): WatcherStatus;

  // Event emitter for changes
  on(event: "change", handler: (events: FileChangeEvent[]) => void): void;
  off(event: "change", handler: (events: FileChangeEvent[]) => void): void;
}

// Create file watcher for repository
function createFileWatcher(
  cwd: string,
  config: WatcherConfig,
  wsManager: WSManager,
): FileWatcher;

// Setup watcher with WebSocket broadcasting
function setupWatcher(
  cwd: string,
  config: WatcherConfig,
  wsManager: WSManager,
): FileWatcher;
```

**Checklist**:

- [x] Implement createFileWatcher()
- [x] Use Bun native fs.watch (node:fs watch API)
- [x] Integrate gitignore filter
- [x] Integrate debounce (event collector)
- [x] Event handler system (on/off methods)
- [x] Handle watcher errors gracefully
- [x] Unit tests (23 tests passing)

### 5. Watcher WebSocket Integration

#### src/server/watcher/broadcast.ts

**Status**: COMPLETED

```typescript
// Handle file change and broadcast to clients
function handleFileChange(
  events: FileChangeEvent[],
  wsManager: WSManager,
): void;

// Create file-change WebSocket message
function createFileChangeMessage(events: FileChangeEvent[]): WSMessage;

// Create diff-updated message after refresh
function createDiffUpdatedMessage(changedFiles: string[]): WSMessage;
```

**Checklist**:

- [x] Implement handleFileChange()
- [x] Implement createFileChangeMessage()
- [x] Implement createDiffUpdatedMessage()
- [x] Unit tests (23 tests passing)

---

## Module Status

| Module           | File Path                         | Status    | Tests         |
| ---------------- | --------------------------------- | --------- | ------------- |
| Watcher Types    | `src/types/watcher.ts`            | COMPLETED | 32/32 passing |
| Gitignore Filter | `src/server/watcher/gitignore.ts` | COMPLETED | 13/13 passing |
| Debounce         | `src/server/watcher/debounce.ts`  | COMPLETED | 18/18 passing |
| File Watcher     | `src/server/watcher/index.ts`     | COMPLETED | 23/23 passing |
| Broadcast        | `src/server/watcher/broadcast.ts` | COMPLETED | 23/23 passing |

## Dependencies

| Feature | Depends On       | Status    |
| ------- | ---------------- | --------- |
| Watcher | Bun fs.watch     | Available |
| Watcher | WebSocket Server | Phase 1   |
| Watcher | Git executor     | Phase 1   |

## Completion Criteria

- [x] File changes detected in non-gitignored files
- [x] Changes debounced (configurable debounceMs)
- [x] WebSocket broadcasts file-change events
- [x] Watcher can be enabled/disabled
- [x] Status tracking (getStatus method)
- [x] Type checking passes
- [x] Unit tests passing (109/109 watcher-related tests)

## Progress Log

### Session: 2026-02-03 (Implementation - Watcher Types)

**Tasks Completed**: TASK-001: Watcher Types
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Created src/types/watcher.ts with FileChangeEvent, WatcherStatus, and WatcherConfig interfaces
- All properties defined as readonly for immutability
- Added type guards: isFileChangeEvent, isWatcherStatus, isWatcherConfig
- Created comprehensive test suite with 32 passing tests
- Tests cover type creation, readonly properties, type guards, and edge cases
- TypeScript compiler check passes without errors
- Code formatted with prettier

### Session: 2026-02-03 (Implementation - Debounce)

**Tasks Completed**: TASK-003: Debounce Utility
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Implemented debounce() function with trailing edge execution
- Implemented createEventCollector() with event batching
- Added destroy() method to EventCollector interface
- All 18 unit tests passing
- Type checking passes with maximum strictness
- Fixed unrelated type error in gitignore.ts (unused variable)

### Session: 2026-02-03 (Implementation - Gitignore Filter)

**Tasks Completed**: TASK-002: Gitignore Filter
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Created src/server/watcher/gitignore.ts with GitignoreFilter interface
- Implemented createGitignoreFilter() factory function
- Implemented isIgnored() using git check-ignore command
- Implemented filterIgnored() for batch checking using git check-ignore --stdin
- Implemented refresh() to clear cache
- Added caching with configurable TTL (default 60 seconds)
- Used Bun.spawn for stdin support in batch operations
- Created comprehensive test suite with 13 passing tests
- Tests cover single file checks, batch filtering, cache behavior, TTL, and edge cases
- Type checking passes without errors
- All server tests pass (216/216)

### Session: 2026-02-03 (Implementation - File Watcher)

**Tasks Completed**: TASK-004: File Watcher
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Created src/types/watcher.ts with FileChangeEvent, WatcherStatus, and WatcherConfig types
- Implemented src/server/watcher/index.ts with FileWatcher interface
- Used node:fs watch API (Bun-compatible) with recursive watching
- Integrated GitignoreFilter for filtering ignored files
- Integrated EventCollector for debouncing rapid changes
- Implemented event handler system with on()/off() methods
- Created comprehensive test suite with 23 passing tests
- Tests cover: creation, start/stop, status tracking, event handling, file detection, batching, exclude patterns, gitignore integration, and error handling
- Type checking passes without errors
- All 584 tests pass across the project
- Pattern matching implemented for exclude patterns (supports *, **)
- Event types mapped from fs.watch to FileChangeEvent types (create/modify/delete)

### Session: 2026-02-03 (Implementation - Watcher Broadcast)

**Tasks Completed**: TASK-005: Watcher Broadcast
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Created src/server/watcher/broadcast.ts with WebSocket broadcast functions
- Implemented handleFileChange() to broadcast file change events to connected clients
- Implemented createFileChangeMessage() to create properly typed WebSocket messages
- Implemented createDiffUpdatedMessage() to notify clients of diff refresh needed
- Used readonly properties for all parameters following TypeScript best practices
- Created comprehensive test suite with 23 passing tests
- Tests cover: broadcasting single/multiple changes, empty arrays, readonly arrays, message structure, payload details, serialization, and integration
- Type checking passes without errors
- All 648 tests pass across the project
- Code formatted with prettier

### Session: 2026-02-03 (Plan Creation)

**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 05-git-xnotes.md
- **Next**: 07-client-core.md
- **Depends On**: 02-server-core.md (WebSocket)
