# Files Route Line Anchor Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#proposed-architecture
**Created**: 2026-03-12
**Last Updated**: 2026-03-12

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Review of the March 12 files-route follow-up found one remaining mismatch with the intended route ownership and the legacy Svelte behavior: the Solid files route treated `selectedLineNumber` as independent state even while the displayed file was temporarily diverging from the route-selected path during synchronization.

### Scope

**Included**:

- Clear files-route line anchors whenever route state and displayed files selection point at different files
- Preserve line anchors once both route state and displayed files state converge again
- Add focused regression coverage plus design and implementation bookkeeping

**Excluded**:

- Broader diff-screen navigation redesign
- Hash-schema changes beyond existing files-route semantics
- Browser verification beyond the existing migration tracking loop

## Modules

### 1. Files Route Synchronization

#### `client/src/app/route-sync.ts`

#### `client/src/app/route-sync.test.ts`

**Status**: COMPLETED

```typescript
function resolveFilesRouteSelectedLineNumber(params: {
  readonly currentRouteSelectedPath: string | null;
  readonly filesSelectedPath: string | null;
  readonly currentRouteSelectedLineNumber: number | null;
}): number | null;
```

**Checklist**:

- [x] Clear stale line anchors while route-selected and displayed files differ
- [x] Preserve line anchors when both route and files state agree on the same path
- [x] Add regression tests for divergence and cleared-selection cases

### 2. Design And Bookkeeping

#### `design-docs/specs/architecture.md`

#### `design-docs/specs/design-solid-frontend-migration.md`

#### `impl-plans/README.md`

#### `impl-plans/PROGRESS.json`

**Status**: COMPLETED

```typescript
interface FilesRouteLineAnchorOwnership {
  readonly selectedPath: string | null;
  readonly selectedLineNumber: number | null;
}
```

**Checklist**:

- [x] Record that files-route line anchors are valid only for the currently rendered file
- [x] Link this follow-up in the implementation-plan index and progress tracker

## Completion Criteria

- [x] Files-route line highlights cannot survive onto a different displayed file during synchronization
- [x] Matching route and files selection still preserves the requested line anchor
- [x] Tests and typechecks pass after the follow-up cleanup

## Progress Log

### Session: 2026-03-12 15:10 UTC

**Tasks Completed**: Route-sync review, line-anchor ownership fix, regression tests, design/plan updates
**Tasks In Progress**: None
**Blockers**: None
**Notes**: The route contract already scoped file query state correctly, but line-focus ownership still assumed the selected file and displayed file always matched. This follow-up closes that gap and restores the legacy behavior of resetting line-local focus when file selection changes.
