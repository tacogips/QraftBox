# Codex Agent Browser E2E Test Plan

**Status**: Completed  
**Implementation Reference**: `src/server/routes/ai.ts`, `src/server/ai/session-manager.ts`, `src/server/routes/system-info.ts`, `client/components/system-info/SystemInfoScreen.svelte`  
**Source Files**: `src/server/ai/*.ts`, `src/server/routes/*.ts`, `client/src/lib/*.ts`, `client/components/**/*.svelte`  
**Test Type**: E2E  
**Created**: 2026-02-22  
**Last Updated**: 2026-02-22

## Implementation Reference

This plan validates that QraftBox can execute prompts with Codex-compatible routing and that Codex is visible in system UI/telemetry alongside Claude.

Out of scope:
- Deep Codex CLI model quality validation
- Third-party API availability benchmarking

## Test Environment

**Runtime**: Browser automation (`agent-browser`) + API checks (`curl`) + Playwright smoke where needed  
**Mocks Required**: None for live local browser checks  
**Fixtures**: Local repo in current workspace  
**Setup/Teardown**: Start local server, close browser daemon, stop server process after run

## Test Cases

### TEST-001: System Info shows Codex and Claude tool versions

**Status**: Passing  
**Priority**: Critical  
**Parallelizable**: Yes  
**Dependencies**: None

**Target**: `src/server/routes/system-info.ts:createSystemInfoRoutes`

**Description**: Ensure `/api/system-info` and System Info screen both include Codex version and Claude version.

**Scenarios**:
1. Happy path: both versions are present when both CLIs are installed
2. Edge case: one CLI missing but schema remains stable
3. Error case: endpoint returns structured error fields

**Assertions**:
- [x] API includes `codexCode` object with `version/error`
- [x] UI displays a Codex section
- [x] Claude section remains present

**Test Code Location**: `src/server/routes/system-info.test.ts`

### TEST-002: AI submit route resolves agent from model vendor

**Status**: Passing  
**Priority**: Critical  
**Parallelizable**: No  
**Dependencies**: TEST-001

**Target**: `src/server/routes/ai.ts:POST /submit`

**Description**: Ensure AI submission no longer hardcodes Claude and derives Codex for OpenAI vendor profiles.

**Scenarios**:
1. Happy path: explicit `ai_agent` is respected
2. Edge case: missing `ai_agent` resolves from `model_vendor`
3. Error case: invalid payload still rejected cleanly

**Assertions**:
- [x] `ai_agent` is not hardcoded to Claude in route logic
- [x] fallback resolves with `resolveAIAgentFromVendor`
- [x] existing input validation remains passing

**Test Code Location**: `src/server/routes/ai.test.ts`

### TEST-003: Session store/runtime preserve Codex attribution

**Status**: Passing  
**Priority**: High  
**Parallelizable**: No  
**Dependencies**: TEST-002

**Target**: `src/server/ai/session-manager.ts`, `src/server/ai/ai-session-store.ts`

**Description**: Verify queued/running/completed session metadata maintains correct agent identity and avoids Claude default-only behavior.

**Scenarios**:
1. Happy path: OpenAI vendor sessions map to Codex
2. Edge case: legacy rows with missing agent still infer from vendor
3. Error case: malformed model arguments do not break mapping

**Assertions**:
- [x] queue info derivation no longer assumes Claude-only
- [x] runner invocation resolves agent from model/vendor
- [x] session-manager tests pass after changes

**Test Code Location**: `src/server/ai/session-manager.test.ts`

### TEST-004: Browser navigation and session screen stability after Codex support

**Status**: Passing  
**Priority**: Medium  
**Parallelizable**: Yes  
**Dependencies**: TEST-001

**Target**: `client/components/system-info/SystemInfoScreen.svelte`, `client/components/session/SessionCard.svelte`

**Description**: Ensure UI remains stable and renders expected labels after codex-related updates.

**Scenarios**:
1. Happy path: navigate to System Info and see Codex card
2. Edge case: menu navigation path works from main app screen
3. Error case: no browser crashes/closed-target errors in steady flow

**Assertions**:
- [x] System Info page shows `Codex` label
- [x] Session screens still load
- [x] Screenshot captured for evidence

**Test Code Location**: Browser-run (manual via `agent-browser`)

### TEST-005: codex-agent package compatibility smoke

**Status**: Passing  
**Priority**: High  
**Parallelizable**: Yes  
**Dependencies**: None

**Target**: `package.json:codex-agent` dependency + package runtime surface

**Description**: Verify whether codex-agent exposes the SDK/API surface needed by QraftBox runtime integration.

**Scenarios**:
1. Happy path: expected APIs import and run
2. Edge case: package installs but API surface is incomplete
3. Error case: missing entrypoints break runtime assumptions

**Assertions**:
- [x] package entrypoint behavior documented
- [x] required API surface availability checked
- [x] issue filed for confirmed bug: `https://github.com/tacogips/codex-agent/issues/1`

**Test Code Location**: shell smoke checks + GitHub issue (if required)

## Test Status

| Test ID | Name | Status | Priority | Dependencies |
|---------|------|--------|----------|--------------|
| TEST-001 | System Info Codex/Claude visibility | Passing | Critical | None |
| TEST-002 | AI submit routing by vendor | Passing | Critical | TEST-001 |
| TEST-003 | Session metadata attribution | Passing | High | TEST-002 |
| TEST-004 | Browser navigation stability | Passing | Medium | TEST-001 |
| TEST-005 | codex-agent compatibility smoke | Passing | High | None |

## Coverage Targets

| Module | Current | Target | Status |
|--------|---------|--------|--------|
| `src/server/routes/system-info.ts` | Verified | 90%+ behavior | In Progress |
| `src/server/routes/ai.ts` | Verified | 90%+ behavior | In Progress |
| `src/server/ai/session-manager.ts` | Verified | Critical flow covered | In Progress |
| `src/server/ai/ai-session-store.ts` | Verified | Critical flow covered | In Progress |
| `client/components/system-info/SystemInfoScreen.svelte` | Verified | Render path covered | In Progress |

## Completion Criteria

- [x] Browser test cases executed for updated UI
- [x] API/typecheck/unit test checks passed for modified modules
- [x] codex-agent compatibility smoke completed
- [x] If bug confirmed, issue created in `tacogips/codex-agent`
- [x] Progress updated to Completed

## Progress Log

### Session: 2026-02-22 23:13
**Tests Completed**: TEST-001, TEST-002, TEST-003, TEST-004  
**Tests In Progress**: None  
**Blockers**: None  
**Notes**: Browser verification confirmed Codex section appears in System Info and backend API returns `codexCode`. Next step is codex-agent package compatibility smoke and issue creation if bug is confirmed.

### Session: 2026-02-22 23:17
**Tests Completed**: TEST-005  
**Tests In Progress**: None  
**Blockers**: None  
**Notes**: Reproduced packaging/import failure for `codex-agent` Git dependency (`dist/` missing while exports point to dist files). Created issue: `https://github.com/tacogips/codex-agent/issues/1`.
