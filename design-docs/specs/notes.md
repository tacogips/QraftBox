# Notes

This file captures as-built constraints, operational considerations, and known gaps.

## Local-Only Security Model

- The server has no authentication or authorization.
- Intended for localhost-only usage; exposing the port publicly is unsafe.

## Persistence Locations

- `~/.local/QraftBox/recent.db` (recent directories, SQLite)
- `~/.local/QraftBox/open-tabs.db` (open tabs, SQLite)
- `~/.local/QraftBox/ai-sessions.db` (AI sessions, SQLite)
- `~/.local/QraftBox/session-mappings.db` (AI session mapping, SQLite)
- `~/.local/QraftBox/model-config.db` (model profiles/bindings, SQLite)
- `~/.local/QraftBox/prompts/` (prompt queue, JSON files)
- `~/.config/qraftbox/tools/` (plugin tools, JSON definitions)

## Terminal Behavior

- Terminal sessions spawn a local interactive shell (`$SHELL` or `bash`).
- Output is buffered when the WebSocket is disconnected and flushed on reconnect.

## AI Integration

- AI execution is delegated by `AgentRunner` to local AI CLIs (Claude/Codex).
- Prompt queue and session mapping are persisted to allow recovery after restarts.

## Known Gaps (As-Built)

- GitHub/PR routes are implemented but not mounted in `mountAllRoutes`. The context routes currently use stub Hono apps.
- Comment routes are implemented in `src/server/routes/comments.ts` but are not mounted in the active API registry.
- The CLI uses `-h` for host, so help is only available as `--help`.

## Document Coverage Notes

- Terminal API includes `/connect`, `/status`, and `/disconnect` under `/api/ctx/:contextId/terminal`.

## Testing/Dev Overrides

- `QRAFTBOX_TEST_CONFIG_DIR` and `QRAFTBOX_TEST_TOOLS_DIR` are used in tests to isolate filesystem state.

## Frontend Cutover Notes

- Solid is now the default frontend served from `client/`.
- The legacy Svelte frontend remains supported from `client-legacy/` when `QRAFTBOX_FRONTEND=svelte` or `--frontend svelte` is used.
- Migration validation should still compare both frontends against the same backend and repository state while legacy fallback remains supported.
- Shared frontend logic should continue to live in framework-neutral TypeScript modules under `client-shared/`.
- Hash-driven navigation parity remains part of the shared contract; both frontends must react to later `hashchange` events, not just the initial URL.
- Browser verification should still be run for both frontends after significant UI changes while legacy comparison remains part of the support model.
- The recorded browser-verification marker currently proves only the shared `project` and `files` smoke loop; screen-specific parity blockers for other routes must stay open until separately verified.
- The recorded full migration check status is stored in the ignored workspace-local marker `tmp-solid-migration-check.json`, which is cleared before each `bun run check:frontend:migration` run and rewritten only after the full command succeeds.
- Packaged binaries and npm installs do not have the source-checkout markers or nested frontend dependencies needed for repo verification, so the runtime support panel must treat those checks as not applicable there rather than as hard failures.
- The client currently needs two explicit support-status baselines to preserve that rule cleanly: one for packaged-runtime bootstrap behavior and one for source-checkout-oriented report helpers and tests.
- The initial Solid bootstrap state must follow the same packaged-safe rule, so a failed `/api/frontend-status` request does not temporarily or permanently fall back to impossible repo-only blockers.
- The bootstrap fallback must also assume the active Solid bundle already exists, because the UI is executing from that bundle; `hasBuiltSolidBundle: false` is not a truthful fallback state once the app has loaded.
- Runtime source-root discovery must walk ancestor directories from runtime-derived paths before falling back to `process.cwd()`, because source runs and bundled outputs can execute from nested directories below the repo root.
- `bun run test:frontend:migration` is part of the support baseline and must include both bootstrap-state and support-status baseline regression coverage, not just route and shared-contract tests.
