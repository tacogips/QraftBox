---
name: e2e-tdd
description: Test-Driven Development with visual UI confirmation. Uses agent-browser for ad-hoc spot verification and Playwright for repeatable regression tests. Covers the full Plan-Red-Green-Refactor-Validate cycle. Use when implementing UI features, fixing UI bugs, or verifying fixes visually. Triggers include "TDD", "test-driven", "verify in browser", "spot check", "visual confirm", "red-green-refactor".
allowed-tools: Bash, Bash(agent-browser:*), Read, Write, Edit, Glob, Grep, Task
---

# E2E Test-Driven Development Skill

This skill provides a structured TDD workflow combining two browser tools:
- **agent-browser**: Ad-hoc spot verification, interactive DOM inspection, quick visual checks
- **Playwright**: Repeatable test assertions, visual regression baselines, CI/CD

## When to Apply

Apply this skill when:
- Implementing a new UI feature with test-first methodology
- Fixing a UI bug and need to visually confirm the fix
- Running tests and want to visually verify the result in a real browser
- Spot-checking UI behavior without writing a formal test

## Tool Selection Guide

```
What do you need?
  |
  +--> Quick visual check after a bug fix?
  |      --> agent-browser (no test file needed)
  |
  +--> Confirm test results with real browser?
  |      --> agent-browser (after Playwright tests pass)
  |
  +--> Explore DOM to find locators?
  |      --> agent-browser (snapshot -i, interactive)
  |
  +--> Repeatable test with assertions?
  |      --> Playwright (auto-wait, retry, CI)
  |
  +--> Visual regression baseline comparison?
  |      --> Playwright (toHaveScreenshot)
  |
  +--> Debug a failing test step-by-step?
         --> Playwright --debug (Inspector)
```

### Comparison

| Capability | agent-browser | Playwright |
|------------|---------------|------------|
| Ad-hoc spot check (no test file) | Best | Requires test file |
| Interactive DOM exploration | snapshot -i, get text | --debug Inspector |
| Agent can "see" the page | Yes (snapshot returns to agent) | Only via screenshots on disk |
| Repeatable assertions | Manual | Auto-wait + retry |
| Visual regression baselines | No | toHaveScreenshot() |
| CI/CD integration | No | Yes |
| Requires nix-shell | No | Yes (Node.js) |
| Headed browser | --headed flag | --headed flag |

## Spot Verification with agent-browser

Use this workflow when you need a quick visual check -- no test file required.

### After a Bug Fix

```bash
# 1. Start the dev server (if not already running)
bun run src/main.ts --port 7155 &

# 2. Open the page
agent-browser open http://localhost:7155

# 3. Take a snapshot to see interactive elements
agent-browser snapshot -i

# 4. Navigate to the area where the bug was fixed
agent-browser click @e3          # e.g., click a file in the tree
agent-browser wait --load networkidle

# 5. Take a screenshot for the record
agent-browser screenshot --full

# 6. Verify specific content
agent-browser get text @e5       # Check element text content
agent-browser snapshot -i        # Re-snapshot to see updated DOM

# 7. Close when done
agent-browser close
```

### After Playwright Tests Pass

```bash
# 1. Run the Playwright test
nix-shell -p nodejs_22 --run "npx playwright test e2e/features/my-feature.spec.ts"

# 2. Tests pass -- now visually confirm with agent-browser
agent-browser open http://localhost:7155

# 3. Navigate to the feature area
agent-browser snapshot -i
agent-browser click @e2
agent-browser wait --load networkidle

# 4. Visual inspection
agent-browser snapshot -i        # Agent sees the DOM structure
agent-browser screenshot --full  # Full page screenshot for review

# 5. Check specific elements the test asserted on
agent-browser get text @e4       # Verify text matches expectations

agent-browser close
```

### Locator Discovery (for writing Playwright tests)

Use agent-browser to explore the DOM before writing test assertions:

```bash
agent-browser open http://localhost:7155
agent-browser snapshot -i
# Output shows: @e1 [button] "Commit", @e2 [button] "Push", @e3 [nav] ...

# Now you know the page structure -- use this to write Playwright locators:
#   page.getByRole("button", { name: "Commit" })
#   page.getByRole("button", { name: "Push" })

agent-browser close
```

## TDD Workflow: Plan - Red - Green - Refactor - Validate

### Overview

