# Solid Frontend Migration Design

This document defines the Solid migration design and the post-cutover coexistence model for QraftBox. The migration is no longer hypothetical on this branch: Solid is now the primary frontend, and the legacy Svelte frontend remains available as an explicit fallback.

## Overview

QraftBox now serves the Solid frontend from `client/` by default and preserves the older Svelte frontend in `client-legacy/` for explicit fallback and parity comparison. Earlier iterations of this document described the pre-cutover layout using `client/` for Svelte and `client-solid/` for Solid; those references should now be read as historical migration notes rather than the current directory layout.

Implementation-plan guidance is split accordingly:

- `impl-plans/solid-frontend-migration.md` is the archived migration record.
- `impl-plans/solid-cutover-alignment.md` and later follow-up plans track post-cutover alignment work.

The immediate goal is not a one-shot rewrite. The goal is to create a controlled coexistence period where:

- Solid remains the production baseline.
- Legacy Svelte remains available for explicit validation, fallback, and retirement tracking.
- Shared behavior is verified by contract tests and browser-level comparison.
- The server can select which frontend bundle to serve for local validation.

## Goals

- Preserve a safe fallback path while Solid remains the default UI.
- Keep API semantics identical across both frontends.
- Introduce shared contracts for frontend state, DTOs, and behavior-oriented test fixtures.
- Make it easy to run browser verification for both frontends against the same repository state.
- Reduce framework-specific logic in data access and screen orchestration before feature-by-feature porting.

## Non-Goals

- Removing Svelte immediately.
- Building a framework-agnostic component library before migration starts.
- Changing server APIs unless a frontend contract gap is discovered.
- Achieving perfect visual parity in the first Solid milestone; functional parity is the first gate.

## Current Constraints

- The current default client is the Solid/Vite application in `client/`, while the fallback Svelte app now lives in `client-legacy/`.
- Server static asset serving must support both `dist/client` and `dist/client-legacy`.
- Existing browser-parity tracking is now exposed through the post-cutover `solidSupportStatus` contract, but the recorded workspace marker currently covers only the shared `project` and `files` smoke loop.
- UI changes require browser verification after code changes, so the migration path must support serving either frontend on demand.

## Proposed Architecture

### 1. Dual Frontend Layout

- Keep the primary Solid frontend in `client/`.
- Keep the legacy Svelte frontend in `client-legacy/`.
- Treat each frontend as its own Vite application with isolated dependencies and build output.
- Keep all server APIs, WebSocket endpoints, and persistence unchanged during the migration.

### 2. Shared Frontend Contract Layer

Introduce a framework-neutral contract layer for logic that should behave the same in both frontends.

Candidate shared areas:

- DTO and view-model definitions for API payloads.
- Screen identifiers and navigation state models.
- Workspace bootstrap snapshots and selection state derivation.
- Formatting helpers and diff transformation utilities.
- Mock payloads and behavior fixtures used by parity tests.

This layer should live outside framework-owned component trees, for example:

- `client-shared/src/contracts/*`
- `client-shared/src/fixtures/*`
- `client-shared/src/testing/*`

Exact directory naming can be finalized during implementation, but the principle is fixed: framework-neutral code must not depend on Svelte or Solid runtime APIs.

### 3. Frontend Selection Strategy

The server should support explicit frontend selection for development and verification.

Preferred mechanism:

- `QRAFTBOX_FRONTEND=svelte|solid`

Optional CLI follow-up if needed:

- `--frontend svelte|solid`

Selection precedence:

- `--frontend` overrides `QRAFTBOX_FRONTEND`
- `QRAFTBOX_FRONTEND` overrides the default
- Default is `solid`

Selection rules:

- Default to `solid`; require explicit selection for the legacy Svelte frontend.
- Resolve the selected frontend build directory before static asset middleware is mounted.
- Return a startup error if the selected frontend bundle is missing.

Current foundation status:

