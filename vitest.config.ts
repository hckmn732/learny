import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    env: {
      CLOCK_FIXED_AT: '2026-11-11T12:20:00Z',
      LLM_MODE: 'mock',
      TZ: 'UTC',
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'json-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'packages/*/src/**/*.test.{ts,tsx}',
            'apps/*/src/**/*.test.{ts,tsx}',
            'apps/web/{app,components,lib,messages}/**/*.test.{ts,tsx}',
            'tools/**/test/unit/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [
            'packages/*/test/integration/**/*.test.ts',
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