```
Plan --> Red --> Green --> Refactor --> Validate
 |        |       |          |            |
Define   Write   Write    Clean up    agent-browser
feature  failing minimal  code while  spot check +
scope    test    impl     tests pass  screenshots
```

### Phase 0: Plan

Before writing any code, define what the feature should do:

1. **Describe the feature** in user-visible terms (not implementation details)
2. **Identify testable behaviors**: What should the user see? What interactions should work?
3. **Explore the current state** with agent-browser:
   ```bash
   agent-browser open http://localhost:7155
   agent-browser snapshot -i
   agent-browser screenshot --full
   agent-browser close
   ```
4. **Define screenshot checkpoints**: What visual states need verification?

### Phase 1: Red (Write Failing Test)

Write a Playwright test that describes the expected behavior. The test MUST fail initially.

#### Test File Location

```
e2e/
  visual-verification.spec.ts    # Existing visual tests
  features/                      # Feature-specific TDD tests
    dark-mode.spec.ts
    search-filter.spec.ts
```

#### Writing the Test

```typescript
import { test, expect } from "@playwright/test";

const E2E_RUN_DIR = process.env["E2E_RUN_DIR"] ?? "e2e-result/unknown";
const SCREENSHOT_DIR = `${E2E_RUN_DIR}/screenshots`;

test.describe("Dark Mode Toggle", () => {
  test("should toggle dark mode on click", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/dark-mode-01-initial.png`,
    });

    const toggle = page.getByRole("button", { name: /dark mode|theme/i });
    await expect(toggle).toBeVisible();
    await toggle.click();

    await expect(page.locator("body")).toHaveClass(/dark/);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/dark-mode-02-toggled.png`,
    });
  });
});
```

#### Locator Best Practices

| Priority | Method | Example | When to Use |
|----------|--------|---------|-------------|
| 1 | Role | `page.getByRole("button", { name: "Submit" })` | Interactive elements |
| 2 | Label | `page.getByLabel("Email")` | Form fields |
| 3 | Placeholder | `page.getByPlaceholder("Search...")` | Input hints |
| 4 | Text | `page.getByText("Welcome")` | Static content |
| 5 | Test ID | `page.getByTestId("submit-btn")` | When semantics unavailable |
| 6 | CSS/XPath | `page.locator(".my-class")` | Last resort only |

Use agent-browser `snapshot -i` to discover what locators are available on the page before writing tests.

#### Assertion Best Practices

Use web-first assertions (auto-wait + retry):

```typescript
// CORRECT - web-first assertion (auto-waits)
await expect(page.getByText("Welcome")).toBeVisible();

// WRONG - manual check (no auto-wait, flaky)
expect(await page.getByText("Welcome").isVisible()).toBe(true);
```

Key assertions:
- `toBeVisible()`, `toBeHidden()` - visibility
- `toHaveText()`, `toContainText()` - text content
- `toHaveClass()`, `toHaveAttribute()` - DOM properties
- `toHaveURL()` - navigation
- `toHaveScreenshot()` - visual regression (generates baseline on first run)

#### Run the Test (Confirm Red)

```bash
nix-shell -p nodejs_22 --run "npx playwright test e2e/features/dark-mode.spec.ts"
```

The test MUST fail. If it passes, the test is not testing new behavior.

### Phase 2: Green (Minimal Implementation)

Write the minimum code to make the test pass.

1. **Implement the feature** in the client/server code
2. **Rebuild the client** if needed: `cd client && bun run build`
3. **Run the test again** to confirm it passes:
   ```bash
   nix-shell -p nodejs_22 --run "npx playwright test e2e/features/dark-mode.spec.ts"
   ```
4. If it fails, debug:
   ```bash
   # Step-through with Playwright Inspector
   nix-shell -p nodejs_22 --run "npx playwright test e2e/features/dark-mode.spec.ts --debug"
   ```

### Phase 3: Refactor

Clean up the implementation while keeping tests green:

1. Refactor implementation code
2. Run tests after each change:
   ```bash
   nix-shell -p nodejs_22 --run "npx playwright test e2e/features/dark-mode.spec.ts"
   ```
3. Refactor test code (extract helpers, page objects)
4. Run tests again

### Phase 4: Validate (Visual Confirmation with agent-browser)

After tests pass, perform visual spot verification with agent-browser:

