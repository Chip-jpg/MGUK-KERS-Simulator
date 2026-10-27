import { defineConfig, devices } from '@playwright/test';

// A Chromium may be pre-installed (e.g. /opt/pw-browsers/...). Point
// PW_CHROMIUM_PATH at its executable to use it instead of a downloaded one.
const executablePath = process.env['PW_CHROMIUM_PATH'];
// Preview port; override (PW_PORT=4273) when several checkouts run e2e at once.
const port = Number(process.env['PW_PORT'] ?? 4173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    // Only used when content/theory/ is empty: fall back to tests/fixtures/theory.
    env: { VITE_THEORY_FIXTURES: 'true' },
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
