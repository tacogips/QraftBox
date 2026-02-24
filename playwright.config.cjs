const { defineConfig, devices } = require('@playwright/test');

const BROWSERS_PATH = process.env['PLAYWRIGHT_BROWSERS_PATH'] ?? '';

function generateRunId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

const E2E_RUN_ID = process.env['E2E_RUN_ID'] ?? generateRunId();
const E2E_RUN_DIR = `e2e-result/${E2E_RUN_ID}`;
process.env['E2E_RUN_DIR'] = E2E_RUN_DIR;

module.exports = defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.e2e.js', 'e2e/**/*.e2e.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: `${E2E_RUN_DIR}/report` }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:7155',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: BROWSERS_PATH
            ? `${BROWSERS_PATH}/chromium-1200/chrome-linux64/chrome`
            : undefined,
        },
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
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
    command: 'bun run src/main.ts --port 7155',
    url: 'http://localhost:7155/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },

  outputDir: `${E2E_RUN_DIR}/results`,
});
