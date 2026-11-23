import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import {
  assertMockLlm,
  TEST_ENCRYPTION_KEY,
  TEST_SERVER_ENV,
} from '../../packages/testing/src/env';
import { supabaseLocalEnv } from '../../packages/testing/src/supabase';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// A real AI provider is refused before the server starts (ADR-0048, SPEC-004 CL-5).
assertMockLlm(process.env);

// Supabase keys of the local stack for the test server (sessions of SPEC-201 and later). A stack
// that is not running is reported by global-setup, not here.
// The values go through process.env (inherited by the test server), never through the `webServer`
// block: the JSON report copies that block and a key must not end up in the evidence files.
function exportSupabasePublicEnv(): void {
  try {
    const { url, anonKey, serviceRoleKey, jwtSecret } = supabaseLocalEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= anonKey;
    // SPEC-206: the file service signs Storage tokens server-side (never reaches the browser).
    process.env.SUPABASE_JWT_SECRET ??= jwtSecret;
    // SPEC-211: the export job writes the private `exports` bucket and deletes the Auth user with
    // the service role. Server-only, inherited by the test server (never sent to the browser).
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= serviceRoleKey;
  } catch {
    // reported by global-setup when the stack is down
  }
}

exportSupabasePublicEnv();

const COMMON = { locale: 'fr-FR', timezoneId: 'Europe/Paris' } as const;
const DESKTOP = { ...devices['Desktop Chrome'], ...COMMON, viewport: { width: 1440, height: 900 } };
// Shared worktrees may already run a server on the default port: allow an isolated run.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
// SPEC-2003 / ADR-2018: the Python facade sits on PORT+1 and relays to Hono on PORT+12, because
// the SPEC-006 end-to-end test starts its own Next server on PORT+2 and that port cannot change.
const FACADE_PORT = PORT + 1;
const API_PORT = PORT + 12;
const HONO_URL = `http://127.0.0.1:${String(API_PORT)}`;
const API_INTERNAL_URL = `http://127.0.0.1:${String(FACADE_PORT)}`;
// SPEC-2102: the Python worker is the fourth process of the stack; its health server proves it is
// alive before the end-to-end test emits an event. A dedicated port, like the other three.
const WORKER_PORT = PORT + 3;
const WORKER_URL = `http://127.0.0.1:${String(WORKER_PORT)}`;

