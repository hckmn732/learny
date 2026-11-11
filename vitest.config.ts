import { defineConfig } from 'vitest/config';

import { assertMockLlm } from './packages/testing/src/env';

// A real AI provider is refused before any test starts (ADR-0048, SPEC-004 CL-5).
assertMockLlm(process.env);

// Line coverage floors (docs/engineering/testing.md §1), enforced from the checkpoint where each
// package exists: a glob that matches no file is ignored.
const COVERAGE_FLOORS = {
  'packages/learning-engine/src/**': { lines: 80 },
  'packages/bricks/src/**': { lines: 80 },
  'packages/core/src/**': { lines: 80 },
  'packages/llm/src/budget/**': { lines: 80 },
  'packages/services/src/**': { lines: 70 },
};

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
            'apps/web/{app,components,lib,messages}/**/*.test.{ts,tsx}',
            'tools/**/test/unit/**/*.test.ts',
            'tools/ci/*.test.ts',
            'tools/deploy/*.test.ts',
            'tools/docker/*.test.ts',
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
