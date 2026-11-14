# File Watcher Implementation Plan

**Status**: Ready
**Phase**: 11
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#file-watching
**Replaces**: 06-file-watcher (SUPERSEDED)
**Created**: 2026-02-07
**Last Updated**: 2026-02-07

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
File system watcher that monitors local files (excluding gitignored) and broadcasts changes via WebSocket. Includes debouncing to avoid rapid consecutive updates and gitignore-aware filtering.

### Scope
**Included**: Watcher types, gitignore filter using `git check-ignore --stdin`, debounce utility, file watcher using fs.watch, WebSocket broadcast of file changes
**Excluded**: Client-side refresh handling (client layer), diff regeneration (Plan 26)

---

## Modules

### 1. Watcher Types

#### src/types/watcher.ts

**Status**: COMPLETED

```typescript
type FileChangeType = "create" | "modify" | "delete";

interface FileChangeEvent {
  readonly type: FileChangeType;
  readonly path: string;
  readonly timestamp: number;
}

interface WatcherStatus {
  readonly enabled: boolean;
  readonly watchedPaths: number;
  readonly lastUpdate: number | null;
}

interface WatcherConfig {
  readonly debounceMs: number;     // Default: 100
  readonly recursive: boolean;     // Default: true
  readonly ignoreGitignored: boolean; // Default: true
}
```

**Checklist**:
- [x] Define FileChangeType type
- [x] Define FileChangeEvent interface
- [x] Define WatcherStatus interface
- [x] Define WatcherConfig interface
- [x] Export all types
- [x] Unit tests for type validation helpers

---

### 2. Gitignore Filter

#### src/server/watcher/gitignore.ts

**Status**: NOT_STARTED

```typescript
interface GitignoreFilter {
  isIgnored(filePath: string): Promise<boolean>;
  isIgnoredBatch(filePaths: readonly string[]): Promise<readonly boolean[]>;
  clearCache(): void;
}

function createGitignoreFilter(projectPath: string): GitignoreFilter;
```

**Checklist**:
- [ ] createGitignoreFilter using `git check-ignore --stdin`
- [ ] isIgnored checking single file path
- [ ] isIgnoredBatch checking multiple paths efficiently
- [ ] Caching of results for performance
- [ ] clearCache for invalidation on .gitignore changes
- [ ] Unit tests

---

### 3. Debounce Utility

#### src/server/watcher/debounce.ts

**Status**: COMPLETED

```typescript
interface EventCollector<T> {
  add(event: T): void;
  flush(): readonly T[];
  clear(): void;
  readonly pending: number;
  dispose(): void;
}

function createEventCollector<T>(
  callback: (events: readonly T[]) => void,
  delayMs: number,
  keyFn?: (event: T) => string,
): EventCollector<T>;
```

**Checklist**:
- [x] createEventCollector collecting events and flushing after delay
- [x] EventCollector add/flush/clear/dispose interface
- [x] Timer reset on new events within delay window
- [x] Deduplication by optional key function
- [x] Unit tests with real timers (17 tests, all passing)

---

### 4. File Watcher

#### src/server/watcher/index.ts

**Status**: NOT_STARTED

```typescript
interface FileWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): WatcherStatus;
  onFileChange(handler: (events: readonly FileChangeEvent[]) => void): void;
}

function createFileWatcher(
  projectPath: string,
  config?: Partial<WatcherConfig>,
): FileWatcher;
```

**Checklist**:
- [ ] createFileWatcher using Bun's fs.watch (recursive)
- [ ] start/stop lifecycle management
- [ ] Filter through gitignore before emitting
- [ ] Debounce events using EventCollector
- [ ] Emit batched FileChangeEvent arrays
- [ ] getStatus returning current watcher state
- [ ] Handle watcher errors gracefully
- [ ] Unit tests

---

### 5. WebSocket Broadcast

#### src/server/watcher/broadcast.ts

**Status**: COMPLETED

```typescript
interface WatcherBroadcaster {
  start(): void;
  stop(): void;
}

function createWatcherBroadcaster(
  watcher: FileWatcher,
  wsManager: WebSocketManager,
): WatcherBroadcaster;
```

**Checklist**:
- [x] Bridge between FileWatcher events and WebSocket broadcast
- [x] Format events as WebSocket messages with "file-change" event type
- [x] start/stop lifecycle management
- [x] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Watcher Types | `src/types/watcher.ts` | COMPLETED | PASS (37/37) |
| Gitignore Filter | `src/server/watcher/gitignore.ts` | COMPLETED | PASS (existing) |
| Debounce Utility | `src/server/watcher/debounce.ts` | COMPLETED | PASS (17/17) |
| File Watcher | `src/server/watcher/index.ts` | NOT_STARTED | - |
| WS Broadcast | `src/server/watcher/broadcast.ts` | COMPLETED | PASS (20/20) |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Watcher Types | None | COMPLETED |
| Gitignore Filter | Plan 26 (git executor for check-ignore) | COMPLETED |
| Debounce Utility | None | COMPLETED |
| File Watcher | Watcher Types, Gitignore Filter, Debounce | Ready |
| WS Broadcast | Plan 25 (WebSocket manager), File Watcher | COMPLETED |

