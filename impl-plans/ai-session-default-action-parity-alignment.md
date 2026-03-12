# AI Session Default Action Parity Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-solid-frontend-migration.md#proposed-architecture
**Created**: 2026-03-12
**Last Updated**: 2026-03-12

## Design Document Reference

**Source**: `design-docs/specs/design-solid-frontend-migration.md`

### Summary

Restore the Solid `ai-session` popup's selected-session default actions so they match the Svelte baseline and the migration design. Refresh-purpose and resume-session actions must use Action Defaults prompt content rather than a Solid-only purpose-refresh shortcut.

### Scope

**Included**:

- Feature-owned helper support for wrapped default session-action prompts
- Solid `AiSessionScreen` wiring for refresh-purpose and resume-session actions
- Regression tests for the default prompt wrapper behavior
- Design and implementation-plan bookkeeping for the restored parity

**Excluded**:

- New server APIs
- Broad popup layout redesign
- Additional AI-session parity work outside the selected-session default actions

## Modules

### 1. Default Prompt Helper Surface

#### `client/src/features/ai-session/state.ts`

**Status**: COMPLETED

```typescript
type AiSessionDefaultPromptAction =
  | "ai-session-purpose"
  | "ai-session-refresh-purpose"
  | "ai-session-resume";

function createAiSessionDefaultPromptMessage(
  action: AiSessionDefaultPromptAction,
  promptContent: string,
): string;
```

**Checklist**:

- [x] Restore a feature-owned helper for wrapping Action Defaults prompt content
- [x] Keep the helper aligned with the existing internal prompt marker format
- [x] Cover the helper with focused unit tests

### 2. Selected-Session Prompt Actions

#### `client/src/features/ai-session/AiSessionScreen.tsx`

**Status**: COMPLETED

```typescript
interface AiSessionDefaultActionState {
  readonly runningDefaultPromptAction:
    | "ai-session-refresh-purpose"
    | "ai-session-resume"
    | null;
}
```

**Checklist**:

- [x] Replace the direct purpose-refresh shortcut with Action Defaults prompt submission
- [x] Restore the missing resume-session action in the selected-session popup
- [x] Keep request-guard handling aligned with prompt submission so loading state clears correctly

## Completion Criteria

- [x] The Solid selected-session popup exposes both refresh-purpose and resume-session actions
- [x] Those actions submit wrapped Action Defaults prompt content to the selected session
- [x] No Solid-only direct-purpose shortcut remains wired to the popup toolbar
- [x] Tests cover the restored helper surface

## Progress Log

### Session: 2026-03-12 17:10

**Tasks Completed**: Design gap review, implementation plan creation, default-action helper restoration, Solid popup parity fix, regression tests
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review of the March 11-12 work found a continuation regression: the Solid popup had drifted from the migration design and Svelte baseline by replacing Action Defaults prompt actions with a direct purpose-refresh fetch and by dropping the resume-session action entirely.
