import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { assertMockLlm, TEST_ENCRYPTION_KEY } from './packages/testing/src/env';

// A real AI provider is refused before any test starts (ADR-0048, SPEC-004 CL-5).
assertMockLlm(process.env);

// Line coverage floors (docs/engineering/testing.md §1), enforced from the checkpoint where each
// package exists: a glob that matches no file is ignored.
const COVERAGE_FLOORS = {
  'packages/bricks/src/**': { lines: 90 },
  'packages/core/src/**': { lines: 95 },
  'packages/contracts/src/**': { lines: 95 },
  'packages/config/src/**': { lines: 95 },
  'packages/ui/src/**': { lines: 95 },
};

export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./apps/web/node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    passWithNoTests: true,
    env: {
      CLOCK_FIXED_AT: '2026-11-11T12:20:00Z',
      LLM_MODE: 'mock',
      TZ: 'UTC',
      APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/web/{app,components,lib}/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
      thresholds: COVERAGE_FLOORS,
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'packages/*/src/**/*.test.{ts,tsx}',
            'apps/*/src/**/*.test.{ts,tsx}',
            // SPEC-3001: pure logic of the mobile e2e harness (compare.mjs).
            'apps/mobile/e2e/**/*.test.ts',
            // SPEC-3002 CA-5: the lint-rule proof runs in Node (ESLint API), not in Jest.
            'apps/mobile/test/*.test.ts',
            // SPEC-3502 : fiches des stores et licences (Vitest Node, sans appareil).
            'apps/mobile/store/**/*.test.ts',
            'apps/web/{app,components,lib}/**/*.test.{ts,tsx}',
            'apps/web/test/unit/**/*.test.ts',
            'apps/web/scripts/**/*.test.ts',
            'tools/**/test/unit/**/*.test.ts',
            'tools/migration/*.test.ts',
            'tools/perf/test/**/*.test.ts',
            'tools/ci/*.test.ts',
            'tools/deploy/*.test.ts',
            'tools/docker/*.test.ts',
          ],
          environment: 'node',
          // CI runners are slower; the year-long quiet-hours loop needs more than the 5 s default.
          testTimeout: 20000,
        },
      },
      {
        // Checks that read the production build (apps/web/.next): run after `pnpm build` only,
        // never in the pre-push unit run.
        extends: true,
        test: {
          name: 'build',
          include: ['apps/web/test/build/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [
            'packages/*/test/integration/**/*.test.{ts,tsx}',
            'apps/*/test/integration/**/*.test.ts',
            'tools/**/test/integration/**/*.test.ts',
          ],
          environment: 'node',
          testTimeout: 60000,
          hookTimeout: 120000,
          fileParallelism: false,
        },
      },
    ],
  },
});
