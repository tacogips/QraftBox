# Implementation Plans

This directory contains implementation plans that describe the current as-built system and any future work.

## Current Plan

| Plan                     | Status      | Design Reference                                              | Last Updated |
| ------------------------ | ----------- | ------------------------------------------------------------- | ------------ |
| current-system           | Completed   | design-docs/specs/architecture.md#overview                    | 2026-02-17   |
| solid-frontend-migration | Archived    | design-docs/specs/design-solid-frontend-migration.md#overview | 2026-03-09   |
| solid-cutover-alignment  | Completed   | design-docs/specs/design-solid-frontend-migration.md#overview | 2026-03-09   |
| solid-migration-history-alignment | Completed | design-docs/specs/design-solid-frontend-migration.md#overview | 2026-03-09   |
| solid-support-status-alignment | Completed | design-docs/specs/design-solid-frontend-migration.md#overview | 2026-03-09   |
| solid-browser-verification-scope-alignment | Completed | design-docs/specs/design-solid-frontend-migration.md#overview | 2026-03-09   |
| solid-release-verification-alignment | Completed | design-docs/specs/design-solid-frontend-migration.md#overview | 2026-03-09   |
| solid-post-cutover-design-alignment | Completed | design-docs/specs/design-solid-frontend-migration.md#overview | 2026-03-09   |
| solid-frontend-status-default-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |
| solid-support-language-alignment | Completed | design-docs/specs/design-solid-frontend-migration.md#overview | 2026-03-09   |
| solid-support-truth-source-alignment | Completed | design-docs/specs/design-solid-frontend-migration.md#progressive-screen-porting | 2026-03-09   |
| solid-support-runtime-scope-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |
| solid-browser-marker-source-scope-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |
| solid-source-checkout-detection-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |
| solid-bootstrap-support-fallback-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |
| solid-bootstrap-bundle-truthfulness-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |
| solid-source-root-runtime-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |
| solid-runtime-root-ancestor-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |
| solid-browser-tool-blocker-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |
| solid-support-baseline-alignment | Completed | design-docs/specs/architecture.md#frontend-selection-and-legacy-support | 2026-03-09   |

## Directory Structure

```
impl-plans/
├── README.md              # This file
├── PROGRESS.json          # Task status index (source of truth)
├── current-system.md      # As-built implementation plan
├── templates/             # Plan templates
│   └── plan-template.md
├── active/                # Legacy plans (deprecated)
└── completed/             # Legacy plans (deprecated)
```

## PROGRESS.json

`PROGRESS.json` is the single source of truth for plan/task status. It is updated whenever plan status changes.

## Historical Plans

The `active/` and `completed/` directories contain legacy plans that have been superseded by `current-system.md`. Root-level plans may also be historical records when the table above marks them `Archived`.

`solid-frontend-migration.md` is now an archival migration record. Use `solid-cutover-alignment.md`, `solid-migration-history-alignment.md`, `solid-support-status-alignment.md`, `solid-browser-verification-scope-alignment.md`, `solid-release-verification-alignment.md`, `solid-post-cutover-design-alignment.md`, `solid-frontend-status-default-alignment.md`, `solid-support-language-alignment.md`, `solid-support-truth-source-alignment.md`, `solid-support-runtime-scope-alignment.md`, `solid-browser-marker-source-scope-alignment.md`, `solid-source-checkout-detection-alignment.md`, `solid-bootstrap-support-fallback-alignment.md`, `solid-bootstrap-bundle-truthfulness-alignment.md`, `solid-source-root-runtime-alignment.md`, `solid-runtime-root-ancestor-alignment.md`, `solid-browser-tool-blocker-alignment.md`, `solid-support-baseline-alignment.md`, and the current design docs for post-cutover work.
