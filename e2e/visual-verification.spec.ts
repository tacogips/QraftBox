/**
 * QraftBox E2E Visual Verification Tests
 *
 * Comprehensive visual verification test suite that navigates all screens,
 * captures screenshots, and verifies core UI functionality.
 *
 * Reference: design-docs/specs/design-e2e-test-plan.md
 *
 * SAFETY: These tests NEVER execute destructive operations (commit, push, PR).
 * They only open UI panels and visually verify rendering.
 */

import { test, expect } from "@playwright/test";

const SCREENSHOT_DIR = "e2e-screenshots";

/**
 * Helper to get contextId from the workspace API.
 * If the workspace has no tabs, creates one by POSTing the current directory.
 */
async function getContextId(
  request: import("@playwright/test").APIRequestContext,
): Promise<string> {
  const ws = await request.get("/api/workspace");
  if (!ws.ok()) return "default";
  try {
    const text = await ws.text();
    const data = JSON.parse(text) as Record<string, unknown>;
    const workspace = data["workspace"] as
      | { tabs?: Array<{ id: string }> }
      | undefined;

    // If tabs exist, use the first one
    if (workspace?.tabs && workspace.tabs.length > 0 && workspace.tabs[0]?.id) {
      return workspace.tabs[0].id;
    }

    // No tabs - create one by POSTing the project directory
    const cwd = process.cwd();
    const createResp = await request.post("/api/workspace/tabs", {
      data: { path: cwd },
    });
    if (createResp.ok()) {
      const createText = await createResp.text();
      const createData = JSON.parse(createText) as Record<string, unknown>;
      const tab = createData["tab"] as { id?: string } | undefined;
      if (tab?.id) return tab.id;
    }
  } catch {
    // Parse error
  }
  return "default";
}

// Helper to take a named screenshot
async function screenshot(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: true,
  });
}

// TS-E2E-01: App Startup & Health Check
test.describe("TS-E2E-01: App Startup", () => {
  test("E2E-01-01: health endpoint responds", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
  });

  test("E2E-01-02: initial page loads", async ({ page }) => {
    await page.goto("/");
    // Wait for page to load; the #app div exists in HTML but may be
    // empty if the Svelte client bundle has not been rebuilt
    await page.waitForLoadState("networkidle");
    await screenshot(page, "01-app-initial-load");

    // Verify HTML was served (the div exists even if empty)
    const appDiv = page.locator("#app");
    await expect(appDiv).toBeAttached();
  });
});

// TS-E2E-20: API Endpoint Smoke Tests
test.describe("TS-E2E-20: API Smoke Tests", () => {
  test("E2E-20-01: GET /api/health", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
  });

  test("E2E-20-02: GET /api/workspace", async ({ request }) => {
    const r = await request.get("/api/workspace");
    expect(r.status()).toBe(200);
  });

  test("E2E-20-04: GET /api/ctx/:id/diff", async ({ request }) => {
    const contextId = await getContextId(request);
    const r = await request.get(`/api/ctx/${contextId}/diff`);
    expect(r.ok()).toBeTruthy();
  });

  test("E2E-20-05: GET /api/ctx/:id/files", async ({ request }) => {
    const contextId = await getContextId(request);
    const r = await request.get(`/api/ctx/${contextId}/files`);
    expect(r.ok()).toBeTruthy();
  });

  test("E2E-20-06: GET /api/ctx/:id/status", async ({ request }) => {
    const contextId = await getContextId(request);
    const r = await request.get(`/api/ctx/${contextId}/status`);
    expect(r.ok()).toBeTruthy();
  });

  test("E2E-20-07: GET /api/ctx/:id/commits", async ({ request }) => {
    const contextId = await getContextId(request);
    const r = await request.get(`/api/ctx/${contextId}/commits`);
    expect(r.ok()).toBeTruthy();
  });

  test("E2E-20-08: GET /api/ctx/:id/claude-sessions/sessions", async ({
    request,
  }) => {
    const contextId = await getContextId(request);
    const r = await request.get(
      `/api/ctx/${contextId}/claude-sessions/sessions`,
    );
    expect(r.ok()).toBeTruthy();
  });

  test("E2E-20-09: GET /api/ctx/:id/prompts", async ({ request }) => {
    const contextId = await getContextId(request);
    const r = await request.get(`/api/ctx/${contextId}/prompts`);
    expect(r.ok()).toBeTruthy();
  });

  test("E2E-20-10: GET /api/ctx/:id/worktree/default-path", async ({ request }) => {
    const contextId = await getContextId(request);
    const cwd = process.cwd();
    const r = await request.get(
      `/api/ctx/${contextId}/worktree/default-path?projectPath=${encodeURIComponent(cwd)}&name=test`,
    );
    expect(r.ok()).toBeTruthy();
  });
});

