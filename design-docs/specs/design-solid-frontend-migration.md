# Solid Frontend Migration Design

This document defines how QraftBox will add a Solid-based frontend alongside the existing Svelte frontend so both implementations can be exercised against the same server and compared during migration.

## Overview

QraftBox currently serves a single Svelte 5 client from `client/`. The migration will introduce a second frontend implementation, tentatively rooted at `client-solid/`, without removing or destabilizing the existing Svelte UI.

The immediate goal is not a one-shot rewrite. The goal is to create a controlled coexistence period where:

- Svelte remains the production baseline.
- Solid is developed feature-by-feature against the same HTTP and WebSocket APIs.
- Shared behavior is verified by contract tests and browser-level comparison.
- The server can select which frontend bundle to serve for local validation.

## Goals

- Add a Solid frontend without interrupting current Svelte workflows.
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

- The current client is a large Svelte/Vite application with routing and state concentrated around `client/src/App.svelte` plus many feature components under `client/components/`.
- Server static asset serving assumes one built client directory resolved from `QRAFTBOX_CLIENT_DIR`.
- Existing client tests are Svelte-centric and do not yet provide a framework-neutral parity suite.
- UI changes require browser verification after code changes, so the migration path must support serving either frontend on demand.

## Proposed Architecture

### 1. Dual Frontend Layout

- Keep the existing Svelte frontend in `client/`.
- Add a new Solid frontend in `client-solid/`.
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
- Default remains `svelte`

Selection rules:

- Default to `svelte` until Solid reaches release parity.
- Resolve the selected frontend build directory before static asset middleware is mounted.
- Return a startup error if the selected frontend bundle is missing.

Current foundation status:

