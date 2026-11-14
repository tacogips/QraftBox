import { defineConfig, devices } from "@playwright/test";

const BROWSERS_PATH = process.env["PLAYWRIGHT_BROWSERS_PATH"] ?? "";

/**
 * Generate a datetime-based run ID for organizing E2E outputs.
 * Format: yyyyMMdd_HHmmss (e.g., 20260207_223015)
 */
function generateRunId(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

const E2E_RUN_ID = process.env["E2E_RUN_ID"] ?? generateRunId();
const E2E_RUN_DIR = `e2e-result/${E2E_RUN_ID}`;

// Export run dir so test files can reference it via process.env
process.env["E2E_RUN_DIR"] = E2E_RUN_DIR;

/**
 * Playwright E2E test configuration for QraftBox
 *
 * Uses a non-default port (7155) to avoid conflicts with running dev instances.
 * Playwright browsers are provided by Nix (PLAYWRIGHT_BROWSERS_PATH env var).
 *
 * Nix provides chromium-1200 which may differ from the npm package expectation.
 * We set executablePath explicitly to use the Nix-provided browser.
 *
 * Each run creates a directory under e2e-result/{runId}/ containing:
 * - screenshots/ - Visual verification screenshots
 * - results/     - Playwright test artifacts (traces, videos, etc.)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never", outputFolder: `${E2E_RUN_DIR}/report` }], ["list"]],

  use: {
    baseURL: "http://localhost:7155",
    trace: "on-first-retry",
    screenshot: "on",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: BROWSERS_PATH
            ? `${BROWSERS_PATH}/chromium-1200/chrome-linux64/chrome`
            : undefined,
        },
      },
    },
    {
      name: "tablet",
      use: {
        // Use Chromium for tablet viewport (WebKit version mismatch with Nix)
        ...devices["Desktop Chrome"],
        viewport: { width: 1194, height: 834 },
        isMobile: true,
        hasTouch: true,
        launchOptions: {
          executablePath: BROWSERS_PATH
            ? `${BROWSERS_PATH}/chromium-1200/chrome-linux64/chrome`
            : undefined,
        },
      },
    },
  ],

  webServer: {
    command: "bun run src/main.ts --port 7155",
    url: "http://localhost:7155/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },

  outputDir: `${E2E_RUN_DIR}/results`,
});