```bash
# 1. Confirm tests are green
nix-shell -p nodejs_22 --run "npx playwright test e2e/features/dark-mode.spec.ts"

# 2. Open browser for visual spot check
agent-browser open http://localhost:7155
agent-browser snapshot -i

# 3. Navigate to the feature area and verify
agent-browser click @e3                  # Navigate to the relevant area
agent-browser wait --load networkidle
agent-browser snapshot -i                # Agent inspects DOM state

# 4. Capture final screenshots
agent-browser screenshot --full

# 5. Check specific content
agent-browser get text @e5               # Verify key text

# 6. Done
agent-browser close

# 3. Run full suite to check regressions
nix-shell -p nodejs_22 --run "npx playwright test"
```

## Bug Fix Verification (No Existing Test)

When fixing a spot bug that has no pre-existing test:

### Quick Workflow (agent-browser only)

For minor fixes where a formal test is unnecessary:

```
1. Fix the bug in source code
2. Rebuild client: cd client && bun run build
3. Verify with agent-browser:
   agent-browser open http://localhost:7155
   agent-browser snapshot -i
   agent-browser click @e2    # Navigate to bug area
   agent-browser snapshot -i  # Confirm fix is visible
   agent-browser screenshot --full
   agent-browser close
```

### Full Workflow (agent-browser + Playwright)

For important fixes that need regression protection:

```
1. Reproduce the bug with agent-browser:
   agent-browser open http://localhost:7155
   agent-browser snapshot -i
   agent-browser screenshot --full    # Capture "before" state

2. Write a failing Playwright test (Red):
   - Test asserts the correct behavior (which currently fails)
   nix-shell -p nodejs_22 --run "npx playwright test e2e/features/bugfix-xxx.spec.ts"

3. Fix the bug in source code (Green):
   - Rebuild client if needed
   nix-shell -p nodejs_22 --run "npx playwright test e2e/features/bugfix-xxx.spec.ts"

4. Verify with agent-browser:
   agent-browser open http://localhost:7155
   agent-browser snapshot -i
   agent-browser screenshot --full    # Capture "after" state
   agent-browser close

5. Run full suite:
   nix-shell -p nodejs_22 --run "npx playwright test"
```

## Debugging Toolkit

### Decision Tree

```
Need to debug?
  |
  +--> Want to see live execution?
  |      --> Playwright --headed
  |
  +--> Want to step through actions?
  |      --> Playwright --debug (Inspector)
  |
  +--> Want to interactively explore DOM?
  |      --> agent-browser snapshot -i
  |
  +--> Want to pause at specific point?
  |      --> page.pause() in test code
  |
  +--> CI failure, no display?
         --> Playwright trace viewer
```

### agent-browser Exploration

```bash
agent-browser open http://localhost:7155
agent-browser snapshot -i                # See all interactive elements
agent-browser snapshot -s "#app"         # Scope to specific container
agent-browser get text @e3               # Read element text
agent-browser highlight @e5              # Highlight element visually
agent-browser --headed open http://localhost:7155  # See the browser window
```

### Playwright Debugging

```bash
# Headed mode (watch test run)
nix-shell -p nodejs_22 --run "npx playwright test --headed"

# Inspector (step through)
nix-shell -p nodejs_22 --run "npx playwright test --debug"

# UI mode (interactive test explorer with time-travel)
nix-shell -p nodejs_22 --run "npx playwright test --ui"

# Verbose API logs
DEBUG=pw:api nix-shell -p nodejs_22 --run "npx playwright test e2e/features/my-test.spec.ts"

# Trace viewer (post-mortem)
nix-shell -p nodejs_22 --run "npx playwright show-trace e2e-result/{runId}/results/trace.zip"
```

### page.pause() Breakpoint

```typescript
test("debug this part", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.pause(); // Opens Playwright Inspector here
});
```

## Visual Regression Testing (Playwright)

### Using toHaveScreenshot()

```typescript
test("visual regression check", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveScreenshot("homepage.png");

  const header = page.getByRole("banner");
  await expect(header).toHaveScreenshot("header.png");
});
```

### Updating Baselines

```bash
nix-shell -p nodejs_22 --run "npx playwright test --update-snapshots"
```

Baselines stored in `{test-file}-snapshots/` directories -- commit to version control.

## Test Structure Patterns

### Page Object Model

