import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: path.join(ROOT, 'test-results/artifacts'),
  snapshotPathTemplate:
    '{testDir}/../__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ??
          path.join(ROOT, 'test-results/playwright.json'),
      },
    ],
    ['junit', { outputFile: path.join(ROOT, 'test-results/playwright.xml') }],
    ['html', { outputFolder: path.join(ROOT, 'test-results/html'), open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'pnpm --filter @learny/web exec next start -p 3100',
    url: 'http://127.0.0.1:3100/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ENABLE_SDD_PAGES: 'true',
      CLOCK_FIXED_AT: '2026-11-11T12:20:00Z',
      LLM_MODE: 'mock',
      APP_ENV: 'test',
    },
  },
});
