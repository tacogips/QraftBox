# AI Session Restart Flow Regression Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#proposed-architecture
**Created**: 2026-03-12
**Last Updated**: 2026-03-12

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Review of the March 11-12 Solid `ai-session` follow-up found a regression against both the migration design and the Svelte baseline: the feature still carried `forceNewSession` submit plumbing, but the composer no longer exposed any selected-session restart/session-fork action and no longer disabled empty prompt submissions.

### Scope

**Included**:

- Restore a selected-session restart-from-beginning composer action in the Solid popup
- Split composer busy-state handling from prompt-content validation so default prompt actions stay available while empty manual submissions remain disabled
- Add focused regression coverage for the shared busy/submit gating helpers
- Record the regression fix in design and implementation tracking

**Excluded**:

- Broader AI-session popup redesign
- Image attachment parity work
- New backend APIs

## Modules

### 1. Composer Submit-State Cleanup

#### `client/src/features/ai-session/state.ts`

#### `client/src/features/ai-session/state.test.ts`

**Status**: COMPLETED

```typescript
function isAiSessionComposerBusy(params: {
  readonly submitting: boolean;
  readonly modelProfilesLoading: boolean;
  readonly runningDefaultPromptAction: AiSessionDefaultPromptAction | null;
}): boolean;

function canSubmitAiSessionComposerPrompt(params: {
  readonly promptInput: string;
  readonly submitting: boolean;
  readonly modelProfilesLoading: boolean;
  readonly runningDefaultPromptAction: AiSessionDefaultPromptAction | null;
}): boolean;
```

**Checklist**:

- [x] Separate composer busy-state from prompt-content validation
- [x] Keep default prompt actions enabled when the composer is idle
- [x] Add regression coverage for empty-prompt gating

### 2. Restart Flow UI Restoration

#### `client/src/features/ai-session/AiSessionScreen.tsx`

**Status**: COMPLETED

```typescript
async function restartSelectedSessionFromBeginning(): Promise<void>;
```

**Checklist**:

- [x] Restore the selected-session restart action to the Solid composer
- [x] Reuse the existing feature-owned `forceNewSession` submit path
- [x] Disable manual submit buttons when the prompt is empty, matching the Svelte baseline

## Completion Criteria

- [x] Existing selected sessions once again expose a restart-from-beginning prompt action
- [x] Empty prompt text no longer leaves Queue/Run/Restart buttons enabled
- [x] Default prompt actions remain available when the composer is idle
- [x] Tests, typecheck, and browser verification pass after the regression fix

## Progress Log

### Session: 2026-03-12 15:35 JST

**Tasks Completed**: Continuation review, regression confirmation against design/Svelte baseline, composer submit-state cleanup, restart-flow restoration, regression tests, design/plan updates
**Tasks In Progress**: None
**Blockers**: None
**Notes**: The regression likely came from later popup simplification work: the `forceNewSession` request path survived in the feature state, but the corresponding composer action and empty-prompt disabled state were dropped from the rendered controls.
