import { defineConfig } from 'vitest/config';

// Unit project of the pure engine (SPEC-401 ET-1, CA-1): no Node I/O, a single v8 report and the
// coverage floors of docs/engineering/testing.md §1.
export default defineConfig({
  test: {
    name: 'learning-engine',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
