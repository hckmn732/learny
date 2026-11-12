import { serve } from 'inngest/edge';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEMO_JOB_ID,
  EVENT_NAMES,
  INNGEST_APP_ID,
  JOB_RETRIES,
  TransientJobError,
  createFunctions,
  createMemoryDemoStore,
  functions,
  inngest,
  type DemoResultStore,
} from '../../src';
import { driveInngestRun } from '../../src/testing';

// Counting store: writes, reads and injectable transient insert failures.
function countingStore(insertFailures = 0) {
  const inner = createMemoryDemoStore();
  let failures = insertFailures;
  const counters = { finds: 0, insertCalls: 0 };
  const store: DemoResultStore = {
    find: (runId) => {
      counters.finds += 1;
      return inner.find(runId);
    },
    insert: async (record) => {
      counters.insertCalls += 1;
      if (failures > 0) {
        failures -= 1;
        throw new TransientJobError('stockage indisponible');
      }
      await inner.insert(record);
    },
  };
  return { inner, store, counters };
}

function host(store: DemoResultStore) {
  return serve({ client: inngest, functions: createFunctions(inngest, { demoStore: store }) });
}

function drive(store: DemoResultStore, data: Record<string, unknown>, runId = 'run-int') {
  return driveInngestRun({
    handler: host(store),
    fnId: `${INNGEST_APP_ID}-${DEMO_JOB_ID}`,
    event: { name: EVENT_NAMES.sddDemoJobRequested, data },
    retries: JOB_RETRIES,
    runId,
  });
}

const outbound = vi.fn(() => Promise.reject(new Error('aucun appel réseau en test')));

beforeEach(() => {
  // The harness replaces Inngest: dev mode, no signature, and no network at all (CL-5).
  vi.stubEnv('INNGEST_DEV', '1');
  vi.stubGlobal('fetch', outbound);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  expect(outbound).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('[SPEC-007] Inngest function', () => {
  it('exposes one shared registry built on the learny client with three retries (EF-1)', () => {
    expect(inngest.id).toBe('learny');
    // The registry also holds the functions of SPEC-203 (crons, cleanup, demonstration pipeline)
    // and the hourly security purge of SPEC-208.
    expect(functions.map((f) => f.id())).toEqual([
      DEMO_JOB_ID,
      'account-deletion',
      'cron-hourly-tick',
      'cron-nightly',
      'data-export',
      'email-welcome',
      'exports-purge',
      'nightly-outbox-cleanup',
      'notification-delivery',
      'notifications-daily-digest',
      'notifications-deferred-due',
      'sdd-demo-pipeline',
      'security-purge',
    ]);
    expect(functions[0]?.opts.retries).toBe(JOB_RETRIES);
    expect(JOB_RETRIES).toBe(3);
  });

  it('runs both steps through the SDK protocol and returns the doubled value (CA-2)', async () => {
    const { inner, store } = countingStore();
    const run = await drive(store, { runId: 'int-1', value: 4 });

    expect(run).toMatchObject({
      status: 'completed',
      output: { runId: 'int-1', doubledValue: 8 },
      httpStatuses: [206, 206, 200],
      stepRuns: { 'validate-input': 1, 'persist-result': 1 },
    });
    expect(inner.writes).toBe(1);
  });

  it('writes once when the same runId is delivered twice (CL-2, CA-2)', async () => {
    const { inner, store } = countingStore();
    const first = await drive(store, { runId: 'int-2', value: 21 }, 'run-a');
    const second = await drive(store, { runId: 'int-2', value: 21 }, 'run-b');

    expect(first.output).toEqual({ runId: 'int-2', doubledValue: 42 });
    expect(second.output).toEqual({ runId: 'int-2', doubledValue: 42 });
    expect(inner.writes).toBe(1);
  });

  it('fails with a non-retried conflict when the runId is reused with another value', async () => {
    const { inner, store } = countingStore();
    await drive(store, { runId: 'int-3', value: 1 });
    const run = await drive(store, { runId: 'int-3', value: 2 });

    expect(run).toMatchObject({
      status: 'failed',
      error: { name: 'PermanentJobError', noRetry: true },
      httpStatuses: [206],
      stepErrors: { 'validate-input': 1 },
    });
    expect(inner.writes).toBe(1);
  });

  it('replays only the failed step after a transient error (CL-3, CA-3)', async () => {
    const { inner, store, counters } = countingStore(2);
    const run = await drive(store, { runId: 'int-4', value: 5 });

    expect(run).toMatchObject({
      status: 'completed',
      output: { runId: 'int-4', doubledValue: 10 },
      stepRuns: { 'validate-input': 1, 'persist-result': 1 },
      stepErrors: { 'persist-result': 2 },
    });
    // validate-input read the store once; persist-result ran three times (two retries).
    expect(counters.finds).toBe(1 + 3);
    expect(counters.insertCalls).toBe(3);
    expect(inner.writes).toBe(1);
  });

  it('stops after three retries at most (CL-3, CL-4, CA-3)', async () => {
    const { inner, store, counters } = countingStore(100);
    const run = await drive(store, { runId: 'int-5', value: 5 });

    expect(run).toMatchObject({
      status: 'failed',
      // The SDK itself marks the fourth failure (attempt 3 of max 4) as final.
      error: { name: 'TransientJobError', noRetry: true },
      stepRuns: { 'validate-input': 1 },
      stepErrors: { 'persist-result': JOB_RETRIES + 1 },
    });
    expect(counters.insertCalls).toBe(JOB_RETRIES + 1);
    expect(inner.writes).toBe(0);
  });

  it('rejects an invalid event before persist-result, without any write (CL-1)', async () => {
    const { inner, store, counters } = countingStore();
    const run = await drive(store, { value: 4 });

    expect(run.status).toBe('failed');
    expect(run.stepRuns).toEqual({});
    expect(counters.finds).toBe(0);
    expect(inner.writes).toBe(0);
  });
});