export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.ts',
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
    baseURL: BASE_URL,
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
    // SPEC-807 ET-4/ET-7 — the six V1 journeys (`apps/web/e2e/journeys`) in the three engines.
    // `pnpm test:v1:journeys` runs them; the default desktop/mobile projects keep `e2e/specs`.
    { name: 'journeys', testDir: './e2e/journeys', use: DESKTOP },
    {
      name: 'journeys-firefox',
      testDir: './e2e/journeys',
      grepInvert: /@visual/,
      ...(process.env.CROSS_BROWSER_SKIP_FIREFOX === '1' ? { grep: /$^/ } : {}),
      use: { ...devices['Desktop Firefox'], ...COMMON, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'journeys-webkit',
      testDir: './e2e/journeys',
      grepInvert: /@visual/,
      use: { ...devices['Desktop Safari'], ...COMMON, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'cross-browser-firefox',
      // Cross-browser covers the functional journeys: pixel baselines stay engine-specific and
      // are validated on the Chromium projects (ADR-0101, CP-6 « parcours principaux »).
      testMatch: '**/specs/p6/**/*.spec.ts',
      grepInvert: /@visual/,
      // This host's kernel makes Firefox 159 segfault in libxul (see progress/blockers.md);
      // a compatible host runs the project normally, the opt-out keeps the check explicit.
      ...(process.env.CROSS_BROWSER_SKIP_FIREFOX === '1' ? { grep: /$^/ } : {}),
      use: { ...devices['Desktop Firefox'], ...COMMON, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'cross-browser-webkit',
      testMatch: '**/specs/p6/**/*.spec.ts',
      grepInvert: /@visual/,
      use: { ...devices['Desktop Safari'], ...COMMON, viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      // SPEC-2102: the durable worker (dispatcher, runner, singleton scheduler). It is started
      // last, once the database of the stack is reset, and stopped with the run.
      command: 'uv run python -m learny_worker',
      url: `${WORKER_URL}/health/live`,
      cwd: ROOT,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...TEST_SERVER_ENV,
        DATABASE_URL:
          process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        PY_WORKER_HEALTH_PORT: String(WORKER_PORT),
        // The Python settings read SUPABASE_URL / SUPABASE_ANON_KEY, mapped from the public names
        // exactly like docker/compose.coolify-py.yml (Storage, Auth admin and export jobs).
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? '',
        JOBS_MODE: 'worker',
        APP_ENV: 'test',
      },
    },
    {
      // The upstream must be healthy before the facade is probed: Playwright starts
      // the servers in this order and waits for each readiness URL in turn (SPEC-2003).
      command: 'pnpm --filter @learny/api dev',
      url: `${HONO_URL}/health`,
      reuseExistingServer:
        process.env.PLAYWRIGHT_REUSE_SERVER === '1' ||
        (!process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER !== '0'),
      timeout: 120000,
      env: {
        ...TEST_SERVER_ENV,
        // Playwright replaces the environment of the command: the database and the Supabase keys
        // must be repeated here or the health probe reports `degraded` (SPEC-2003).
        DATABASE_URL:
          process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? '',
        PORT: String(API_PORT),
        API_PORT: String(API_PORT),
        APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
        ENABLE_SDD_PAGES: 'true',
        APP_ENV: 'test',
        API_PROXY_SECRET: 'learny-test-only-api-proxy-secret-value',
        // SPEC-2207: the Python worker runs every consumer and cron of the table, so Hono no
        // longer mounts `/api/inngest` (ADR-2014, flip procedure step 2 of the P22 plan).
        LEARNY_API_ROLE: 'api',
        JOBS_MODE: 'inline',
        TRUST_PROXY: 'true',
      },
    },
    {
      // SPEC-2003: the web only talks to the facade; every operation is still relayed to Hono.
      command: `uv run uvicorn learny_api.main:app --host 127.0.0.1 --port ${String(FACADE_PORT)}`,
      url: `${API_INTERNAL_URL}/health`,
      cwd: ROOT,
      reuseExistingServer: false,
      timeout: 180000,
      env: {
        ...TEST_SERVER_ENV,
        // SPEC-2204: BYOK encryption is served by the Python facade, which reads the keyring at
        // request time; it receives the same test-only key as the web and Hono.
        APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
        PY_HONO_UPSTREAM_URL: HONO_URL,
        // The facade health probes the database only when DATABASE_URL is set explicitly.
        DATABASE_URL:
          process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        // The Python settings read SUPABASE_URL / SUPABASE_ANON_KEY, mapped from the public names
        // exactly like docker/compose.coolify-py.yml (Storage, Auth admin and export jobs).
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? '',
        APP_ENV: 'test',
        // SPEC-2201: the facade serves the operations owned by `py`, so it must trust the web
        // relay exactly like Hono does (SPEC-208 origin guard) — same secret, same forwarded host.
        API_PROXY_SECRET: 'learny-test-only-api-proxy-secret-value',
        TRUST_PROXY: 'true',
        // SPEC-2206: the billing routes owned by `py` resolve the simulated Stripe gateway
        // explicitly. `STRIPE_MODE=mock` needs no key and opens no socket (`build_stripe_gateway`);
        // the webhook tolerance and the error codes are those of ADR-2031.
        STRIPE_MODE: 'mock',
        // SPEC-2207: the demonstration routes are served by the Python facade, so it needs the
        // same development flag as the web and Hono or `devOnly` answers 404 to every page.
        ENABLE_SDD_PAGES: 'true',
        // P21 plan step 6: the facade runs the consumers of the events a request commits before it
        // answers, as Hono's inline jobs did; the worker still runs the crons and anything else.
        JOBS_MODE: 'inline',
      },
    },
    {
      command: 'pnpm --filter @learny/web exec node server.mjs',
      url: `${BASE_URL}/api/v1/health`,
      reuseExistingServer:
        process.env.PLAYWRIGHT_REUSE_SERVER === '1' ||
        (!process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER !== '0'),
      timeout: 120000,
      env: {
        ...TEST_SERVER_ENV,
        DATABASE_URL:
          process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? '',
        PORT: String(PORT),
        APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
        ENABLE_SDD_PAGES: 'true',
        API_INTERNAL_URL,
        API_PROXY_SECRET: 'learny-test-only-api-proxy-secret-value',
        // SPEC-804: rapport de démonstration figé pour la page de performance.
        PERF_DEMO_FIXTURE: '1',
        // The server sits behind a trusted proxy in these tests: each test announces its own address
        // (fixture `clientAddress`), so the IP-keyed rate-limit buckets of SPEC-208 stay independent.
        TRUST_PROXY: 'true',
        APP_ENV: 'test',
        // SPEC-203: events run in the process, without an Inngest Dev Server (EF-6).
        JOBS_MODE: 'inline',
        // SPEC-008 demo page: a deterministic, explicitly labelled simulated state for captures.
        SDD_STACK_DEMO: 'true',
        // SPEC-602: the onboarding reminders stub a browser whose subscription uses this test key.
        NEXT_PUBLIC_VAPID_PUBLIC_KEY:
          'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      },
    },
  ],
});