```typescript
// e2e/pages/diff-viewer.ts
import { type Page, type Locator, expect } from "@playwright/test";

export class DiffViewerPage {
  readonly page: Page;
  readonly fileTree: Locator;
  readonly diffPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.fileTree = page.getByTestId("file-tree");
    this.diffPanel = page.getByTestId("diff-panel");
  }

  async goto() {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }

  async selectFile(name: string) {
    await this.fileTree.getByText(name).click();
    await this.page.waitForTimeout(500);
  }
}
```

### Fixture Pattern

```typescript
// e2e/fixtures.ts
import { test as base } from "@playwright/test";
import { DiffViewerPage } from "./pages/diff-viewer";

export const test = base.extend<{ diffViewer: DiffViewerPage }>({
  diffViewer: async ({ page }, use) => {
    const diffViewer = new DiffViewerPage(page);
    await diffViewer.goto();
    await use(diffViewer);
  },
});

export { expect } from "@playwright/test";
```

## Environment

### Nix + Node.js (Playwright)

```bash
# CORRECT
nix-shell -p nodejs_22 --run "npx playwright test"

# WRONG - Bun cannot run Playwright
bun run playwright test
```

### Dev Server

| Setting | Value |
|---------|-------|
| Command | `bun run src/main.ts --port 7155` |
| Health check | `http://localhost:7155/api/health` |
| Auto-managed by | Playwright config (webServer) |

For agent-browser spot checks, start the server manually if Playwright is not running:
```bash
bun run src/main.ts --port 7155 &
```

### Kill Stale Server

```bash
lsof -ti:7155 | xargs kill -9 2>/dev/null || true
```

## Safety Rules

1. **NEVER** execute destructive operations (commit, push, PR) via agent-browser or tests
2. **NEVER** modify actual repository files during browser verification
3. **NEVER** switch branches on the repository under test
4. **NEVER** make POST calls to destructive endpoints
5. Only verify UI rendering and user interactions
6. Capture error states and continue when screens fail to load

## Agent Workflow Summary

### Scenario A: New Feature (Full TDD)

```
1. Plan: agent-browser explore current state
2. Red:  Write Playwright test -> confirm failure
3. Green: Implement -> confirm test passes
4. Refactor: Clean up -> tests still green
5. Validate: agent-browser spot check + full suite run
```

### Scenario B: Bug Fix (Spot Verification)

```
1. agent-browser: Reproduce and screenshot the bug
2. Fix the source code, rebuild client
3. agent-browser: Verify fix visually
4. (Optional) Write Playwright test for regression
5. Run full suite
```

### Scenario C: Post-Test Visual Confirm

```
1. Run Playwright tests (pass)
2. agent-browser: Open page, navigate, inspect DOM
3. agent-browser: Screenshot key states
4. Confirm visual correctness
```

## Integration with Other Skills

| Skill/Agent | Relationship |
|-------------|--------------|
| `e2e-test` | Playwright environment setup, result directories |
| `agent-browser` | Ad-hoc spot verification, DOM exploration |
| `ts-coding-standards` | TypeScript quality for test files |
| `check-and-test-after-modify` | Run after implementation changes |
| `impl-plan` | Feature planning before TDD cycle |

## Quick Reference Card

| Action | Tool | Command |
|--------|------|---------|
| Spot check (no test) | agent-browser | `agent-browser open http://localhost:7155` |
| Inspect DOM | agent-browser | `agent-browser snapshot -i` |
| Screenshot | agent-browser | `agent-browser screenshot --full` |
| Get element text | agent-browser | `agent-browser get text @e1` |
| Run test | Playwright | `nix-shell -p nodejs_22 --run "npx playwright test e2e/features/{name}.spec.ts"` |
| Step-through debug | Playwright | append `--debug` |
| Headed mode | Playwright | append `--headed` |
| UI mode | Playwright | append `--ui` |
| Update baselines | Playwright | append `--update-snapshots` |
| View screenshots | Read tool | `ls e2e-result/$(ls -t e2e-result/ \| head -1)/screenshots/` |
| View report | Playwright | `nix-shell -p nodejs_22 --run "npx playwright show-report e2e-result/{runId}/report"` |
| Start server manually | Bun | `bun run src/main.ts --port 7155 &` |
| Kill stale server | Bash | `lsof -ti:7155 \| xargs kill -9 2>/dev/null \|\| true` |
| Rebuild client | Bun | `cd client && bun run build` |