- Asset-root overrides are frontend-specific: `QRAFTBOX_CLIENT_DIR` for Svelte and `QRAFTBOX_CLIENT_SOLID_DIR` for Solid.
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
- The Solid diff workflow now owns its async loading/reset/selection lifecycle inside `client-solid/src/features/diff/`, instead of keeping request-state orchestration in `App.tsx`, so migration work can keep feature boundaries aligned with the intended architecture and regression-test stale state transitions directly.
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
- The Solid screen registry should treat implementation completeness separately from parity verification. A screen can be `implemented` while still carrying browser-verification blockers, otherwise the readiness model understates actual port progress and turns `implementationStatus` into a proxy for unrelated verification work.
- Shared commit-history API access now also lives in `client-shared/`, so the Solid `commits` screen can reuse one framework-neutral fetch/error contract for commit lists, commit detail, and per-commit diff payloads instead of issuing ad-hoc requests from the component layer.
- The Solid app shell now treats `commits` as a live migrated screen rather than a placeholder, while leaving an explicit browser-verification blocker in the screen registry until parity is checked against the Svelte baseline.
- Shared terminal session API access should also live in `client-shared/`, so the Solid `terminal` screen can reuse one framework-neutral connect/status/disconnect contract before any richer terminal rendering parity work is layered on top.
- The Solid app shell now treats `terminal` as a live migrated screen rather than a placeholder, while leaving browser parity blocked on reconnect, command input, disconnect, and output verification against the Svelte baseline.
- Shared AI-session API access should also live in `client-shared/`, so the Solid `ai-session` screen can reuse one framework-neutral contract for active-session polling, prompt-queue state, prompt submission, and Claude-session history browsing instead of depending on Svelte-local request helpers.
- Shared AI-session API access should also cover hidden-session persistence, so both frontends can reuse one framework-neutral contract for overview visibility state instead of leaving that behavior in the legacy Svelte app API.
- The Solid app shell now treats `ai-session` as an in-progress live screen rather than a placeholder, with project-scoped session history, active-session monitoring, prompt submission, model-profile selection, and active-file prompt-context wiring backed by the existing APIs while browser parity and broader cutover verification remain explicit blockers.
- The Solid `ai-session` composer must preserve both new-session drafts and the Svelte baseline's restart-from-beginning flow for existing sessions, because the shared AI-session API and backend already model `force_new_session` as part of the current session lifecycle rather than as a Solid-only enhancement.
- The Solid `ai-session` screen should keep growing through pure presentation/state helpers that merge active sessions, queued prompts, and Claude-session history into one selectable overview model, so richer session-browsing parity can land without pushing orchestration back into `App.tsx`.
- The Solid `ai-session` screen should also keep its selected-session/search route state in feature-owned helpers instead of scattering query-string parsing through the component body, so parity-sensitive navigation can be regression-tested without a browser harness.
- Shared AI-session API access should also cover selected-session detail and transcript loading, so the Solid `ai-session` screen can reach the Svelte baseline of in-app session browsing without importing Svelte-only transcript logic or coupling feature state to server-route knowledge.
- The Solid `ai-session` screen should render selected-session transcript and summary state through feature-owned presentation helpers, keeping transcript parsing/browser copy testable offline while the full browser-verification gate remains blocked.
- The Solid `ai-session` composer must reset its selected target session when the workspace context changes, otherwise a project switch can leak the previous repository's Qraft session id into a new submission and break project-scoped session semantics.
- The Solid `ai-session` composer should consume the current Solid files-screen selection through feature-owned helper state, so prompt submission can carry the active file reference without reaching back into Svelte-only prompt wiring or duplicating request assembly in `App.tsx`.
- The Solid `ai-session` composer now builds its submit payload from a feature-owned prompt-context helper, promoting the currently selected text file to structured `primaryFile` context and falling back to attachment-style references for binary/image-style selections instead of always submitting an empty primary-file context.
- The Solid diff/files selection state must stay alive across both `files` and `ai-session` for the active workspace. Treating `ai-session` as outside the shared files context resets `selectedPath`, file preview data, and diff summary exactly when the AI composer needs them, so the ownership boundary is `files | ai-session`, not `files` alone.
- The Solid `ai-session` screen should also consume the configured Action Defaults prompts for session-purpose, refresh-purpose, and resume actions through feature-owned helpers, so session recovery flows stay aligned with the existing backend prompt definitions instead of hardcoding Solid-only copies.
- Shared AI-session query contracts should carry transcript-search intent as well as summary-level search, so the Solid session browser can reuse the richer backend session-filter behavior already exposed to the Svelte baseline instead of hardcoding a reduced history search path.
- Shared AI-session activity contracts must also carry project identity for active sessions and queued prompts, so the Solid `ai-session` screen can scope its live activity panels to the active workspace instead of leaking unrelated repositories into the current overview.
- The lower-complexity Solid screens for `system-info`, `notifications`, `model-profiles`, and `action-defaults` are also live against the existing backend contracts, so the remaining migration work is now dominated by parity verification plus deeper completion of `ai-session`.
- The Solid app now also owns a screen-registry contract in `client-solid/src/app/screen-registry.ts`, making implementation order, parity gates, and cutover blockers explicit instead of scattering them across `App.tsx`, navigation helpers, and plan notes.
- Cutover blockers must be modeled in two layers: global blockers that apply regardless of screen implementation state (for example missing `client-solid` dependencies, missing build output, or missing browser-verification tooling) and screen-specific blockers that track unported or unverified flows. Global blockers must remain visible even after every screen flips to `implemented`, otherwise the cutover gate can report a false-ready state.
- The screen registry must not hardcode the current workspace's blocker state as if it were immutable design truth. Instead, the registry should define the blocker catalog and derive active global blockers from explicit environment/verification status inputs, so readiness can flip when dependencies are installed, the Solid bundle is built, browser tooling becomes available, or the full migration gate is recorded as passing.
- The Solid app shell must consume those environment/verification status inputs from a runtime source instead of calling the registry with defaults only, otherwise the readiness UI falls back to permanently blocked placeholder state even after the workspace conditions change.
- The recorded `bun run check:frontend:migration` status must come from a workspace-local runtime marker written by the verification command itself, not from a manual environment variable, so the Solid cutover UI reflects a real recorded gate instead of ad hoc startup configuration.
- Browser verification status must also be a recorded workspace-local fact rather than an inference from available tooling or cleared blockers, otherwise the cutover UI can claim parity was recorded when the browser loop never actually ran in that workspace.
- The browser verification gate must be executable from the repo itself via `bun run verify:frontend:migration:browser`, which runs a scripted `agent-browser` smoke loop against both frontend URLs (`#/project` and `#/files`) and records the workspace-local browser-verification marker only when that loop succeeds.
- Repo-level migration verification now has an explicit `test:frontend:migration` target for shared-contract and dual-frontend selection coverage, rather than relying on the broader default test command to implicitly exercise the migration surface.
- Repo-level migration verification is now intentionally two-stage: `check:frontend:migration:offline` covers root/server/shared-contract regressions without `client-solid/node_modules`, while `check:frontend:migration` remains the full gate that additionally typechecks the nested Solid app once its dependencies are installed.
- Repo-level Solid build/typecheck scripts now fail fast with an explicit `bun install --cwd client-solid` prerequisite when the nested frontend dependencies are absent; in this workspace the install step is currently blocked because Bun cannot write to its tempdir and exits with `AccessDenied`.

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
- explicit cutover blockers that still prevent switching the default frontend
- a readiness summary derived from the registry so the app shell and implementation plan share the same cutover truth source

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