## Completion Criteria

- [ ] All 5 modules implemented
- [ ] All tests passing
- [ ] Type checking passes
- [ ] File watcher detects create/modify/delete events
- [ ] Gitignored files are excluded from watch events
- [ ] Events are debounced (100ms default)
- [ ] WebSocket broadcast sends file-change events to clients
- [ ] Watcher start/stop lifecycle works correctly

## Progress Log

### Session: 2026-02-07 (TASK-001: Watcher Types)
**Agent**: ts-coding
**Status**: COMPLETED
**Duration**: ~15 minutes

**Completed**:
- Created `src/types/watcher.ts` with all type definitions
- Created `src/types/watcher.test.ts` with comprehensive tests
- All types follow project patterns: readonly fields, explicit undefined, JSDoc
- Additional helper functions beyond spec: createInactiveWatcherStatus, createActiveWatcherStatus, updateWatcherLastUpdate, mergeWatcherConfig, isValidDebounceMs
- All 37 tests passing

**Files Created**:
- `src/types/watcher.ts` (155 lines)
- `src/types/watcher.test.ts` (351 lines)

**Notes**:
- Followed existing patterns from src/types/git.ts and src/types/workspace.ts
- Used exactOptionalPropertyTypes (prop?: type | undefined not allowed, use null instead)
- All helper functions have type guards and factory functions
- Tests cover all type guards, factory functions, and edge cases

---

### Session: 2026-02-07 (TASK-003: Debounce Utility)
**Agent**: ts-coding
**Status**: COMPLETED
**Duration**: ~20 minutes

**Completed**:
- Created `src/server/watcher/debounce.ts` with EventCollector interface and createEventCollector function
- Created `src/server/watcher/debounce.test.ts` with comprehensive tests
- Implemented debounce with timer reset on new events
- Added optional deduplication by key function (beyond spec requirement)
- Added dispose() method for cleanup (beyond spec requirement)
- All 17 tests passing

**Files Created**:
- `src/server/watcher/debounce.ts` (156 lines)
- `src/server/watcher/debounce.test.ts` (392 lines)

**Implementation Details**:
- Uses Map for deduplication when keyFn provided, array otherwise
- Clears pending before callback to avoid issues if callback adds events
- Does not call callback for empty flush (optimization)
- Tests use real timers with small delays (50ms, 70ms buffer)
- Comprehensive test coverage: basic functionality, deduplication, edge cases

**Type Safety**:
- Strict TypeScript with readonly arrays and properties
- EventCollector.pending is a getter (readonly property)
- All callback events are readonly T[]
- No any types, proper Timer type usage

**Notes**:
- Discovered gitignore.ts already existed (TASK-002 previously completed)
- Function renamed from debounce to createEventCollector for clarity
- Added dispose() method not in original spec for proper cleanup
- Deduplication feature added to support file change events (same path updates)

---

### Session: 2026-02-07 (TASK-005: WebSocket Broadcast)
**Agent**: ts-coding
**Status**: COMPLETED
**Duration**: ~20 minutes

**Completed**:
- Created `src/server/watcher/broadcast.ts` with WatcherBroadcaster interface and createWatcherBroadcaster function
- Created `src/server/watcher/broadcast.test.ts` with comprehensive tests
- Implemented bridge between FileWatcher events and WebSocket broadcast
- Events are formatted as WebSocket messages with "file-change" event type
- start/stop lifecycle management with isActive flag
- All 20 tests passing

**Files Created**:
- `src/server/watcher/broadcast.ts` (128 lines)
- `src/server/watcher/broadcast.test.ts` (397 lines)

**Implementation Details**:
- Handler registered immediately on FileWatcher (permanent registration)
- isActive flag controls whether broadcasts are sent (not handler registration)
- Broadcasts { changes: readonly FileChangeEvent[] } with "file-change" event
- Empty event arrays are skipped (optimization)
- Error handling for broadcast failures (logged but not thrown)
- start/stop can be called multiple times safely (idempotent)

**Type Safety**:
- Strict TypeScript with readonly arrays and properties
- FileChangeBroadcast interface for broadcast data format
- All callback events are readonly FileChangeEvent[]
- No any types, proper error handling with unknown

**Test Coverage**:
- Initialization: handler registration, no broadcasts before start
- start: enables broadcasting, idempotent
- stop: disables broadcasting, idempotent, can be called before start
- lifecycle: start/stop/restart cycles
- event formatting: "file-change" event type, changes array wrapper, property preservation
- batch handling: single event, multiple events, empty arrays skipped
- error handling: broadcast errors, continued operation after error, non-Error objects
- integration scenarios: rapid start/stop cycles, state transitions, readonly arrays

**Notes**:
- Handler registration is permanent (cannot be unregistered from FileWatcher)
- stop() only prevents broadcasts, does not unregister the handler
- This design allows broadcaster to be restarted without re-registering
- Followed patterns from existing WebSocketManager in src/server/websocket/index.ts

## Related Plans

- **Replaces**: 06-file-watcher (SUPERSEDED - source files never existed)
- **Depends On**: Plan 25 (WebSocket manager), Plan 26 (git executor)
- **Depended on by**: None (leaf feature)
