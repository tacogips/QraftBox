# Implementation Plans

This directory contains implementation plans that describe the current as-built system and any future work.

## Current Plan

| Plan | Status | Design Reference | Last Updated |
| --- | --- | --- | --- |
| current-system | Completed | design-docs/specs/architecture.md#overview | 2026-02-17 |

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

## Legacy Plans

The `active/` and `completed/` directories contain legacy plans that have been superseded by `current-system.md`. These files are retained only for historical reference and should not be used for new work.
