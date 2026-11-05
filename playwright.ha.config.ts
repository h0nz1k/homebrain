import { defineConfig } from '@playwright/test';

// E2E proti skutečnému testovacímu HA (issue #8). Před spuštěním:
// pnpm build && pnpm build:integration, start HA (ha-test/README.md), node ha-test/onboard.mjs.
export default defineConfig({
  testDir: './tests/e2e-ha',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-ha' }]],
  use: {
    browserName: 'chromium',
    baseURL: process.env.HB_HA_URL ?? 'http://127.0.0.1:8123',
    timezoneId: 'Europe/Prague',
    locale: 'cs-CZ',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'ha-desktop', use: { viewport: { width: 1440, height: 900 } } }],
});
