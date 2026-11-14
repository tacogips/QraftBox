# Files Route Hash Cleanliness And AI Session Model Fallback Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#proposed-architecture
**Created**: 2026-03-12
**Last Updated**: 2026-03-12

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Review of the March 11-12 Solid migration follow-up found two remaining mismatches with the intended UX and the Svelte baseline:

- The shared files route hash was serializing default `view` and `tree` values even when they did not add state, making every files link noisier than the legacy route model.
- The Solid `ai-session` popup resolved selected-session model metadata from the overview entry as an all-or-nothing object, so detail-loaded model metadata could be dropped when the card-level summary omitted it.

### Scope

**Included**:

- Shared navigation-contract cleanup for files-only, non-default hash serialization
- Sanitization of meaningless `line`-without-`path` hash state
- Field-wise fallback for selected-session model metadata in the Solid `ai-session` popup
- Regression tests plus design/plan bookkeeping

**Excluded**:

- Server-side routing changes
- Additional AI-session layout redesign
- Broad hash-schema changes beyond files-route cleanup

## Modules

### 1. Files Route Hash Cleanup

#### `client-shared/src/contracts/navigation.ts`

#### `client-shared/src/contracts/navigation.test.ts`

#### `client/src/app/navigation.test.ts`

**Status**: COMPLETED

```typescript
function buildScreenHash(
  projectSlug: string | null,
  screen: AppScreen,
  routeState?: Partial<
    Pick<
      ScreenRouteState,
      | "selectedPath"
      | "selectedViewMode"
      | "fileTreeMode"
      | "selectedLineNumber"
    >
  >,
): string;
```

**Checklist**:

- [x] Stop serializing default files-route state into every files hash
- [x] Keep non-default files-route state serializable for real state restoration
- [x] Drop meaningless `line` query state when no file path is selected
- [x] Update navigation expectations to match the cleaner hash output

### 2. Selected Session Model Fallback

#### `client/src/features/ai-session/state.ts`

#### `client/src/features/ai-session/state.test.ts`

#### `client/src/features/ai-session/AiSessionScreen.tsx`

**Status**: COMPLETED

```typescript
interface AiSessionModelState {
  readonly modelProfileId?: string | undefined;
  readonly modelVendor?: string | undefined;
  readonly modelName?: string | undefined;
}

function resolveAiSessionSelectedModelState(params: {
  readonly overviewModelState: AiSessionModelState | null;
  readonly detailModelState: AiSessionModelState | null;
}): AiSessionModelState;
```

**Checklist**:

- [x] Resolve selected-session model metadata field-by-field instead of entry-by-entry
- [x] Preserve the Svelte baseline's overview-then-detail fallback semantics
- [x] Keep selected-session prompt submission aligned with the resolved model profile
- [x] Add focused regression coverage for the fallback helper

## Completion Criteria

- [x] Files hashes stay clean when only default files state is active
- [x] Non-default files state remains restorable through the hash
- [x] Selected-session model labels and prompt submissions can use detail metadata when overview data is missing
- [x] Design and implementation records match the corrected architecture

## Progress Log

### Session: 2026-03-12 19:45 JST

**Tasks Completed**: Review of current diff, hash-serialization cleanup, selected-session model fallback fix, regression tests, design/plan updates
**Tasks In Progress**: None
**Blockers**: None
**Notes**: This iteration focused on residual cleanup after the larger March 11-12 parity work. The architecture direction was correct, but the implementation still leaked default files-route state into URLs and still had a Solid-specific model-metadata fallback regression relative to the Svelte overview popup.
