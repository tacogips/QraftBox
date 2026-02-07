import { defineConfig, devices } from "@playwright/test";

const BROWSERS_PATH = process.env["PLAYWRIGHT_BROWSERS_PATH"] ?? "";

/**
 * Playwright E2E test configuration for QraftBox
 *
 * Uses a non-default port (7155) to avoid conflicts with running dev instances.
 * Playwright browsers are provided by Nix (PLAYWRIGHT_BROWSERS_PATH env var).
 *
 * Nix provides chromium-1200 which may differ from the npm package expectation.
 * We set executablePath explicitly to use the Nix-provided browser.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],

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

  outputDir: "e2e-results",
});
