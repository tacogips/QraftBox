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

**Status**: NOT_STARTED

```typescript
// CLI configuration types
interface CLIConfig {
  port: number;
  host: string;
  noOpen: boolean;
  mode: ViewMode;
  allFiles: boolean;
  sync: SyncMode;
  watch: boolean;
  ai: boolean;
  aiQueue: boolean;
  aiConcurrent: number;
}

type ViewMode = 'github' | 'current';
type SyncMode = 'manual' | 'auto-push' | 'auto-pull' | 'auto';

// Diff target specification
interface DiffTarget {
  target: string;   // Branch, commit, or '.' for working tree
  base?: string;    // Base branch/commit (optional)
}
```

**Checklist**:
- [ ] Define CLIConfig interface
- [ ] Define ViewMode type
- [ ] Define SyncMode type
- [ ] Define DiffTarget interface
- [ ] Export all types

### 2. CLI Module

#### src/cli/index.ts

**Status**: NOT_STARTED

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
- [ ] Implement main() entry point
- [ ] Implement parseArgs() with Commander
- [ ] Implement resolveDiffTarget()
- [ ] Implement openBrowser() using Bun APIs
- [ ] Implement setupShutdownHandlers()
- [ ] Add help text and version info
- [ ] Unit tests for argument parsing

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
| Shared Types | `src/types/index.ts` | NOT_STARTED | - |
| CLI Entry | `src/cli/index.ts` | NOT_STARTED | - |
| Configuration | `src/cli/config.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| CLI | Bun runtime | Available |
| CLI | Commander package | To install |
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
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Next**: 02-server-core.md (Server implementation)
- **Depends On**: None (foundation layer)
