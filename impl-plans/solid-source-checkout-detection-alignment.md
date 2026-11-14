# Solid Source-Checkout Detection Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#frontend-selection-and-legacy-support
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Summary

Tighten `/api/frontend-status` source-checkout detection so repo-only Solid support checks apply only inside an actual QraftBox source checkout, not any unrelated working directory that happens to contain a `client/` tree.

## Scope

**Included**:
- Strengthen source-checkout detection in `src/server/routes/frontend-status.ts`
- Add regression tests for false-positive and true-positive checkout detection
- Record the rule in the post-cutover architecture/design docs

**Not Included**:
- Changes to frontend bundle resolution
- Changes to the support-blocker evaluation model itself
- New browser-verification coverage

## Modules

### 1. Frontend Status Detection

#### `src/server/routes/frontend-status.ts`

**Status**: COMPLETED

```typescript
function hasPackageJsonName(
  packageJsonPath: string,
  expectedName: string,
): boolean;

function detectHasSourceCheckout(): boolean;
```

**Checklist**:
- [x] Verify the repo root `package.json` is QraftBox
- [x] Verify `client/package.json` matches the Solid frontend package
- [x] Treat malformed or missing package files as non-source checkouts

### 2. Regression Coverage

#### `src/server/routes/frontend-status.test.ts`

**Status**: COMPLETED

```typescript
test("does not treat an unrelated repo with a client package as a source checkout", () => {});
test("detects repo-local verification markers from a source checkout", () => {});
```

**Checklist**:
- [x] Cover false positives from unrelated repos
- [x] Preserve true-positive detection for QraftBox-style checkouts
- [x] Verify repo-local marker files stay ignored outside a source checkout

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Source-checkout detection | `src/server/routes/frontend-status.ts` | COMPLETED | Yes |
| Frontend-status regression tests | `src/server/routes/frontend-status.test.ts` | COMPLETED | Yes |
| Design alignment | `design-docs/specs/architecture.md` | COMPLETED | N/A |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Detection hardening | Existing frontend-status route | COMPLETED |
| Regression tests | Detection hardening | COMPLETED |

## Completion Criteria

- [x] `/api/frontend-status` no longer treats arbitrary repos as QraftBox source checkouts
- [x] Regression tests cover both true-positive and false-positive detection
- [x] Design docs describe the stronger checkout-detection rule

## Progress Log

### Session: 2026-03-09 16:25
**Tasks Completed**: Detection hardening, regression tests, design alignment
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Restricted repo-only marker handling to verified QraftBox checkout layouts to avoid false blockers in packaged/runtime-adjacent executions.
