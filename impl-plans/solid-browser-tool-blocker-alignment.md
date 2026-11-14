# Solid Browser Tool Blocker Alignment Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#frontend-selection-and-legacy-support
**Created**: 2026-03-09
**Last Updated**: 2026-03-09

## Design Document Reference

**Source**: `design-docs/specs/architecture.md`

### Summary

Align the post-cutover support-status blocker model so a recorded browser-verification fact remains authoritative. `agent-browser` is required to record the workspace baseline, but it should not continue blocking the runtime support surface after that verification has already been recorded.

### Scope

**Included**:

- Support-registry blocker logic for the `agent-browser` prerequisite
- Regression coverage for recorded-browser-verification precedence
- Design/architecture note updates for the recorded-fact rule

**Excluded**:

- New browser-verification coverage for additional screens
- Changes to the marker schema or verification command
- Legacy frontend retirement

## Modules

### 1. Browser Tool Blocker Rule

#### `client/src/app/screen-registry.ts`

**Status**: COMPLETED

```typescript
interface SolidSupportStatus {
  readonly hasAgentBrowser: boolean;
  readonly hasRecordedBrowserVerification: boolean;
}
```

**Checklist**:

- [x] Keep `agent-browser` as a blocker only while browser verification is still unrecorded
- [x] Preserve the explicit browser-verification-recorded criterion semantics
- [x] Add regression coverage for the recorded-marker precedence

## Completion Criteria

- [x] Runtime support blockers no longer re-block on missing `agent-browser` after browser verification is recorded
- [x] Tests cover the recorded-marker precedence rule
- [x] Design docs describe the recorded-fact behavior

## Progress Log

### Session: 2026-03-09 23:59
**Tasks Completed**: Review finding triage, blocker-rule fix, regression test, design and architecture note updates, plan registration
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Review found the support surface still treated `agent-browser` as a permanent blocker in source checkouts even after browser verification had already been recorded. That made tool availability override the explicit recorded verification fact, which contradicted the intended truth-source model for post-cutover support status.

## Related Plans

- **Previous**: `solid-browser-verification-scope-alignment.md`
- **Next**: None
- **Depends On**: `solid-support-truth-source-alignment.md`
