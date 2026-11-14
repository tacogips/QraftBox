# E2E Visual Verification Test

You are executing a comprehensive E2E visual verification test for QraftBox.
Your goal is to start the dev server, open each screen in a browser, take screenshots, and verify all UI features are rendering correctly.

## Reference

Read the test plan: `design-docs/specs/design-e2e-test-plan.md`

## Environment Setup

1. Ensure you are in the QraftBox project root directory
2. Verify Playwright browsers are available: `echo $PLAYWRIGHT_BROWSERS_PATH`
3. Create the screenshot output directory: `mkdir -p e2e-screenshots`

## Execution Steps

### Phase 1: Start Dev Server

```bash
# Start dev server on port 7155 (non-default to avoid conflicts)
bun run src/main.ts --port 7155 --no-open &
DEV_SERVER_PID=$!

# Wait for server to be ready
for i in $(seq 1 30); do
  if curl -s http://localhost:7155/api/health > /dev/null 2>&1; then
    echo "Server ready"
    break
  fi
  sleep 1
done
```

### Phase 2: API Smoke Tests (TS-E2E-20)

Before launching the browser, verify all API endpoints respond correctly using curl:

```bash
# Get the contextId from workspace API
WORKSPACE_RESPONSE=$(curl -s http://localhost:7155/api/workspace)
CONTEXT_ID=$(echo "$WORKSPACE_RESPONSE" | jq -r '.contexts[0].id // .tabs[0].contextId // empty')

# Test each endpoint
curl -s http://localhost:7155/api/health
curl -s http://localhost:7155/api/workspace
curl -s "http://localhost:7155/api/browse?path=$(pwd)"
curl -s "http://localhost:7155/api/ctx/${CONTEXT_ID}/diff"
curl -s "http://localhost:7155/api/ctx/${CONTEXT_ID}/files"
curl -s "http://localhost:7155/api/ctx/${CONTEXT_ID}/status"
curl -s "http://localhost:7155/api/ctx/${CONTEXT_ID}/commits"
curl -s "http://localhost:7155/api/ctx/${CONTEXT_ID}/claude-sessions"
curl -s "http://localhost:7155/api/ctx/${CONTEXT_ID}/prompts"
curl -s "http://localhost:7155/api/ctx/${CONTEXT_ID}/worktree"
```

Record pass/fail for each endpoint.

### Phase 3: Browser Visual Tests

Use the `agent-browser` tool (or Playwright directly) to:

1. **Open the app** at `http://localhost:7155`
2. **Wait for initial load** - wait for the `#app` div to have content
3. **Take screenshots** at each verification point per the test plan

Execute each test suite in order:

#### TS-E2E-01: App Startup
- Navigate to `http://localhost:7155`
- Wait for page load
- Screenshot: `e2e-screenshots/01-app-initial-load.png`
- Verify: Page has content, no error messages

#### TS-E2E-02: File Tree
- Look for file tree sidebar
- Screenshot: `e2e-screenshots/02-file-tree-initial.png`
- Click a directory node to expand
- Screenshot: `e2e-screenshots/02-file-tree-expanded.png`
- Look for status badges on changed files
- Screenshot: `e2e-screenshots/02-file-tree-status.png`
- Toggle mode (if toggle exists)
- Screenshot: `e2e-screenshots/02-file-tree-diff-only.png`

#### TS-E2E-03: Diff View (Side by Side)
- Click on a modified file in the file tree
- Wait for diff to render
- Screenshot: `e2e-screenshots/03-diff-sbs-initial.png`
- Look for two-column layout
- Scroll down to see more diff content
- Screenshot: `e2e-screenshots/03-diff-sbs-scroll.png`

#### TS-E2E-04: Diff View (Inline)
- Find and click the view mode toggle (SBS -> Inline)
- Wait for re-render
- Screenshot: `e2e-screenshots/04-diff-inline-initial.png`
- Verify single-column layout

#### TS-E2E-05: Current State View
- Find and activate Current State View toggle
- Screenshot: `e2e-screenshots/05-current-state-initial.png`
- Look for delete markers
- Screenshot: `e2e-screenshots/05-current-state-markers.png`