- Asset-root overrides are frontend-specific: `QRAFTBOX_CLIENT_DIR` for Solid and `QRAFTBOX_CLIENT_LEGACY_DIR` for legacy Svelte.
- The runtime now validates the selected frontend bundle before static middleware is mounted and fails fast when `index.html` is missing.
- Shared routing contracts now define canonical screen IDs, legacy hash normalization, and browser-hash parsing/building in a framework-neutral module under `client-shared/`.
- Shared workspace contracts now define the canonical workspace snapshot shape, metadata defaults, and shell-bootstrap state derivation in `client-shared/`.
- The legacy Svelte app now consumes shared routing through a compatibility adapter so coexistence work can continue without breaking existing `slug`-based callers during the transition.
- The legacy Svelte workspace API layer now normalizes `/api/workspace` responses through shared contracts instead of re-declaring DTOs locally.
- Shared workspace bootstrap fetching now also lives in `client-shared/`, so both frontends can consume the same `/api/workspace` and `/api/workspace/recent` normalization path.
- The shared workspace API layer now also supports a configurable API base URL, so the Solid bootstrap no longer advertises endpoint configuration that the runtime ignores.
- The Solid scaffold now renders a minimal live workspace shell from shared workspace state instead of staying purely static.
- Shared workspace mutations now also live in `client-shared/`, so both frontends can reuse the same open/activate/close/recent-project API contracts instead of re-encoding request/response handling per framework.
- The Solid workspace shell now exercises real tab activation, close, open-by-path, open-by-slug, and recent-project actions, making the coexistence architecture useful for iterative parity work rather than only bootstrap validation.
- The Solid workspace shell now also reconciles browser `hashchange` navigation against shared workspace route-planning rules, so back/forward and direct hash edits can activate or open the matching project slug instead of only honoring the initial load.
- Shared diff DTOs and API normalization now also live in `client-shared/`, establishing one contract for `GET /api/ctx/:contextId/diff` before the richer file viewer and realtime port begins.
- Shared file-tree and file-content contracts should also live in `client-shared/`, because the Solid `files` screen now needs an app-owned selection model that can cover both diff-backed files and non-diff files from the full repository tree without falling back to Svelte-only helpers.
- Shared file-change refresh rules now also live in `client-shared/src/realtime/`, so Svelte and Solid can debounce diff-affecting watcher updates from one contract without forcing both frontends through the same WebSocket shell.
- The Solid app now treats `project` and `files` as distinct migration surfaces, with `project` rendering the live workspace shell and `files` rendering a live diff/files browser backed by shared diff, tree, viewer, and realtime state.
- The Solid diff slice now remembers selected files per workspace context instead of reusing the previous workspace selection globally, preventing cross-repo path collisions from silently selecting the wrong file after tab switches.
- The Solid diff workflow now owns its async loading/reset/selection lifecycle inside `client/src/features/diff/`, instead of keeping request-state orchestration in `App.tsx`, so migration work can keep feature boundaries aligned with the intended architecture and regression-test stale state transitions directly.
- Shared current-state derivation now also lives in `client-shared/`, so the Solid diff workflow can reuse the same framework-neutral file-preview transform instead of recreating file-view logic inside the frontend shell.
- A minimal shared parity helper now exists for expected/forbidden text assertions so screen-level comparisons can accumulate against one contract surface before larger browser automation is added.
- Shared fixture-registry helpers now exist in `client-shared/` so browser verification can reference one scenario fixture catalog instead of duplicating API payload wiring per frontend.
- Shared workspace parity scenarios and fixture payloads now live in `client-shared/src/testing/workspace-parity.ts`, giving both frontends one concrete catalog for empty, populated, and restricted workspace states.
- The Solid workspace shell now derives its headings and status copy through a small presentation helper, so shared workspace scenarios can assert Solid-visible text without depending on a browser DOM harness for every regression.
- The Solid app shell now renders minimal shared screen navigation for `project` and `files`, preventing the default `#/files` entrypoint from trapping users away from the live workspace shell during migration.
- Shared diff parity scenarios and fixture payloads now also live in `client-shared/src/testing/diff-parity.ts`, covering loading, populated, empty, and server-error diff states through one framework-neutral scenario catalog.
- The Solid diff slice now short-circuits non-Git workspaces before the backend diff request layer, but it must still preserve the Svelte baseline of forcing the `files` screen into all-files browsing for non-Git tabs instead of treating the entire screen as unavailable.
- The Solid diff slice now carries view-mode state in its feature-owned controller and renders a minimal selected-file preview for inline, side-by-side, current-state, and binary-file fallback cases, pushing the migration beyond list-only parity without taking a dependency on the full Svelte component tree.
- The Solid diff slice now also subscribes to the shared file-change refresh rules through a Solid-owned realtime controller, so file watcher events can rehydrate the active diff screen without re-embedding the Svelte-specific refresh semantics.
- The Solid diff workflow now also mirrors the Svelte focus/visibility/poll git-state refresh behavior through a feature-owned controller, so external git metadata changes can refresh the active `files` screen even when file-watch events do not fire.
- The files-screen realtime refresh policy should remain feature-owned and must refresh all-files tree/file-preview state even when diff data is unavailable, so non-Git workspace parity does not silently depend on the diff endpoint.
- The Solid screen registry should treat implementation completeness separately from parity verification. A screen can be `implemented` while still carrying browser-verification blockers, otherwise the support-status model understates actual port progress and turns `implementationStatus` into a proxy for unrelated verification work.
- Shared commit-history API access now also lives in `client-shared/`, so the Solid `commits` screen can reuse one framework-neutral fetch/error contract for commit lists, commit detail, and per-commit diff payloads instead of issuing ad-hoc requests from the component layer.
- The Solid app shell now treats `commits` as a live migrated screen rather than a placeholder, while leaving an explicit browser-verification blocker in the screen registry until parity is checked against the Svelte baseline.
- Shared terminal session API access should also live in `client-shared/`, so the Solid `terminal` screen can reuse one framework-neutral connect/status/disconnect contract before any richer terminal rendering parity work is layered on top.
- The Solid app shell now treats `terminal` as a live migrated screen rather than a placeholder, while leaving browser parity blocked on reconnect, command input, disconnect, and output verification against the Svelte baseline.
- Shared AI-session API access should also live in `client-shared/`, so the Solid `ai-session` screen can reuse one framework-neutral contract for active-session polling, prompt-queue state, prompt submission, and Claude-session history browsing instead of depending on Svelte-local request helpers.
- Shared AI-session API access should also cover hidden-session persistence, so both frontends can reuse one framework-neutral contract for overview visibility state instead of leaving that behavior in the legacy Svelte app API.
- The Solid app shell now treats `ai-session` as an in-progress live screen rather than a placeholder, with project-scoped session history, active-session monitoring, prompt submission, model-profile selection, and active-file prompt-context wiring backed by the existing APIs while browser parity and broader legacy-retirement verification remain explicit blockers.
- The Solid `ai-session` composer must preserve both new-session drafts and the Svelte baseline's restart-from-beginning flow for existing sessions, because the shared AI-session API and backend already model `force_new_session` as part of the current session lifecycle rather than as a Solid-only enhancement.
- The Solid `ai-session` composer must also keep empty manual prompt submissions disabled while leaving default prompt actions available when idle; otherwise popup simplifications regress the Svelte baseline by surfacing buttons that can only fail with a client-side validation error.
- The Solid `ai-session` screen should keep growing through pure presentation/state helpers that merge active sessions, queued prompts, and Claude-session history into one selectable overview model, so richer session-browsing parity can land without pushing orchestration back into `App.tsx`.
- The Solid `ai-session` screen should also keep its selected-session/search route state in feature-owned helpers instead of scattering query-string parsing through the component body, so parity-sensitive navigation can be regression-tested without a browser harness.
- Shared AI-session API access should also cover selected-session detail and transcript loading, so the Solid `ai-session` screen can reach the Svelte baseline of in-app session browsing without importing Svelte-only transcript logic or coupling feature state to server-route knowledge.
- The Solid `ai-session` screen should render selected-session transcript and summary state through feature-owned presentation helpers, keeping transcript parsing/browser copy testable offline while the full browser-verification gate remains blocked.
- The Solid `ai-session` composer must reset its selected target session when the workspace context changes, otherwise a project switch can leak the previous repository's Qraft session id into a new submission and break project-scoped session semantics.
- The Solid `ai-session` composer should consume the current Solid files-screen selection through feature-owned helper state, so prompt submission can carry the active file reference without reaching back into Svelte-only prompt wiring or duplicating request assembly in `App.tsx`.
- The Solid `ai-session` composer now builds its submit payload from a feature-owned prompt-context helper, promoting the currently selected text file to structured `primaryFile` context and falling back to attachment-style references for binary/image-style selections instead of always submitting an empty primary-file context.
- The Solid diff/files selection state must stay alive across both `files` and `ai-session` for the active workspace. Treating `ai-session` as outside the shared files context resets `selectedPath`, file preview data, and diff summary exactly when the AI composer needs them, so the ownership boundary is `files | ai-session`, not `files` alone.
- The browser hash should keep file-selection details scoped to the `files` route even while that in-memory diff/files context is shared with `ai-session`; coupling the AI session route to URL-level file-selection state would make session browsing noisier without adding ownership clarity.
- That route scoping must be enforced in the shared navigation contract itself when hashes are parsed and emitted, not delegated to a later app-shell cleanup pass that temporarily preserves stale file query state on non-files routes.
- Files-route hash serialization should stay semantic rather than mechanical: omit default `view=side-by-side` and `tree=diff` values when they add no information, and never serialize a `line` value without a selected file path.
- Files-route line selection must stay scoped to the file currently rendered by the shared files context. If route state and files state temporarily diverge during synchronization, the line anchor must clear until both point at the same path; otherwise a stale line highlight leaks onto the wrong file, which the Svelte baseline does not do.
- The Solid `ai-session` screen should also consume the configured Action Defaults prompts for session-purpose, refresh-purpose, and resume actions through feature-owned helpers, so session recovery flows stay aligned with the existing backend prompt definitions instead of hardcoding Solid-only copies.
- The new-session Solid popup must expose the configured `ai-session-purpose` Action Default as a feature-owned draft-session action, so initial-purpose generation uses the same backend-owned prompt source as resumed-session actions instead of forcing users to hand-type the bootstrap prompt.
- The selected-session Solid popup must preserve the Svelte baseline's default prompt actions as prompt submissions, not collapse them into a direct purpose-refresh shortcut. `Refresh purpose` and `Resume session` must both fetch the configured Action Defaults prompt, wrap it with the internal session-action marker, and submit it against the selected Qraft session.
- Selected-session model metadata must preserve the Svelte popup's field-wise fallback semantics: use overview-card model data when present, but fill missing fields from the loaded session detail so labels and resumed prompts do not silently fall back to the new-session draft profile.
- Every selected-session Solid model label surface should reuse that same resolved model state, so the popup header badge and the session-detail footer cannot drift when overview metadata is incomplete.
- Files-to-session deep links should build the full ai-session screen hash through feature-owned route helpers instead of hand-assembling any part of that hash in `App.tsx`.
- Once those helpers exist, the ai-session screen itself should also mutate its selected-session/search route state via the same full screen-hash helper rather than replacing only the hash query fragment by hand; otherwise ownership remains split across two route-writing styles inside the same feature.
- Shared AI-session query contracts should carry transcript-search intent as well as summary-level search, so the Solid session browser can reuse the richer backend session-filter behavior already exposed to the Svelte baseline instead of hardcoding a reduced history search path.
- Shared AI-session activity contracts must also carry project identity for active sessions and queued prompts, so the Solid `ai-session` screen can scope its live activity panels to the active workspace instead of leaking unrelated repositories into the current overview.
- The lower-complexity Solid screens for `system-info`, `notifications`, `model-profiles`, and `action-defaults` are also live against the existing backend contracts, so the remaining migration work is now dominated by parity verification plus deeper completion of `ai-session`.
- The Solid app now also owns a screen-registry contract in `client/src/app/screen-registry.ts`, making implementation order, parity gates, and support blockers explicit instead of scattering them across `App.tsx`, navigation helpers, and plan notes.
- Support blockers must be modeled in two layers: global blockers that apply regardless of screen implementation state (for example missing `client/node_modules`, missing build output, or missing browser-verification tooling) and screen-specific blockers that track unported or unverified flows. Global blockers must remain visible even after every screen flips to `implemented`, otherwise the support gate can report a false-ready state.
- The screen registry must not hardcode the current workspace's blocker state as if it were immutable design truth. Instead, the registry should define the blocker catalog and derive active global blockers from explicit environment/verification status inputs, so support status can flip when dependencies are installed, the Solid bundle is built, browser tooling becomes available, or the full migration gate is recorded as passing.
- The Solid app shell must consume those environment/verification status inputs from a runtime source instead of calling the registry with defaults only, otherwise the support-status UI falls back to permanently blocked placeholder state even after the workspace conditions change.
- The recorded `bun run check:frontend:migration` status must come from a workspace-local runtime marker written by the verification command itself, not from a manual environment variable, so the Solid support-status UI reflects a real recorded gate instead of ad hoc startup configuration.
- Browser verification status must also be a recorded workspace-local fact rather than an inference from available tooling or cleared blockers, otherwise the support-status UI can claim parity was recorded when the browser loop never actually ran in that workspace.
- Browser-tool availability must not override that recorded fact after the verification marker exists. `agent-browser` blocks recording the baseline, but it should not keep the post-cutover support surface blocked once that baseline has already been recorded for the workspace.
- The browser verification gate must be executable from the repo itself via `bun run verify:frontend:migration:browser`, which runs a scripted `agent-browser` smoke loop against both frontend URLs (`#/project` and `#/files`) and records the workspace-local browser-verification marker only when that loop succeeds.
- The runtime support-status path must distinguish a source checkout from a packaged runtime. Release binaries and npm installs can serve built frontend bundles, but they cannot evaluate repo-local dependency installs or workspace markers and therefore must treat those criteria as not applicable instead of falsely blocked.
- The Solid client bootstrap must preserve that packaged/runtime distinction even before the `/api/frontend-status` refresh completes or when it fails; fallback client defaults must not assume a source checkout by default.
- Repo-only support checks must resolve the active QraftBox source root from the runtime location instead of assuming `process.cwd()` is the repo root; otherwise source-based development runs launched from another directory silently lose migration/support markers and nested-client status.
- That source-root resolution must walk upward from runtime-derived candidate paths until it finds the QraftBox repo markers, because bundled or nested runtime directories are often below the actual repo root rather than equal to it.
- Repo-local migration/browser markers must also stay non-authoritative outside a source checkout, so they cannot clear screen-level parity blockers or flip support status through an unrelated working-directory marker file.
- Screen-level parity blockers outside that smoke loop must remain open until they are cleared by targeted verification work; the shared browser marker must not be treated as blanket verification for `ai-session`, `commits`, `terminal`, `system-info`, `notifications`, `model-profiles`, or `action-defaults`.
- Repo-level migration verification now has an explicit `test:frontend:migration` target for shared-contract and dual-frontend selection coverage, rather than relying on the broader default test command to implicitly exercise the migration surface.
- The migration-focused test target must also include bootstrap fallback regressions such as `client/src/app/bootstrap-state.test.ts`; otherwise the packaged-safe support-default contract can drift without failing the intended offline verification gate.
- Repo-level migration verification is now intentionally two-stage: `check:frontend:migration:offline` covers root/server/shared-contract regressions without `client/node_modules`, while `check:frontend:migration` remains the full gate that additionally typechecks the nested Solid app once its dependencies are installed.
- Repo-level Solid build/typecheck scripts now fail fast with an explicit `bun install --cwd client` prerequisite when the nested frontend dependencies are absent.
- Release packaging must verify the same support baseline before bundling artifacts: `release:prepare` should run `check:frontend:migration:offline` plus `typecheck:client`, then build both frontend bundles and the server bundle only after those checks pass.

