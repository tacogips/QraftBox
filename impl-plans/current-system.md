# Current System Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#overview
**Created**: 2026-02-17
**Last Updated**: 2026-02-17

## Design Document Reference

This plan captures the as-built implementation of QraftBox. It is not a future roadmap; it documents the existing modules and their public TypeScript types.

**Out of Scope**:
- New feature proposals
- Refactors or migrations
- Unimplemented GitHub/PR route wiring

## Modules

### 1. CLI Configuration Types

#### src/types/index.ts

```typescript
export interface CLIConfig {
  readonly port: number;
  readonly host: string;
  readonly open: boolean;
  readonly watch: boolean;
  readonly syncMode: SyncMode;
  readonly ai: boolean;
  readonly projectPath: string;
  readonly promptModel: string;
  readonly assistantModel: string;
  readonly assistantAdditionalArgs: readonly string[];
  readonly projectDirs: readonly string[];
}

export type SyncMode = "manual" | "auto-push" | "auto-pull" | "auto";
```

**Checklist**:
- [x] CLI configuration types defined
- [x] Defaults and validation implemented

### 2. Workspace & Context Types

#### src/types/workspace.ts

```typescript
export type ContextId = string;

export interface WorkspaceTab {
  readonly id: ContextId;
  readonly projectSlug: string;
  readonly path: string;
  readonly name: string;
  readonly repositoryRoot: string;
  readonly isGitRepo: boolean;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
  readonly isWorktree: boolean;
  readonly mainRepositoryPath: string | null;
  readonly worktreeName: string | null;
}

export interface RecentDirectory {
  readonly path: string;
  readonly name: string;
  readonly lastOpened: number;
  readonly isGitRepo: boolean;
}
```

**Checklist**:
- [x] Workspace tab model defined
- [x] Recent directory model defined

### 3. Git & Diff Models

#### src/types/git.ts

```typescript
export type FileStatusCode =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored";

export interface DiffFile {
  readonly path: string;
  readonly status: FileStatusCode;
  readonly oldPath?: string | undefined;
  readonly additions: number;
  readonly deletions: number;
  readonly chunks: readonly DiffChunk[];
  readonly isBinary: boolean;
  readonly fileSize?: number | undefined;
}

export interface DiffChunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly header: string;
  readonly changes: readonly DiffChange[];
}

export interface DiffChange {
  readonly type: "add" | "delete" | "context";
  readonly oldLine?: number | undefined;
  readonly newLine?: number | undefined;
  readonly content: string;
}
```

**Checklist**:
- [x] Diff/file status types defined
- [x] Server uses git diff parsing to populate models

### 4. AI Session Types

#### src/types/ai.ts

```typescript
export type QraftAiSessionId = string & {
  readonly __brand: "QraftAiSessionId";
};

export interface AIPromptRequest {
  readonly prompt: string;
  readonly context: AIPromptContext;
  readonly options: AIPromptOptions;
}

export interface QueueStatus {
  readonly runningCount: number;
  readonly queuedCount: number;
  readonly runningSessionIds: readonly QraftAiSessionId[];
  readonly totalCount: number;
}
```

**Checklist**:
- [x] AI prompt and queue types defined
- [x] Session identifiers are branded

### 5. Tool Registration Types

#### src/types/tool.ts

```typescript
export interface JsonSchema {
  readonly type: string;
  readonly properties?: Record<string, JsonSchemaProperty> | undefined;
  readonly required?: readonly string[] | undefined;
  readonly items?: JsonSchemaProperty | undefined;
  readonly description?: string | undefined;
  readonly enum?: readonly unknown[] | undefined;
  readonly additionalProperties?: boolean | JsonSchemaProperty | undefined;
}

export interface JsonSchemaProperty {
  readonly type: string;
  readonly description?: string | undefined;
  readonly enum?: readonly unknown[] | undefined;
  readonly items?: JsonSchemaProperty | undefined;
  readonly properties?: Record<string, JsonSchemaProperty> | undefined;
  readonly required?: readonly string[] | undefined;
  readonly default?: unknown;
}

export type ToolSource = "builtin" | "plugin";
export type PluginHandlerType = "shell" | "http" | "file-read";
```

**Checklist**:
- [x] Tool schema types defined
- [x] Built-in and plugin sources supported

### 6. Client Diff Types

#### client/src/types/diff.ts

```typescript
export type DiffStatus = "added" | "modified" | "deleted" | "renamed";
export type DiffChangeType = "add" | "delete" | "context";

export interface DiffChange {
  readonly type: DiffChangeType;
  readonly content: string;
  readonly oldLine: number | undefined;
  readonly newLine: number | undefined;
}

export interface DiffChunk {
  readonly header: string;
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly changes: readonly DiffChange[];
}

export interface DiffFile {
  readonly path: string;
  readonly status: DiffStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly chunks: readonly DiffChunk[];
  readonly oldPath?: string;
}
```

**Checklist**:
- [x] Client diff models defined
- [x] Client renders diff using these types

## Module Status

| Module | File Path | Status | Tests |
| --- | --- | --- | --- |
| CLI config types | `src/types/index.ts` | Completed | Unit tests present |
| Workspace types | `src/types/workspace.ts` | Completed | Unit tests present |
| Git/diff types | `src/types/git.ts` | Completed | Unit tests present |
| AI session types | `src/types/ai.ts` | Completed | Unit tests present |
| Tool registration types | `src/types/tool.ts` | Completed | Unit tests present |
| Client diff types | `client/src/types/diff.ts` | Completed | Unit tests present |

## Dependencies

| Feature | Depends On | Status |
| --- | --- | --- |
| Server routes | Core types, workspace types | Completed |
| Client diff UI | Git/diff types | Completed |
| AI runtime | AI session types, tool registry | Completed |

## Completion Criteria

- [x] All modules implemented
- [x] All tests passing
- [x] Type checking passes
- [x] Docs aligned with current implementation

## Progress Log

### Session: 2026-02-17 00:00
**Tasks Completed**: Rewrote plan to match as-built system
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Consolidated plan set into a single current-system plan.

## Tasks

### TASK-001: Core CLI Configuration Types

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `src/types/index.ts`
**Dependencies**: None

**Description**:
Define CLI configuration and sync mode types.

**Completion Criteria**:
- [x] CLIConfig defined
- [x] SyncMode defined

### TASK-002: Workspace Context Types

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `src/types/workspace.ts`
**Dependencies**: None

**Description**:
Define workspace tab, context, and recent directory models.

**Completion Criteria**:
- [x] WorkspaceTab defined
- [x] RecentDirectory defined

### TASK-003: Git/Diff Data Models

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `src/types/git.ts`
**Dependencies**: None

**Description**:
Define file status and diff models for server APIs.

**Completion Criteria**:
- [x] DiffFile model defined
- [x] DiffChunk and DiffChange defined

### TASK-004: AI Session Models

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `src/types/ai.ts`
**Dependencies**: None

**Description**:
Define AI prompt request and queue status models.

**Completion Criteria**:
- [x] AIPromptRequest defined
- [x] QueueStatus defined

### TASK-005: Tool Registration Models

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `src/types/tool.ts`
**Dependencies**: None

**Description**:
Define JSON schema and tool handler types for registry.

**Completion Criteria**:
- [x] JsonSchema defined
- [x] ToolSource and PluginHandlerType defined

### TASK-006: Client Diff Models

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `client/src/types/diff.ts`
**Dependencies**: None

**Description**:
Define client-side diff types used by the UI.

**Completion Criteria**:
- [x] Client diff models defined
