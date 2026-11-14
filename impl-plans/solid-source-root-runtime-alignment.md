# Solid Source-Root Runtime Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#frontend-selection-and-legacy-support
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Summary

Align repo-only Solid support checks with the actual running QraftBox source tree instead of the shell working directory. The previous implementation verified `process.cwd()` only, which could misclassify a real source run as a packaged runtime when the server was launched from outside the repository root.

## Scope

**Included**:
- Resolve a verified QraftBox source root from runtime-relative paths with `process.cwd()` as fallback
- Use that resolved root consistently for source-checkout detection, nested client dependency checks, and repo-local verification marker reads
- Add regression coverage for source-root detection when `cwd` is unrelated
- Record the rule in the architecture/design docs and plan indexes

**Not Included**:
- Changes to frontend bundle asset resolution
- Changes to the support-blocker model in the Solid client
- Additional browser verification coverage

## Modules

### 1. Frontend Status Detection

#### `src/server/routes/frontend-status.ts`

**Status**: COMPLETED

```typescript
function getSourceCheckoutSearchRoots(): readonly string[];
function findQraftBoxSourceCheckoutRoot(
  searchRoots?: readonly string[],
): string | null;

export interface DetectSolidSupportStatusOptions {
  readonly searchRoots?: readonly string[] | undefined;
}
```

**Checklist**:
- [x] Resolve the QraftBox source root from runtime-relative paths before falling back to `process.cwd()`
- [x] Use the resolved root for repo-only dependency and marker checks
- [x] Preserve `process.cwd()` fallback for local source runs launched from the repo root

### 2. Regression Coverage

#### `src/server/routes/frontend-status.test.ts`

**Status**: COMPLETED

```typescript
test("detects repo-local support facts from a resolved source root even when cwd is unrelated", () => {});
```

**Checklist**:
- [x] Cover source-root detection independent of the current working directory
- [x] Verify repo-local markers and nested client dependency checks use the resolved root
- [x] Preserve false-negative behavior for unrelated directories

## Completion Criteria

- [x] `/api/frontend-status` no longer depends on the shell working directory to identify a QraftBox source checkout
- [x] Repo-local support facts are read from the resolved source root consistently
- [x] Regression tests and design docs capture the runtime-root rule

## Progress Log

### Session: 2026-03-09 23:15
**Tasks Completed**: Review finding triage, runtime-root detection fix, regression coverage, design/plan alignment
**Tasks In Progress**: None
**Blockers**: None
**Notes**: The review found that repo-only support status still described `process.cwd()` instead of the actual running QraftBox checkout. The fix resolves a verified source root once and reuses it for dependency and marker checks.
