# Architecture

This document describes the current as-built architecture of QraftBox based on the repository state as of 2026-03-09.

## Overview

QraftBox is a local-first diff viewer and git operations tool. It runs a Bun-based HTTP server with WebSocket support, serves a selectable frontend bundle (Solid by default, legacy Svelte on explicit request), and executes git/AI/terminal operations on the local machine. The system is intentionally single-user and assumes localhost-only access.

## Runtime Topology

- CLI entrypoint: `src/main.ts` -> `src/cli/index.ts`
- HTTP server: Hono app in `src/server/index.ts`
- WebSocket endpoints:
  - `ws://<host>:<port>/ws` for realtime events
  - `ws://<host>:<port>/ws/terminal/<sessionId>` for terminal sessions
- Frontend bundle: built from `client/` or `client-legacy/` and selected at startup via `QRAFTBOX_FRONTEND` / `--frontend`

## Server Architecture

### Core Server

- Hono app created by `createServer` with error handling and request logging.
- Static middleware serves client assets; SPA fallback handles client routing.
- Context-scoped routes are mounted under `/api/ctx/:contextId/*` via `contextMiddleware`.

### Workspace & Contexts

- `ContextManager` creates and manages workspace contexts (tabs) and validates directories.
- Recent directories are persisted via SQLite in `~/.local/QraftBox/recent.db`.
- Open tabs state is persisted via SQLite in `~/.local/QraftBox/open-tabs.db`.

### Git Operations

- Diff, file tree, status, branch, worktree, commit log, push, staged file operations live in `src/server/git/`.
- Comment system uses git notes via `src/server/comments/` (git-xnotes style).
- Binary/large-file detection is handled in `src/server/git/binary.ts` and reflected in file APIs.

### AI & Prompting

- AI sessions are orchestrated by `SessionManager` (`src/server/ai/`).
- Session metadata is persisted in SQLite (`~/.local/QraftBox/ai-sessions.db`).
- Session mappings (qraft_ai_session_id <-> claude_session_id) are persisted in SQLite (`~/.local/QraftBox/session-mappings.db`).
- Prompt queue is persisted in JSON files under `~/.local/QraftBox/prompts/`.
- AI execution runs through local AI CLIs via `AgentRunner` (Claude Code and Codex are actively integrated).

### Tools System

- Tool registry (`src/server/tools/registry.ts`) aggregates built-in and plugin tools.
- Built-in tools live under `src/server/tools/builtin/`.
- Plugin tools are loaded from JSON definitions in `~/.config/qraftbox/tools/`.

### Terminal

- Terminal sessions are managed by `TerminalSessionManager` (`src/server/terminal/`).
- Each session spawns a local shell (`$SHELL` or `bash`) and streams output over WebSocket.

### File Watching & Realtime

- Project file watching is managed by `ProjectWatcherManager`.
- Gitignore-aware watcher and debounced broadcast send events over WebSocket.

### Model Config

- Model profiles and operation bindings are stored in SQLite (`~/.local/QraftBox/model-config.db`).

## Client Architecture

- Primary frontend: Solid SPA built with Vite in `client/`.
- Legacy frontend: Svelte 5 SPA preserved in `client-legacy/` and served only when `QRAFTBOX_FRONTEND=svelte` or `--frontend svelte` is selected.
- Shared frontend contracts: framework-neutral routing, API clients, DTO normalization, realtime helpers, and parity fixtures in `client-shared/`.
- The primary app entrypoint is `client/src/main.tsx` and `client/src/App.tsx`.
- Primary feature modules live under `client/src/features/` and `client/src/app/`.
- Legacy Svelte feature code remains under `client-legacy/src/` and `client-legacy/components/`.
- Screens currently wired in the primary Solid client include project/workspace, files/diff, AI sessions, commits, terminal, system info, notifications, model profiles, and action defaults.

## Frontend Selection And Legacy Support

The Solid cutover has already happened on this branch. The current coexistence model is:

- `client/` is the primary Solid implementation and the default served frontend.
- `client-legacy/` preserves the older Svelte implementation for explicit fallback, comparison, and staged retirement.
- `client-shared/` remains the framework-neutral contract layer used by both frontends.
- `src/config/frontend.ts` is the single place that maps `solid` and `svelte` to build directories and environment overrides.

Current post-cutover rules:

