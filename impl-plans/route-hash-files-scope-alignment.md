# Route Hash Files Scope Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#proposed-architecture
**Created**: 2026-03-12
**Last Updated**: 2026-03-12

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Align the shared navigation contract with the intended `files`-only hash scope for file-selection state. Non-files routes must ignore stale `path`/`view`/`tree`/`line` query state at the contract boundary instead of relying on a later app-shell cleanup pass.

### Scope

**Included**:

- Shared hash parse/build enforcement for `files`-only selection query state
- Regression tests covering non-files route cleanup at the contract layer
- Removal of the now-unused Solid client API surface for direct session-purpose fetches
- Design and implementation bookkeeping for the alignment

**Excluded**:

- Server-side removal of the dedicated purpose route
- Broader AI-session UI redesign
- Browser verification beyond existing migration tracking

## Modules

### 1. Navigation Contract Scoping

#### `client-shared/src/contracts/navigation.ts`

#### `client-shared/src/contracts/navigation.test.ts`

**Status**: COMPLETED

```typescript
function createParsedRouteWithQueryState(params: {
  readonly projectSlug: string | null;
  readonly screen: AppScreen;
  readonly selectedPath: string;
  readonly selectedViewMode: DiffViewMode | undefined;
  readonly fileTreeMode: FileTreeMode | undefined;
  readonly selectedLineNumber: number | null;
}): ParsedAppRoute;
```

**Checklist**:

- [x] Ignore file-selection query state when parsing non-files routes
- [x] Avoid emitting file-selection query state when building non-files hashes
- [x] Add regression coverage for the scoped contract behavior

### 2. Dead Client API Cleanup

#### `client-shared/src/api/ai-sessions.ts`

#### `client-shared/src/api/ai-sessions.test.ts`

**Status**: COMPLETED

```typescript
interface AiSessionsApiClient {
  fetchClaudeSessionTranscript(
    contextId: string,
    qraftAiSessionId: QraftAiSessionId,
    options?: {
      readonly offset?: number | undefined;
      readonly limit?: number | undefined;
    },
  ): Promise<AiSessionTranscriptResponse>;
}
```

**Checklist**:

- [x] Remove the unused direct session-purpose client method
- [x] Remove tests that only covered the dead client surface
- [x] Keep the active Solid ai-session path focused on prompt-based default actions

## Completion Criteria

- [x] Non-files routes no longer preserve file-selection query state in shared hash parsing/building
- [x] The app shell no longer depends on a cleanup round-trip to strip stale file query parameters
- [x] Dead client API surface from the removed direct-purpose shortcut is gone
- [x] Design and plan records match the corrected architecture

## Progress Log

### Session: 2026-03-12 18:35

**Tasks Completed**: Route-contract review, navigation contract fix, dead API cleanup, design/plan updates
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review of the March 12 follow-up work found that the migration design already required `files`-only hash serialization, but the shared navigation contract still parsed and emitted file query state for non-files routes and relied on `App.tsx` to clean it up afterward.
