---
name: e2e-test
description: Execute Playwright E2E tests for QraftBox. Handles Nix environment setup, test execution, result directory management, and output analysis. Use when running, debugging, or analyzing E2E tests.
allowed-tools: Bash, Read, Write, Glob, Grep
---

# E2E Test Execution Skill

This skill provides guidelines for efficiently executing, debugging, and managing Playwright E2E tests for QraftBox.

## When to Apply

Apply this skill when:
- Running E2E tests (full suite or specific tests)
- Debugging failing E2E tests
- Analyzing E2E test results, screenshots, or reports
- Setting up E2E test infrastructure

## Quick Reference

### Run All Tests

```bash
nix-shell -p nodejs_22 --run "npx playwright test"
```

### Run a Specific Test by Name

```bash
nix-shell -p nodejs_22 --run "npx playwright test -g 'E2E-01-01'"
```

### Run a Specific Test File

```bash
nix-shell -p nodejs_22 --run "npx playwright test e2e/visual-verification.spec.ts"
```

### Run a Specific Project (chromium or tablet)

```bash
nix-shell -p nodejs_22 --run "npx playwright test --project=chromium"
nix-shell -p nodejs_22 --run "npx playwright test --project=tablet"
```

### Run with Custom Run ID

```bash
E2E_RUN_ID=manual_test nix-shell -p nodejs_22 --run "npx playwright test"
```

### Run in Headed Mode (visible browser)

```bash
nix-shell -p nodejs_22 --run "npx playwright test --headed"
```

### Run with Debug (Playwright Inspector)

```bash
nix-shell -p nodejs_22 --run "npx playwright test --debug"
```

## Environment Requirements

### Nix + Node.js

Playwright requires Node.js (NOT Bun). Always execute via `nix-shell -p nodejs_22`:

```bash
# CORRECT
nix-shell -p nodejs_22 --run "npx playwright test"

# WRONG - Bun cannot run Playwright
bun run playwright test
bunx playwright test
```

### Playwright Browsers

- Nix sets `PLAYWRIGHT_BROWSERS_PATH` automatically via `direnv` / `nix develop`
- Do NOT override `PLAYWRIGHT_BROWSERS_PATH` manually
- Nix provides `chromium-1200`; the config sets `executablePath` accordingly
- WebKit has version mismatches with Nix -- use Chromium for all projects

### Dev Server

The `playwright.config.ts` manages the dev server automatically:

| Setting | Value |
|---------|-------|
| Command | `bun run src/main.ts --port 7155` |
| Health check | `http://localhost:7155/api/health` |
| `reuseExistingServer` | `false` (always starts fresh) |
| Timeout | 30 seconds |

No manual server startup is needed. Playwright starts and stops the server.

**NOTE**: If port 7155 is already in use, tests will fail. Kill any existing process on that port first:

```bash
lsof -ti:7155 | xargs kill -9 2>/dev/null || true
```

## Result Directory Structure

Each test run creates a timestamped directory under `e2e-result/`:

```
e2e-result/                          # <-- gitignored
  {runId}/                           # e.g., 20260208_143022
    screenshots/                     # Visual verification screenshots
      01-app-initial-load.png
      02-file-tree-initial.png
      03-diff-sbs-initial.png
      ...
    results/                         # Playwright test artifacts (traces, videos)
    report/                          # HTML report (open with: npx playwright show-report)
```

### Run ID

- Auto-generated from current datetime: `yyyyMMdd_HHmmss` (e.g., `20260208_143022`)
- Override with `E2E_RUN_ID` env var for custom naming
- Available in test code via `process.env["E2E_RUN_DIR"]`

### Gitignore Status

The following directories are **already gitignored** in `.gitignore`:

```gitignore
# E2E test outputs
e2e-result/
playwright-report/
test-results/
```

No E2E results will ever be committed. Each run is ephemeral.

## Viewing Results

### HTML Report

```bash
nix-shell -p nodejs_22 --run "npx playwright show-report e2e-result/{runId}/report"
```

### Screenshots

Screenshots are saved to `e2e-result/{runId}/screenshots/`. View them directly or use `Read` tool for image files.

### Finding the Latest Run

```bash
ls -td e2e-result/*/ | head -1
```

## Test Architecture

### Config File

`playwright.config.ts` - Defines projects, browser settings, and output directories.

### Test Files

| File | Purpose |
|------|---------|
| `e2e/visual-verification.spec.ts` | Main visual verification test suite |
| `e2e/tsconfig.json` | TypeScript config for E2E tests |

### Test Plan Reference

`design-docs/specs/design-e2e-test-plan.md` - Full test plan with all test case definitions.

### Projects

| Project | Browser | Viewport | Purpose |
|---------|---------|----------|---------|
| `chromium` | Desktop Chrome | Default (1280x720) | Standard desktop testing |
| `tablet` | Desktop Chrome | 1194x834, touch | Tablet/responsive testing |

## Safety Rules

These tests follow a non-destructive testing policy:

1. **NEVER** click submit/execute buttons for commit, push, or PR operations
2. **NEVER** modify files during tests
3. **NEVER** switch branches on the actual repository
4. **NEVER** make POST calls to destructive endpoints
5. Only open panels and visually verify their rendering
6. If a screen fails to load, capture the error state and continue

## Troubleshooting

### "Browser not found" Error

Verify the Nix environment is active and provides the browser:

```bash
echo $PLAYWRIGHT_BROWSERS_PATH
ls $PLAYWRIGHT_BROWSERS_PATH/chromium-1200/chrome-linux64/chrome
```

### Port 7155 Already in Use

```bash
lsof -ti:7155 | xargs kill -9 2>/dev/null || true
```

### Tests Hang or Timeout

- Check if the server starts properly: `bun run src/main.ts --port 7155`
- Verify the health endpoint: `curl http://localhost:7155/api/health`
- Increase timeout in `playwright.config.ts` if needed

### "Cannot find module" Errors

Ensure Node.js dependencies are installed:

```bash
bun install
```

### Stale Server State

The config uses `reuseExistingServer: false`, so Playwright always starts a fresh server. If issues persist, manually kill any lingering processes on port 7155.

## Adding New E2E Tests

1. Add test cases to `e2e/visual-verification.spec.ts` (or create new spec files under `e2e/`)
2. Follow the naming convention: `E2E-{suite}-{case}` (e.g., `E2E-21-01`)
3. Use the `screenshot()` helper for consistent screenshot naming
4. Use `getContextId()` helper for API tests that need a workspace context
5. Update `design-docs/specs/design-e2e-test-plan.md` with new test cases

## Workflow Summary

```
1. Run tests:    nix-shell -p nodejs_22 --run "npx playwright test"
2. Check output: ls -td e2e-result/*/ | head -1
3. View report:  nix-shell -p nodejs_22 --run "npx playwright show-report e2e-result/{runId}/report"
4. View screenshots: ls e2e-result/{runId}/screenshots/
```
