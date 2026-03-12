# AI Session Feature-Owned Route Hash Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#proposed-architecture
**Created**: 2026-03-12
**Last Updated**: 2026-03-12

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Review of the March 12 route-alignment follow-up found one remaining ownership mismatch: the design required feature-owned ai-session route helpers, but `client/src/App.tsx` still assembled the full `#/.../ai-session?...` hash locally and only reused the feature module for the query-string fragment.

### Scope

**Included**:

- Move full ai-session screen-hash composition into the ai-session feature state helpers
- Switch the app shell to the feature-owned helper for files-to-session deep links
- Record the alignment in design and implementation bookkeeping

**Excluded**:

- Changes to general files-route hash semantics
- Selected-session UI/layout changes
- Server-side routing changes

## Modules

### 1. Feature-Owned AI-Session Route Hash Helper

#### `client/src/features/ai-session/state.ts`

#### `client/src/features/ai-session/state.test.ts`

**Status**: COMPLETED

```typescript
function buildAiSessionScreenHash(params: {
  readonly projectSlug: string | null;
  readonly overviewRouteState: AiSessionOverviewRouteState;
}): string;
```

**Checklist**:

- [x] Centralize full ai-session screen-hash composition in the feature-owned state module
- [x] Add regression coverage for project-scoped and global ai-session hashes

### 2. App-Shell Route Ownership Cleanup

#### `client/src/App.tsx`

#### `client/src/app/route-sync.ts`

**Status**: COMPLETED

```typescript
function resolveFilesRouteSelectedPath(params: {
  readonly currentRouteSelectedPath: string | null;
  readonly filesSelectedPath: string | null;
}): string | null;
```

**Checklist**:

- [x] Remove the remaining App-owned ai-session hash assembly
- [x] Keep files-to-session deep-link behavior unchanged while simplifying route-state ownership
- [x] Trim duplicated selected-path reconciliation logic adjacent to the changed route wiring

## Completion Criteria

- [x] The ai-session feature owns full screen-hash generation for its route state
- [x] `App.tsx` no longer hand-builds ai-session route hashes
- [x] Focused tests and typechecking pass after the cleanup

## Progress Log

### Session: 2026-03-12 22:35 JST

**Tasks Completed**: Route-hash ownership review, feature-owned hash helper implementation, app-shell cleanup, targeted regression coverage, design/plan updates
**Tasks In Progress**: None
**Blockers**: None
**Notes**: This iteration closes the remaining gap between the migration design and the as-built App shell. The previous follow-up reused the ai-session query helper, but ownership of the full hash still sat in `App.tsx`.