During early coexistence, screen-level checks may be implemented through framework-specific presentation helpers when a full DOM test harness is not yet available, but those helpers must stay close to the rendered screen and be backed by browser verification before cutover.

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

### Phase 4: Secondary Screens and Cutover Readiness

- Port commits, AI sessions, terminal, tools, model config, and remaining screens.
- Drive secondary-screen sequencing from the Solid screen registry so placeholder state, navigation, and cutover notes cannot drift.
- Flip default frontend only after parity gates pass and Svelte fallback remains available temporarily.

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

### Decision: Separate global cutover blockers from screen-level blockers

Reason:

- Build and browser-verification blockers do not disappear just because a screen is marked `implemented`.
- The registry must keep cutover status truthful after the last screen port lands.
- A derived readiness summary gives the app shell, tests, and implementation plan one consistent source for default-frontend flip criteria.

### Decision: Derive active cutover blockers from status inputs instead of hardcoded workspace assumptions

Reason:

- Dependency installation, built bundle presence, browser-tool availability, and full-gate verification are runtime/workspace facts, not static design facts.
- The readiness model must distinguish prerequisites like `client-solid/node_modules` from verification outcomes like `bun run check:frontend:migration` having actually passed.
- Parameterized blocker evaluation lets the same registry stay correct across blocked sandboxes, local developer machines, and future CI-driven cutover checks.

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
2. Run `bun install --cwd client-solid` when needed, then run `bun run check:frontend:migration` for the full nested Solid typecheck gate.
3. Run browser verification for Svelte and Solid against the same repository state.
4. Record parity gaps and environment blockers in the implementation plan progress log before continuing.

For the initial diff milestone, browser verification should at minimum confirm:

1. Navigating to `#/project-slug/files` in Solid issues the expected diff bootstrap request for the active workspace context.
2. The changed-file summary and selected-file identity update when switching between changed files.
3. Empty, unsupported, and error states stay comprehensible when the active workspace has no diff payload or is not a Git repository.
4. A `file-change` websocket event refreshes the active Solid diff screen against the current workspace context without mutating non-files routes.

Before the default frontend can flip from Svelte to Solid, the migration must also confirm:

1. Every screen in the Solid screen registry is marked `implemented`.
2. `bun run check:frontend:migration` passes, including the nested Solid typecheck.
3. `dist/client-solid/index.html` is built and is served successfully by the backend under `QRAFTBOX_FRONTEND=solid`.
4. Browser verification is recorded for Svelte and Solid against the same backend state for workspace and diff flows.
5. No explicit cutover blocker remains open in the screen registry or implementation plan.

## References

See `design-docs/references/README.md` for framework and tooling references relevant to this migration.