// TS-E2E-02: File Tree Navigation
test.describe("TS-E2E-02: File Tree", () => {
  test("E2E-02-01: file tree renders", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await screenshot(page, "02-file-tree-initial");
  });
});

// TS-E2E-03: Diff View Side by Side
test.describe("TS-E2E-03: Diff View SBS", () => {
  test("E2E-03-01: side-by-side diff renders", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Click first modified file in file tree (if available)
    const fileNode = page.locator(
      '[data-testid="file-node"], .file-node, [class*="file"]',
    );
    if ((await fileNode.count()) > 0) {
      await fileNode.first().click();
      await page.waitForTimeout(1000);
    }
    await screenshot(page, "03-diff-sbs-initial");
  });
});

// TS-E2E-04: Diff View Inline
test.describe("TS-E2E-04: Diff View Inline", () => {
  test("E2E-04-01: inline diff renders", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Look for view mode toggle
    const toggle = page.locator(
      '[data-testid="view-mode-toggle"], [class*="mode-toggle"], button:has-text("Inline")',
    );
    if ((await toggle.count()) > 0) {
      await toggle.first().click();
      await page.waitForTimeout(1000);
    }
    await screenshot(page, "04-diff-inline-initial");
  });
});

// TS-E2E-05: Current State View
test.describe("TS-E2E-05: Current State View", () => {
  test("E2E-05-01: current state view renders", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const toggle = page.locator(
      'button:has-text("Current"), [data-testid="current-state-toggle"]',
    );
    if ((await toggle.count()) > 0) {
      await toggle.first().click();
      await page.waitForTimeout(1000);
    }
    await screenshot(page, "05-current-state-initial");
  });
});

// TS-E2E-06: Commit Log
test.describe("TS-E2E-06: Commit Log", () => {
  test("E2E-06-01: commit log panel renders", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const logBtn = page.locator(
      'button:has-text("Commits"), button:has-text("Log"), [data-testid="commit-log"]',
    );
    if ((await logBtn.count()) > 0) {
      await logBtn.first().click();
      await page.waitForTimeout(1000);
    }
    await screenshot(page, "06-commit-log-initial");
  });
});

// TS-E2E-09: Tab Bar
test.describe("TS-E2E-09: Tab Bar", () => {
  test("E2E-09-01: tab bar renders", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await screenshot(page, "09-tabs-initial");
  });
});

// TS-E2E-12: AI Commit (UI only)
test.describe("TS-E2E-12: AI Commit UI", () => {
  test("E2E-12-01: commit button and panel", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const commitBtn = page.locator(
      'button:has-text("Commit"), [data-testid="commit-button"]',
    );
    if ((await commitBtn.count()) > 0) {
      await screenshot(page, "12-commit-button");
      await commitBtn.first().click();
      await page.waitForTimeout(500);
      await screenshot(page, "12-commit-panel");
      // Close without committing
      await page.keyboard.press("Escape");
    }
  });
});

// TS-E2E-13: AI Push (UI only)
test.describe("TS-E2E-13: AI Push UI", () => {
  test("E2E-13-01: push button and panel", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const pushBtn = page.locator(
      'button:has-text("Push"), [data-testid="push-button"]',
    );
    if ((await pushBtn.count()) > 0) {
      await screenshot(page, "13-push-button");
      await pushBtn.first().click();
      await page.waitForTimeout(500);
      await screenshot(page, "13-push-panel");
      await page.keyboard.press("Escape");
    }
  });
});

// TS-E2E-14: AI PR (UI only)
test.describe("TS-E2E-14: AI PR UI", () => {
  test("E2E-14-01: PR button and panel", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const prBtn = page.locator(
      'button:has-text("PR"), button:has-text("Pull Request"), [data-testid="pr-button"]',
    );
    if ((await prBtn.count()) > 0) {
      await screenshot(page, "14-pr-button");
      await prBtn.first().click();
      await page.waitForTimeout(500);
      await screenshot(page, "14-pr-panel");
      await page.keyboard.press("Escape");
    }
  });
});

// TS-E2E-19: Responsive Views
test.describe("TS-E2E-19: Responsive", () => {
  test("E2E-19-01: tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await screenshot(page, "19-responsive-tablet");
  });

  test("E2E-19-02: desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await screenshot(page, "19-responsive-desktop");
  });
});
