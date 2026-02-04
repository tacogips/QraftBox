# CLI Layer Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#cli-interface
**Phase**: 1
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
CLI entry point using Bun runtime and Commander for argument parsing. Handles server lifecycle, browser opening, and configuration.

### Scope
**Included**: CLI argument parsing, server startup/shutdown, browser opening, configuration loading
**Excluded**: Server implementation details (separate plan), client implementation

---

## Modules

### 1. Shared Types

#### src/types/index.ts

**Status**: COMPLETED

```typescript
// CLI configuration types
interface CLIConfig {
  readonly port: number;
  readonly host: string;
  readonly noOpen: boolean;
  readonly mode: ViewMode;
  readonly allFiles: boolean;
  readonly sync: SyncMode;
  readonly watch: boolean;
  readonly ai: boolean;
  readonly aiQueue: boolean;
  readonly aiConcurrent: number;
}

type ViewMode = 'github' | 'current';
type SyncMode = 'manual' | 'auto-push' | 'auto-pull' | 'auto';

// Diff target specification
interface DiffTarget {
  readonly type: 'working' | 'branch' | 'commit';
  readonly base: string;
  readonly target: string;
}

interface ServerContext {
  readonly projectPath: string;
  readonly diffTarget: DiffTarget;
  readonly config: CLIConfig;
}
```

**Checklist**:
- [x] Define CLIConfig interface
- [x] Define ViewMode type
- [x] Define SyncMode type
- [x] Define DiffTarget interface
- [x] Define ServerContext interface
- [x] Export all types

### 2. CLI Module

#### src/cli/index.ts

**Status**: COMPLETED

```typescript
// CLI entry point
function main(): Promise<void>;

// Parse CLI arguments and return config
function parseArgs(argv: string[]): CLIConfig & DiffTarget;

// Resolve diff target (handle '.', branch names, commits)
function resolveDiffTarget(target?: string, base?: string): DiffTarget;

// Open browser at specified URL
function openBrowser(url: string): Promise<void>;

// Graceful shutdown handler
function setupShutdownHandlers(server: Server): void;
```

**Checklist**:
- [x] Implement main() entry point
- [x] Implement parseArgs() with Commander
- [x] Implement resolveDiffTarget()
- [x] Implement openBrowser() using Bun APIs
- [x] Implement setupShutdownHandlers()
- [x] Add help text and version info
- [x] Unit tests for argument parsing

### 3. Configuration

#### src/cli/config.ts

**Status**: NOT_STARTED

```typescript
// Default configuration values
const DEFAULT_CONFIG: Partial<CLIConfig>;

// Load and merge configuration from environment and args
function loadConfig(args: Partial<CLIConfig>): CLIConfig;

// Validate configuration
function validateConfig(config: CLIConfig): void;
```

**Checklist**:
- [ ] Define DEFAULT_CONFIG
- [ ] Implement loadConfig()
- [ ] Implement validateConfig()
- [ ] Handle environment variable overrides
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Shared Types | `src/types/index.ts` | COMPLETED | Passing |
| CLI Entry | `src/cli/index.ts` | COMPLETED | Passing |
| Configuration | `src/cli/config.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| CLI | Bun runtime | Available |
| CLI | Commander package | Installed |
| Browser open | Bun spawn | Available |

## Completion Criteria

- [ ] `aynd` command starts server and opens browser
- [ ] All CLI options from design doc supported
- [ ] Help text displays correctly
- [ ] Graceful shutdown on SIGINT/SIGTERM
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created

### Session: 2026-02-03 (Impl)
**Tasks Completed**: TASK-001 Shared Types
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented src/types/index.ts with CLIConfig, ViewMode, SyncMode, DiffTarget, and ServerContext interfaces. All use readonly properties. Tests passing.

### Session: 2026-02-03 (CLI Entry)
**Tasks Completed**: TASK-002 CLI Module (src/cli/index.ts)
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented CLI entry point with:
- parseArgs() using Commander for all CLI options (-p, -H, --no-open, -m, -a, --sync, -w, --ai, --ai-queue, --ai-concurrent)
- resolveDiffTarget() handles '.', branch names, commit hashes (7-40 chars)
- openBrowser() uses platform-specific commands (xdg-open/open/start)
- setupShutdownHandlers() for graceful SIGINT/SIGTERM
- main() entry point with configuration logging
- All 37 unit tests passing
- Follows strict TypeScript with bracket notation for index signatures

## Related Plans

- **Next**: 02-server-core.md (Server implementation)
- **Depends On**: None (foundation layer)
