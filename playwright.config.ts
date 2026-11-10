import { defineConfig } from '@playwright/test';

// Local runs can avoid a busy dev port: HB_E2E_PORT=5201 npx playwright test
const port = Number(process.env.HB_E2E_PORT ?? 5173);

export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    // Modul Odpady počítá dnes/zítra v Europe/Prague; mock data musí používat stejné pásmo.
    timezoneId: 'Europe/Prague',
    locale: 'cs-CZ',
    baseURL: `http://localhost:${port}`,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-s21', use: { viewport: { width: 360, height: 800 } } },
    { name: 'tablet', use: { viewport: { width: 800, height: 1280 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm --filter @homebrain/panel dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
