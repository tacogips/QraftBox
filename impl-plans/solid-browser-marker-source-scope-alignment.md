# Solid Browser Marker Source-Scope Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#frontend-selection-and-legacy-support
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Design Document Reference

**Source**: `design-docs/specs/architecture.md`

### Summary

Align the support-status runtime with the documented source-checkout boundary for repo-local verification markers. Browser and full-migration marker files are meaningful only in a source checkout, so they must not influence packaged-runtime support reporting or screen-blocker clearing.

### Scope

**Included**:

- Runtime normalization for repo-local marker fields in `/api/frontend-status`
- Screen-registry blocker evaluation alignment with the same source-checkout rule
- Regression coverage plus design/plan updates for the corrected boundary

**Excluded**:

- Expanding browser verification coverage beyond the current `project` and `files` smoke loop
- Renaming marker files
- Legacy frontend retirement work

## Modules

### 1. Runtime Marker Normalization

#### `src/server/routes/frontend-status.ts`

**Status**: COMPLETED

```typescript
interface SolidSupportStatus {
  readonly hasSourceCheckout: boolean;
  readonly hasRecordedFullMigrationCheck: boolean;
  readonly hasRecordedBrowserVerification: boolean;
}
```

**Checklist**:

- [x] Report repo-local verification markers only when `hasSourceCheckout` is true
- [x] Keep bundle-serving detection unchanged for packaged runtimes
- [x] Add regression coverage for both packaged and source-checkout cases

### 2. Screen Registry Source-Scope Alignment

#### `client/src/app/screen-registry.ts`

**Status**: COMPLETED

```typescript
interface BrowserMarkerApplicability {
  readonly requiresSourceCheckout: true;
}
```

**Checklist**:

- [x] Clear the `files` parity blocker only when browser verification is both recorded and applicable
- [x] Preserve blockers when marker fields are not applicable outside a source checkout
- [x] Keep the existing smoke-loop scope unchanged

## Completion Criteria

- [x] Packaged-runtime support status ignores repo-local verification markers
- [x] Screen-level blocker clearing follows the same applicability rule
- [x] Tests and design records capture the corrected source boundary

## Progress Log

### Session: 2026-03-09 23:59
**Tasks Completed**: Review finding triage, runtime marker normalization, screen-registry applicability fix, design/plan updates
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review found that the post-cutover support model still allowed repo-local browser and migration markers to affect runtime reporting even when `hasSourceCheckout` was false. This follow-up makes the marker fields and blocker-clearing logic obey the same packaged-vs-source boundary documented in the architecture and migration design.
