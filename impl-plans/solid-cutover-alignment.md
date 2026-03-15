# Solid Cutover Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#overview
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

---

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Align the repository's release packaging and operational documentation with the completed Solid cutover, while preserving the legacy Svelte frontend as an explicitly selectable fallback.

### Scope

**Included**:
- Release artifact packaging for both frontend bundles
- Architecture, command, and migration documentation updates
- Plan/progress tracking for the post-cutover alignment work

**Excluded**:
- Removal of the legacy Svelte frontend
- Renaming migration-era runtime/status concepts
- New UI feature work beyond cutover-alignment fixes

---

## Modules

### 1. Release Packaging Alignment

#### Taskfile.yml

**Status**: COMPLETED

```typescript
type ReleaseFrontendAsset = "client" | "client-legacy";

interface ReleaseArtifactLayout {
  readonly bundledFrontends: readonly ReleaseFrontendAsset[];
  readonly supportsDefaultSolidFrontend: true;
  readonly supportsLegacySvelteFrontend: true;
}
```

**Checklist**:
- [x] Build both frontend bundles during release preparation
- [x] Copy both frontend bundles into compiled binary archives
- [x] Copy both frontend bundles into npm release artifacts

### 2. Documentation Alignment

#### design-docs/specs/architecture.md

**Status**: COMPLETED

```typescript
interface FrontendArchitectureSummary {
  readonly defaultFrontend: "solid";
  readonly legacyFrontend: "svelte";
  readonly defaultFrontendPath: "client";
  readonly legacyFrontendPath: "client-legacy";
}
```

**Checklist**:
- [x] Update architecture docs to describe the post-cutover layout
- [x] Update command/docs to document `--frontend` and legacy asset overrides
- [x] Update README to describe legacy fallback support in shipped artifacts

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Release packaging alignment | `Taskfile.yml` | COMPLETED | Manual |
| Documentation alignment | `README.md`, `design-docs/specs/*.md` | COMPLETED | Manual |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Release packaging alignment | Solid cutover commit | Available |
| Documentation alignment | Release packaging alignment | Completed |

## Completion Criteria

- [x] Release workflows ship both `dist/client` and `dist/client-legacy`
- [x] Architecture/design docs match the current frontend layout
- [x] Implementation plan index records the cutover-alignment follow-up

## Progress Log

### Session: 2026-03-09 23:50
**Tasks Completed**: Review follow-up for legacy client build preflight
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review found an operational consistency gap after the cutover packaging work: the top-level `build:client:legacy` script did not check for installed `client-legacy` dependencies before invoking the build, unlike the Solid build path. Added a matching explicit preflight so direct legacy-build invocations fail with a clear remediation message instead of an opaque bundler error.

### Session: 2026-03-09 23:20
**Tasks Completed**: Release packaging alignment, documentation alignment, plan/progress updates
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Fixed a packaging regression where release artifacts only shipped the default Solid bundle even though `--frontend svelte` remains a supported runtime path.

## Related Plans

- **Previous**: `impl-plans/solid-frontend-migration.md`
- **Next**: None
- **Depends On**: `solid-frontend-migration.md`