### 4. Progressive Screen Porting

Port by screen/domain instead of by low-level component first.

Recommended order:

1. App shell, top navigation, and workspace selection
2. Diff/file browsing flows
3. Commit and branch workflows
4. AI session browsing and queue views
5. Terminal, tools, model config, and long-tail screens

Each migrated screen should have:

- Shared contract fixtures
- Browser verification in both frontends
- A parity checklist covering loading, success, empty, unsupported, and error states

The Solid app should keep one explicit screen registry that records:

- implementation order
- implementation status
- per-screen parity gate summaries
- explicit support blockers that still prevent retiring the legacy fallback
- a support-status summary derived from the registry so the app shell and tests share one runtime truth source while implementation-plan tracking remains documentation-only

Current intended order after the initial workspace shell is:

1. `files`
2. `ai-session`
3. `commits`
4. `terminal`
5. `system-info`
6. `notifications`
7. `model-profiles`
8. `action-defaults`

### 5. Parity Testing Strategy

Behavior comparison should happen at three levels:

- Contract tests: shared DTO transforms and state reducers produce the same outputs.
- Screen-level tests: identical mocked server responses render equivalent visible states.
- Browser verification: the operator runs both frontends against the same backend and checks targeted flows.
- The repo-owned browser verification command should automate the minimum smoke loop needed to make the recorded browser-verification marker reproducible: open both frontend URLs, visit the migrated `project` and `files` routes, capture snapshots/screenshots, and fail if the browser cannot read non-empty page text.
- Because that command only covers shared workspace/diff flows, the recorded marker may clear only the corresponding global criterion and the `files` screen parity blocker. Other screen blockers must stay explicit until separate verification coverage exists.

