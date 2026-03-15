# Files AI-Session Shared Selection Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#proposed-architecture
**Created**: 2026-03-12
**Last Updated**: 2026-03-12

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Align the Solid app shell and shared files controller with the intended ownership boundary for file selection. The active file selection and loaded preview must remain available to `ai-session`, while route serialization stays scoped to the `files` screen.

### Scope

**Included**:

- `App.tsx` wiring between the shared files context and `AiSessionScreen`
- Cleanup of dead AI-session helpers left behind by the March 12 refactor
- Removal of expensive deep-stringify comparisons from the files controller
- Design and architecture note updates describing the shared-selection rule

**Excluded**:

- New browser-verification coverage beyond the existing migration smoke loop
- Additional `ai-session` parity work unrelated to shared file context
- Changes to server APIs

## Modules

### 1. Shared Files Context Wiring

#### `client/src/App.tsx`

**Status**: COMPLETED

```typescript
interface SharedFilesContextConsumer {
  readonly selectedPath: string | null;
  readonly fileContent: FileContent | null;
}
```

**Checklist**:

- [x] Pass the shared selected file path into `AiSessionScreen`
- [x] Pass the shared loaded file content into `AiSessionScreen`
- [x] Keep file-selection details serialized only on the `files` route

### 2. Files Controller Churn Cleanup

#### `client/src/features/diff/files-controller.ts`

**Status**: COMPLETED

```typescript
interface FilesRefreshResult {
  readonly allFilesTree: FileTreeNode | null;
  readonly fileContent: FileContent | null;
}
```

**Checklist**:

- [x] Remove whole-tree and whole-file `JSON.stringify` comparisons
- [x] Keep refresh success paths straightforward and state-driven
- [x] Preserve existing controller behavior under the shared files context

### 3. AI Session Dead-Code Cleanup

#### `client/src/features/ai-session/state.ts`

#### `client/src/features/ai-session/presentation.ts`

#### `client/src/features/ai-session/AiSessionScreen.tsx`

**Status**: COMPLETED

```typescript
interface AiSessionCleanupSurface {
  readonly removedDefaultPromptWrapper: true;
  readonly removedUnusedPromptContextDescription: true;
}
```

**Checklist**:

- [x] Remove unused loading-state and prompt-wrapper helpers superseded by the dedicated purpose-refresh flow
- [x] Remove unused prompt-context description helpers left unattached to the current UI
- [x] Update tests to match the leaner AI-session helper surface

## Completion Criteria

- [x] `AiSessionScreen` receives the shared selected file and file content from the app shell
- [x] Files-controller refresh no longer serializes entire trees or file payloads just to detect no-op updates
- [x] Dead AI-session helper code and tests are removed
- [x] Design and architecture docs record the shared-selection ownership rule

## Progress Log

### Session: 2026-03-12 16:00

**Tasks Completed**: Review of March 11-12 Solid changes, shared-selection regression fix, files-controller cleanup, AI-session dead-code removal, design/plan updates
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review found that the intended shared `files | ai-session` ownership boundary already existed in the migration design, but `App.tsx` still passed `null` selection props into `AiSessionScreen`. The same pass also found controller-level deep serialization and unused AI-session helper code left behind by the March 12 refactor.
