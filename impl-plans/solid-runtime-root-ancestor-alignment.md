# Solid Runtime Root Ancestor Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#frontend-selection-and-legacy-support
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Design Document Reference

**Source**: `design-docs/specs/architecture.md`

### Summary

Align repo-only Solid support checks with the intended post-cutover runtime behavior. Source-checkout detection should work from nested runtime directories, and the offline migration verification gate must include the packaged-safe bootstrap fallback regression.

### Scope

**Included**:

- Ancestor-walking source-root detection for `/api/frontend-status`
- Regression coverage for nested runtime search roots
- Inclusion of the Solid bootstrap fallback test in `test:frontend:migration`
- Design/progress updates for the architecture mismatch

**Excluded**:

- New support-status fields
- Legacy Svelte retirement work
- Browser-verification scope changes

## Modules

### 1. Runtime Source Root Discovery

#### `src/server/routes/frontend-status.ts`

**Status**: COMPLETED

```typescript
interface SourceCheckoutDiscoveryBehavior {
  readonly candidatePathsAreAncestorWalked: true;
}
```

**Checklist**:

- [x] Walk ancestor directories from runtime-derived candidate paths
- [x] Preserve existing repo-marker validation
- [x] Add regression coverage for nested runtime paths

### 2. Offline Verification Coverage

#### `package.json`

**Status**: COMPLETED

```typescript
interface FrontendMigrationVerificationCoverage {
  readonly includesBootstrapFallbackRegression: true;
}
```

**Checklist**:

- [x] Include `client/src/app/bootstrap-state.test.ts` in `test:frontend:migration`
- [x] Keep the offline migration command aligned with the support baseline

## Completion Criteria

- [x] Nested runtime paths still resolve the repo root for repo-only support facts
- [x] `test:frontend:migration` fails if the bootstrap fallback contract regresses
- [x] Design and progress records capture the alignment fix

## Progress Log

### Session: 2026-03-09 23:55
**Tasks Completed**: Runtime root detection review, ancestor-walk fix, regression-test coverage update, design/plan alignment
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review found that source-root discovery still assumed runtime-derived paths already pointed at the repo root. That contradicted the documented intent for source runs launched from nested runtime directories. The migration-focused test command also omitted the new bootstrap fallback regression, leaving the packaged-safe support contract partially unverified.