During early coexistence, screen-level checks may be implemented through framework-specific presentation helpers when a full DOM test harness is not yet available, but those helpers must stay close to the rendered screen and be backed by browser verification before the corresponding parity blocker is cleared.

Parity is defined by:

- Same route/screen availability
- Same primary actions
- Same hash-driven project selection behavior
- Same changed-file summary and selected-file identity for the initial diff slice
- Same per-workspace changed-file selection continuity when switching between open repositories
- Same non-Git workspace behavior for screens that depend on Git-only data, including keeping diff-only actions unavailable while preserving all-files browsing on the `files` screen
- Same server requests for equivalent user intent
- Same visible status/error semantics

Pixel-perfect equality is not required during coexistence unless the migrated feature is highly layout-sensitive.

## Implementation Phases

Phases 1 through 3 are already complete on this branch. The remaining work is
no longer a frontend-default flip; it is support-status closure and eventual
legacy Svelte retirement once the recorded blockers are cleared.

### Phase 1: Foundation

- Add Solid/Vite app scaffold.
- Add frontend selection support in server startup/static asset resolution.
- Define shared contracts, fixtures, and parity-test helpers.
- Move routing semantics into shared contracts so Svelte and Solid do not diverge during early porting.

### Phase 2: Core Navigation and Workspace

