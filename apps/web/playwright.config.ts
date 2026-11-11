import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { assertMockLlm, TEST_SERVER_ENV } from '../../packages/testing/src/env';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// A real AI provider is refused before the server starts (ADR-0048, SPEC-004 CL-5).
assertMockLlm(process.env);

const COMMON = { locale: 'fr-FR', timezoneId: 'Europe/Paris' } as const;
const DESKTOP = { ...devices['Desktop Chrome'], ...COMMON, viewport: { width: 1440, height: 900 } };

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
    [
      'junit',
      {
        outputFile:
          process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE ??
          path.join(ROOT, 'test-results/playwright.xml'),
      },
    ],
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
  // desktop runs every test; mobile only the @mobile ones; cross-browser (checkpoints) the
  // Chromium-agnostic suite on Firefox and WebKit (ADR-0101).
  projects: [
    { name: 'desktop', use: DESKTOP },
    {
      name: 'mobile',
      grep: /@mobile/,
      use: {
        ...devices['Pixel 7'],
        ...COMMON,
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
    {
      name: 'cross-browser-firefox',
      use: { ...devices['Desktop Firefox'], ...COMMON, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'cross-browser-webkit',
      use: { ...devices['Desktop Safari'], ...COMMON, viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'pnpm --filter @learny/web exec next start -p 3100',
    url: 'http://127.0.0.1:3100/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ...TEST_SERVER_ENV,
      ENABLE_SDD_PAGES: 'true',
      APP_ENV: 'test',
      // SPEC-008 demo page: a deterministic, explicitly labelled simulated state for captures.
      SDD_STACK_DEMO: 'true',
    },
  },
});
