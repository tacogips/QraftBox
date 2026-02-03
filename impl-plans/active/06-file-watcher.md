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

**Status**: NOT_STARTED

```typescript
// File change event types
interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete';
  path: string;
  timestamp: number;
}

interface WatcherStatus {
  enabled: boolean;
  watchedPaths: number;
  lastUpdate: number | null;
}

interface WatcherConfig {
  enabled: boolean;
  debounceMs: number;
  excludePatterns: string[];
}
```

**Checklist**:
- [ ] Define FileChangeEvent interface
- [ ] Define WatcherStatus interface
- [ ] Define WatcherConfig interface
- [ ] Export all types

### 2. Gitignore Filter

#### src/server/watcher/gitignore.ts

**Status**: NOT_STARTED

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

// Parse gitignore patterns for local filtering
function parseGitignore(content: string): GitignorePattern[];
```

**Checklist**:
- [ ] Implement createGitignoreFilter()
- [ ] Implement isIgnored() using git check-ignore
- [ ] Implement filterIgnored() for batch checking
- [ ] Implement refresh()
- [ ] Cache results for performance
- [ ] Unit tests

### 3. Debounce Utility

#### src/server/watcher/debounce.ts

**Status**: NOT_STARTED

```typescript
// Debounce function with trailing edge
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  waitMs: number
): (...args: Parameters<T>) => void;

// Debounced event collector - collects events and emits batch
interface EventCollector<T> {
  add(event: T): void;
  flush(): T[];
  onFlush(handler: (events: T[]) => void): void;
}

function createEventCollector<T>(debounceMs: number): EventCollector<T>;
```

**Checklist**:
- [ ] Implement debounce()
- [ ] Implement createEventCollector()
- [ ] Handle edge cases (rapid fire, cancel)
- [ ] Unit tests

### 4. File Watcher

#### src/server/watcher/index.ts

**Status**: NOT_STARTED

```typescript
interface FileWatcher {
  // Start watching
  start(): Promise<void>;

  // Stop watching
  stop(): void;

  // Get status
  getStatus(): WatcherStatus;

  // Event emitter for changes
  on(event: 'change', handler: (events: FileChangeEvent[]) => void): void;
  off(event: 'change', handler: (events: FileChangeEvent[]) => void): void;
}

// Create file watcher for repository
function createFileWatcher(
  cwd: string,
  config: WatcherConfig,
  wsManager: WSManager
): FileWatcher;

// Setup watcher with WebSocket broadcasting
function setupWatcher(
  cwd: string,
  config: WatcherConfig,
  wsManager: WSManager
): FileWatcher;
```

**Checklist**:
- [ ] Implement createFileWatcher()
- [ ] Use Bun native fs.watch
- [ ] Integrate gitignore filter
- [ ] Integrate debounce
- [ ] Broadcast changes via WebSocket
- [ ] Handle watcher errors
- [ ] Unit tests

### 5. Watcher WebSocket Integration

#### src/server/watcher/broadcast.ts

**Status**: NOT_STARTED

```typescript
// Handle file change and broadcast to clients
function handleFileChange(
  events: FileChangeEvent[],
  wsManager: WSManager
): void;

// Create file-change WebSocket message
function createFileChangeMessage(events: FileChangeEvent[]): WSMessage;

// Create diff-updated message after refresh
function createDiffUpdatedMessage(changedFiles: string[]): WSMessage;
```

**Checklist**:
- [ ] Implement handleFileChange()
- [ ] Implement createFileChangeMessage()
- [ ] Implement createDiffUpdatedMessage()
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Watcher Types | `src/types/watcher.ts` | NOT_STARTED | - |
| Gitignore Filter | `src/server/watcher/gitignore.ts` | NOT_STARTED | - |
| Debounce | `src/server/watcher/debounce.ts` | NOT_STARTED | - |
| File Watcher | `src/server/watcher/index.ts` | NOT_STARTED | - |
| Broadcast | `src/server/watcher/broadcast.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Watcher | Bun fs.watch | Available |
| Watcher | WebSocket Server | Phase 1 |
| Watcher | Git executor | Phase 1 |

## Completion Criteria

- [ ] File changes detected in non-gitignored files
- [ ] Changes debounced (100ms default)
- [ ] WebSocket broadcasts file-change events
- [ ] Watcher can be enabled/disabled
- [ ] Status endpoint shows watcher state
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 05-git-xnotes.md
- **Next**: 07-client-core.md
- **Depends On**: 02-server-core.md (WebSocket)