- Port app shell and navigation.
- Port project/workspace selection and tab context behavior.
- Validate startup and repository switching parity.

### Phase 3: Diff-Centric Workflows

- Port diff screen, file tree, current-state, and file viewer flows.
- Start with a minimal shared diff slice: changed-file summary, changed-file selection, and selected-file identity on the `files` screen.
- Split the remaining `files` work into explicit subflows:
  - diff data and diff-specific view modes
  - file-tree source/loading state (`diff` tree vs `all` tree, lazy directory expansion, ignored/all-file toggles)
  - screen-owned selected-path state that is broader than diff selection
  - file-content fetching for `full-file` and non-diff selections
- Port realtime update behavior that affects diff-focused screens through shared watcher-refresh rules plus framework-owned WebSocket shells.
- Mirror the existing git-state focus/visibility/poll refresh behavior for the Solid `files` screen so external terminal git operations do not leave stale diff state behind between watcher events.
- Keep the files-screen realtime refresh policy separate from diff availability so non-Git all-files browsing still updates when watcher events arrive.
- Preserve the Svelte non-Git `files` fallback by forcing all-files mode and file preview support while diff data stays explicitly unavailable.
- Add browser verification scripts/checklists for side-by-side testing.

### Phase 4: Secondary Screens and Legacy-Retirement Closure