#### TS-E2E-06: Commit Log
- Find and open commit log panel
- Screenshot: `e2e-screenshots/06-commit-log-initial.png`
- Click on a commit entry
- Screenshot: `e2e-screenshots/06-commit-log-selected.png`

#### TS-E2E-07: Comments Panel
- Find and open comments panel
- Screenshot: `e2e-screenshots/07-comments-panel.png`

#### TS-E2E-08: Search
- Find search input
- Type a search query (e.g., "function")
- Wait for results
- Screenshot: `e2e-screenshots/08-search-results.png`

#### TS-E2E-09: Tab Bar
- Look for tab bar at the top
- Screenshot: `e2e-screenshots/09-tabs-initial.png`
- If add-tab button exists, click it
- Screenshot: `e2e-screenshots/09-tabs-add.png`

#### TS-E2E-10: Directory Picker
- If directory picker opened from tab add, capture it
- Screenshot: `e2e-screenshots/10-picker-open.png`
- Navigate into a directory
- Screenshot: `e2e-screenshots/10-picker-navigate.png`
- Close picker without selecting (ESC or close button)

#### TS-E2E-11: Branch Management
- Find branch indicator in UI
- Screenshot: `e2e-screenshots/11-branch-current.png`
- Click to open branch list (if available)
- Screenshot: `e2e-screenshots/11-branch-list.png`

#### TS-E2E-12: AI Commit (UI only - DO NOT execute)
- Find commit button
- Screenshot: `e2e-screenshots/12-commit-button.png`
- Click to open commit panel
- Screenshot: `e2e-screenshots/12-commit-panel.png`
- Check for staged files list and prompt selector
- Close panel WITHOUT committing

#### TS-E2E-13: AI Push (UI only - DO NOT execute)
- Find push button
- Screenshot: `e2e-screenshots/13-push-button.png`
- Click to open push panel
- Screenshot: `e2e-screenshots/13-push-panel.png`
- Close panel WITHOUT pushing

#### TS-E2E-14: AI PR (UI only - DO NOT execute)
- Find PR button
- Screenshot: `e2e-screenshots/14-pr-button.png`
- Click to open PR panel
- Screenshot: `e2e-screenshots/14-pr-panel.png`
- Close panel WITHOUT creating PR

#### TS-E2E-15: Claude Sessions Browser
- Navigate to Claude sessions screen
- Screenshot: `e2e-screenshots/15-claude-sessions.png`
- Try search if sessions exist
- Screenshot: `e2e-screenshots/15-claude-sessions-search.png`

#### TS-E2E-16: Session Queue
- Find session queue button
- Screenshot: `e2e-screenshots/16-session-button.png`
- Open session queue screen
- Screenshot: `e2e-screenshots/16-session-queue.png`

#### TS-E2E-17: AI Prompt Interface
- Find AI prompt input
- Screenshot: `e2e-screenshots/17-ai-prompt-inline.png`

#### TS-E2E-18: Worktree Management
- Check for worktree information in UI
- Screenshot: `e2e-screenshots/18-worktree-info.png`

#### TS-E2E-19: Responsive Views
- Resize viewport to 1024x768 (tablet)
- Screenshot: `e2e-screenshots/19-responsive-tablet.png`
- Resize viewport to 1920x1080 (desktop)
- Screenshot: `e2e-screenshots/19-responsive-desktop.png`

### Phase 4: Cleanup

```bash
# Stop the dev server
kill $DEV_SERVER_PID 2>/dev/null
```

### Phase 5: Report

Generate a summary report listing:
- Total tests: count
- Passed: count
- Failed: count (with details)
- Screenshots captured: list of files in e2e-screenshots/
- Any errors or unexpected behaviors observed

## Important Safety Rules

1. **NEVER click submit/execute buttons** for commit, push, or PR operations
2. **NEVER modify files** during the test
3. **NEVER switch branches** on the actual repository
4. **NEVER make API POST calls** to destructive endpoints
5. Only open panels and visually verify their rendering
6. If a screen fails to load, capture the error state and continue

## Adaptive Testing

Some screens may not be accessible if:
- There are no modified files (diff view may be empty)
- There are no Claude sessions (session browser may be empty)
- GitHub auth is not configured (PR panel shows auth required)
- No worktrees exist

In these cases, capture whatever state is available and note it in the report.
This is expected behavior, not a test failure.
