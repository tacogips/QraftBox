# Solid Bootstrap Support Fallback Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#frontend-selection-and-legacy-support
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Design Document Reference

**Source**: `design-docs/specs/architecture.md`

### Summary

Align the Solid client bootstrap fallback with the packaged-runtime support-status design. The runtime status API now distinguishes source checkouts from packaged installs, but the client bootstrap default still assumed `hasSourceCheckout: true`, which could reintroduce impossible repo-only blockers whenever `/api/frontend-status` was still loading or failed.

### Scope

**Included**:

- Solid bootstrap fallback status defaults in `client/src/app/bootstrap-state.ts`
- Regression coverage for bootstrap fallback behavior
- Design and plan index updates documenting the bootstrap/runtime distinction

**Excluded**:

- Changes to `/api/frontend-status` server detection
- New browser-verification coverage
- Legacy Svelte retirement work

## Modules

### 1. Bootstrap Fallback Status

#### `client/src/app/bootstrap-state.ts`

**Status**: COMPLETED

```typescript
interface SolidBootstrapState {
  readonly supportStatus: SolidSupportStatus;
}
```

**Checklist**:

- [x] Stop using the source-checkout-oriented registry default as the client bootstrap fallback
- [x] Keep bootstrap fallback safe for packaged installs when runtime status cannot be fetched
- [x] Add focused regression coverage

## Completion Criteria

- [x] The default Solid bootstrap state no longer implies `hasSourceCheckout: true`
- [x] Regression tests cover the bootstrap fallback behavior
- [x] Design/plan docs describe the bootstrap/runtime alignment

## Progress Log

### Session: 2026-03-09 23:59
**Tasks Completed**: Review finding triage, bootstrap fallback fix, regression coverage, design/plan alignment
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review found that the runtime-status architecture had been corrected for packaged installs, but the Solid client still bootstrapped with a source-checkout default. That meant a failed `/api/frontend-status` fetch could resurrect impossible repo-only blockers in packaged environments despite the newer server/runtime rules.
