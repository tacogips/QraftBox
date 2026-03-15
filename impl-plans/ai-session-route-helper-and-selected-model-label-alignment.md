# AI Session Route Helper And Selected Model Label Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#proposed-architecture
**Created**: 2026-03-12
**Last Updated**: 2026-03-12

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Review of the in-progress March 12 ai-session parity work found two residual mismatches:

- The selected-session popup resolved model metadata field-by-field for the footer, but the header badge still rendered from overview-card data only.
- Files-to-session deep links still hand-built `ai_session_id` hash state in `App.tsx` instead of reusing the feature-owned ai-session route helpers.

### Scope

**Included**:

- Selected-session popup model-label consistency across header and footer surfaces
- Shared fallback control for unknown selected-session model labels
- App-shell cleanup to reuse ai-session route-search helpers for files-to-session deep links
- Design and implementation bookkeeping for the follow-up alignment

**Excluded**:

- Broader ai-session popup layout changes
- Server-side routing changes
- Additional browser-verification scope beyond the affected Solid flow

## Modules

### 1. Selected-Session Model Label Consistency

#### `client/src/features/ai-session/presentation.ts`

#### `client/src/features/ai-session/presentation.test.ts`

#### `client/src/features/ai-session/AiSessionScreen.tsx`

**Status**: COMPLETED

```typescript
interface DescribeAiSessionEntryModelOptions {
  readonly unknownLabel?: string | undefined;
}

function describeAiSessionEntryModel(
  entry: Pick<
    AiSessionListEntry,
    "modelProfileId" | "modelVendor" | "modelName"
  >,
  profiles: readonly ModelProfile[],
  options?: DescribeAiSessionEntryModelOptions,
): string;
```

**Checklist**:

- [x] Let selected-session UI choose a non-assertive fallback label when model metadata is unavailable
- [x] Reuse the same resolved selected-session model label in the popup header and footer
- [x] Add regression coverage for the customizable unknown-label fallback

### 2. Files-To-Session Route Helper Reuse

#### `client/src/App.tsx`

**Status**: COMPLETED

```typescript
function buildAiSessionScreenHash(
  projectSlug: string | null,
  sessionId: QraftAiSessionId,
): string;
```

**Checklist**:

- [x] Remove hand-built `ai_session_id` hash assembly from the app shell
- [x] Reuse the ai-session feature's canonical route-search builder for deep links
- [x] Keep files-to-session navigation behavior unchanged while reducing route hardcoding

## Completion Criteria

- [x] Selected-session popup header and footer use the same resolved model label
- [x] Unknown selected-session model metadata no longer claims a server-default profile in the popup
- [x] Files-to-session deep links reuse the canonical ai-session route-search helper
- [x] Tests and typechecks pass after the follow-up cleanup

## Progress Log

### Session: 2026-03-12 21:10 JST

**Tasks Completed**: Continuation review, design/plan bookkeeping, selected-session model-label consistency fix, ai-session route-helper cleanup, regression tests
**Tasks In Progress**: None
**Blockers**: None
**Notes**: This was a follow-up to the March 12 field-wise model fallback work. The footer label had been corrected, but the popup header still used overview-only model data, and the files screen still hand-assembled ai-session query state instead of using the existing helper surface.
