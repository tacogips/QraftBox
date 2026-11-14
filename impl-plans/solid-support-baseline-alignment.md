# Solid Support Baseline Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#frontend-selection-and-legacy-support
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Design Document Reference

**Source**: `design-docs/specs/architecture.md`

### Summary

Make the post-cutover Solid support-status baselines explicit in code. The architecture now distinguishes packaged-runtime bootstrap behavior from source-checkout validation/reporting behavior, so the client should expose those as named baselines instead of relying on ambiguous "default" objects.

### Scope

**Included**:

- Explicit packaged-runtime and source-checkout support-status baselines
- Refactoring bootstrap and screen-registry defaults to consume those baselines
- Regression coverage proving both baselines and inclusion in the migration test command
- Architecture/notes updates documenting the baseline split

**Excluded**:

- Changes to runtime detection in `/api/frontend-status`
- Changes to browser-verification scope or marker semantics
- Legacy frontend retirement work

## Modules

### 1. Shared Support-Status Baselines

#### `client/src/app/support-status.ts`

**Status**: COMPLETED

```typescript
interface SolidSupportStatus {
  readonly hasSourceCheckout: boolean;
  readonly hasBuiltSolidBundle: boolean;
}
```

**Checklist**:

- [x] Define a packaged-runtime support baseline
- [x] Define a source-checkout support baseline
- [x] Reuse those constants from bootstrap and screen-registry modules
- [x] Add regression tests and wire them into `bun run test:frontend:migration`

## Completion Criteria

- [x] Packaged-runtime bootstrap state uses a named baseline instead of an inline object
- [x] Source-checkout-oriented support-report helpers use a named baseline instead of an inline object
- [x] Tests cover both baseline shapes explicitly
- [x] Design docs describe why the baselines must remain distinct

## Progress Log

### Session: 2026-03-09 23:59
**Tasks Completed**: Review finding triage, baseline extraction, regression test addition, migration test command update, design and plan record updates
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review found that the architecture had already split packaged-runtime versus source-checkout support rules, but the client code still expressed them as two different generic "default" objects. That shape invited misuse and made follow-up review harder because a caller's baseline choice was implicit.

## Related Plans

- **Previous**: `solid-bootstrap-support-fallback-alignment.md`
- **Next**: None
- **Depends On**: `solid-support-runtime-scope-alignment.md`, `solid-bootstrap-bundle-truthfulness-alignment.md`
