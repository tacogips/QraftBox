# Solid Support Runtime Scope Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#frontend-selection-and-legacy-support
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Design Document Reference

**Source**: `design-docs/specs/architecture.md`

### Summary

Align the Solid support-status model with the actual runtime environments. Source checkouts can evaluate repo-local verification prerequisites such as nested frontend dependencies and recorded migration markers, while packaged binaries and npm installs can only evaluate runtime bundle-serving state.

### Scope

**Included**:

- Runtime status-contract extension for source-checkout detection
- Support-registry logic changes so repo-only blockers become not-applicable outside a source checkout
- Design and README updates documenting the environment split

**Excluded**:

- New browser-verification coverage
- Legacy Svelte retirement
- Release pipeline changes

## Modules

### 1. Runtime Status Scope Detection

#### `src/server/routes/frontend-status.ts`

**Status**: COMPLETED

```typescript
interface SolidSupportStatus {
  readonly hasSourceCheckout: boolean;
}
```

**Checklist**:

- [x] Detect whether the server is running from a source checkout
- [x] Include that fact in `/api/frontend-status`
- [x] Keep existing bundle and marker detection intact

### 2. Support Registry Applicability Rules

#### `client/src/app/screen-registry.ts`

**Status**: COMPLETED

```typescript
interface SolidSupportCriterion {
  readonly status: "pass" | "blocked" | "not-applicable";
}
```

**Checklist**:

- [x] Treat repo-only verification criteria as not-applicable when no source checkout exists
- [x] Suppress impossible repo-only blockers in packaged runtimes
- [x] Update Solid UI copy/tests to render the new criterion status

## Completion Criteria

- [x] `/api/frontend-status` distinguishes packaged runtime scope from source-checkout scope
- [x] Support registry no longer reports impossible repo-only blockers in packaged environments
- [x] Design docs and README describe the scope split

## Progress Log

### Session: 2026-03-09 23:55
**Tasks Completed**: Review finding triage, runtime scope detection, support-registry applicability update, documentation and plan registration
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review found an architecture mismatch after the support-status rename: the runtime status path still assumed a source checkout and would therefore report missing `client/node_modules` and missing workspace markers from packaged releases, even though those environments can only validate built bundle serving. This follow-up adds explicit source-checkout detection and narrows repo-only checks to the environments where they are meaningful.
