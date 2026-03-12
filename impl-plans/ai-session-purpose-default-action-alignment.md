# AI Session Purpose Default Action Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#proposed-architecture
**Created**: 2026-03-12
**Last Updated**: 2026-03-12

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Close the remaining Solid `ai-session` Action Defaults gap by wiring the configured `ai-session-purpose` prompt into the new-session draft popup. The draft-session flow should use the same feature-owned prompt-submission path as the selected-session refresh and resume actions.

### Scope

**Included**:

- Solid `AiSessionScreen` support for the draft-session purpose action
- Regression coverage for the feature-owned prompt wrapper after removing obsolete route-helper code
- Design and implementation bookkeeping for the restored draft-session parity

**Excluded**:

- New backend APIs
- Broader AI-session popup redesign
- Changes to selected-session action semantics already restored in phase 22

## Modules

### 1. Draft Default Action Wiring

#### `client/src/features/ai-session/AiSessionScreen.tsx`

**Status**: COMPLETED

```typescript
type AiSessionDefaultPromptAction =
  | "ai-session-purpose"
  | "ai-session-refresh-purpose"
  | "ai-session-resume";

function runDefaultPromptAction(
  action: AiSessionDefaultPromptAction,
): Promise<void>;
```

**Checklist**:

- [x] Show a draft-session button backed by `ai-session-purpose`
- [x] Reuse the existing feature-owned prompt-submission path
- [x] Keep loading/disabled state consistent across all default actions

### 2. Obsolete Helper Cleanup

#### `client/src/features/ai-session/state.ts`

**Status**: COMPLETED

```typescript
function buildAiSessionScreenHash(params: {
  readonly projectSlug: string | null;
  readonly overviewRouteState: AiSessionOverviewRouteState;
}): string;
```

**Checklist**:

- [x] Remove the superseded hash-query replacement helper
- [x] Keep state tests focused on the feature-owned full-hash builder and prompt wrapper

## Completion Criteria

- [x] New-session AI-session drafts expose a feature-owned purpose action
- [x] The action uses configured Action Defaults prompt content instead of handwritten text
- [x] Obsolete hash-query helper code is removed
- [x] Typecheck and targeted frontend migration tests pass

## Progress Log

### Session: 2026-03-12 15:35

**Tasks Completed**: Design gap confirmation, implementation plan creation, draft-session purpose action wiring, obsolete helper cleanup, verification
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review of the March 11-12 parity work found that the migration design already required Action Defaults ownership for `ai-session-purpose`, but the Solid popup still exposed only refresh/resume actions and carried a now-dead hash replacement helper from the earlier route-transition refactor.
