import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'readfox-beta-sso.e2e.ts',
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    ...(process.env.READFOX_E2E_CHROME
      ? { launchOptions: { executablePath: process.env.READFOX_E2E_CHROME } }
      : {}),
  },
  webServer: {
    command: 'bun run e2e/beta-sso-servers.mjs',
    url: 'http://localhost:3480/health',
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