- Keep commits, AI sessions, terminal, tools, model config, and remaining screens aligned with the screen registry until their explicit parity blockers are cleared.
- Drive follow-up verification and blocker burn-down from the Solid screen registry so support-status notes cannot drift from the implemented UI surface.
- Retire the legacy Svelte frontend only after the remaining parity gates pass and the fallback path is no longer needed.

## Key Decisions

### Decision: Parallel implementation instead of in-place framework replacement

Reason:

- It preserves a working baseline.
- It enables behavior comparison against the same backend.
- It reduces migration risk for a UI with broad surface area and many workflows.

### Decision: Shared contract layer before large-scale screen porting

Reason:

- Without shared contracts, the Solid frontend would re-encode business rules and drift quickly.
- Shared fixtures create a common truth source for parity tests.

### Decision: Server-level frontend selection instead of separate backend processes

Reason:

- The backend behavior must stay identical during comparison.
- A single server process avoids configuration skew between validation runs.

### Decision: Separate global support blockers from screen-level blockers

Reason:

- Build and browser-verification blockers do not disappear just because a screen is marked `implemented`.
- The registry must keep support status truthful after the last screen port lands.
- A derived support summary gives the app shell and tests one consistent runtime source for legacy-retirement criteria, while implementation plans remain a parallel tracking artifact.

