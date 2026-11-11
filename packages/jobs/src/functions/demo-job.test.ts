import { describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';

import { createMemoryDemoStore, type DemoResultStore } from '../demo-store';
import { TransientJobError } from '../errors';
import { DEMO_VALUE_MAX, demoJobInputSchema } from '../events';
import type { JobLogger, SafeLogFields } from '../ports';
import { executeDirect } from '../testing';

import { DEMO_STEPS, JOB_RETRIES, runDemoJob } from './demo-job';

const FIXED: Clock = { now: () => new Date('2026-11-11T12:20:00Z') };

interface LogLine {
  level: 'info' | 'warn' | 'error';
  message: string;
  fields: SafeLogFields;
}

function recordingLogger(): JobLogger & { lines: LogLine[] } {
  const lines: LogLine[] = [];
  return {
    lines,
    info: (message, fields) => lines.push({ level: 'info', message, fields }),
    warn: (message, fields) => lines.push({ level: 'warn', message, fields }),
    error: (message, fields) => lines.push({ level: 'error', message, fields }),
  };
}

function run(data: unknown, store: DemoResultStore, logger: JobLogger = recordingLogger()) {
  return executeDirect((step) => runDemoJob({ data, step, logger }, { store, clock: FIXED }), {
    steps: DEMO_STEPS,
  });
}

// Store whose insert fails `failures` times with a transient error before succeeding.
function flakyStore(failures: number, error: () => Error = () => new TransientJobError('down')) {
  const inner = createMemoryDemoStore();
  let left = failures;
  let finds = 0;
  return {
    inner,
    get finds() {
      return finds;
    },
    store: {
      find: (runId: string) => {
        finds += 1;
        return inner.find(runId);
      },
      insert: async (record: Parameters<DemoResultStore['insert']>[0]) => {
        if (left > 0) {
          left -= 1;
          throw error();
        }
        await inner.insert(record);
      },
    } satisfies DemoResultStore,
  };
}

describe('[SPEC-007] demo job', () => {
  it('validates the input schema: non-empty runId and bounded integer value', () => {
    expect(demoJobInputSchema.safeParse({ runId: 'r-1', value: 4 }).success).toBe(true);
    expect(demoJobInputSchema.safeParse({ value: 4 }).success).toBe(false);
    expect(demoJobInputSchema.safeParse({ runId: '   ', value: 4 }).success).toBe(false);
    expect(demoJobInputSchema.safeParse({ runId: 'r-1', value: 1.5 }).success).toBe(false);
    expect(demoJobInputSchema.safeParse({ runId: 'r-1', value: DEMO_VALUE_MAX + 1 }).success).toBe(
      false,
    );
  });

  it('runs validate-input then persist-result and returns the doubled value (CA-2)', async () => {
    const store = createMemoryDemoStore();
    const result = await run({ runId: 'run-a', value: 4 }, store);

    expect(result).toMatchObject({
      status: 'completed',
      output: { runId: 'run-a', doubledValue: 8 },
    });
    expect(result.steps.map((s) => [s.name, s.status, s.attempts])).toEqual([
      ['validate-input', 'completed', 1],
      ['persist-result', 'completed', 1],
    ]);
    expect(store.writes).toBe(1);
    expect(await store.find('run-a')).toEqual({
      runId: 'run-a',
      value: 4,
      doubledValue: 8,
      persistedAt: '2026-11-11T12:20:00.000Z',
    });
  });

  it('rejects an invalid event before persist-result, without any write (CL-1)', async () => {
    const store = createMemoryDemoStore();
    for (const data of [{ value: 4 }, { runId: 'run-b', value: DEMO_VALUE_MAX + 1 }]) {
      const result = await run(data, store);
      expect(result).toMatchObject({
        status: 'failed',
        error: { code: 'VALIDATION_FAILED', retriable: false, step: null },
        invocations: 1,
      });
      expect(result.steps.every((s) => s.status === 'pending' && s.attempts === 0)).toBe(true);
    }
    expect(store.writes).toBe(0);
  });

  it('writes once for a duplicated runId and returns the same result (CL-2, CA-2)', async () => {
    const store = createMemoryDemoStore();
    const first = await run({ runId: 'run-c', value: 21 }, store);
    const second = await run({ runId: 'run-c', value: 21 }, store);

    expect(first).toMatchObject({ status: 'completed', output: { doubledValue: 42 } });
    expect(second).toMatchObject({
      status: 'completed',
      output: { runId: 'run-c', doubledValue: 42 },
    });
    expect(store.writes).toBe(1);
  });

  it('fails with an explicit conflict when a runId is reused with another value (CL-2)', async () => {
    const store = createMemoryDemoStore();
    await run({ runId: 'run-d', value: 1 }, store);
    const result = await run({ runId: 'run-d', value: 2 }, store);

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'IDEMPOTENCY_CONFLICT', retriable: false, step: 'validate-input' },
      invocations: 1,
    });
    expect(store.writes).toBe(1);
    expect((await store.find('run-d'))?.doubledValue).toBe(2);
  });

  it('retries only the failing step after a transient error (CL-3, CA-3)', async () => {
    const flaky = flakyStore(2);
    const result = await run({ runId: 'run-e', value: 5 }, flaky.store);

    expect(result).toMatchObject({ status: 'completed', output: { doubledValue: 10 } });
    const [validate, persist] = result.steps;
    // validate-input ran once and was replayed from memo on the two following invocations.
    expect(validate).toMatchObject({ status: 'completed', attempts: 1, replays: 2 });
    expect(persist).toMatchObject({ status: 'completed', attempts: 3, replays: 0 });
    expect(result.invocations).toBe(3);
    expect(flaky.inner.writes).toBe(1);
  });

  it('stops after three retries at most (CL-3, CA-3)', async () => {
    const flaky = flakyStore(100);
    const result = await run({ runId: 'run-f', value: 5 }, flaky.store);

    expect(JOB_RETRIES).toBe(3);
    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'TRANSIENT', retriable: true, step: 'persist-result' },
      invocations: JOB_RETRIES + 1,
    });
    expect(result.steps[0]).toMatchObject({ attempts: 1, replays: JOB_RETRIES });
    expect(result.steps[1]).toMatchObject({ status: 'failed', attempts: JOB_RETRIES + 1 });
    expect(flaky.inner.writes).toBe(0);
  });

  it('never retries a permanent error and logs it safely (CL-4, CA-3)', async () => {
    const store = createMemoryDemoStore();
    await run({ runId: 'run-g', value: 7 }, store);
    const logger = recordingLogger();
    const result = await run({ runId: 'run-g', value: 987654 }, store, logger);

    expect(result).toMatchObject({ status: 'failed', invocations: 1 });
    expect(result.steps[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(result.steps[1]).toMatchObject({ status: 'pending', attempts: 0 });
    expect(logger.lines).toEqual([
      {
        level: 'error',
        message: 'job step failed permanently',
        fields: {
          job: 'sdd/demo-job',
          step: 'validate-input',
          runId: 'run-g',
          code: 'IDEMPOTENCY_CONFLICT',
        },
      },
    ]);
    expect(JSON.stringify(logger.lines)).not.toContain('987654');
  });

  it('logs transient failures as warnings without the input value', async () => {
    const logger = recordingLogger();
    const flaky = flakyStore(1, () => new Error('ECONNRESET 10.0.0.1 value=31337'));
    const result = await run({ runId: 'run-h', value: 31337 }, flaky.store, logger);

    expect(result.status).toBe('completed');
    expect(logger.lines.map((l) => [l.level, l.fields.code])).toEqual([
      ['warn', 'INTERNAL'],
      ['info', undefined],
    ]);
    expect(JSON.stringify(logger.lines)).not.toMatch(/31337|ECONNRESET/);
  });
});
