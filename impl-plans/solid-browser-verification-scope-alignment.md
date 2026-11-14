# Solid Browser Verification Scope Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#overview
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Align the post-cutover support-status model with the actual scope of the recorded browser-verification marker. The repo-owned `verify:frontend:migration:browser` command currently verifies only the shared `project` and `files` smoke loop, so the screen registry must not clear unrelated screen-level parity blockers when that marker is present.

### Scope

**Included**:

- Screen-registry blocker logic for recorded browser verification
- Regression coverage for the narrowed blocker-clearing behavior
- Design, README, and plan updates that document the marker's current scope

**Excluded**:

- Expanding `verify:frontend:migration:browser` to cover more screens
- Renaming marker files or route names
- Removing legacy Svelte support

## Modules

### 1. Support-Status Blocker Evaluation

#### `client/src/app/screen-registry.ts`

**Status**: COMPLETED

```typescript
interface SolidSupportBlocker {
  readonly id: string;
  readonly scope: "global" | "screen";
  readonly category:
    | "build"
    | "verification"
    | "implementation"
    | "parity"
    | "environment";
  readonly summary: string;
}
```

**Checklist**:

- [x] Keep the recorded browser marker as a global support criterion
- [x] Limit automatic screen-blocker clearing to flows actually covered by the recorded smoke loop
- [x] Preserve explicit blockers for unverified screens outside `project` and `files`

### 2. Design And Progress Alignment

#### `design-docs/specs/design-solid-frontend-migration.md`

**Status**: COMPLETED

```typescript
interface BrowserVerificationScopeNote {
  readonly command: "bun run verify:frontend:migration:browser";
  readonly coveredScreens: readonly ["project", "files"];
}
```

**Checklist**:

- [x] Document that the recorded browser marker is narrower than full screen parity
- [x] Point future work at follow-up verification for the remaining screens
- [x] Record this alignment work in plan indexes/progress tracking

## Completion Criteria

- [x] Recorded browser verification no longer clears unrelated screen blockers
- [x] Regression tests cover the narrowed blocker-clearing behavior
- [x] Design and README text match the implemented verification scope

## Progress Log

### Session: 2026-03-09 23:25
**Tasks Completed**: Browser verification scope review, support-status blocker fix, design/README/plan alignment
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review found a post-cutover architecture mismatch: the recorded browser-verification marker only proves the shared `project` and `files` smoke loop, but the screen registry was clearing parity blockers for unrelated screens as if the marker represented blanket parity coverage. This follow-up narrows the blocker-clearing behavior to match the actual verification command.