### Decision: Derive active support blockers from status inputs instead of hardcoded workspace assumptions

Reason:

- Dependency installation, built bundle presence, browser-tool availability, and full-gate verification are runtime/workspace facts, not static design facts.
- The support-status model must distinguish prerequisites like `client/node_modules` from verification outcomes like `bun run check:frontend:migration` having actually passed.
- The support-status model must also distinguish repo-only verification prerequisites from general runtime health so packaged installs do not report impossible source-workspace failures.
- Source-checkout detection for repo-only support checks must identify the actual QraftBox checkout shape, not just any arbitrary working directory containing a `client/package.json`.
- Parameterized blocker evaluation lets the same registry stay correct across blocked sandboxes, local developer machines, and future CI-driven support checks.

## Risks and Mitigations

| Risk                                                      | Impact                                      | Mitigation                                                                                 |
| --------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Shared code stays trapped inside Svelte stores/components | Solid rewrite duplicates logic and diverges | Extract contracts and pure helpers before porting complex screens                          |
| Dual frontends increase maintenance load                  | Slower feature work during migration        | Limit coexistence period and track remaining screens explicitly in the implementation plan |
| Static asset selection becomes fragile                    | Incorrect bundle served during verification | Centralize frontend selection in one server config module with startup validation          |
| Browser verification is manual and inconsistent           | False parity confidence                     | Add explicit verification checklist and stable seed scenarios per milestone                |
| Repo-root verification can miss the Solid migration path  | Regressions land without touching Svelte    | Add explicit migration-focused test/typecheck commands and shared fixture registries       |

## Verification Approach

For each migrated milestone:

1. Run `bun run check:frontend:migration:offline` for root TypeScript, shared contracts, and server/frontend-selection regression coverage.
2. Run `bun install --cwd client` when needed, then run `bun run check:frontend:migration` for the full nested Solid typecheck gate.
3. Run browser verification for Svelte and Solid against the same repository state.
4. Record parity gaps and environment blockers in the implementation plan progress log before continuing.

For the initial diff milestone, browser verification should at minimum confirm:

1. Navigating to `#/project-slug/files` in Solid issues the expected diff bootstrap request for the active workspace context.
2. The changed-file summary and selected-file identity update when switching between changed files.
3. Empty, unsupported, and error states stay comprehensible when the active workspace has no diff payload or is not a Git repository.
4. A `file-change` websocket event refreshes the active Solid diff screen against the current workspace context without mutating non-files routes.

Before the legacy Svelte frontend can be retired, the support baseline must also confirm:

1. Every screen in the Solid screen registry is marked `implemented`.
2. `bun run check:frontend:migration` passes, including the nested Solid typecheck.
3. `dist/client/index.html` is built and is served successfully by the backend under `QRAFTBOX_FRONTEND=solid`.
4. Browser verification is recorded for Svelte and Solid against the same backend state for workspace and diff flows.
5. No explicit support blocker remains open in the screen registry runtime status surface.

## References

See `design-docs/references/README.md` for framework and tooling references relevant to this migration.
