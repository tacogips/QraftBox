# Solid Bootstrap Bundle Truthfulness Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#frontend-selection-and-legacy-support
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Summary

Keep the Solid bootstrap fallback truthful about bundle availability. The app can only execute after the Solid bundle has already been served, so defaulting `hasBuiltSolidBundle` to `false` creates a false blocker whenever `/api/frontend-status` is still loading or fails.

## Scope

**Included**:
- Correct the Solid bootstrap fallback in `client/src/app/bootstrap-state.ts`
- Add regression coverage for the fallback bundle status
- Record the architectural rule in the design and plan indexes

**Not Included**:
- Changes to `/api/frontend-status` server detection
- Changes to screen-specific parity blockers
- Additional browser-verification automation

## Modules

### 1. Bootstrap Support Status

#### `client/src/app/bootstrap-state.ts`

**Status**: COMPLETED

```typescript
const DEFAULT_BOOTSTRAP_SOLID_SUPPORT_STATUS: SolidSupportStatus = {
  hasBuiltSolidBundle: true,
};
```

**Checklist**:
- [x] Treat the currently loaded Solid app as proof that the bundle exists
- [x] Preserve the packaged-safe `hasSourceCheckout: false` bootstrap fallback
- [x] Keep the fallback behavior regression-tested

## Completion Criteria

- [x] Bootstrap fallback no longer reports the active Solid bundle as missing
- [x] Regression tests cover the corrected fallback state
- [x] Design docs describe why bundle truthfulness differs from repo-only checks

## Progress Log

### Session: 2026-03-10 00:28
**Tasks Completed**: Review finding triage, bootstrap bundle-truthfulness fix, regression coverage, design/plan alignment
**Tasks In Progress**: None
**Blockers**: None
**Notes**: The review found that the packaged-safe bootstrap fallback still falsely marked the Solid bundle as missing, even though the browser was already executing that bundle. The fix keeps repo-only checks disabled by default while making bundle availability truthful during frontend-status API failures.