- CLI/runtime frontend selection is now modeled explicitly as `svelte | solid`, with `--frontend` overriding `QRAFTBOX_FRONTEND`.
- Default startup serves the Solid bundle from `dist/client/`.
- Explicit legacy startup serves the Svelte bundle from `dist/client-legacy/`.
- Frontend asset resolution is centralized in `src/config/frontend.ts`, and startup fails fast when the selected bundle is missing `index.html`.
- Route-level frontend status reporting must use the same default (`solid`) whenever no explicit `selectedFrontend` value is injected, so `/api/frontend-status` cannot drift from the actual post-cutover runtime default in partial test or embedding setups.
- Shared routing, API clients, DTO normalization, parity fixtures, and browser-verification helpers continue to live in `client-shared/`.
- The support-status reporting surface in `client/src/app/screen-registry.ts` and `/api/frontend-status` tracks post-cutover legacy-retirement readiness rather than a pre-cutover go/no-go switch.
- Repo-only support checks such as nested client dependencies and recorded migration/browser markers apply only when the server is running from a source checkout; packaged runtimes still report bundle-serving status but must not invent impossible workspace blockers.
- The client code must model those two runtime baselines explicitly: a packaged-runtime baseline for pre-fetch/bootstrap behavior and a source-checkout baseline for repo-validation/reporting helpers. Leaving them as ambiguous "default" objects is a design smell because it hides which rule-set a caller is opting into.
- The Solid client bootstrap must also default to packaged-safe support status until `/api/frontend-status` loads, so a failed runtime-status refresh cannot reintroduce impossible repo-only blockers in packaged installs.
- That bootstrap fallback must treat `hasBuiltSolidBundle` as `true`, because the currently running Solid client could not have loaded without a built bundle; otherwise a failed runtime-status fetch would falsely report the active bundle as missing.
- Source-checkout detection for those repo-only checks must verify the QraftBox repo layout specifically (root `package.json` name `qraftbox` plus `client/package.json` name `qraftbox-client`), not merely the presence of an arbitrary `client/` directory in the current working directory.
- Source-checkout detection and all repo-only support facts must be resolved from the actual running QraftBox checkout first, using runtime-relative paths with `process.cwd()` only as a fallback.
- Runtime-relative source-root detection must walk ancestor directories from those candidate paths instead of assuming the candidate already is the repo root; otherwise bundled or nested runtime paths can still misreport a real source checkout as packaged.
- Repo-only browser and migration markers must also be ignored by screen-level blocker clearing outside a source checkout, so packaged runtimes cannot inherit stale repo-marker state from an arbitrary working directory.
- `agent-browser` availability is only a prerequisite for recording browser verification. Once the current workspace already has a recorded browser-verification marker, the runtime support surface must treat that recorded fact as authoritative instead of re-blocking on the missing tool.
- The offline migration verification command must include the Solid bootstrap fallback regression tests, otherwise packaged-safe support defaults can drift without failing the intended support baseline.
- The recorded browser-verification marker currently covers the shared `project` and `files` smoke loop only; other screen-level parity blockers remain explicit until their own verification work lands.
- Release artifacts and npm packages must include both frontend bundles while legacy support remains a documented runtime option.

Design details are tracked in `design-docs/specs/design-solid-frontend-migration.md`.

## API Surface (Summary)

Non-context routes (no workspace context required):

- `GET /api/health`
- `GET /api/workspace` (tabs, active context, recent projects)
- `GET /api/browse` (directory listing)
- `POST/GET/PUT /api/ai/*` (AI submit, queue, sessions, hidden state, cancel/stream)
- `GET/POST/PATCH/DELETE /api/prompts/*` (local prompt CRUD + dispatch/summarize)
- `GET /api/tools` (tool registry)
- `POST /api/git-actions` (git action prompts)
- `GET/POST/PATCH /api/model-config`
- `GET /api/system-info`

Context routes (require `contextId`):

- `GET /api/ctx/:contextId/diff`
- `GET /api/ctx/:contextId/files`
- `GET /api/ctx/:contextId/status`
- `GET /api/ctx/:contextId/commits`
- `GET /api/ctx/:contextId/search`
- `POST /api/ctx/:contextId/commit`
- `POST /api/ctx/:contextId/push`
- `GET /api/ctx/:contextId/worktree`
- `GET /api/ctx/:contextId/branches`
- `GET /api/ctx/:contextId/claude-sessions`
- `GET /api/ctx/:contextId/prompts`
- `POST /api/ctx/:contextId/terminal/connect`
- `GET /api/ctx/:contextId/terminal/status`
- `POST /api/ctx/:contextId/terminal/disconnect`

## Realtime & Events

- WebSocket `/ws` broadcasts file watcher events and AI queue/session updates.
- WebSocket `/ws/terminal/:sessionId` streams terminal input/output.

## Build & Runtime

- Runtime: Bun + Hono.
- Frontends:
  - Solid + Vite in `client/`
  - Svelte 5 + Tailwind + Vite in `client-legacy/`
- Server build output: `dist/` from `bun build src/main.ts`.
- Frontend build outputs:
  - `dist/client/` for Solid, overridable via `QRAFTBOX_CLIENT_DIR`
  - `dist/client-legacy/` for Svelte, overridable via `QRAFTBOX_CLIENT_LEGACY_DIR`
- Startup now fails fast when the selected frontend bundle is missing `index.html`.

### Dual-Frontend Build Direction

The build/runtime model now supports separate Solid and legacy Svelte frontend bundles while preserving one backend/runtime. Solid is the default served frontend, but the legacy Svelte bundle remains intentionally shippable until fallback support is retired.

## Security Model

- No authentication is implemented.
- Intended for localhost-only use; network exposure is unsafe.

## Known Limitations (As-Built)

- GitHub and PR routes are implemented but not currently mounted in `mountAllRoutes` (context routes are stubbed).
- Comment routes exist in `src/server/routes/comments.ts` but are not mounted in the active route registry.
